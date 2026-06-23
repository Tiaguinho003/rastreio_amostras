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

// Quem ve a pagina /resumo (informes de visita): ADMIN + CADASTRO. Espelha
// VISIT_REPORT_VIEWER_ROLES do backend (src/visits/visit-report-service.js).
// COMMERCIAL saiu (2026-06-18): ja ve os PROPRIOS formularios no /informe
// (scope=mine); o /resumo e supervisao do time (funcao de ADMIN/Cadastro).
export function isVisitReportViewer(role: UserRole | null | undefined): boolean {
  return role === 'ADMIN' || role === 'CADASTRO';
}

// Quem cura o vinculo informe -> cliente no /resumo (Vincular / Cadastrar e
// vincular / Remover vinculo). Espelha VISIT_REPORT_LINK_CURATOR_ROLES do
// backend: subconjunto dos viewers — COMMERCIAL le, nao vincula.
export function isVisitLinkCurator(role: UserRole | null | undefined): boolean {
  return role === 'ADMIN' || role === 'CADASTRO';
}

// Classificacao e Cadastro tem METRICAS como pagina de navegacao (alem do
// dashboard). Usado pra: (a) o swap da tabbar do 5o slot e (b) esconder o
// teaser "Em breve" de Metricas no menu do avatar. Pos-unificacao a tabbar
// difere: CLASSIFIER ve Metricas no 5o slot; CADASTRO (que virou viewer de
// Relatorios) ve Relatorios no slot e acessa Metricas pelo menu do avatar.
export function isMetricsNavRole(role: UserRole | null | undefined): boolean {
  return role === 'CLASSIFIER' || role === 'CADASTRO';
}

// allowedRoles da pagina "Relatorios" (rota /informe, unificada com o antigo
// /resumo): nao-prospector MENOS classificacao. ADMIN/CADASTRO entram como
// VIEWERS (scope=all + curadoria, via isVisitReportViewer); COMMERCIAL ve os
// proprios (scope=mine); REGISTRATION cai no placeholder vazio.
export const INFORME_ROLES: UserRole[] = ['ADMIN', 'COMMERCIAL', 'REGISTRATION', 'CADASTRO'];
