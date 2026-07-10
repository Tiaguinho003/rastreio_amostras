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
  return role === 'COMMERCIAL';
}

// Papeis que NAO podem ser referenciados em vinculo nenhum (responsavel
// comercial de cliente, classificador de amostra, usuario de um corretor).
// Espelha NON_ASSIGNABLE_ROLES do backend (src/auth/roles.js), onde mora o
// enforcement de verdade: lookupUsersForReference nao devolve estes papeis e
// os pontos de escrita respondem 422 PROSPECTOR_NOT_ASSIGNABLE.
//
// No front serve so ao formulario de /users: nao se cria mais um PROSPECTOR,
// mas os que ja existem continuam editaveis (o select de edicao acrescenta o
// papel atual quando ele nao e atribuivel).
export const NON_ASSIGNABLE_ROLES: UserRole[] = ['PROSPECTOR'];

export function isAssignableUserRole(role: UserRole | null | undefined): boolean {
  return !!role && !NON_ASSIGNABLE_ROLES.includes(role);
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

// Quem GERENCIA cadastro de cliente: hub /cadastros (abas Clientes/Bancos/
// Corretores), detalhe do cliente (/clients/[id]) e o card "Cadastros
// pendentes" do dashboard. Os demais papeis nao-PROSPECTOR (CLASSIFIER,
// COMMERCIAL, REGISTRATION) ficam so com a lista /clients e o modal de
// consulta do card. NAO ha gate equivalente no backend: os endpoints de
// cliente exigem so autenticacao — isto e alivio de UI, nao fronteira de
// seguranca (varios deles sao compartilhados com Contratos e envio de amostra).
export const CLIENT_MANAGEMENT_ROLES: UserRole[] = ['ADMIN', 'CADASTRO'];

export function canManageClients(role: UserRole | null | undefined): boolean {
  return !!role && CLIENT_MANAGEMENT_ROLES.includes(role);
}
