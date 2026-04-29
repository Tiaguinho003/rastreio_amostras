import { NextResponse, type NextRequest } from 'next/server';

/**
 * M1: middleware de manutencao. Quando `MAINTENANCE_MODE=true` no env,
 * redireciona usuarios nao-ADMIN para `/maintenance` em qualquer rota
 * UI; rotas publicas (login, health, assets) ficam livres.
 *
 * O role e lido decodificando o payload do JWT do cookie
 * `rastreio_session` (base64url puro, sem verificacao). A verificacao
 * de assinatura/validade fica nas APIs e server actions; aqui o objetivo
 * e apenas UX (filtrar quem ve o app vs a pagina de manutencao).
 *
 * Fora de manutencao (env != 'true'), middleware e no-op.
 */

const SESSION_COOKIE = 'rastreio_session';
const MAINTENANCE_PATH = '/maintenance';

const PUBLIC_PATH_PREFIXES = [
  MAINTENANCE_PATH,
  '/login',
  // Rotas de auth ficam livres para que o ADMIN consiga logar mesmo
  // quando o modo manutencao esta ativo. Path real: /api/v1/auth/...
  '/api/v1/auth',
  '/api/health',
  '/_next',
  '/icon-',
  '/apple-icon',
  '/favicon.ico',
  '/manifest',
  '/robots.txt',
  '/sw.js',
  '/workbox-',
  '/logo-',
  '/dashboard-coffee-cup',
  '/login-coffee-beans',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function decodeJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payloadB64 = parts[1];
  if (!payloadB64) return null;
  try {
    const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const json = atob(padded + padding);
    const payload = JSON.parse(json) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  if (process.env.MAINTENANCE_MODE !== 'true') {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const role = sessionToken ? decodeJwtRole(sessionToken) : null;
  if (role === 'ADMIN') {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = MAINTENANCE_PATH;
  url.search = '';
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
