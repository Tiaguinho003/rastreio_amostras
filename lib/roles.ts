import type { UserRole } from './types';

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administração',
  CLASSIFIER: 'Classificação',
  REGISTRATION: 'Impressão',
  COMMERCIAL: 'Comercial',
  PROSPECTOR: 'Prospecção',
  CADASTRO: 'Cadastro',
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

// Papeis "comerciais": podem ser responsavel comercial de cliente.
export function isCommercialRole(role: UserRole | null | undefined): boolean {
  return role === 'COMMERCIAL' || role === 'PROSPECTOR';
}

// PROSPECTOR tem um app restrito: dashboard dedicado (cards + lista dos
// proprios informes + FAB do formulario) e perfil — nada alem. A navegacao
// e os guards de pagina usam este helper; a restricao de verdade e a
// allowlist central de API no backend (src/auth/prospector-access.js).
export function isProspector(role: UserRole | null | undefined): boolean {
  return role === 'PROSPECTOR';
}

// allowedRoles das paginas que NAO fazem parte do app do prospector
// (amostras, clientes, camera, informe) — o guard redireciona PROSPECTOR
// para /dashboard. O middleware cobre a navegacao online; este guard cobre
// tambem paginas servidas do cache do service worker (PWA offline).
export const NON_PROSPECTOR_ROLES: UserRole[] = [
  'ADMIN',
  'CLASSIFIER',
  'REGISTRATION',
  'COMMERCIAL',
  'CADASTRO',
];

// Quem ve a pagina "Relatorios" como viewer (todos os informes): ADMIN. Espelha
// VISIT_REPORT_VIEWER_ROLES do backend (src/visits/visit-report-service.js).
// COMMERCIAL ve os PROPRIOS formularios no /informe (scope=mine). CADASTRO saiu
// (2026-06-28): nao acessa mais Relatorios.
export function isVisitReportViewer(role: UserRole | null | undefined): boolean {
  return role === 'ADMIN';
}

// Quem cura o vinculo informe -> cliente em "Relatorios" (Vincular / Cadastrar e
// vincular / Remover vinculo). Espelha VISIT_REPORT_LINK_CURATOR_ROLES do
// backend. CADASTRO saiu (2026-06-28); restou o ADMIN.
export function isVisitLinkCurator(role: UserRole | null | undefined): boolean {
  return role === 'ADMIN';
}

// allowedRoles da pagina "Relatorios" (rota /informe, unificada com o antigo
// /resumo): ADMIN entra como VIEWER (scope=all + curadoria, via
// isVisitReportViewer); COMMERCIAL ve os proprios (scope=mine); REGISTRATION cai
// no placeholder vazio. CLASSIFIER e CADASTRO nao acessam (CADASTRO saiu em
// 2026-06-28).
export const INFORME_ROLES: UserRole[] = ['ADMIN', 'COMMERCIAL', 'REGISTRATION'];

// allowedRoles da pagina "Financeiro" (Fase F, D135): corretagem a receber por
// fechamento — ADMIN + COMMERCIAL (D135 reabre ao COMMERCIAL, revisa a D128
// ADMIN-only). O COMMERCIAL so ve os contratos dele — o backend escopa por
// Broker.userId. Espelha o FINANCEIRO_ROLES do backend (sale-contract-service.js).
export const FINANCEIRO_ROLES: UserRole[] = ['ADMIN', 'COMMERCIAL'];

// allowedRoles da pagina "Contratos" (S74/D110): ADMIN ve/gerencia tudo;
// COMMERCIAL so os contratos em que e corretor (o backend filtra). Espelha o
// SALE_CONTRACT_ACCESS_ROLES do backend.
export const CONTRATOS_ROLES: UserRole[] = ['ADMIN', 'COMMERCIAL'];
