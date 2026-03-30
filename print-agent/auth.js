import * as log from './logger.js';

let sessionCookie = null;
let expiresAt = null;

export async function login(config) {
  log.info('Autenticando no backend...');

  const res = await fetch(`${config.backendUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: config.agentUsername,
      password: config.agentPassword,
    }),
    redirect: 'manual',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Login falhou (HTTP ${res.status}): ${text}`);
  }

  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/rastreio_session=([^;]+)/);
  if (!match) {
    throw new Error('Login retornou sem cookie rastreio_session');
  }

  sessionCookie = match[1];

  const body = await res.json().catch(() => null);
  if (body?.expiresAt) {
    expiresAt = new Date(body.expiresAt);
  } else {
    expiresAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
  }

  log.info('Login bem-sucedido. Sessao valida ate', expiresAt.toISOString());
}

export function isTokenExpiringSoon() {
  if (!sessionCookie || !expiresAt) return true;
  const oneHour = 60 * 60 * 1000;
  return Date.now() > expiresAt.getTime() - oneHour;
}

export async function ensureAuthenticated(config) {
  if (isTokenExpiringSoon()) {
    await login(config);
  }
}

export function getAuthHeaders() {
  if (!sessionCookie) {
    throw new Error('Nao autenticado. Chame login() primeiro.');
  }
  return { Cookie: `rastreio_session=${sessionCookie}` };
}

export function clearSession() {
  sessionCookie = null;
  expiresAt = null;
}
