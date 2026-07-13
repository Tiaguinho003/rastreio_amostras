'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { ContratosPanel } from '../../components/contracts/ContratosPanel';
import { FinanceiroPanel } from '../../components/financeiro/FinanceiroPanel';
import { CONTRATOS_ROLES } from '../../lib/roles';
import { useRequireAuth } from '../../lib/use-auth';

// SPLIT 2026-07-13: página de GESTÃO do contrato — Contratos + Financeiro — restrita
// a ADMIN+COMMERCIAL (CONTRATOS_ROLES). A OPERAÇÃO (Embarque/Aprovações) foi pra
// /embarques (todos os não-PROSPECTOR). A casca — guard, AppShell, header e a barra
// de abas — vive aqui; cada aba é um painel montado sob demanda (só a ativa monta).
// Ver docs/Contratos-Visao-Geral.md (§2 — a casca).
const HUB_TABS = [
  { key: 'contratos', label: 'Contratos' },
  { key: 'financeiro', label: 'Financeiro' },
] as const;
type HubTab = (typeof HUB_TABS)[number]['key'];
const HUB_TAB_KEYS = HUB_TABS.map((t) => t.key);

// `?tab=` é a fonte de verdade da aba ativa; ausente/inválido cai em Contratos.
function parseTab(raw: string | null): HubTab {
  if (raw != null && HUB_TAB_KEYS.includes(raw as HubTab)) return raw as HubTab;
  return 'contratos';
}

function ContratosHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');

  // Compat: os deep-links antigos de embarque/aprovações vivem agora em /embarques
  // (o hub virou 2 páginas). Alvo do redirect, preservando `?highlight=`.
  const highlight = searchParams.get('highlight');
  const compatTarget =
    rawTab === 'embarque' || rawTab === 'aprovacoes'
      ? `/embarques?tab=${rawTab}${highlight ? `&highlight=${highlight}` : ''}`
      : null;

  // Guard de gestão (ADMIN+COMMERCIAL). `unauthorizedRedirectTo` dinâmico: o
  // operacional que abre um link antigo de embarque/aprovação cai no /embarques
  // (que ele acessa), não no /dashboard — senão o guard corria contra o effect abaixo.
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: CONTRATOS_ROLES,
    unauthorizedRedirectTo: compatTarget ?? '/dashboard',
  });

  // ADMIN/COMMERCIAL (autorizados) seguem o redirect de compat por aqui.
  useEffect(() => {
    if (compatTarget) router.replace(compatTarget);
  }, [compatTarget, router]);

  if (loading || !session) return null;
  // Enquanto o compat-redirect não navega, não pisca a aba Contratos.
  if (compatTarget) return null;

  const tab = parseTab(rawTab);

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
        {tab === 'financeiro' ? <FinanceiroPanel session={session} /> : null}
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
