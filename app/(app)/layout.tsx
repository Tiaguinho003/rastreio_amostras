'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import { AppShell } from '../../components/AppShell';
import { AuthProvider, useAuth } from '../../lib/auth/AuthProvider';

// F2 do ciclo SN — o shell persistente.
//
// Este layout envolve as 8 rotas AUTENTICADAS. As publicas (/login, /offline,
// /maintenance) ficam de fora do grupo, na raiz de `app/`: nao ha lista de
// excecoes para manter em dia, a separacao e estrutural. O parenteses no nome
// da pasta e um route group — ele NAO entra na URL.
//
// No App Router so o layout persiste entre navegacoes. Com o `AppShell` aqui,
// o navbar monta uma vez e para de remontar (era isso que destruia, a cada
// toque, o efeito de selecao que o `MobileTabbar` ja tem pronto) e a sessao e
// resolvida uma vez, em vez de uma vez por pagina.
//
// Ver docs/Shell-e-Navegacao-Plano-de-Trabalho.md §3.1 e as decisoes SN-D4/SN-D6.
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Suspense fallback={null}>
        <PersistentShell>{children}</PersistentShell>
      </Suspense>
    </AuthProvider>
  );
}

function PersistentShell({ children }: { children: ReactNode }) {
  const { session, loading, logout, setSession } = useAuth();
  const searchParams = useSearchParams();

  // O `?tab=` cru: o AppShell valida contra as sub-abas reais da secao e cai na
  // primeira quando nao casa. (Antes cada pagina com abas normalizava e passava
  // por prop; o shell nao lia searchParams pra nao exigir Suspense em toda
  // pagina — aqui o Suspense e UM SO, no layout.)
  const activeSubTab = searchParams.get('tab') ?? undefined;

  // Mesmo gate `null` de antes, agora em UM lugar em vez de oito. O shell nao
  // pode pintar sem sessao: a nav e filtrada por papel e o avatar mostra o
  // usuario. O page loader (camada 2) ainda cobre esta espera — quem a elimina
  // e a F3, inicializando a sessao do cache local (SN-D8/SN-D1).
  if (loading || !session) {
    return null;
  }

  return (
    <AppShell
      session={session}
      onLogout={logout}
      onSessionChange={setSession}
      activeSubTab={activeSubTab}
    >
      {children}
    </AppShell>
  );
}
