import { createHash, randomInt, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

import { HttpError } from '../contracts/errors.js';
import { USER_ROLES } from '../auth/roles.js';

export const USER_STATUSES = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE'
};

export const INITIAL_PASSWORD_DECISIONS = {
  PENDING: 'PENDING',
  KEPT: 'KEPT',
  CHANGED: 'CHANGED'
};

export const USER_SESSION_END_REASONS = {
  LOGOUT: 'LOGOUT',
  EXPIRED: 'EXPIRED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  USERNAME_CHANGED: 'USERNAME_CHANGED',
  ROLE_CHANGED: 'ROLE_CHANGED',
  INACTIVATED: 'INACTIVATED',
  REVOKED: 'REVOKED'
};

export const USER_AUDIT_EVENT_TYPES = {
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_INACTIVATED: 'USER_INACTIVATED',
  USER_REACTIVATED: 'USER_REACTIVATED',
  USER_UNLOCKED: 'USER_UNLOCKED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET_BY_ADMIN: 'PASSWORD_RESET_BY_ADMIN',
  LOGIN_SUCCEEDED: 'LOGIN_SUCCEEDED',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
  EMAIL_CHANGE_REQUESTED: 'EMAIL_CHANGE_REQUESTED',
  EMAIL_CHANGE_CONFIRMED: 'EMAIL_CHANGE_CONFIRMED',
  INITIAL_PASSWORD_DECISION_RECORDED: 'INITIAL_PASSWORD_DECISION_RECORDED'
};

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 8;
export const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;
export const REQUEST_CODE_TTL_MS = 15 * 60 * 1000;
export const REQUEST_CODE_RESEND_MS = 60 * 1000;
export const REQUEST_MAX_ATTEMPTS = 5;
export const REQUEST_RETRY_MS = 5 * 60 * 1000;
export const USER_LIST_LIMIT_DEFAULT = 10;
export const USER_LIST_LIMIT_MAX = 10;
export const USER_AUDIT_LIMIT_DEFAULT = 10;
export const USER_AUDIT_LIMIT_MAX = 10;

export function normalizeCanonical(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
}

export function normalizeRequiredText(value, fieldName, maxLength = null) {
  if (typeof value !== 'string') {
    throw new HttpError(422, `${fieldName} is required`, {
      code: 'VALIDATION_ERROR',
      field: fieldName
    });
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new HttpError(422, `${fieldName} is required`, {
      code: 'VALIDATION_ERROR',
      field: fieldName
    });
  }

  if (maxLength !== null && normalized.length > maxLength) {
    throw new HttpError(422, `${fieldName} must have at most ${maxLength} characters`, {
      code: 'VALIDATION_ERROR',
      field: fieldName
    });
  }

  return normalized;
}

export function normalizeOptionalText(value, fieldName, maxLength = null) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new HttpError(422, `${fieldName} must be a string`, {
      code: 'VALIDATION_ERROR',
      field: fieldName
    });
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (maxLength !== null && normalized.length > maxLength) {
    throw new HttpError(422, `${fieldName} must have at most ${maxLength} characters`, {
      code: 'VALIDATION_ERROR',
      field: fieldName
    });
  }

  return normalized;
}

export function normalizeUsername(value, fieldName = 'username') {
  const normalized = normalizeRequiredText(value, fieldName, 64);
  return normalized;
}

export function normalizeEmail(value, fieldName = 'email') {
  const normalized = normalizeRequiredText(value, fieldName, 320);
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!pattern.test(normalized)) {
    throw new HttpError(422, `${fieldName} is invalid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName
    });
  }

  return normalized;
}

export function normalizePhone(value, fieldName = 'phone') {
  return normalizeOptionalText(value, fieldName, 40);
}

export function normalizePassword(value, fieldName = 'password') {
  if (typeof value !== 'string') {
    throw new HttpError(422, `${fieldName} is required`, {
      code: 'VALIDATION_ERROR',
      field: fieldName
    });
  }

  if (value.length < 8) {
    throw new HttpError(422, `${fieldName} must have at least 8 characters`, {
      code: 'VALIDATION_ERROR',
      field: fieldName
    });
  }

  return value;
}

export function normalizeRole(value, fieldName = 'role') {
  if (typeof value !== 'string') {
    throw new HttpError(422, `${fieldName} is required`, {
      code: 'VALIDATION_ERROR',
      field: fieldName
    });
  }

  const normalized = value.trim().toUpperCase();
  if (!Object.values(USER_ROLES).includes(normalized)) {
    throw new HttpError(422, `${fieldName} is invalid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName
    });
  }

  return normalized;
}

export function normalizeUserStatus(value, fieldName = 'status') {
  if (typeof value !== 'string') {
    throw new HttpError(422, `${fieldName} is required`, {
      code: 'VALIDATION_ERROR',
      field: fieldName
    });
  }

  const normalized = value.trim().toUpperCase();
  if (!Object.values(USER_STATUSES).includes(normalized)) {
    throw new HttpError(422, `${fieldName} is invalid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName
    });
  }

  return normalized;
}

export function normalizeInitialPasswordDecision(value, fieldName = 'decision') {
  if (typeof value !== 'string') {
    throw new HttpError(422, `${fieldName} is required`, {
      code: 'VALIDATION_ERROR',
      field: fieldName
    });
  }

  const normalized = value.trim().toUpperCase();
  if (!Object.values(INITIAL_PASSWORD_DECISIONS).includes(normalized)) {
    throw new HttpError(422, `${fieldName} is invalid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName
    });
  }

  return normalized;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, passwordHash) {
  if (typeof passwordHash !== 'string' || passwordHash.length === 0) {
    return false;
  }

  try {
    return await bcrypt.compare(password, passwordHash);
  } catch {
    return false;
  }
}

export function generateNumericCode() {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

export function hashCode(code) {
  return createHash('sha256').update(String(code)).digest('hex');
}

export function addMilliseconds(date, amount) {
  return new Date(date.getTime() + amount);
}

export function nowUtc() {
  return new Date();
}

export function toIsoString(value) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function buildSessionExpiry(now = nowUtc()) {
  return addMilliseconds(now, SESSION_TTL_MS);
}

export function isLocked(user, now = nowUtc()) {
  if (!user?.lockedUntil) {
    return false;
  }

  return new Date(user.lockedUntil).getTime() > now.getTime();
}

export function buildRequestTiming(now = nowUtc()) {
  return {
    now,
    expiresAt: addMilliseconds(now, REQUEST_CODE_TTL_MS),
    resendAvailableAt: addMilliseconds(now, REQUEST_CODE_RESEND_MS),
    retryAvailableAt: now
  };
}

export function buildBlockedRetryAt(now = nowUtc()) {
  return addMilliseconds(now, REQUEST_RETRY_MS);
}

export function toUserSummary(user, options = {}) {
  const pendingEmailChange = options.pendingEmailChange ?? null;
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    status: user.status,
    initialPasswordDecision: user.initialPasswordDecision,
    lastLoginAt: toIsoString(user.lastLoginAt),
    lockedUntil: toIsoString(user.lockedUntil),
    isLocked: isLocked(user),
    createdAt: toIsoString(user.createdAt),
    updatedAt: toIsoString(user.updatedAt),
    pendingEmailChange
  };
}

export function toSessionUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    displayName: user.fullName,
    role: user.role,
    status: user.status,
    initialPasswordDecision: user.initialPasswordDecision
  };
}

export function buildDiff(before, after) {
  const beforeValues = {};
  const afterValues = {};

  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) {
      beforeValues[key] = before[key] ?? null;
      afterValues[key] = value ?? null;
    }
  }

  return {
    before: beforeValues,
    after: afterValues
  };
}

export function assertAdminActor(actorContext, actionLabel) {
  if (!actorContext?.actorUserId) {
    throw new HttpError(401, `${actionLabel} requires authenticated user`, {
      code: 'AUTH_REQUIRED'
    });
  }

  if (actorContext.role !== USER_ROLES.ADMIN) {
    throw new HttpError(403, `Only administrators can ${actionLabel}`, {
      code: 'FORBIDDEN'
    });
  }

  return actorContext;
}

export function assertAuthenticatedActor(actorContext, actionLabel) {
  if (!actorContext?.actorUserId) {
    throw new HttpError(401, `${actionLabel} requires authenticated user`, {
      code: 'AUTH_REQUIRED'
    });
  }

  return actorContext;
}

export function buildAuditContext(actorContext = {}) {
  return {
    actorUserId: actorContext.actorUserId ?? null,
    requestId: actorContext.requestId ?? randomUUID(),
    correlationId: actorContext.correlationId ?? null,
    metadataIp: actorContext.ip ?? null,
    metadataUserAgent: actorContext.userAgent ?? null
  };
}

export function readPageQuery(value, fallback = 1) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new HttpError(422, 'page must be an integer greater than or equal to 1', {
      code: 'VALIDATION_ERROR',
      field: 'page'
    });
  }

  return parsed;
}

export function readLimitQuery(value, { fallback, max }) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new HttpError(422, `limit must be an integer between 1 and ${max}`, {
      code: 'VALIDATION_ERROR',
      field: 'limit'
    });
  }

  return parsed;
}
