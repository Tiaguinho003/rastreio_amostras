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
// prioridade no lookup de usuarios.
export function isCommercialRole(role) {
  return role === USER_ROLES.COMMERCIAL;
}

// Papeis que NAO podem ser referenciados em vinculo nenhum: responsavel
// comercial de cliente, classificador de amostra, usuario de um corretor.
// O PROSPECTOR continua existindo, com login e app de campo proprios — so nao
// participa mais de vinculos. Espelhado no front em lib/roles.ts.
//
// Enforcement em dois niveis: lookupUsersForReference nao devolve estes papeis
// (some dos seletores) e os pontos de escrita respondem 422
// PROSPECTOR_NOT_ASSIGNABLE. So esconder na UI seria alivio visual — a API
// aceitaria o vinculo do mesmo jeito.
export const NON_ASSIGNABLE_ROLES = Object.freeze([USER_ROLES.PROSPECTOR]);

export function isAssignableUserRole(role) {
  return !NON_ASSIGNABLE_ROLES.includes(role);
}
