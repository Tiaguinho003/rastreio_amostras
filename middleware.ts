import { NextResponse, type NextRequest } from 'next/server';

/**
 * Dois gates de UX, ambos lendo o role por decodificacao do payload do JWT
 * do cookie `rastreio_session` (base64url puro, SEM verificacao de
 * assinatura — a seguranca real fica nas APIs e server actions):
 *
 * M1 — manutencao: quando `MAINTENANCE_MODE=true` no env, redireciona
 * usuarios nao-ADMIN para `/maintenance` em qualquer rota UI; rotas
 * publicas (login, health, assets) ficam livres.
 *
 * P1 — app restrito do PROSPECTOR: fora das paginas do app dele
 * (/dashboard, /profile, alem de /settings que ja redireciona pra
 * /profile e /offline), redireciona para /dashboard. Apenas UX:
 * - APIs nao passam por aqui (se autodefendem no gate central de papel —
 *   ver src/auth/prospector-access.js);
 * - navegacoes servidas do cache do service worker (PWA offline) NAO
 *   passam pelo middleware — os guards de pagina via useRequireAuth
 *   (allowedRoles: NON_PROSPECTOR_ROLES) cobrem esse caminho;
 * - /dashboard nunca e redirecionado (evita loop) e o deep link
 *   `/dashboard?informe=novo` do lembrete push passa intacto.
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

// Paginas do app restrito do PROSPECTOR (prefixos).
const PROSPECTOR_PAGE_PREFIXES = ['/dashboard', '/profile', '/settings', '/offline'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function isProspectorAllowedPage(pathname: string): boolean {
  return PROSPECTOR_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
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
  const { pathname } = request.nextUrl;

  // M1: modo manutencao (comportamento original, inalterado).
  if (process.env.MAINTENANCE_MODE === 'true') {
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

  // P1: app restrito do PROSPECTOR (so paginas — APIs se autodefendem).
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  if (!isPublicPath(pathname)) {
    const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
    const role = sessionToken ? decodeJwtRole(sessionToken) : null;
    if (role === 'PROSPECTOR' && !isProspectorAllowedPage(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      return NextResponse.redirect(url, 307);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
