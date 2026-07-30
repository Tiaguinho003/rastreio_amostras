'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ApiError, getCurrentSession, logout as logoutRequest } from '../api-client';
import { useGlobalLoading } from '../loading/loading-context';
import {
  clearCachedSession,
  readCachedSession,
  writeCachedSession,
} from '../offline/session-cache';
import { isRoleAllowed } from '../roles';
import type { SessionData, UserRole } from '../types';

// F2 do ciclo SN: a sessao passa a ser resolvida UMA VEZ, no layout do route
// group (app), em vez de uma vez por pagina. Antes, cada page.tsx chamava
// `useRequireAuth`, e como no App Router a pagina desmonta a cada navegacao,
// TODA navegacao custava um `GET /auth/session` — que e round-trip ao banco
// (resolveActorContext + getMe). Ver docs/Shell-e-Navegacao-Plano-de-Trabalho.md
// §2.4 e a decisao SN-D6.
//
// O contexto expoe a MESMA forma que o antigo `useRequireAuth` devolvia
// (`session`/`loading`/`logout`/`setSession`), de proposito: a migracao das 8
// paginas fica mecanica.
//
// F3 vai inicializar `session` sincronamente do cache (SN-D8) — hoje ainda
// comeca em `null` com `loading: true`, e o page loader cobre a espera.

interface AuthContextValue {
  session: SessionData | null;
  loading: boolean;
  logout: () => Promise<void>;
  setSession: (session: SessionData | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSessionState] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failureReason, setFailureReason] = useState<'session-expired' | 'session-ended' | null>(
    null
  );

  // Loader global da marca enquanto a sessao carrega. Morre na F3, junto com o
  // proprio LoadingProvider.
  useGlobalLoading(loading);

  useEffect(() => {
    let active = true;

    getCurrentSession()
      .then((currentSession) => {
        if (!active) {
          return;
        }

        setFailureReason(null);
        setSessionState(currentSession);
        // Atualiza o snapshot local pra proxima abertura sem internet.
        writeCachedSession(currentSession);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          const maybeCode =
            error.details && typeof error.details === 'object' && 'code' in error.details
              ? error.details.code
              : null;
          setFailureReason(maybeCode === 'SESSION_EXPIRED' ? 'session-expired' : 'session-ended');
          // 401 real: sessao acabou de verdade — o snapshot offline morre junto.
          clearCachedSession();
          setSessionState(null);
          return;
        }

        setFailureReason(null);

        // Falha de REDE (status 0): aparelho offline. Usa a ultima sessao
        // conhecida (se ainda valida pelo expiresAt) em vez de expulsar pro
        // /login — que tambem nao funcionaria sem internet. Demais erros
        // (5xx etc.) mantem o comportamento atual: sessao nula -> login.
        if (error instanceof ApiError && error.status === 0) {
          setSessionState(readCachedSession());
          return;
        }

        setSessionState(null);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const replaceSession = useCallback((nextSession: SessionData | null) => {
    setSessionState(nextSession);
    // Mantem o snapshot offline em dia (atualizacoes de perfil, logout).
    if (nextSession) {
      writeCachedSession(nextSession);
    } else {
      clearCachedSession();
    }
  }, []);

  // Guard de AUTENTICACAO (nao de papel): sem sessao, vai pro login. O guard de
  // PAPEL fica na pagina, via `useRequireRole` — o layout nao sabe (nem deve
  // saber) quais papeis cada rota aceita.
  useEffect(() => {
    if (loading || session) {
      return;
    }

    router.replace(failureReason ? `/login?reason=${failureReason}` : '/login');
  }, [failureReason, loading, router, session]);

  const logout = useCallback(async () => {
    try {
      await logoutRequest(session);
    } catch {
      // local cleanup still wins
    }

    // Snapshots de lista (primeira pintura de /samples e /clients) sao do
    // usuario da sessao — num PWA que sobrevive ao logout, sem esta limpeza o
    // proximo login poderia restaurar a lista de outro usuario.
    try {
      window.sessionStorage.removeItem('samples-list-snapshot-v3');
      window.sessionStorage.removeItem('clients-list-snapshot-v3');
      window.sessionStorage.removeItem('clients-list-snapshot-cad-v3');
    } catch {
      // sessionStorage indisponivel — nada a limpar
    }

    replaceSession(null);
    router.replace('/login');
  }, [replaceSession, router, session]);

  const value = useMemo(
    () => ({ session, loading, logout, setSession: replaceSession }),
    [session, loading, logout, replaceSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Sessao ja resolvida pelo layout do route group `(app)`. So pode ser chamado
 * por descendentes do `AuthProvider` — fora dele, lanca.
 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth precisa estar dentro do AuthProvider (layout do route group (app)).');
  }
  return value;
}

/**
 * Guard de PAPEL, no nivel da pagina. A autenticacao ja foi garantida pelo
 * layout; aqui so se decide se ESTE papel pode ver ESTA rota. Devolve a mesma
 * forma do `useAuth`, mas com `session: null` enquanto o redirect nao acontece
 * — a pagina segue usando `if (!session) return null` como antes.
 */
export function useRequireRole(
  allowedRoles?: UserRole[],
  unauthorizedRedirectTo = '/dashboard'
): AuthContextValue {
  const router = useRouter();
  const { session, loading, logout, setSession } = useAuth();

  const isAuthorized = useMemo(() => {
    if (!session) {
      return false;
    }

    if (!allowedRoles || allowedRoles.length === 0) {
      return true;
    }

    return isRoleAllowed(session.user.role, allowedRoles);
  }, [allowedRoles, session]);

  useEffect(() => {
    if (loading || !session || isAuthorized) {
      return;
    }

    router.replace(unauthorizedRedirectTo);
  }, [isAuthorized, loading, router, session, unauthorizedRedirectTo]);

  return useMemo(
    () => ({ session: isAuthorized ? session : null, loading, logout, setSession }),
    [isAuthorized, session, loading, logout, setSession]
  );
}
