import test from 'node:test';
import assert from 'node:assert/strict';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';
import { PROSPECTOR_ALLOWED_API_METHODS } from '../src/auth/prospector-access.js';

// Gate central do app restrito do PROSPECTOR (resolveActorContext em
// backend-api.js): qualquer metodo autenticado fora da allowlist responde
// 403 ROLE_FORBIDDEN; os permitidos seguem funcionando e os demais papeis
// nao sao afetados. O methodName e carimbado no proprio createBackendApiV1,
// entao o gate vale tanto pras rotas Next quanto pra chamadas diretas.

const AUTHED_INPUT = Object.freeze({
  headers: { authorization: 'Bearer token' },
  params: {},
  query: {},
  body: {},
});

function createApiFor(role, services = {}) {
  return createBackendApiV1({
    authService: {
      async authenticateAuthorizationHeader() {
        return {
          actorType: 'USER',
          actorUserId: '00000000-0000-0000-0000-000000000001',
          role,
          username: 'user-teste',
          sessionId: '00000000-0000-0000-0000-000000000010',
          sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        };
      },
    },
    commandService: {},
    queryService: {
      async listSamples() {
        return { items: [], page: { total: 0 } };
      },
      async getDashboardPending() {
        return { pending: [] };
      },
      async getPendingPrintJobs() {
        return { items: [] };
      },
    },
    // Stubs truthy: os checks "service is not configured" (501) rodam
    // ANTES de resolveActorContext — sem isto os metodos negados de
    // cliente/usuario/visita responderiam 501 em vez de cair no gate.
    userService: {},
    clientService: {},
    visitReportService: {},
    ...services,
  });
}

test('PROSPECTOR: metodos fora da allowlist respondem 403 ROLE_FORBIDDEN', async () => {
  const api = createApiFor('PROSPECTOR');

  const deniedSamples = [
    'listSamples',
    'getDashboardPending',
    'getPendingPrintJobs',
    'listClients',
    'createSample',
    'listUsers',
    // Relatorio SEMANAL: so ADMIN + COMMERCIAL — fora do app do prospector.
    'createWeeklyReport',
    'cancelWeeklyReport',
    // Feed da pagina "Relatorios": o prospector nao e viewer (ve so os dele
    // no dashboard, via listVisitReports).
    'listInformeFeed',
  ];

  for (const methodName of deniedSamples) {
    const result = await api[methodName](AUTHED_INPUT);
    assert.equal(result.status, 403, `${methodName} deveria responder 403`);
    assert.equal(
      result.body.error.details?.code,
      'ROLE_FORBIDDEN',
      `${methodName} deveria responder ROLE_FORBIDDEN`
    );
    assert.match(result.body.error.message, new RegExp(methodName));
  }
});

test('PROSPECTOR: metodos da allowlist nao caem no gate', async () => {
  const api = createApiFor('PROSPECTOR', {
    userService: {
      async getMe() {
        return {
          user: {
            id: '00000000-0000-0000-0000-000000000001',
            username: 'user-teste',
            email: 'user@example.com',
            fullName: 'Usuario Teste',
            role: 'PROSPECTOR',
            status: 'ACTIVE',
            initialPasswordDecision: 'DONE',
            pendingEmailChange: null,
          },
        };
      },
      // Desde a unificacao (2026-07-15) o prospector cadastra cliente no
      // proprio form da visita; o modal de cadastro rapido lista usuarios.
      async lookupUsersForReference() {
        return { users: [] };
      },
    },
    clientService: {
      // Buscar + cadastrar cliente no form da visita (nasce vinculada).
      async lookupClients() {
        return { items: [] };
      },
    },
    visitReportService: {
      async listVisitReports() {
        return { items: [], page: { total: 0 } };
      },
      async getMyVisitReportStats() {
        return { todayCount: 0, todayNewClientsCount: 0 };
      },
      async cancelVisitReport() {
        return { report: { id: 'x', cancelledAt: new Date().toISOString() } };
      },
    },
    pushService: {
      getPublicKey() {
        return 'public-key';
      },
      async getSubscriptionStatus() {
        return { subscribed: false };
      },
    },
  });

  const allowedSamples = [
    'getSession',
    'listVisitReports',
    'getMyVisitReportStats',
    'getPushConfig',
    'lookupClients',
    'lookupUsersForReference',
  ];

  for (const methodName of allowedSamples) {
    const result = await api[methodName](AUTHED_INPUT);
    assert.equal(result.status, 200, `${methodName} deveria responder 200`);
  }

  // cancelVisitReport tambem entra na allowlist (cancelamento soft do proprio
  // relatorio) — a regra "so o proprio" e do service, nao do gate.
  const cancelled = await api.cancelVisitReport({
    ...AUTHED_INPUT,
    params: { reportId: '00000000-0000-0000-0000-000000000099' },
  });
  assert.equal(cancelled.status, 200, 'cancelVisitReport deveria passar pelo gate');
});

test('demais papeis nao sao afetados pelo gate', async () => {
  for (const role of ['ADMIN', 'COMMERCIAL', 'CLASSIFIER', 'REGISTRATION', 'CADASTRO']) {
    const api = createApiFor(role);
    const result = await api.listSamples(AUTHED_INPUT);
    assert.equal(result.status, 200, `${role} deveria continuar com acesso a listSamples`);
  }
});

test('allowlist so contem metodos reais da API (pega typo/rename)', () => {
  const api = createApiFor('ADMIN');
  for (const name of PROSPECTOR_ALLOWED_API_METHODS) {
    assert.equal(typeof api[name], 'function', `${name} nao existe em createBackendApiV1`);
  }
});
