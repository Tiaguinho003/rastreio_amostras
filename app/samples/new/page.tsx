'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';

import { AppShell } from '../../../components/AppShell';
import { NewSampleModal } from '../../../components/NewSampleModal';
import { useRequireAuth } from '../../../lib/use-auth';

// /samples/new e um wrapper temporario (Fase 2) que renderiza o
// <NewSampleModal /> ja aberto. O AppShell e mantido por baixo pra
// preservar o contexto visual (tabbar mobile + topbar desktop com
// blur do backdrop do modal). Quando o modal fecha, navega pra
// /samples (lista de amostras).
//
// Esta rota sera deletada na Fase 5 — o FAB de /samples (Fase 3) e o
// botao "+ Nova amostra" no desktop assumem como entrypoints reais.

function NewSamplePageContent() {
  const router = useRouter();
  const { session, loading, logout, setSession } = useRequireAuth();

  if (loading || !session) {
    return null;
  }

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <NewSampleModal open={true} session={session} onClose={() => router.push('/samples')} />
    </AppShell>
  );
}

export default function NewSamplePage() {
  return (
    <Suspense fallback={null}>
      <NewSamplePageContent />
    </Suspense>
  );
}
