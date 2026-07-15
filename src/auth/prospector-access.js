// Allowlist central de API do PROSPECTOR — papel de campo com app restrito
// (dashboard de informes + perfil). O enforcement fica em
// resolveActorContext (src/api/v1/backend-api.js): qualquer metodo
// autenticado FORA desta lista responde 403 ROLE_FORBIDDEN para o
// PROSPECTOR. Fail-closed: input sem methodName (carimbado no fim de
// createBackendApiV1) tambem nega.
//
// Metodos publicos (health, login, requestPasswordReset,
// verifyPasswordResetCode, resetPasswordWithCode)
// nao resolvem ator e nao passam pelo gate — nao precisam constar aqui.
export const PROSPECTOR_ALLOWED_API_METHODS = new Set([
  // Sessao e conta (perfil, senha, troca de e-mail)
  'getSession',
  'logout',
  'getCurrentUser',
  'updateCurrentUserProfile',
  'changeCurrentUserPassword',
  'requestCurrentUserEmailChange',
  'resendCurrentUserEmailChangeCode',
  'confirmCurrentUserEmailChange',
  'recordInitialPasswordDecision',

  // Notificacoes push (toggle no perfil + inscricao do aparelho)
  'getPushConfig',
  'savePushSubscription',
  'deletePushSubscription',

  // Relatorio de VISITA + dashboard do prospector. Desde a UNIFICACAO
  // (2026-07-15) a visita nasce VINCULADA a um cliente real, entao o
  // prospector agora precisa BUSCAR (lookupClients) e CADASTRAR (createClient)
  // cliente no proprio formulario — e o modal de cadastro rapido lista usuarios
  // p/ o responsavel (lookupUsersForReference). Os tres sao auth-only no service
  // (nenhuma mudanca de gate la); isto AMPLIA de proposito a superficie do
  // prospector (passa a enumerar/criar clientes). cancelVisitReport (soft) entra
  // porque o autor cancela a PROPRIA visita; a regra "so o proprio" e do service.
  'lookupClients',
  'createClient',
  'lookupUsersForReference',
  'createVisitReport',
  'listVisitReports',
  'getMyVisitReportStats',
  'cancelVisitReport',
]);
