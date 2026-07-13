'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { AprovacoesPanel } from '../../components/contracts/AprovacoesPanel';
import { ContratosPanel } from '../../components/contracts/ContratosPanel';
import { EmbarquePanel } from '../../components/contracts/EmbarquePanel';
import { FinanceiroPanel } from '../../components/financeiro/FinanceiroPanel';
import { contractsHubNavLabel, contractsHubTabs, NON_PROSPECTOR_ROLES } from '../../lib/roles';
import { useRequireAuth } from '../../lib/use-auth';

// Central de Contratos (F1): hub com 4 sub-abas sobre a mesma entidade
// (SaleContract). A casca — guard, AppShell, header e a barra de abas — vive
// aqui; o conteúdo de cada aba é um painel montado sob demanda (só a aba ativa
// fica montada). CC F2 (Embarque) abriu o hub a TODOS os não-PROSPECTOR:
// ADMIN/COMMERCIAL veem as 4 abas; operacionais veem Embarque + Aprovações
// (contractsHubTabs, AP30). Todas as abas são painéis/worklists funcionais.
// Ver docs/Contratos-Visao-Geral.md (§2 — a casca).
const HUB_TABS = [
  { key: 'contratos', label: 'Contratos' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'aprovacoes', label: 'Aprovações' },
  { key: 'embarque', label: 'Embarque' },
] as const;
type HubTab = (typeof HUB_TABS)[number]['key'];

// `?tab=` é a fonte de verdade da aba ativa; ausente/inválido/oculto-ao-papel cai
// na 1ª aba VISÍVEL ao papel (assim o operacional aterrissa em Embarque e nunca
// monta um painel comercial, que dispararia 403).
function parseTab(raw: string | null, visible: readonly string[]): HubTab {
  if (raw != null && visible.includes(raw)) return raw as HubTab;
  return (visible[0] ?? 'contratos') as HubTab;
}

function ContratosHubInner() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: NON_PROSPECTOR_ROLES,
  });
  const router = useRouter();
  const searchParams = useSearchParams();

  if (loading || !session) return null;

  // CC F2: abas visíveis por papel + rótulo do hub por papel. `?tab` inválido/oculto
  // cai na 1ª aba visível (contratos p/ comercial, embarque p/ operacional).
  const visibleKeys = contractsHubTabs(session.user.role);
  const tab = parseTab(searchParams.get('tab'), visibleKeys);
  const hubLabel = contractsHubNavLabel(session.user.role);
  const visibleTabs = HUB_TABS.filter((t) => visibleKeys.includes(t.key));

  const avatarInitials = (() => {
    const base = (session.user.fullName ?? session.user.username ?? '').trim();
    if (!base) return '?';
    const parts = base.split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return (first + last).toUpperCase() || '?';
  })();

  const selectTab = (next: HubTab) => {
    if (next === tab) return;
    // Troca via replace (sem poluir o histórico) e solta `?details=` (deep-link
    // específico da aba Contratos). A aba inativa desmonta → carregamento lazy.
    router.replace(`/contratos?tab=${next}`);
  };

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="clients-page-v2 ctr-page">
        <header className="clients-v2-header">
          <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div className="clients-v2-header-center">
            <h2 className="nsv2-title">{hubLabel}</h2>
          </div>
          <HeaderAvatarMenu session={session} onLogout={logout} />
          <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
            <span className="nsv2-avatar-initials">{avatarInitials}</span>
          </Link>
        </header>

        <div className="cad-tabs cc-tabs" role="tablist" aria-label="Seções do contrato">
          {visibleTabs.map((t) => (
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

        {tab === 'contratos' ? <ContratosPanel session={session} /> : null}
        {tab === 'financeiro' ? <FinanceiroPanel session={session} /> : null}
        {tab === 'aprovacoes' ? <AprovacoesPanel session={session} /> : null}
        {tab === 'embarque' ? <EmbarquePanel session={session} /> : null}
      </section>
    </AppShell>
  );
}

// useSearchParams (?tab / deep-link ?details) exige Suspense — molde /samples e /dashboard.
export default function ContratosPage() {
  return (
    <Suspense fallback={null}>
      <ContratosHubInner />
    </Suspense>
  );
}
