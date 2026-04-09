import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveSessionCookieSecureMode,
  shouldUseSecureSessionCookie,
} from '../src/auth/session-cookie-policy.js';

test('resolveSessionCookieSecureMode normalizes explicit values and defaults to auto', () => {
  assert.equal(resolveSessionCookieSecureMode(undefined), 'auto');
  assert.equal(resolveSessionCookieSecureMode('auto'), 'auto');
  assert.equal(resolveSessionCookieSecureMode('true'), 'true');
  assert.equal(resolveSessionCookieSecureMode('1'), 'true');
  assert.equal(resolveSessionCookieSecureMode('false'), 'false');
  assert.equal(resolveSessionCookieSecureMode('off'), 'false');
});

test('shouldUseSecureSessionCookie honors explicit false even for https-like requests', () => {
  assert.equal(
    shouldUseSecureSessionCookie({
      configuredValue: 'false',
      forwardedProto: 'https',
      requestProtocol: 'https:',
    }),
    false
  );
});

test('shouldUseSecureSessionCookie honors explicit true and auto detection', () => {
  assert.equal(
    shouldUseSecureSessionCookie({
      configuredValue: 'true',
      forwardedProto: 'http',
      requestProtocol: 'http:',
    }),
    true
  );

  assert.equal(
    shouldUseSecureSessionCookie({
      configuredValue: 'auto',
      forwardedProto: 'https',
      requestProtocol: 'http:',
    }),
    true
  );

  assert.equal(
    shouldUseSecureSessionCookie({
      configuredValue: 'auto',
      forwardedProto: 'http',
      requestProtocol: 'http:',
    }),
    false
  );
});

test('resolveSessionCookieSecureMode rejects invalid values', () => {
  assert.throws(
    () => resolveSessionCookieSecureMode('maybe'),
    /SESSION_COOKIE_SECURE must be auto, true or false/
  );
});
