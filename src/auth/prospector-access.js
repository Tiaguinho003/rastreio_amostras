// Allowlist central de API do PROSPECTOR — papel de campo com app restrito
// (dashboard de informes + perfil). O enforcement fica em
// resolveActorContext (src/api/v1/backend-api.js): qualquer metodo
// autenticado FORA desta lista responde 403 ROLE_FORBIDDEN para o
// PROSPECTOR. Fail-closed: input sem methodName (carimbado no fim de
// createBackendApiV1) tambem nega.
//
// Metodos publicos (health, login, requestPasswordReset,
// verifyPasswordResetCode, resetPasswordWithCode, recordSessionExpired)
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

  // Formulario de visita + dashboard do prospector. deleteVisitReport
  // entra porque o autor exclui o PROPRIO informe (lixeira do dashboard);
  // a regra "so o proprio" e do service, nao do gate.
  'lookupClients',
  'createVisitReport',
  'listVisitReports',
  'getMyVisitReportStats',
  'deleteVisitReport',
]);
