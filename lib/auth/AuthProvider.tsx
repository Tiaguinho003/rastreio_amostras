'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ApiError, getCurrentSession, logout as logoutRequest } from '../api-client';
import {
  clearCachedSession,
  readCachedSession,
  writeCachedSession,
} from '../offline/session-cache';
import { useRevalidate } from '../revalidation/use-revalidate';
import { isRoleAllowed } from '../roles';
import { clearAllSnapshots } from '../snapshots/registry';
import type { SessionData, UserRole } from '../types';

// O cache so existe no cliente. Ler no SSR devolveria `null` e no cliente a
// sessao — mismatch de hidratacao nas 8 rotas, que sao pre-renderizadas. O
// layout effect roda DEPOIS da hidratacao DESTA arvore e ANTES da pintura: sem
// mismatch e sem flash. Molde de `components/BottomSheet.tsx`.
//
// 🔴 SN-D15 — "DEPOIS da hidratacao" vale SO pra arvore onde este provider
// esta. NAO vale pra quem consome isto atras de um <Suspense>: conteudo de
// fronteira e hidratado num passe posterior, DEPOIS deste commit — pra quem
// esta la dentro, este efeito ja rodou antes de o React sequer chamar o
// componente. Trocar layout effect por inicializador de `useState` nao
// resolveria; a defesa mora em QUEM HIDRATA. Foi esta frase, incompleta, que
// autorizou o gate do `app/(app)/layout.tsx` a olhar a sessao no primeiro
// render — mismatch garantido, nao provavel.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
// F3 do ciclo SN: a sessao passa a vir do CACHE LOCAL antes da pintura
// (SN-D8), e com isso o page loader — a "pagina de carregamento verde" que
// era o objetivo n. 1 deste ciclo — perdeu a unica fonte que tinha e foi
// apagado junto (`LoadingProvider`, `loading-context`, `SplashVisual` e as
// ~365 linhas de CSS do splash).

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

  // SN-D8: a sessao vem do CACHE LOCAL, lida antes da pintura. Com cache, o app
  // desenha na hora e o `getCurrentSession()` roda por baixo
  // (stale-while-revalidate da propria sessao) — e por isso que a "pagina de
  // carregamento verde" pode morrer sem virar tela branca.
  //
  // Sem cache, `loading` fica `true` ate o servidor responder e a tela fica
  // neutra ate o redirect pro /login. Decidido com o Flavio: e o que ja
  // acontecia abaixo do limiar de 480ms do loader antigo, e quem chega aqui sem
  // cache quase sempre esta mesmo deslogado. Quem tiver cookie valido e cache
  // limpo o /login devolve pro /dashboard (app/login/page.tsx).
  //
  // Descartado resolver a sessao no servidor: o service worker cacheia
  // documentos — e e isso que faz o app abrir offline —, entao o HTML levaria
  // nome e papel pro cache, inclusive depois do logout.
  useIsomorphicLayoutEffect(() => {
    const cached = readCachedSession();
    if (cached) {
      setSessionState(cached);
      setLoading(false);
    }
  }, []);

  const revalidateSession = useCallback(() => {
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
          // E o unico jeito de revogacao no servidor chegar aqui, ja que a
          // primeira pintura passou a vir do cache.
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

  useEffect(() => revalidateSession(), [revalidateSession]);

  // Sessao revogada no servidor so aparece numa revalidacao. Antes da F2 toda
  // navegacao fazia uma; agora nao faz nenhuma, entao o retorno do app ao
  // primeiro plano e o momento que sobrou pra pegar isso. Sem poll: `sessao`
  // nao muda sozinha, e cada checagem e round-trip ao banco.
  useRevalidate({
    subjects: ['sessao'],
    enabled: true,
    onRevalidate: () => {
      revalidateSession();
    },
    pollMs: null,
  });

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

    // Snapshots de lista (a primeira pintura de cada pagina) sao do usuario da
    // sessao — num PWA que sobrevive ao logout, sem esta limpeza o proximo
    // login poderia restaurar a lista de outra pessoa.
    // SN-D9: itera o REGISTRO em vez da lista hardcoded que morava aqui. Pagina
    // nova entra em `lib/snapshots/registry.ts` e a limpeza vem de graca — a
    // lista manual precisava ser lembrada, e esquecer nao quebrava nada na hora.
    clearAllSnapshots();

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
