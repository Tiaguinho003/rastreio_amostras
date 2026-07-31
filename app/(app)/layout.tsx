'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';

import { AppShell } from '../../components/AppShell';
import { AuthProvider, useAuth } from '../../lib/auth/AuthProvider';
import { useIsomorphicLayoutEffect } from '../../lib/use-isomorphic-layout-effect';

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

  // 🔴 SN-D15 — O PRIMEIRO render DESTE componente NAO PODE OLHAR A SESSAO.
  // Se voce veio "simplificar" o `!hydrated` do gate abaixo, leia isto antes.
  //
  // Este componente e o conteudo do <Suspense> acima, e o React hidrata
  // conteudo de fronteira num PASSE SEPARADO, de prioridade minima: no primeiro
  // passe ele so ESTACIONA a fronteira e devolve `null` — nao chega a chamar
  // quem esta aqui dentro. O layout effect do `AuthProvider`, que esta FORA da
  // fronteira, roda no commit DAQUELE primeiro passe. Ou seja: com cache de
  // sessao, a sessao aparece SEMPRE antes de o React olhar pra ca. Nao e
  // corrida, e ordem garantida — e por isso o servidor mandava a caixa verde e
  // o cliente, chegando tarde e ja com sessao, tentava casar o
  // `.app-shell-root` contra ela ("Hydration failed... this tree will be
  // regenerated on the client").
  //
  // O latch tira a decisao das maos da sessao: no MOUNT ele vale `false` em
  // qualquer ambiente (inicializador de `useState` nao vem do servidor, e
  // nenhum efeito rodou ainda), entao o primeiro render daqui e uma CONSTANTE
  // — o mesmo HTML que o servidor mandou, em qualquer ordem de hidratacao e em
  // qualquer modo de render do Next. De quebra, como o gate corta antes dos
  // `children`, nada abaixo dele e comparado com HTML: os snapshots lidos no
  // inicializador do `useState` e o `useIsDesktop` das paginas param de
  // depender de as 8 rotas continuarem estaticas (SN-D7).
  //
  // 🔴 Layout effect, nao `useEffect`: com `useEffect` a troca cai DEPOIS da
  // pintura e todo mundo — inclusive quem tem cache — ganha um frame do portao
  // verde. E a splash antiga em miniatura: apresentacao acoplada a espera.
  const [hydrated, setHydrated] = useState(false);
  useIsomorphicLayoutEffect(() => {
    setHydrated(true);
  }, []);

  // Mesmo gate de antes, agora em UM lugar em vez de oito. O shell nao pode
  // pintar sem sessao: a nav e filtrada por papel e o avatar mostra o usuario.
  //
  // F5: o gate devolvia `null`, e com o page loader ja apagado (F3) isso
  // significava BRANCO — a `.fv-boot` do layout raiz sai na hidratacao, e quem
  // abre SEM cache de sessao fica esperando o servidor com a tela em branco.
  // A mesma superficie verde cobre a espera; `is-hold` tira a saida por tempo,
  // porque quem a substitui e o shell.
  //
  // O `!hydrated` vem PRIMEIRO de proposito: e ele que faz o primeiro render
  // daqui ser identico ao HTML servido, e nao a sessao. Ver o bloco acima.
  if (!hydrated || loading || !session) {
    return <div className="fv-boot is-hold" aria-hidden="true" />;
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
