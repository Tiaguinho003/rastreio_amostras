import { HttpError } from '../contracts/errors.js';

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 10;
const CLEANUP_INTERVAL_MS = 5 * 60_000;

export function createRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs) || DEFAULT_WINDOW_MS;
  const maxRequests = Number(options.maxRequests) || DEFAULT_MAX_REQUESTS;

  const hits = new Map();
  let lastCleanup = Date.now();

  function cleanup(now) {
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
      return;
    }
    lastCleanup = now;
    for (const [key, entry] of hits) {
      if (now - entry.windowStart >= windowMs) {
        hits.delete(key);
      }
    }
  }

  function check(ip, nowMs) {
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    cleanup(now);

    if (!ip) {
      return;
    }

    const entry = hits.get(ip);

    if (!entry || now - entry.windowStart >= windowMs) {
      hits.set(ip, { count: 1, windowStart: now });
      return;
    }

    entry.count += 1;

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      throw new HttpError(429, 'Too many requests, please try again later', {
        retryAfter,
      });
    }
  }

  return { check, _hits: hits };
}
