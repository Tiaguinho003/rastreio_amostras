import { HttpError } from '../contracts/errors.js';

export const USER_ROLES = {
  ADMIN: 'ADMIN',
  CLASSIFIER: 'CLASSIFIER',
  REGISTRATION: 'REGISTRATION',
  COMMERCIAL: 'COMMERCIAL',
  // PROSPECTOR: app restrito — so informes de visita (+ conta/push).
  // Allowlist central de API em src/auth/prospector-access.js.
  PROSPECTOR: 'PROSPECTOR',
  // CADASTRO: espelha o REGISTRATION (operacao geral) — sem admin e sem
  // elegibilidade comercial. Especializar aqui quando precisar.
  CADASTRO: 'CADASTRO',
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
// prioridade no lookup de usuarios. Vale para COMMERCIAL e PROSPECTOR —
// a restricao de navegacao/API do PROSPECTOR e tratada a parte
// (src/auth/prospector-access.js), nao por aqui.
export function isCommercialRole(role) {
  return role === USER_ROLES.COMMERCIAL || role === USER_ROLES.PROSPECTOR;
}
