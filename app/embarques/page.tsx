'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { AppShell } from '../../components/AppShell';
import { AprovacoesPanel } from '../../components/contracts/AprovacoesPanel';
import { EmbarquePanel } from '../../components/contracts/EmbarquePanel';
import { NON_PROSPECTOR_ROLES } from '../../lib/roles';
import { useRequireAuth } from '../../lib/use-auth';

// SPLIT 2026-07-13: página de OPERAÇÃO do contrato — Embarque + Aprovações — aberta
// a todos os não-PROSPECTOR. Espelha a casca do /contratos (mesma `.ctr-page`); a
// GESTÃO (Contratos/Financeiro) vive em /contratos (ADMIN+COMMERCIAL). Abre em
// Embarque. Ver docs/Contratos-Visao-Geral.md (§2 — a casca).
const HUB_TABS = [
  { key: 'embarque', label: 'Embarque' },
  { key: 'aprovacoes', label: 'Aprovações' },
] as const;
type HubTab = (typeof HUB_TABS)[number]['key'];
const HUB_TAB_KEYS = HUB_TABS.map((t) => t.key);

// `?tab=` é a fonte de verdade da aba ativa; ausente/inválido cai em Embarque.
function parseTab(raw: string | null): HubTab {
  if (raw != null && HUB_TAB_KEYS.includes(raw as HubTab)) return raw as HubTab;
  return 'embarque';
}

function EmbarquesHubInner() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: NON_PROSPECTOR_ROLES,
  });
  const router = useRouter();
  const searchParams = useSearchParams();

  if (loading || !session) return null;

  const tab = parseTab(searchParams.get('tab'));

  const selectTab = (next: HubTab) => {
    if (next === tab) return;
    // Troca via replace (sem poluir o histórico); solta `?highlight=` da aba anterior.
    router.replace(`/embarques?tab=${next}`);
  };

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession} activeSubTab={tab}>
      <section className="clients-page-v2 ctr-page">
        {/* RD16: o header verde da pagina saiu — o chrome mobile agora e unico
            e mora no AppShell (.fv-mtopbar: titulo da rota + camera + avatar). */}

        <div className="cad-tabs cc-tabs" role="tablist" aria-label="Seções de embarque">
          {HUB_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`cad-tab${tab === t.key ? ' is-active' : ''}`}
              onClick={() => selectTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'embarque' ? <EmbarquePanel session={session} /> : null}
        {tab === 'aprovacoes' ? <AprovacoesPanel session={session} /> : null}
      </section>
    </AppShell>
  );
}

// useSearchParams (?tab / deep-link ?highlight) exige Suspense — molde /contratos.
export default function EmbarquesPage() {
  return (
    <Suspense fallback={null}>
      <EmbarquesHubInner />
    </Suspense>
  );
}
