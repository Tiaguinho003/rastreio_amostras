import { HttpError } from '../contracts/errors.js';
import { issueAccessToken, verifyAccessToken } from './token-service.js';
import { USER_AUDIT_EVENT_TYPES, USER_STATUSES, toIsoString } from '../users/user-support.js';

function parseBearerToken(headerValue) {
  if (typeof headerValue !== 'string') {
    throw new HttpError(401, 'Authorization header is required', {
      code: 'AUTH_REQUIRED'
    });
  }

  const [scheme, token] = headerValue.trim().split(/\s+/, 2);
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'Authorization must use Bearer token', {
      code: 'AUTH_REQUIRED'
    });
  }

  return token;
}

export class DatabaseAuthService {
  constructor({ prisma, secret, userService }) {
    this.prisma = prisma;
    this.secret = secret;
    this.userService = userService;
  }

  async login({ username, password }, requestContext = {}) {
    if (typeof username !== 'string' || username.trim().length === 0 || typeof password !== 'string') {
      throw new HttpError(422, 'username and password are required', {
        code: 'VALIDATION_ERROR'
      });
    }

    const user = await this.userService.verifyCredentials(username, password, requestContext);

    return this.prisma.$transaction(async (tx) => {
      const refreshedUser = await this.userService.resetLoginFailures(tx, user.id);
      const { sessionId, expiresAt } = await this.userService.createSession(tx, refreshedUser, requestContext);
      await this.userService.registerLoginSuccess(tx, refreshedUser, requestContext);

      const { token } = issueAccessToken(
        {
          userId: refreshedUser.id,
          sessionId,
          role: refreshedUser.role,
          username: refreshedUser.username
        },
        { secret: this.secret }
      );

      return {
        accessToken: token,
        tokenType: 'Bearer',
        expiresAt: expiresAt.toISOString(),
        sessionId,
        user: this.userService.toSessionUser(refreshedUser)
      };
    });
  }

  async authenticateAuthorizationHeader(authorizationHeader, actorContext = {}) {
    const token = parseBearerToken(authorizationHeader);
    const claims = verifyAccessToken(token, {
      secret: this.secret,
      allowExpired: true
    });
    const session = await this.userService.hydrateSession(claims.sessionId);

    if (!session) {
      throw new HttpError(401, 'Sessao encerrada. Faca login novamente.', {
        code: 'SESSION_REVOKED'
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const currentSession = await tx.userSession.findUnique({
        where: { id: session.id },
        include: {
          user: true
        }
      });

      if (!currentSession || currentSession.revokedAt) {
        throw new HttpError(401, 'Sessao encerrada. Faca login novamente.', {
          code: 'SESSION_REVOKED'
        });
      }

      if (currentSession.user.status !== USER_STATUSES.ACTIVE) {
        throw new HttpError(403, 'Conta inativa. Fale com o administrador.', {
          code: 'ACCOUNT_INACTIVE'
        });
      }

      if (claims.expired || new Date(currentSession.expiresAt).getTime() <= Date.now()) {
        await this.userService.markSessionExpiredIfNeeded(tx, currentSession, actorContext);
      }

      await tx.userSession.update({
        where: { id: currentSession.id },
        data: {
          lastSeenAt: new Date()
        }
      });

      return {
        actorType: 'USER',
        actorUserId: currentSession.user.id,
        role: currentSession.user.role,
        username: currentSession.user.username,
        sessionId: currentSession.id,
        sessionExpiresAt: toIsoString(currentSession.expiresAt)
      };
    });
  }

  async logout(actorContext) {
    if (!actorContext?.sessionId) {
      return { ok: true };
    }

    return this.userService.recordLogout(actorContext.sessionId, actorContext);
  }

  async recordSessionExpired(input, actorContext) {
    return this.userService.markSessionExpired(input, actorContext);
  }

  async recordAnonymousAudit(eventType, payload, actorContext = {}) {
    return this.prisma.userAuditEvent.create({
      data: {
        eventId: payload.eventId,
        targetUserId: payload.targetUserId ?? null,
        actorUserId: payload.actorUserId ?? null,
        eventType,
        payload: payload.payload ?? {},
        reasonText: payload.reasonText ?? null,
        requestId: actorContext.requestId ?? payload.requestId ?? 'anonymous',
        correlationId: actorContext.correlationId ?? null,
        metadataIp: actorContext.ip ?? null,
        metadataUserAgent: actorContext.userAgent ?? null
      }
    });
  }
}
