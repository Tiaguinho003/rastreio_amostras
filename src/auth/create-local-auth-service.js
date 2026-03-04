import { LocalAuthService } from './local-auth-service.js';

const BOOLEAN_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const BOOLEAN_FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

function loadUsersFromEnv() {
  const raw = process.env.LOCAL_AUTH_USERS_JSON;
  if (!raw) {
    throw new Error('LOCAL_AUTH_USERS_JSON is required and must be a non-empty JSON array');
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('LOCAL_AUTH_USERS_JSON must be a non-empty array');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse LOCAL_AUTH_USERS_JSON: ${error.message}`);
  }
}

function loadSecretFromEnv() {
  const secret = process.env.AUTH_SECRET;
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new Error('AUTH_SECRET is required and must contain at least 16 characters');
  }
  return secret;
}

function isProductionEnv() {
  return (process.env.NODE_ENV ?? 'development').toLowerCase() === 'production';
}

function readBooleanEnv(name) {
  const raw = process.env[name];
  if (raw === undefined) {
    return null;
  }

  const normalized = String(raw).trim().toLowerCase();
  if (BOOLEAN_TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (BOOLEAN_FALSE_VALUES.has(normalized)) {
    return false;
  }

  throw new Error(`${name} must be boolean (true/false/1/0/yes/no/on/off)`);
}

function resolveAllowPlaintextPasswords() {
  const explicit = readBooleanEnv('LOCAL_AUTH_ALLOW_PLAINTEXT_PASSWORDS');
  if (explicit !== null) {
    return explicit;
  }

  return !isProductionEnv();
}

export function createLocalAuthServiceFromEnv() {
  const production = isProductionEnv();
  const users = loadUsersFromEnv();
  const secret = loadSecretFromEnv();
  const allowPlaintextPasswords = resolveAllowPlaintextPasswords();

  if (production && allowPlaintextPasswords) {
    throw new Error('LOCAL_AUTH_ALLOW_PLAINTEXT_PASSWORDS cannot be enabled in production');
  }

  return new LocalAuthService({
    users,
    secret,
    allowPlaintextPasswords
  });
}
