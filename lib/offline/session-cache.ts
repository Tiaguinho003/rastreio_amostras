import type { SessionData } from '../types';

// Cache local da ultima sessao conhecida — usado SOMENTE quando a checagem
// de sessao falha por REDE (aparelho offline). Um 401 real (sessao expirada
// ou revogada confirmada pelo servidor) limpa o cache e desloga normalmente.
//
// Seguranca: o token de autenticacao NAO passa por aqui — ele vive no cookie
// httpOnly e continua sendo exigido pelo servidor em qualquer chamada. O que
// fica em localStorage e so o snapshot de exibicao da sessao (nome, papel,
// expiresAt), o suficiente pro app-shell renderizar offline. O expiresAt da
// propria sessao e respeitado na leitura: sessao vencida no relogio local
// nao reabre o app offline.

const STORAGE_KEY = 'rastreio.cached-session.v1';

function isValidSessionShape(value: unknown): value is SessionData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.expiresAt !== 'string' || typeof candidate.sessionId !== 'string') {
    return false;
  }

  const user = candidate.user as Record<string, unknown> | undefined;
  return Boolean(
    user &&
    typeof user === 'object' &&
    typeof user.id === 'string' &&
    typeof user.username === 'string' &&
    typeof user.role === 'string'
  );
}

export function readCachedSession(): SessionData | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isValidSessionShape(parsed)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const expiresAtMs = new Date(parsed.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedSession(session: SessionData): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Quota/modo privado: cache e best-effort, nunca bloqueia o fluxo.
  }
}

export function clearCachedSession(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort.
  }
}
