import { HttpError } from '../contracts/errors.js';

export const USER_ROLES = {
  ADMIN: 'ADMIN',
  CLASSIFIER: 'CLASSIFIER',
  REGISTRATION: 'REGISTRATION',
  COMMERCIAL: 'COMMERCIAL',
};

export function assertRoleAllowed(role, allowedRoles, actionLabel) {
  if (!allowedRoles.includes(role)) {
    throw new HttpError(403, `Role ${role} is not allowed to ${actionLabel}`);
  }
}

export function isKnownRole(role) {
  return Object.values(USER_ROLES).includes(role);
}
