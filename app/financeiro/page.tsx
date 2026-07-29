'use client';

import { Suspense } from 'react';

import { AppShell } from '../../components/AppShell';
import { FinanceiroPanel } from '../../components/financeiro/FinanceiroPanel';
import { FINANCEIRO_ROLES } from '../../lib/roles';
import { useRequireAuth } from '../../lib/use-auth';

// RC-D1/RC-D3 (2026-07-27): o Financeiro DEIXA de ser sub-aba do hub /contratos
// (onde a CC3 o pos, em 2026-07-13) e volta a ser PAGINA PROPRIA — agora gated
// em ADMIN, a primeira rota ADMIN-only do dominio de contratos.
//
// RC-D4: o gate e de ROTA, nao de campo. Quem nao e ADMIN segue vendo valores e
// corretagem DENTRO do contrato; o que fica reservado e a carteira consolidada.
// E o "Pago", que morava so aqui, voltou pro card da lista (RC-D22) — sem isso
// 4 dos 5 papeis perderiam o fim do ciclo do dinheiro.
//
// RC-D24: a pagina nasceu com o PAINEL INTACTO, so trocando de casca; o chrome
// institucional FV veio na 2a rodada da RC-F6 (RC-D92..D95).
function FinanceiroPageInner() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: FINANCEIRO_ROLES,
  });

  if (loading || !session) return null;

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="clients-page-v2 ctr-page fv-fin-page">
        {/* RD16: sem header verde de pagina — o chrome mobile e unico e mora no
            AppShell (.fv-mtopbar: titulo da rota + camera + avatar). O titulo
            sai do item de nav, sem mapa proprio.
            RC-D92: `fv-fin-page` e o escopo do kit institucional desta pagina
            (molde `fv-ctr-page`/`fv-cad-page`). `ctr-page` FICA: carrega o
            ajuste de altura do shell via `:has()`, compartilhado com
            /contratos. */}
        <FinanceiroPanel session={session} />
      </section>
    </AppShell>
  );
}

// O painel le `?highlight=` (chip do calendario) — useSearchParams exige Suspense.
export default function FinanceiroPage() {
  return (
    <Suspense fallback={null}>
      <FinanceiroPageInner />
    </Suspense>
  );
}
