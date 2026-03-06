import { createHmac, timingSafeEqual } from 'node:crypto';

import { HttpError } from '../contracts/errors.js';

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
const HEADER = {
  alg: 'HS256',
  typ: 'JWT'
};

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function sign(message, secret) {
  return createHmac('sha256', secret).update(message).digest('base64url');
}

function assertSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new Error('AUTH_SECRET must be a string with at least 16 characters');
  }
}

function verifySignature(unsignedToken, providedSignature, secret) {
  const expected = sign(unsignedToken, secret);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function decodeVerifiedToken(token, options) {
  const { secret, ttlSeconds = DEFAULT_TTL_SECONDS, nowMs = Date.now() } = options;
  assertSecret(secret);

  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new HttpError(401, 'Missing access token');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new HttpError(401, 'Malformed access token');
  }

  const [encodedHeader, encodedPayload, providedSignature] = parts;
  const unsigned = `${encodedHeader}.${encodedPayload}`;

  if (!verifySignature(unsigned, providedSignature, secret)) {
    throw new HttpError(401, 'Invalid access token signature');
  }

  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader));
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw new HttpError(401, 'Malformed access token payload');
  }

  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw new HttpError(401, 'Unsupported access token header');
  }

  if (
    typeof payload.exp !== 'number' ||
    typeof payload.sub !== 'string' ||
    typeof payload.role !== 'string' ||
    typeof payload.sid !== 'string'
  ) {
    throw new HttpError(401, 'Invalid access token claims');
  }

  const nowSeconds = Math.floor(nowMs / 1000);

  return {
    payload,
    expired: payload.exp <= nowSeconds,
    ttlSeconds
  };
}

export function issueAccessToken(claims, options) {
  const { secret, ttlSeconds = DEFAULT_TTL_SECONDS, nowMs = Date.now() } = options;
  assertSecret(secret);

  const issuedAt = Math.floor(nowMs / 1000);
  const expiresAt = issuedAt + ttlSeconds;
  const payload = {
    sub: claims.userId,
    sid: claims.sessionId,
    role: claims.role,
    username: claims.username,
    iat: issuedAt,
    exp: expiresAt
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(HEADER));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(unsigned, secret);

  return {
    token: `${unsigned}.${signature}`,
    expiresAt: new Date(expiresAt * 1000).toISOString()
  };
}

export function verifyAccessToken(token, options) {
  const { secret, nowMs = Date.now(), allowExpired = false } = options;
  const { payload, expired } = decodeVerifiedToken(token, { secret, nowMs });

  if (expired && !allowExpired) {
    throw new HttpError(401, 'Access token expired');
  }

  return {
    userId: payload.sub,
    sessionId: payload.sid,
    role: payload.role,
    username: payload.username,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
    expired
  };
}
