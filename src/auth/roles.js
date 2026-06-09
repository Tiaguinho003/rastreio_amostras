import { HttpError } from '../contracts/errors.js';

export const USER_ROLES = {
  ADMIN: 'ADMIN',
  CLASSIFIER: 'CLASSIFIER',
  REGISTRATION: 'REGISTRATION',
  COMMERCIAL: 'COMMERCIAL',
  // PROSPECTOR: por enquanto espelha integralmente os acessos do COMMERCIAL.
  PROSPECTOR: 'PROSPECTOR',
};

export function assertRoleAllowed(role, allowedRoles, actionLabel) {
  if (!allowedRoles.includes(role)) {
    throw new HttpError(403, `Role ${role} is not allowed to ${actionLabel}`);
  }
}

export function isKnownRole(role) {
  return Object.values(USER_ROLES).includes(role);
}

// Papeis "comerciais": podem ser responsavel comercial de cliente e tem
// prioridade no lookup de usuarios. PROSPECTOR espelha COMMERCIAL por enquanto;
// concentrar a regra aqui facilita especializa-la no futuro.
export function isCommercialRole(role) {
  return role === USER_ROLES.COMMERCIAL || role === USER_ROLES.PROSPECTOR;
}
