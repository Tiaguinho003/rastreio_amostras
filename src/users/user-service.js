import { randomUUID } from 'node:crypto';

import { HttpError } from '../contracts/errors.js';
import { USER_ROLES } from '../auth/roles.js';
import {
  INITIAL_PASSWORD_DECISIONS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_LOCKOUT_MS,
  REQUEST_MAX_ATTEMPTS,
  REQUEST_RETRY_MS,
  REQUEST_CODE_RESEND_MS,
  USER_AUDIT_EVENT_TYPES,
  USER_AUDIT_LIMIT_DEFAULT,
  USER_AUDIT_LIMIT_MAX,
  USER_LIST_LIMIT_DEFAULT,
  USER_LIST_LIMIT_MAX,
  USER_SESSION_END_REASONS,
  USER_STATUSES,
  addMilliseconds,
  assertAdminActor,
  assertAuthenticatedActor,
  buildAuditContext,
  buildBlockedRetryAt,
  buildDiff,
  buildRequestTiming,
  buildSessionExpiry,
  generateNumericCode,
  hashCode,
  hashPassword,
  isLocked,
  normalizeCanonical,
  normalizeEmail,
  normalizeInitialPasswordDecision,
  normalizeOptionalText,
  normalizePassword,
  normalizePhone,
  normalizeRequiredText,
  normalizeRole,
  normalizeUsername,
  nowUtc,
  readLimitQuery,
  readPageQuery,
  toIsoString,
  toSessionUser,
  toUserSummary,
  verifyPassword
} from './user-support.js';

const USER_SELECT = {
  id: true,
  fullName: true,
  username: true,
  usernameCanonical: true,
  email: true,
  emailCanonical: true,
  phone: true,
  passwordHash: true,
  role: true,
  status: true,
  initialPasswordDecision: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true
};

function buildPage(total, page, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  return {
    limit,
    page: safePage,
    offset,
    total,
    totalPages,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages
  };
}

function maskEmailForPayload(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const [local, domain] = value.split('@');
  if (!local || !domain) {
    return value;
  }

  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function normalizePasswordResetCode(value, fieldName = 'code') {
  const normalized = normalizeRequiredText(value, fieldName, 6);
  if (!/^\d{6}$/.test(normalized)) {
    throw new HttpError(422, 'Codigo invalido', {
      code: 'INVALID_CODE',
      field: fieldName
    });
  }

  return normalized;
}

export class UserService {
  constructor({ prisma, emailService }) {
    this.prisma = prisma;
    this.emailService = emailService;
  }

  async recordAuditEvent(tx, input) {
    const auditContext = buildAuditContext(input.actorContext);
    return tx.userAuditEvent.create({
      data: {
        eventId: input.eventId ?? randomUUID(),
        targetUserId: input.targetUserId ?? null,
        actorUserId: input.actorUserId ?? auditContext.actorUserId,
        eventType: input.eventType,
        payload: input.payload ?? {},
        reasonText: input.reasonText ?? null,
        requestId: auditContext.requestId,
        correlationId: auditContext.correlationId,
        metadataIp: auditContext.metadataIp,
        metadataUserAgent: auditContext.metadataUserAgent
      }
    });
  }

  async revokeUserSessions(tx, userId, endReason) {
    await tx.userSession.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: nowUtc(),
        endReason
      }
    });
  }

  async revokeCurrentSession(tx, sessionId, endReason) {
    if (!sessionId) {
      return;
    }

    await tx.userSession.updateMany({
      where: {
        id: sessionId,
        revokedAt: null
      },
      data: {
        revokedAt: nowUtc(),
        endReason
      }
    });
  }

  async invalidatePasswordResetRequests(tx, userId, now = nowUtc()) {
    await tx.passwordResetRequest.updateMany({
      where: {
        userId,
        invalidatedAt: null,
        consumedAt: null
      },
      data: {
        invalidatedAt: now,
        retryAvailableAt: addMilliseconds(now, REQUEST_RETRY_MS),
        resendAvailableAt: addMilliseconds(now, REQUEST_RETRY_MS)
      }
    });
  }

  async loadPasswordResetContext(tx, emailInput, now = nowUtc()) {
    const email = normalizeEmail(emailInput);
    const emailCanonical = normalizeCanonical(email);

    const user = await tx.user.findFirst({
      where: {
        emailCanonical
      },
      select: USER_SELECT
    });

    if (!user) {
      throw new HttpError(404, 'Email nao encontrado. Revise o email informado.', {
        code: 'EMAIL_NOT_FOUND'
      });
    }

    if (user.status === USER_STATUSES.INACTIVE) {
      throw new HttpError(403, 'Conta inativa. Fale com o administrador.', {
        code: 'ACCOUNT_INACTIVE'
      });
    }

    if (isLocked(user, now)) {
      throw new HttpError(423, 'Conta temporariamente bloqueada. Aguarde 5 minutos.', {
        code: 'ACCOUNT_LOCKED',
        lockedUntil: toIsoString(user.lockedUntil)
      });
    }

    const request = await tx.passwordResetRequest.findFirst({
      where: {
        userId: user.id,
        invalidatedAt: null,
        consumedAt: null,
        expiresAt: {
          gt: now
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!request) {
      throw new HttpError(404, 'Nao existe pedido valido de recuperacao para esse email', {
        code: 'PASSWORD_RESET_REQUEST_INVALID'
      });
    }

    return {
      email,
      emailCanonical,
      user,
      request
    };
  }

  async assertPasswordResetCode(tx, request, code, now = nowUtc()) {
    if (request.codeHash === hashCode(code)) {
      return;
    }

    const failedAttempts = request.failedAttempts + 1;
    const data = {
      failedAttempts
    };

    if (failedAttempts >= REQUEST_MAX_ATTEMPTS) {
      data.invalidatedAt = now;
      data.retryAvailableAt = buildBlockedRetryAt(now);
      data.resendAvailableAt = buildBlockedRetryAt(now);
    }

    await tx.passwordResetRequest.update({
      where: { id: request.id },
      data
    });

    if (failedAttempts >= REQUEST_MAX_ATTEMPTS) {
      throw new HttpError(429, 'Pedido invalidado. Solicite novamente em 5 minutos.', {
        code: 'PASSWORD_RESET_REQUEST_LOCKED'
      });
    }

    throw new HttpError(422, 'Codigo invalido', {
      code: 'INVALID_CODE'
    });
  }

  async invalidateEmailChangeRequests(tx, userId, now = nowUtc()) {
    await tx.emailChangeRequest.updateMany({
      where: {
        userId,
        invalidatedAt: null,
        consumedAt: null
      },
      data: {
        invalidatedAt: now,
        reservationKey: null,
        retryAvailableAt: addMilliseconds(now, REQUEST_RETRY_MS),
        resendAvailableAt: addMilliseconds(now, REQUEST_RETRY_MS)
      }
    });
  }

  async expireEmailChangeReservations(tx, userId, now = nowUtc()) {
    await tx.emailChangeRequest.updateMany({
      where: {
        userId,
        invalidatedAt: null,
        consumedAt: null,
        expiresAt: {
          lte: now
        }
      },
      data: {
        invalidatedAt: now,
        reservationKey: null
      }
    });
  }

  async getPendingEmailChange(tx, userId, now = nowUtc()) {
    const request = await tx.emailChangeRequest.findFirst({
      where: {
        userId,
        invalidatedAt: null,
        consumedAt: null,
        expiresAt: {
          gt: now
        },
        reservationKey: {
          not: null
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!request) {
      return null;
    }

    return {
      requestId: request.id,
      newEmail: request.newEmail,
      expiresAt: toIsoString(request.expiresAt)
    };
  }

  async requireUserById(tx, userId) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: USER_SELECT
    });

    if (!user) {
      throw new HttpError(404, 'Usuario nao encontrado', {
        code: 'USER_NOT_FOUND'
      });
    }

    return user;
  }

  async assertEmailAvailable(tx, email, { excludeUserId = null } = {}) {
    const emailCanonical = normalizeCanonical(email);

    const existingUser = await tx.user.findFirst({
      where: {
        emailCanonical,
        ...(excludeUserId
          ? {
              id: {
                not: excludeUserId
              }
            }
          : {})
      },
      select: {
        id: true
      }
    });

    if (existingUser) {
      throw new HttpError(409, 'Email ja esta em uso', {
        code: 'EMAIL_ALREADY_IN_USE'
      });
    }

    const reserved = await tx.emailChangeRequest.findFirst({
      where: {
        reservationKey: emailCanonical,
        invalidatedAt: null,
        consumedAt: null,
        expiresAt: {
          gt: nowUtc()
        },
        ...(excludeUserId
          ? {
              userId: {
                not: excludeUserId
              }
            }
          : {})
      },
      select: {
        id: true
      }
    });

    if (reserved) {
      throw new HttpError(409, 'Email ja esta em uso', {
        code: 'EMAIL_ALREADY_IN_USE'
      });
    }
  }

  async assertUsernameAvailable(tx, username, { excludeUserId = null } = {}) {
    const usernameCanonical = normalizeCanonical(username);
    const existingUser = await tx.user.findFirst({
      where: {
        usernameCanonical,
        ...(excludeUserId
          ? {
              id: {
                not: excludeUserId
              }
            }
          : {})
      },
      select: {
        id: true
      }
    });

    if (existingUser) {
      throw new HttpError(409, 'Usuario ja esta em uso', {
        code: 'USERNAME_ALREADY_IN_USE'
      });
    }
  }

  async countActiveAdmins(tx, { excludeUserId = null } = {}) {
    return tx.user.count({
      where: {
        role: USER_ROLES.ADMIN,
        status: USER_STATUSES.ACTIVE,
        ...(excludeUserId
          ? {
              id: {
                not: excludeUserId
              }
            }
          : {})
      }
    });
  }

  async assertAdminInvariant(tx, targetUser, { nextRole = null, nextStatus = null, actorUserId = null } = {}) {
    const role = nextRole ?? targetUser.role;
    const status = nextStatus ?? targetUser.status;
    const isAdmin = targetUser.role === USER_ROLES.ADMIN;
    const remainsAdmin = role === USER_ROLES.ADMIN;
    const remainsActive = status === USER_STATUSES.ACTIVE;

    if (targetUser.id === actorUserId && (!remainsAdmin || !remainsActive)) {
      throw new HttpError(409, 'O administrador nao pode remover o proprio acesso administrativo', {
        code: 'LAST_ADMIN_REQUIRED'
      });
    }

    if (isAdmin && (!remainsAdmin || !remainsActive)) {
      const otherActiveAdmins = await this.countActiveAdmins(tx, { excludeUserId: targetUser.id });
      if (otherActiveAdmins === 0) {
        throw new HttpError(409, 'Nao e permitido deixar o sistema sem administrador ativo', {
          code: 'LAST_ADMIN_REQUIRED'
        });
      }
    }
  }

  async getMe(actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'load profile');
    return this.prisma.$transaction(async (tx) => {
      await this.expireEmailChangeReservations(tx, actor.actorUserId);
      const user = await this.requireUserById(tx, actor.actorUserId);
      const pendingEmailChange = await this.getPendingEmailChange(tx, actor.actorUserId);
      return {
        user: toUserSummary(user, { pendingEmailChange })
      };
    });
  }

  async listUsers(input, actorContext) {
    assertAdminActor(actorContext, 'list users');
    const page = readPageQuery(input.page, 1);
    const limit = readLimitQuery(input.limit, {
      fallback: USER_LIST_LIMIT_DEFAULT,
      max: USER_LIST_LIMIT_MAX
    });
    const search = normalizeOptionalText(input.search, 'search', 200);
    const role = input.role ? normalizeRole(input.role, 'role') : null;
    const status = input.status ? normalizeOptionalText(input.status, 'status', 20)?.toUpperCase() : null;
    const skip = (page - 1) * limit;

    const where = {
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { username: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const [items, total, pendingRequests] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        select: USER_SELECT
      }),
      this.prisma.user.count({ where }),
      this.prisma.emailChangeRequest.findMany({
        where: {
          invalidatedAt: null,
          consumedAt: null,
          expiresAt: {
            gt: nowUtc()
          },
          reservationKey: {
            not: null
          }
        },
        select: {
          userId: true,
          newEmail: true,
          expiresAt: true
        }
      })
    ]);

    const pendingMap = new Map(
      pendingRequests.map((request) => [
        request.userId,
        {
          requestId: null,
          newEmail: request.newEmail,
          expiresAt: toIsoString(request.expiresAt)
        }
      ])
    );

    return {
      items: items.map((item) => toUserSummary(item, { pendingEmailChange: pendingMap.get(item.id) ?? null })),
      page: buildPage(total, page, limit)
    };
  }

  async getUser(userId, actorContext) {
    assertAdminActor(actorContext, 'get user');
    return this.prisma.$transaction(async (tx) => {
      await this.expireEmailChangeReservations(tx, userId);
      const user = await this.requireUserById(tx, userId);
      const pendingEmailChange = await this.getPendingEmailChange(tx, userId);
      return {
        user: toUserSummary(user, { pendingEmailChange })
      };
    });
  }

  async createUser(input, actorContext) {
    const actor = assertAdminActor(actorContext, 'create user');
    const fullName = normalizeRequiredText(input.fullName, 'fullName', 160);
    const username = normalizeUsername(input.username);
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    const password = normalizePassword(input.password);
    const role = normalizeRole(input.role);
    const passwordHash = await hashPassword(password);
    const now = nowUtc();

    return this.prisma.$transaction(async (tx) => {
      await this.assertUsernameAvailable(tx, username);
      await this.assertEmailAvailable(tx, email);

      const created = await tx.user.create({
        data: {
          id: randomUUID(),
          fullName,
          username,
          usernameCanonical: normalizeCanonical(username),
          email,
          emailCanonical: normalizeCanonical(email),
          phone,
          passwordHash,
          role,
          status: USER_STATUSES.ACTIVE,
          initialPasswordDecision: INITIAL_PASSWORD_DECISIONS.PENDING,
          createdAt: now,
          updatedAt: now
        },
        select: USER_SELECT
      });

      await this.emailService.sendUserCreated({
        to: created.email,
        fullName: created.fullName,
        username: created.username,
        password
      });

      await this.recordAuditEvent(tx, {
        targetUserId: created.id,
        actorContext: actor,
        eventType: USER_AUDIT_EVENT_TYPES.USER_CREATED,
        payload: {
          after: {
            fullName: created.fullName,
            username: created.username,
            email: created.email,
            phone: created.phone,
            role: created.role,
            status: created.status
          }
        }
      });

      return {
        user: toUserSummary(created),
        generatedPassword: password
      };
    });
  }

  async updateUser(userId, input, actorContext) {
    const actor = assertAdminActor(actorContext, 'update user');
    const now = nowUtc();

    return this.prisma.$transaction(async (tx) => {
      await this.expireEmailChangeReservations(tx, userId, now);
      const user = await this.requireUserById(tx, userId);
      if (user.status !== USER_STATUSES.ACTIVE) {
        throw new HttpError(409, 'Usuario inativo deve ser reativado antes da edicao', {
          code: 'USER_INACTIVE'
        });
      }

      const updateData = {};
      const afterSnapshot = {
        fullName: user.fullName,
        username: user.username,
        phone: user.phone,
        role: user.role
      };
      let usernameChanged = false;
      let roleChanged = false;
      let emailChangeResult = null;

      if (input.fullName !== undefined) {
        const fullName = normalizeRequiredText(input.fullName, 'fullName', 160);
        updateData.fullName = fullName;
        afterSnapshot.fullName = fullName;
      }

      if (input.username !== undefined) {
        const username = normalizeUsername(input.username);
        if (normalizeCanonical(username) !== user.usernameCanonical) {
          await this.assertUsernameAvailable(tx, username, { excludeUserId: user.id });
          updateData.username = username;
          updateData.usernameCanonical = normalizeCanonical(username);
          afterSnapshot.username = username;
          usernameChanged = true;
        }
      }

      if (input.phone !== undefined) {
        const phone = normalizePhone(input.phone);
        updateData.phone = phone;
        afterSnapshot.phone = phone;
      }

      if (input.role !== undefined) {
        const role = normalizeRole(input.role);
        await this.assertAdminInvariant(tx, user, {
          nextRole: role,
          actorUserId: actor.actorUserId
        });
        if (role !== user.role) {
          updateData.role = role;
          afterSnapshot.role = role;
          roleChanged = true;
        }
      }

      if (input.email !== undefined) {
        const email = normalizeEmail(input.email);
        if (normalizeCanonical(email) !== user.emailCanonical) {
          await this.assertEmailAvailable(tx, email, { excludeUserId: user.id });
          await this.invalidateEmailChangeRequests(tx, user.id, now);

          const code = generateNumericCode();
          const timing = buildRequestTiming(now);
          const request = await tx.emailChangeRequest.create({
            data: {
              id: randomUUID(),
              userId: user.id,
              newEmail: email,
              newEmailCanonical: normalizeCanonical(email),
              reservationKey: normalizeCanonical(email),
              codeHash: hashCode(code),
              expiresAt: timing.expiresAt,
              resendAvailableAt: timing.resendAvailableAt,
              retryAvailableAt: timing.retryAvailableAt,
              createdAt: now
            }
          });

          await this.emailService.sendEmailChangeOldEmailNotice({
            to: user.email,
            fullName: user.fullName,
            newEmail: email
          });
          await this.emailService.sendEmailChangeCode({
            to: email,
            fullName: user.fullName,
            code,
            newEmail: email
          });

          await this.recordAuditEvent(tx, {
            targetUserId: user.id,
            actorContext: actor,
            eventType: USER_AUDIT_EVENT_TYPES.EMAIL_CHANGE_REQUESTED,
            payload: {
              before: {
                email: user.email
              },
              after: {
                email
              }
            }
          });

          emailChangeResult = {
            requestId: request.id,
            newEmail: request.newEmail,
            expiresAt: toIsoString(request.expiresAt)
          };
        }
      }

      let updatedUser = user;
      if (Object.keys(updateData).length > 0) {
        updatedUser = await tx.user.update({
          where: { id: user.id },
          data: updateData,
          select: USER_SELECT
        });

        const diff = buildDiff(
          {
            fullName: user.fullName,
            username: user.username,
            phone: user.phone,
            role: user.role
          },
          afterSnapshot
        );

        if (Object.keys(diff.after).length > 0) {
          await this.recordAuditEvent(tx, {
            targetUserId: updatedUser.id,
            actorContext: actor,
            eventType: roleChanged ? USER_AUDIT_EVENT_TYPES.USER_ROLE_CHANGED : USER_AUDIT_EVENT_TYPES.USER_UPDATED,
            payload: diff
          });
        }
      }

      if (usernameChanged) {
        await this.revokeUserSessions(tx, updatedUser.id, USER_SESSION_END_REASONS.USERNAME_CHANGED);
        await this.emailService.sendUsernameChangedNotice({
          to: updatedUser.email,
          fullName: updatedUser.fullName,
          username: updatedUser.username
        });
      }

      if (roleChanged) {
        await this.revokeUserSessions(tx, updatedUser.id, USER_SESSION_END_REASONS.ROLE_CHANGED);
      }

      const pendingEmailChange = emailChangeResult ?? (await this.getPendingEmailChange(tx, updatedUser.id, now));
      return {
        user: toUserSummary(updatedUser, { pendingEmailChange }),
        sessionRevoked: usernameChanged || roleChanged
      };
    });
  }

  async inactivateUser(userId, input, actorContext) {
    const actor = assertAdminActor(actorContext, 'inactivate user');
    const reasonText = normalizeRequiredText(input.reasonText, 'reasonText', 500);
    const now = nowUtc();

    return this.prisma.$transaction(async (tx) => {
      const user = await this.requireUserById(tx, userId);
      await this.assertAdminInvariant(tx, user, {
        nextStatus: USER_STATUSES.INACTIVE,
        actorUserId: actor.actorUserId
      });

      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          status: USER_STATUSES.INACTIVE
        },
        select: USER_SELECT
      });

      await this.revokeUserSessions(tx, user.id, USER_SESSION_END_REASONS.INACTIVATED);
      await this.invalidatePasswordResetRequests(tx, user.id, now);
      await this.invalidateEmailChangeRequests(tx, user.id, now);
      await this.emailService.sendUserInactivated({
        to: updated.email,
        fullName: updated.fullName
      });

      await this.recordAuditEvent(tx, {
        targetUserId: updated.id,
        actorContext: actor,
        eventType: USER_AUDIT_EVENT_TYPES.USER_INACTIVATED,
        reasonText,
        payload: {
          before: {
            status: user.status
          },
          after: {
            status: updated.status
          }
        }
      });

      return {
        user: toUserSummary(updated)
      };
    });
  }

  async reactivateUser(userId, actorContext) {
    const actor = assertAdminActor(actorContext, 'reactivate user');

    return this.prisma.$transaction(async (tx) => {
      const user = await this.requireUserById(tx, userId);
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          status: USER_STATUSES.ACTIVE
        },
        select: USER_SELECT
      });

      await this.emailService.sendUserReactivated({
        to: updated.email,
        fullName: updated.fullName
      });
      await this.recordAuditEvent(tx, {
        targetUserId: updated.id,
        actorContext: actor,
        eventType: USER_AUDIT_EVENT_TYPES.USER_REACTIVATED,
        payload: {
          before: {
            status: user.status
          },
          after: {
            status: updated.status
          }
        }
      });

      return {
        user: toUserSummary(updated)
      };
    });
  }

  async unlockUser(userId, actorContext) {
    const actor = assertAdminActor(actorContext, 'unlock user');

    return this.prisma.$transaction(async (tx) => {
      const user = await this.requireUserById(tx, userId);
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null
        },
        select: USER_SELECT
      });

      await this.recordAuditEvent(tx, {
        targetUserId: updated.id,
        actorContext: actor,
        eventType: USER_AUDIT_EVENT_TYPES.USER_UNLOCKED,
        payload: {
          before: {
            failedLoginAttempts: user.failedLoginAttempts,
            lockedUntil: toIsoString(user.lockedUntil)
          },
          after: {
            failedLoginAttempts: updated.failedLoginAttempts,
            lockedUntil: toIsoString(updated.lockedUntil)
          }
        }
      });

      return {
        user: toUserSummary(updated)
      };
    });
  }

  async resetUserPassword(userId, input, actorContext) {
    const actor = assertAdminActor(actorContext, 'reset user password');
    const password = normalizePassword(input.password);
    const passwordHash = await hashPassword(password);

    return this.prisma.$transaction(async (tx) => {
      const user = await this.requireUserById(tx, userId);
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash
        },
        select: USER_SELECT
      });

      await this.revokeUserSessions(tx, updated.id, USER_SESSION_END_REASONS.PASSWORD_RESET);
      await this.emailService.sendPasswordResetByAdmin({
        to: updated.email,
        fullName: updated.fullName,
        username: updated.username,
        password
      });
      await this.recordAuditEvent(tx, {
        targetUserId: updated.id,
        actorContext: actor,
        eventType: USER_AUDIT_EVENT_TYPES.PASSWORD_RESET_BY_ADMIN,
        payload: {}
      });

      return {
        user: toUserSummary(updated),
        generatedPassword: password
      };
    });
  }

  async updateOwnProfile(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'update own profile');
    const now = nowUtc();

    return this.prisma.$transaction(async (tx) => {
      await this.expireEmailChangeReservations(tx, actor.actorUserId, now);
      const user = await this.requireUserById(tx, actor.actorUserId);
      if (user.status !== USER_STATUSES.ACTIVE) {
        throw new HttpError(403, 'Conta inativa. Fale com o administrador.', {
          code: 'ACCOUNT_INACTIVE'
        });
      }

      const updateData = {};
      const afterSnapshot = {
        fullName: user.fullName,
        username: user.username,
        phone: user.phone
      };
      let usernameChanged = false;

      if (input.fullName !== undefined) {
        const fullName = normalizeRequiredText(input.fullName, 'fullName', 160);
        updateData.fullName = fullName;
        afterSnapshot.fullName = fullName;
      }

      if (input.username !== undefined) {
        const username = normalizeUsername(input.username);
        if (normalizeCanonical(username) !== user.usernameCanonical) {
          await this.assertUsernameAvailable(tx, username, { excludeUserId: user.id });
          updateData.username = username;
          updateData.usernameCanonical = normalizeCanonical(username);
          afterSnapshot.username = username;
          usernameChanged = true;
        }
      }

      if (input.phone !== undefined) {
        const phone = normalizePhone(input.phone);
        updateData.phone = phone;
        afterSnapshot.phone = phone;
      }

      let updated = user;
      if (Object.keys(updateData).length > 0) {
        updated = await tx.user.update({
          where: { id: user.id },
          data: updateData,
          select: USER_SELECT
        });

        await this.recordAuditEvent(tx, {
          targetUserId: updated.id,
          actorContext: actor,
          actorUserId: updated.id,
          eventType: USER_AUDIT_EVENT_TYPES.USER_UPDATED,
          payload: buildDiff(
            {
              fullName: user.fullName,
              username: user.username,
              phone: user.phone
            },
            afterSnapshot
          )
        });
      }

      if (usernameChanged) {
        await this.revokeUserSessions(tx, updated.id, USER_SESSION_END_REASONS.USERNAME_CHANGED);
        await this.emailService.sendUsernameChangedNotice({
          to: updated.email,
          fullName: updated.fullName,
          username: updated.username
        });
      }

      const pendingEmailChange = await this.getPendingEmailChange(tx, updated.id, now);
      return {
        user: toUserSummary(updated, { pendingEmailChange }),
        sessionRevoked: usernameChanged
      };
    });
  }

  async changeOwnPassword(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'change own password');
    const password = normalizePassword(input.password);
    const passwordHash = await hashPassword(password);

    return this.prisma.$transaction(async (tx) => {
      const user = await this.requireUserById(tx, actor.actorUserId);
      const updateData = {
        passwordHash
      };

      if (user.initialPasswordDecision === INITIAL_PASSWORD_DECISIONS.PENDING) {
        updateData.initialPasswordDecision = INITIAL_PASSWORD_DECISIONS.CHANGED;
      }

      const updated = await tx.user.update({
        where: { id: user.id },
        data: updateData,
        select: USER_SELECT
      });

      await this.revokeUserSessions(tx, updated.id, USER_SESSION_END_REASONS.PASSWORD_CHANGED);
      await this.emailService.sendPasswordChangedNotice({
        to: updated.email,
        fullName: updated.fullName
      });
      await this.recordAuditEvent(tx, {
        targetUserId: updated.id,
        actorContext: actor,
        actorUserId: updated.id,
        eventType: USER_AUDIT_EVENT_TYPES.PASSWORD_CHANGED,
        payload: {}
      });

      return {
        user: toUserSummary(updated),
        sessionRevoked: true
      };
    });
  }

  async requestOwnEmailChange(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'request email change');
    const newEmail = normalizeEmail(input.email);
    const now = nowUtc();

    return this.prisma.$transaction(async (tx) => {
      const user = await this.requireUserById(tx, actor.actorUserId);
      if (normalizeCanonical(newEmail) === user.emailCanonical) {
        const pendingEmailChange = await this.getPendingEmailChange(tx, user.id, now);
        return {
          user: toUserSummary(user, { pendingEmailChange })
        };
      }

      await this.assertEmailAvailable(tx, newEmail, { excludeUserId: user.id });
      await this.invalidateEmailChangeRequests(tx, user.id, now);

      const code = generateNumericCode();
      const timing = buildRequestTiming(now);
      const request = await tx.emailChangeRequest.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          newEmail: newEmail,
          newEmailCanonical: normalizeCanonical(newEmail),
          reservationKey: normalizeCanonical(newEmail),
          codeHash: hashCode(code),
          expiresAt: timing.expiresAt,
          resendAvailableAt: timing.resendAvailableAt,
          retryAvailableAt: timing.retryAvailableAt,
          createdAt: now
        }
      });

      await this.emailService.sendEmailChangeOldEmailNotice({
        to: user.email,
        fullName: user.fullName,
        newEmail
      });
      await this.emailService.sendEmailChangeCode({
        to: newEmail,
        fullName: user.fullName,
        code,
        newEmail
      });

      await this.recordAuditEvent(tx, {
        targetUserId: user.id,
        actorContext: actor,
        actorUserId: user.id,
        eventType: USER_AUDIT_EVENT_TYPES.EMAIL_CHANGE_REQUESTED,
        payload: {
          before: {
            email: user.email
          },
          after: {
            email: newEmail
          }
        }
      });

      const refreshedUser = await this.requireUserById(tx, user.id);
      return {
        user: toUserSummary(refreshedUser, {
          pendingEmailChange: {
            requestId: request.id,
            newEmail: request.newEmail,
            expiresAt: toIsoString(request.expiresAt)
          }
        })
      };
    });
  }

  async resendOwnEmailChangeCode(actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'resend email change code');
    const now = nowUtc();

    return this.prisma.$transaction(async (tx) => {
      const user = await this.requireUserById(tx, actor.actorUserId);
      await this.expireEmailChangeReservations(tx, user.id, now);
      const request = await tx.emailChangeRequest.findFirst({
        where: {
          userId: user.id,
          invalidatedAt: null,
          consumedAt: null,
          expiresAt: {
            gt: now
          },
          reservationKey: {
            not: null
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (!request) {
        throw new HttpError(404, 'Nao existe troca de email pendente', {
          code: 'EMAIL_CHANGE_REQUEST_NOT_FOUND'
        });
      }

      if (new Date(request.resendAvailableAt).getTime() > now.getTime()) {
        throw new HttpError(429, 'Aguarde 1 minuto para reenviar o codigo', {
          code: 'EMAIL_CHANGE_RESEND_NOT_AVAILABLE',
          resendAvailableAt: toIsoString(request.resendAvailableAt)
        });
      }

      const code = generateNumericCode();
      const expiresAt = addMilliseconds(now, REQUEST_CODE_RESEND_MS * 15);
      const resendAvailableAt = addMilliseconds(now, REQUEST_CODE_RESEND_MS);
      const updatedRequest = await tx.emailChangeRequest.update({
        where: { id: request.id },
        data: {
          codeHash: hashCode(code),
          expiresAt,
          resendAvailableAt,
          retryAvailableAt: now,
          failedAttempts: 0
        }
      });

      await this.emailService.sendEmailChangeCode({
        to: updatedRequest.newEmail,
        fullName: user.fullName,
        code,
        newEmail: updatedRequest.newEmail
      });

      const refreshedUser = await this.requireUserById(tx, user.id);
      return {
        user: toUserSummary(refreshedUser, {
          pendingEmailChange: {
            requestId: updatedRequest.id,
            newEmail: updatedRequest.newEmail,
            expiresAt: toIsoString(updatedRequest.expiresAt)
          }
        })
      };
    });
  }

  async confirmOwnEmailChange(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'confirm email change');
    const code = normalizeRequiredText(input.code, 'code', 6);
    const now = nowUtc();

    return this.prisma.$transaction(async (tx) => {
      const user = await this.requireUserById(tx, actor.actorUserId);
      await this.expireEmailChangeReservations(tx, user.id, now);
      const request = await tx.emailChangeRequest.findFirst({
        where: {
          userId: user.id,
          invalidatedAt: null,
          consumedAt: null,
          expiresAt: {
            gt: now
          },
          reservationKey: {
            not: null
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (!request) {
        throw new HttpError(404, 'Nao existe troca de email pendente', {
          code: 'EMAIL_CHANGE_REQUEST_NOT_FOUND'
        });
      }

      if (request.codeHash !== hashCode(code)) {
        const failedAttempts = request.failedAttempts + 1;
        const data = {
          failedAttempts
        };

        if (failedAttempts >= REQUEST_MAX_ATTEMPTS) {
          data.invalidatedAt = now;
          data.retryAvailableAt = buildBlockedRetryAt(now);
          data.reservationKey = null;
        }

        await tx.emailChangeRequest.update({
          where: { id: request.id },
          data
        });

        if (failedAttempts >= REQUEST_MAX_ATTEMPTS) {
          throw new HttpError(429, 'Pedido invalidado. Solicite novamente em 5 minutos.', {
            code: 'EMAIL_CHANGE_REQUEST_LOCKED'
          });
        }

        throw new HttpError(422, 'Codigo invalido', {
          code: 'INVALID_CODE'
        });
      }

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          email: request.newEmail,
          emailCanonical: request.newEmailCanonical
        },
        select: USER_SELECT
      });

      await tx.emailChangeRequest.update({
        where: { id: request.id },
        data: {
          consumedAt: now,
          reservationKey: null
        }
      });

      await this.recordAuditEvent(tx, {
        targetUserId: updatedUser.id,
        actorContext: actor,
        actorUserId: updatedUser.id,
        eventType: USER_AUDIT_EVENT_TYPES.EMAIL_CHANGE_CONFIRMED,
        payload: {
          before: {
            email: user.email
          },
          after: {
            email: updatedUser.email
          }
        }
      });

      return {
        user: toUserSummary(updatedUser)
      };
    });
  }

  async recordInitialPasswordDecision(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'record initial password decision');
    const decision = normalizeInitialPasswordDecision(input.decision);

    return this.prisma.$transaction(async (tx) => {
      const user = await this.requireUserById(tx, actor.actorUserId);
      if (user.initialPasswordDecision !== INITIAL_PASSWORD_DECISIONS.PENDING) {
        return {
          user: toUserSummary(user)
        };
      }

      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          initialPasswordDecision: decision
        },
        select: USER_SELECT
      });

      await this.recordAuditEvent(tx, {
        targetUserId: updated.id,
        actorContext: actor,
        actorUserId: updated.id,
        eventType: USER_AUDIT_EVENT_TYPES.INITIAL_PASSWORD_DECISION_RECORDED,
        payload: {
          after: {
            decision
          }
        }
      });

      return {
        user: toUserSummary(updated)
      };
    });
  }

  async requestPasswordReset(input, actorContext) {
    const email = normalizeEmail(input.email);
    const emailCanonical = normalizeCanonical(email);
    const now = nowUtc();

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: {
          emailCanonical
        },
        select: USER_SELECT
      });

      if (!user) {
        throw new HttpError(404, 'Email nao encontrado. Revise o email informado.', {
          code: 'EMAIL_NOT_FOUND'
        });
      }

      if (user.status === USER_STATUSES.INACTIVE) {
        throw new HttpError(403, 'Conta inativa. Fale com o administrador.', {
          code: 'ACCOUNT_INACTIVE'
        });
      }

      if (isLocked(user, now)) {
        throw new HttpError(423, 'Conta temporariamente bloqueada. Aguarde 5 minutos.', {
          code: 'ACCOUNT_LOCKED',
          lockedUntil: toIsoString(user.lockedUntil)
        });
      }

      const latest = await tx.passwordResetRequest.findFirst({
        where: {
          userId: user.id
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (latest && new Date(latest.retryAvailableAt).getTime() > now.getTime()) {
        throw new HttpError(429, 'Aguarde 5 minutos para solicitar um novo codigo', {
          code: 'PASSWORD_RESET_REQUEST_LOCKED',
          retryAvailableAt: toIsoString(latest.retryAvailableAt)
        });
      }

      if (
        latest &&
        !latest.invalidatedAt &&
        !latest.consumedAt &&
        new Date(latest.expiresAt).getTime() > now.getTime() &&
        new Date(latest.resendAvailableAt).getTime() > now.getTime()
      ) {
        throw new HttpError(429, 'Aguarde 1 minuto para reenviar o codigo', {
          code: 'PASSWORD_RESET_RESEND_NOT_AVAILABLE',
          resendAvailableAt: toIsoString(latest.resendAvailableAt)
        });
      }

      await this.invalidatePasswordResetRequests(tx, user.id, now);
      const code = generateNumericCode();
      const timing = buildRequestTiming(now);
      const created = await tx.passwordResetRequest.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          emailCanonical,
          codeHash: hashCode(code),
          expiresAt: timing.expiresAt,
          resendAvailableAt: timing.resendAvailableAt,
          retryAvailableAt: timing.retryAvailableAt,
          createdAt: now
        }
      });

      await this.emailService.sendPasswordResetCode({
        to: user.email,
        fullName: user.fullName,
        code
      });

      await this.recordAuditEvent(tx, {
        targetUserId: user.id,
        actorContext,
        actorUserId: user.id,
        eventType: USER_AUDIT_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
        payload: {
          email: maskEmailForPayload(user.email)
        }
      });

      return {
        resetRequest: {
          requestId: created.id,
          expiresAt: toIsoString(created.expiresAt),
          resendAvailableAt: toIsoString(created.resendAvailableAt)
        }
      };
    });
  }

  async verifyPasswordResetCode(input) {
    const code = normalizePasswordResetCode(input.code);
    const now = nowUtc();

    return this.prisma.$transaction(async (tx) => {
      const { request } = await this.loadPasswordResetContext(tx, input.email, now);
      await this.assertPasswordResetCode(tx, request, code, now);

      return {
        verification: {
          verified: true
        }
      };
    });
  }

  async resetPasswordWithCode(input, actorContext) {
    const code = normalizePasswordResetCode(input.code);
    const password = normalizePassword(input.password);
    const passwordHash = await hashPassword(password);
    const now = nowUtc();

    return this.prisma.$transaction(async (tx) => {
      const { user, request } = await this.loadPasswordResetContext(tx, input.email, now);
      await this.assertPasswordResetCode(tx, request, code, now);

      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null
        },
        select: USER_SELECT
      });

      await tx.passwordResetRequest.update({
        where: { id: request.id },
        data: {
          consumedAt: now
        }
      });

      await this.revokeUserSessions(tx, updated.id, USER_SESSION_END_REASONS.PASSWORD_RESET);
      await this.recordAuditEvent(tx, {
        targetUserId: updated.id,
        actorContext,
        actorUserId: updated.id,
        eventType: USER_AUDIT_EVENT_TYPES.PASSWORD_RESET_COMPLETED,
        payload: {}
      });

      return {
        user: toUserSummary(updated),
        sessionRevoked: true
      };
    });
  }

  async listAuditEvents(input, actorContext) {
    assertAdminActor(actorContext, 'list user audit events');
    const page = readPageQuery(input.page, 1);
    const limit = readLimitQuery(input.limit, {
      fallback: USER_AUDIT_LIMIT_DEFAULT,
      max: USER_AUDIT_LIMIT_MAX
    });
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.userAuditEvent.findMany({
        orderBy: [{ createdAt: 'desc' }, { eventId: 'desc' }],
        skip,
        take: limit,
        include: {
          actorUser: {
            select: {
              id: true,
              fullName: true,
              username: true
            }
          },
          targetUser: {
            select: {
              id: true,
              fullName: true,
              username: true
            }
          }
        }
      }),
      this.prisma.userAuditEvent.count()
    ]);

    return {
      items: items.map((item) => ({
        eventId: item.eventId,
        eventType: item.eventType,
        payload: item.payload,
        reasonText: item.reasonText,
        createdAt: toIsoString(item.createdAt),
        actorUser: item.actorUser
          ? {
              id: item.actorUser.id,
              fullName: item.actorUser.fullName,
              username: item.actorUser.username
            }
          : null,
        targetUser: item.targetUser
          ? {
              id: item.targetUser.id,
              fullName: item.targetUser.fullName,
              username: item.targetUser.username
            }
          : null,
        metadata: {
          ip: item.metadataIp,
          userAgent: item.metadataUserAgent
        }
      })),
      page: buildPage(total, page, limit)
    };
  }

  async registerLoginFailure({ username, actorContext }) {
    const normalizedUsername = normalizeCanonical(username);
    const now = nowUtc();

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: {
          usernameCanonical: normalizedUsername
        },
        select: USER_SELECT
      });

      if (!user) {
        await this.recordAuditEvent(tx, {
          targetUserId: null,
          actorContext,
          eventType: USER_AUDIT_EVENT_TYPES.LOGIN_FAILED,
          payload: {
            submittedUsername: username,
            failureCode: 'USERNAME_NOT_FOUND'
          }
        });

        throw new HttpError(401, 'Usuario nao encontrado', {
          code: 'USERNAME_NOT_FOUND'
        });
      }

      if (user.status === USER_STATUSES.INACTIVE) {
        await this.recordAuditEvent(tx, {
          targetUserId: user.id,
          actorContext,
          eventType: USER_AUDIT_EVENT_TYPES.LOGIN_FAILED,
          payload: {
            submittedUsername: username,
            failureCode: 'ACCOUNT_INACTIVE'
          }
        });

        throw new HttpError(403, 'Conta inativa. Fale com o administrador.', {
          code: 'ACCOUNT_INACTIVE'
        });
      }

      if (isLocked(user, now)) {
        await this.recordAuditEvent(tx, {
          targetUserId: user.id,
          actorContext,
          eventType: USER_AUDIT_EVENT_TYPES.LOGIN_FAILED,
          payload: {
            submittedUsername: username,
            failureCode: 'ACCOUNT_LOCKED'
          }
        });

        throw new HttpError(423, 'Conta temporariamente bloqueada. Aguarde 5 minutos.', {
          code: 'ACCOUNT_LOCKED',
          lockedUntil: toIsoString(user.lockedUntil)
        });
      }

      const failedLoginAttempts = user.failedLoginAttempts + 1;
      const data = {
        failedLoginAttempts
      };
      if (failedLoginAttempts >= LOGIN_MAX_ATTEMPTS) {
        data.lockedUntil = addMilliseconds(now, LOGIN_LOCKOUT_MS);
      }

      await tx.user.update({
        where: { id: user.id },
        data
      });

      await this.recordAuditEvent(tx, {
        targetUserId: user.id,
        actorContext,
        eventType: USER_AUDIT_EVENT_TYPES.LOGIN_FAILED,
        payload: {
          submittedUsername: username,
          failureCode: 'INVALID_PASSWORD',
          failedLoginAttempts,
          lockedUntil: toIsoString(data.lockedUntil ?? null)
        }
      });

      if (data.lockedUntil) {
        throw new HttpError(423, 'Conta temporariamente bloqueada. Aguarde 5 minutos.', {
          code: 'ACCOUNT_LOCKED',
          lockedUntil: toIsoString(data.lockedUntil)
        });
      }

      throw new HttpError(401, 'Senha incorreta', {
        code: 'INVALID_PASSWORD'
      });
    });
  }

  async resetLoginFailures(tx, userId) {
    return tx.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: nowUtc()
      },
      select: USER_SELECT
    });
  }

  async verifyCredentials(username, password, actorContext) {
    const normalizedUsername = normalizeCanonical(normalizeUsername(username));
    const user = await this.prisma.user.findFirst({
      where: {
        usernameCanonical: normalizedUsername
      },
      select: USER_SELECT
    });

    if (!user) {
      await this.registerLoginFailure({ username, actorContext });
    }

    if (user.status === USER_STATUSES.INACTIVE) {
      await this.recordAuditEvent(this.prisma, {
        targetUserId: user.id,
        actorContext,
        eventType: USER_AUDIT_EVENT_TYPES.LOGIN_FAILED,
        payload: {
          submittedUsername: username,
          failureCode: 'ACCOUNT_INACTIVE'
        }
      });
      throw new HttpError(403, 'Conta inativa. Fale com o administrador.', {
        code: 'ACCOUNT_INACTIVE'
      });
    }

    if (isLocked(user)) {
      await this.recordAuditEvent(this.prisma, {
        targetUserId: user.id,
        actorContext,
        eventType: USER_AUDIT_EVENT_TYPES.LOGIN_FAILED,
        payload: {
          submittedUsername: username,
          failureCode: 'ACCOUNT_LOCKED'
        }
      });
      throw new HttpError(423, 'Conta temporariamente bloqueada. Aguarde 5 minutos.', {
        code: 'ACCOUNT_LOCKED',
        lockedUntil: toIsoString(user.lockedUntil)
      });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      await this.registerLoginFailure({ username, actorContext });
    }

    return user;
  }

  async createSession(tx, user, actorContext) {
    const sessionId = randomUUID();
    const expiresAt = buildSessionExpiry(nowUtc());
    await tx.userSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        expiresAt,
        createdIp: actorContext?.ip ?? null,
        createdUserAgent: actorContext?.userAgent ?? null
      }
    });

    return {
      sessionId,
      expiresAt
    };
  }

  async registerLoginSuccess(tx, user, actorContext) {
    await this.recordAuditEvent(tx, {
      targetUserId: user.id,
      actorContext,
      actorUserId: user.id,
      eventType: USER_AUDIT_EVENT_TYPES.LOGIN_SUCCEEDED,
      payload: {}
    });
  }

  async recordLogout(sessionId, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'logout');
    const now = nowUtc();

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.userSession.findUnique({
        where: { id: sessionId },
        include: {
          user: {
            select: USER_SELECT
          }
        }
      });

      if (!session || session.userId !== actor.actorUserId) {
        return { ok: true };
      }

      await tx.userSession.updateMany({
        where: {
          id: session.id,
          revokedAt: null
        },
        data: {
          revokedAt: now,
          endReason: USER_SESSION_END_REASONS.LOGOUT
        }
      });

      await this.recordAuditEvent(tx, {
        targetUserId: session.userId,
        actorContext: actor,
        actorUserId: session.userId,
        eventType: USER_AUDIT_EVENT_TYPES.LOGOUT,
        payload: {}
      });

      return { ok: true };
    });
  }

  async markSessionExpired(input, actorContext) {
    const sessionId = normalizeRequiredText(input.sessionId, 'sessionId', 64);
    const now = nowUtc();

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.userSession.findUnique({
        where: { id: sessionId },
        include: {
          user: {
            select: USER_SELECT
          }
        }
      });

      if (!session) {
        return { ok: true };
      }

      if (session.revokedAt) {
        return { ok: true };
      }

      if (new Date(session.expiresAt).getTime() > now.getTime()) {
        return { ok: true };
      }

      await tx.userSession.update({
        where: { id: session.id },
        data: {
          revokedAt: now,
          endReason: USER_SESSION_END_REASONS.EXPIRED
        }
      });

      await this.recordAuditEvent(tx, {
        targetUserId: session.userId,
        actorContext,
        actorUserId: session.userId,
        eventType: USER_AUDIT_EVENT_TYPES.SESSION_EXPIRED,
        payload: {}
      });

      return { ok: true };
    });
  }

  async hydrateSession(sessionId) {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          select: USER_SELECT
        }
      }
    });

    if (!session) {
      return null;
    }

    return session;
  }

  async markSessionExpiredIfNeeded(tx, session, actorContext) {
    const now = nowUtc();
    if (session.revokedAt || new Date(session.expiresAt).getTime() <= now.getTime()) {
      if (!session.revokedAt) {
        await tx.userSession.update({
          where: { id: session.id },
          data: {
            revokedAt: now,
            endReason: USER_SESSION_END_REASONS.EXPIRED
          }
        });
        await this.recordAuditEvent(tx, {
          targetUserId: session.userId,
          actorContext,
          actorUserId: session.userId,
          eventType: USER_AUDIT_EVENT_TYPES.SESSION_EXPIRED,
          payload: {}
        });
      }

      throw new HttpError(401, 'Sessao expirada', {
        code: 'SESSION_EXPIRED'
      });
    }
  }

  toSessionUser(user) {
    return toSessionUser(user);
  }
}
