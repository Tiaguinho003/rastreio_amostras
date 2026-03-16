import test from 'node:test';
import assert from 'node:assert/strict';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';

function createMinimalApi(options = {}) {
  const queryService = {
    async listSamples() {
      return { items: [], page: { total: 0, totalPages: 1, page: 1, limit: 30, offset: 0, hasPrev: false, hasNext: false } };
    },
    async getDashboardPending() {
      return { pending: [] };
    }
  };

  return createBackendApiV1({
    commandService: {},
    queryService,
    reportService: null,
    ...options
  });
}

test('missing bearer token is rejected', async () => {
  const api = createMinimalApi({
    authService: {
      async authenticateAuthorizationHeader() {
        throw new Error('should not be called');
      }
    }
  });

  const result = await api.listSamples({
    headers: {},
    params: {},
    query: {},
    body: {}
  });

  assert.equal(result.status, 401);
  assert.equal(result.body.error.message, 'Authentication required');
});

test('bearer auth works for protected routes', async () => {
  const api = createMinimalApi({
    authService: {
      async authenticateAuthorizationHeader(value) {
        if (value !== 'Bearer token') {
          throw new Error('unexpected token');
        }

        return {
          actorType: 'USER',
          actorUserId: '00000000-0000-0000-0000-000000000001',
          role: 'ADMIN',
          username: 'admin',
          sessionId: '00000000-0000-0000-0000-000000000010'
        };
      }
    }
  });

  const result = await api.listSamples({
    headers: {
      authorization: 'Bearer token'
    },
    params: {},
    query: {},
    body: {}
  });

  assert.equal(result.status, 200);
  assert.equal(Array.isArray(result.body.items), true);
});

test('session cookie works for protected routes', async () => {
  const api = createMinimalApi({
    authService: {
      async authenticateAuthorizationHeader(value) {
        if (value !== 'Bearer cookie-token') {
          throw new Error('unexpected token');
        }

        return {
          actorType: 'USER',
          actorUserId: '00000000-0000-0000-0000-000000000001',
          role: 'ADMIN',
          username: 'admin',
          sessionId: '00000000-0000-0000-0000-000000000010',
          sessionExpiresAt: new Date(Date.now() + 60_000).toISOString()
        };
      }
    }
  });

  const result = await api.listSamples({
    headers: {
      cookie: 'rastreio_session=cookie-token'
    },
    params: {},
    query: {},
    body: {}
  });

  assert.equal(result.status, 200);
  assert.equal(Array.isArray(result.body.items), true);
});
