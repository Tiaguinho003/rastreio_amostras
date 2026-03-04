import test from 'node:test';
import assert from 'node:assert/strict';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';

function createMinimalApi(options = {}) {
  const queryService = {
    async listSamples() {
      return { items: [], total: 0 };
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

test('fallback headers are accepted when header auth fallback is enabled', async () => {
  const api = createMinimalApi({
    authService: null,
    headerAuthFallbackEnabled: true
  });

  const result = await api.listSamples({
    headers: {
      'x-user-id': '00000000-0000-0000-0000-000000000001',
      'x-user-role': 'ADMIN'
    },
    params: {},
    query: {},
    body: {}
  });

  assert.equal(result.status, 200);
  assert.equal(Array.isArray(result.body.items), true);
});

test('fallback headers are rejected when header auth fallback is disabled', async () => {
  const api = createMinimalApi({
    authService: null,
    headerAuthFallbackEnabled: false
  });

  const result = await api.listSamples({
    headers: {
      'x-user-id': '00000000-0000-0000-0000-000000000001',
      'x-user-role': 'ADMIN'
    },
    params: {},
    query: {},
    body: {}
  });

  assert.equal(result.status, 401);
  assert.equal(result.body.error.message, 'Authentication required (Bearer token)');
});

test('bearer auth works with fallback disabled', async () => {
  const api = createMinimalApi({
    authService: {
      authenticateAuthorizationHeader(value) {
        if (value !== 'Bearer token') {
          throw new Error('unexpected token');
        }
        return {
          actorType: 'USER',
          actorUserId: '00000000-0000-0000-0000-000000000001',
          role: 'ADMIN',
          username: 'admin'
        };
      }
    },
    headerAuthFallbackEnabled: false
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
