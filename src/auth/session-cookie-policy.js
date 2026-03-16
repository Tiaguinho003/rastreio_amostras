const BOOLEAN_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const BOOLEAN_FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

/**
 * @param {string | null | undefined} [rawValue]
 * @returns {'auto' | 'true' | 'false'}
 */
export function resolveSessionCookieSecureMode(rawValue = process.env.SESSION_COOKIE_SECURE) {
  if (rawValue === undefined || rawValue === null) {
    return 'auto';
  }

  const normalized = String(rawValue).trim().toLowerCase();
  if (!normalized) {
    return 'auto';
  }

  if (normalized === 'auto') {
    return 'auto';
  }

  if (BOOLEAN_TRUE_VALUES.has(normalized)) {
    return 'true';
  }

  if (BOOLEAN_FALSE_VALUES.has(normalized)) {
    return 'false';
  }

  throw new Error('SESSION_COOKIE_SECURE must be auto, true or false');
}

function isHttpsLikeValue(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const firstValue = value.split(',')[0]?.trim().toLowerCase();
  return firstValue === 'https';
}

/**
 * @param {{
 *   configuredValue?: string | null | undefined,
 *   forwardedProto?: string | null | undefined,
 *   requestProtocol?: string | null | undefined
 * }} [options]
 */
export function shouldUseSecureSessionCookie({
  configuredValue = process.env.SESSION_COOKIE_SECURE,
  forwardedProto = null,
  requestProtocol = null
} = {}) {
  const secureMode = resolveSessionCookieSecureMode(configuredValue);

  if (secureMode === 'true') {
    return true;
  }

  if (secureMode === 'false') {
    return false;
  }

  if (isHttpsLikeValue(forwardedProto)) {
    return true;
  }

  return typeof requestProtocol === 'string' && requestProtocol.toLowerCase() === 'https:';
}
