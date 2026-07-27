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

// Quem ve a pagina "Relatorios" como viewer (TODOS os informes, scope=all).
// ACESSO UNIFICADO (2026-07-15): todo papel nao-PROSPECTOR e viewer — o COMMERCIAL,
// que via so os proprios, passa a ver todos. Espelha VISIT_REPORT_VIEWER_ROLES do
// backend (src/visits/visit-report-service.js). PROSPECTOR ve so os proprios.
export function isVisitReportViewer(role: UserRole | null | undefined): boolean {
  return !!role && !isProspector(role);
}

// Quem CRIA o relatorio SEMANAL na pagina "Relatorios" — so ADMIN + COMMERCIAL
// (unificacao 2026-07-15). A VISITA, ao contrario, e criada por qualquer
// autenticado (incl. PROSPECTOR). Espelha WEEKLY_REPORT_AUTHOR_ROLES no backend.
export function isWeeklyReportAuthor(role: UserRole | null | undefined): boolean {
  return role === 'ADMIN' || role === 'COMMERCIAL';
}

// allowedRoles da pagina "Relatorios" (rota /relatorios; /informe e /resumo
// redirecionam pra ela). ACESSO UNIFICADO (2026-07-15): todo papel nao-PROSPECTOR acessa, entra
// como VIEWER (scope=all, via isVisitReportViewer) e cria (canCreate). O COMMERCIAL,
// que via so os proprios, passa a ver todos. Espelha os gates do backend
// (VISIT_REPORT_VIEWER_ROLES + COMMERCIAL_FORM_AUTHOR_ROLES, agora NON_PROSPECTOR).
export const INFORME_ROLES: UserRole[] = NON_PROSPECTOR_ROLES;

// allowedRoles da PAGINA "Financeiro" (rota /financeiro): a carteira de
// corretagem a receber. RC-D3: so ADMIN — e a primeira rota ADMIN-only do
// dominio de contratos. Espelha o FINANCEIRO_ROLES do backend
// (sale-contract-service.js).
//
// RC-D4: o gate e de ROTA, nao de campo. Dentro do contrato TODOS continuam
// vendo dinheiro (valores e corretagem no detalhe); o ADMIN-only protege a
// carteira consolidada, nao o numero.
export const FINANCEIRO_ROLES: UserRole[] = ['ADMIN'];

// RC-D5: o feed de PAGAMENTO do calendario do dashboard NAO segue a carteira.
// Ele era gateado pela mesma constante; apertar sem partir em duas tiraria o
// pagamento do calendario de 4 dos 5 papeis. Espelha o PAYMENT_FEED_ROLES do
// backend (sale-contract-service.js).
export const PAYMENT_FEED_ROLES: UserRole[] = NON_PROSPECTOR_ROLES;

// allowedRoles da pagina "Contratos" (rota /contratos, pagina unica desde a
// RC-D1). ACESSO UNIFICADO (2026-07-15): todo papel nao-PROSPECTOR ve e gerencia
// os contratos — escopo aberto, sem filtro por Broker. Espelha o
// SALE_CONTRACT_ACCESS_ROLES do backend. A carteira consolidada saiu daqui pra
// /financeiro, so ADMIN (RC-D3).
export const CONTRATOS_ROLES: UserRole[] = NON_PROSPECTOR_ROLES;

// RC-D1/RC-D2/RC-D23 (2026-07-27): `ContractsHubTab`, `contractsHubTabs` e
// `contractTabRoute` foram REMOVIDOS. Eles existiam pra mapear evento -> sub-aba
// dona -> rota (e apagar o link quando o papel nao abria aquela aba, DSB-D11).
// Nao ha mais sub-aba nem segunda rota: /contratos e pagina unica, /embarques foi
// extinta, e todo chip do calendario aponta pro proprio contrato
// (`/contratos?details=<id>`), que os 5 papeis nao-PROSPECTOR abrem.

// Quem GERENCIA cadastro de cliente: hub /cadastros (abas Clientes/Corretores) e
// detalhe do cliente (/clients/[id]). ACESSO UNIFICADO (2026-07-15): todo papel
// nao-PROSPECTOR gerencia — o item "Clientes" avulso sai da nav e todos acessam
// clientes pela aba Clientes do hub Cadastros (padrao antes so ADMIN/CADASTRO).
// Continua sem gate equivalente no backend (endpoints de cliente sao auth-only).
export const CLIENT_MANAGEMENT_ROLES: UserRole[] = NON_PROSPECTOR_ROLES;

export function canManageClients(role: UserRole | null | undefined): boolean {
  return !!role && CLIENT_MANAGEMENT_ROLES.includes(role);
}
