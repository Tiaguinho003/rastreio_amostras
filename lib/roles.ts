import type { UserRole } from './types';

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  CLASSIFIER: 'Classificador',
  REGISTRATION: 'Registro',
  COMMERCIAL: 'Comercial',
  PROSPECTOR: 'Prospector',
};

export function getRoleLabel(role: UserRole): string {
  return USER_ROLE_LABELS[role];
}

export function isRoleAllowed(role: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(role);
}

export function isAdmin(role: UserRole): boolean {
  return role === 'ADMIN';
}

// Papeis "comerciais": podem ser responsavel comercial de cliente. PROSPECTOR
// espelha COMMERCIAL por enquanto; concentrar a regra aqui facilita
// especializa-la no futuro.
export function isCommercialRole(role: UserRole | null | undefined): boolean {
  return role === 'COMMERCIAL' || role === 'PROSPECTOR';
}
