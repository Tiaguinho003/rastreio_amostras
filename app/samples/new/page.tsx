'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';

import { AppShell } from '../../../components/AppShell';
import { NewSampleModal } from '../../../components/NewSampleModal';
import { useRequireAuth } from '../../../lib/use-auth';
import { NON_PROSPECTOR_ROLES } from '../../../lib/roles';

// /samples/new e um wrapper que renderiza o <NewSampleModal /> ja aberto.
// O AppShell e mantido por baixo pra preservar o contexto visual (tabbar
// mobile + topbar desktop com blur do backdrop do modal). Quando o modal
// fecha, navega pra /samples (lista de amostras).
//
// Status pos-refatoracao: os entrypoints principais agora sao o FAB de
// /samples mobile e o botao "+ Nova amostra" no desktop (Fase 3). Este
// wrapper continua existindo porque e usado pelo fluxo da camera —
// `ClassificationNotFoundModal` em `app/camera/page.tsx:1303` chama
// `router.push('/samples/new')` quando o usuario tenta escanear QR de
// amostra que nao existe ("Cadastrar nova"). Pode ser deletado se camera
// for refatorada pra abrir <NewSampleModal /> inline no futuro.

function NewSamplePageContent() {
  const router = useRouter();
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: NON_PROSPECTOR_ROLES,
  });

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
