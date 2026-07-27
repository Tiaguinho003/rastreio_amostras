'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { AppShell } from '../../components/AppShell';
import { ContratosPanel } from '../../components/contracts/ContratosPanel';
import { CONTRATOS_ROLES } from '../../lib/roles';
import { useRequireAuth } from '../../lib/use-auth';

// RC-D1 (2026-07-27): o hub de sub-abas ACABOU — /contratos e PAGINA UNICA, so a
// lista de contratos. O Financeiro voltou a ser rota propria (/financeiro, ADMIN)
// e a operacao (Embarque/Aprovacoes) virou FASE dentro do proprio contrato.
// Aberta a todo nao-PROSPECTOR (CONTRATOS_ROLES). Ver docs/Contratos-Visao-Geral.md.
//
// Compat: `?tab=financeiro` (o deep-link da sub-aba) leva pra /financeiro; os
// demais `?tab=` sao ignorados — a pagina nao tem mais abas. `?details=<id>` e
// `?highlight=<id>` seguem sendo lidos pelo ContratosPanel.
function ContratosPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');

  // Compat do deep-link da sub-aba Financeiro. Vale so pro ADMIN — os demais caem
  // no guard de /financeiro e vao pro dashboard; edge aceito (nada em producao).
  const financeiroTarget = rawTab === 'financeiro' ? '/financeiro' : null;

  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: CONTRATOS_ROLES,
  });

  useEffect(() => {
    if (financeiroTarget) router.replace(financeiroTarget);
  }, [financeiroTarget, router]);

  if (loading || !session) return null;
  // Enquanto o redirect de compat nao navega, nao pisca a lista.
  if (financeiroTarget) return null;

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="clients-page-v2 ctr-page">
        {/* RD16: o header verde da pagina saiu — o chrome mobile agora e unico
            e mora no AppShell (.fv-mtopbar: titulo da rota + camera + avatar). */}
        <ContratosPanel session={session} />
      </section>
    </AppShell>
  );
}

// useSearchParams (?details / ?highlight / compat ?tab) exige Suspense — molde
// /samples e /dashboard.
export default function ContratosPage() {
  return (
    <Suspense fallback={null}>
      <ContratosPageInner />
    </Suspense>
  );
}
