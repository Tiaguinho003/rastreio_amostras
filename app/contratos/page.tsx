'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { ContratosPanel } from '../../components/contracts/ContratosPanel';
import { HubTabPlaceholder } from '../../components/contracts/HubTabPlaceholder';
import { CONTRATOS_ROLES } from '../../lib/roles';
import { useRequireAuth } from '../../lib/use-auth';

// Central de Contratos (F1): hub com 4 sub-abas sobre a mesma entidade
// (SaleContract). A casca — guard, AppShell, header e a barra de abas — vive
// aqui; o conteúdo de cada aba é um painel montado sob demanda (só a aba ativa
// fica montada). F1 = Contratos migrado; Financeiro/Aprovações/Embarque entram
// como placeholder. Acesso = ADMIN+COMMERCIAL (CONTRATOS_ROLES; = FINANCEIRO_ROLES,
// a união das abas visíveis em F1). Ver docs/Central-de-Contratos-Plano-de-Trabalho.md.
const HUB_TABS = [
  { key: 'contratos', label: 'Contratos' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'aprovacoes', label: 'Aprovações' },
  { key: 'embarque', label: 'Embarque' },
] as const;
type HubTab = (typeof HUB_TABS)[number]['key'];
const HUB_TAB_KEYS: readonly string[] = HUB_TABS.map((t) => t.key);

// `?tab=` é a fonte de verdade da aba ativa; valor ausente/inválido cai em
// Contratos (que é também o alvo implícito do deep-link `?details=<id>`).
function parseTab(raw: string | null): HubTab {
  return raw != null && HUB_TAB_KEYS.includes(raw) ? (raw as HubTab) : 'contratos';
}

function ContratosHubInner() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: CONTRATOS_ROLES,
  });
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));

  if (loading || !session) return null;

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
            <h2 className="nsv2-title">Contratos</h2>
          </div>
          <HeaderAvatarMenu session={session} onLogout={logout} />
          <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
            <span className="nsv2-avatar-initials">{avatarInitials}</span>
          </Link>
        </header>

        <div className="cad-tabs cc-tabs" role="tablist" aria-label="Seções do contrato">
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

        {tab === 'contratos' ? <ContratosPanel session={session} /> : null}
        {tab === 'financeiro' ? <HubTabPlaceholder /> : null}
        {tab === 'aprovacoes' ? <HubTabPlaceholder /> : null}
        {tab === 'embarque' ? <HubTabPlaceholder /> : null}
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
