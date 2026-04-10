import test from 'node:test';
import assert from 'node:assert/strict';

import { createRateLimiter } from '../src/auth/rate-limiter.js';
import { HttpError } from '../src/contracts/errors.js';

test('allows requests up to the limit', () => {
  const limiter = createRateLimiter({ maxRequests: 3, windowMs: 60_000 });
  const now = Date.now();

  assert.doesNotThrow(() => limiter.check('1.2.3.4', now));
  assert.doesNotThrow(() => limiter.check('1.2.3.4', now + 100));
  assert.doesNotThrow(() => limiter.check('1.2.3.4', now + 200));
});

test('blocks request exceeding the limit with 429', () => {
  const limiter = createRateLimiter({ maxRequests: 3, windowMs: 60_000 });
  const now = Date.now();

  limiter.check('1.2.3.4', now);
  limiter.check('1.2.3.4', now + 100);
  limiter.check('1.2.3.4', now + 200);

  assert.throws(
    () => limiter.check('1.2.3.4', now + 300),
    (error) => {
      assert.equal(error instanceof HttpError, true);
      assert.equal(error.status, 429);
      assert.ok(error.details.retryAfter > 0);
      return true;
    }
  );
});

test('resets after the window expires', () => {
  const limiter = createRateLimiter({ maxRequests: 2, windowMs: 1000 });
  const now = Date.now();

  limiter.check('1.2.3.4', now);
  limiter.check('1.2.3.4', now + 100);

  assert.throws(() => limiter.check('1.2.3.4', now + 200));

  assert.doesNotThrow(() => limiter.check('1.2.3.4', now + 1100));
});

test('tracks different IPs independently', () => {
  const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
  const now = Date.now();

  limiter.check('1.1.1.1', now);
  assert.throws(() => limiter.check('1.1.1.1', now + 100));

  assert.doesNotThrow(() => limiter.check('2.2.2.2', now + 100));
});

test('skips check when ip is null or undefined', () => {
  const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });

  assert.doesNotThrow(() => limiter.check(null));
  assert.doesNotThrow(() => limiter.check(undefined));
  assert.doesNotThrow(() => limiter.check(null));
});
