'use client';

import Link from 'next/link';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { useRequireAuth } from '../../lib/use-auth';
import { NON_PROSPECTOR_ROLES } from '../../lib/roles';

// Pagina "Metricas" — placeholder EM CONSTRUCAO. Vive na barra de navegacao
// dos papeis CLASSIFIER/CADASTRO (no lugar do Informe; ver isMetricsNavRole).
// Acessivel a qualquer nao-prospector (ADMIN consegue previsualizar); o
// conteudo real (cards de metrica) entra depois.
export default function MetricsPage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: NON_PROSPECTOR_ROLES,
  });

  if (loading || !session) {
    return null;
  }

  const userFullName = session.user.fullName ?? session.user.username;
  const userAvatarInitials = userFullName
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="sdv-page">
        <header className="sdv-header">
          <div className="sdv-header-top">
            {/* Spacer invisivel no lugar do botao de voltar: mantem o titulo
                (flex: 1 + text-align: center) equilibrado com o avatar a direita. */}
            <span
              className="nsv2-back"
              aria-hidden="true"
              style={{ visibility: 'hidden', pointerEvents: 'none' }}
            />
            <span className="sdv-header-title">Métricas</span>
            <HeaderAvatarMenu session={session} onLogout={logout} />
            <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
              <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
            </Link>
          </div>
        </header>

        <section className="sdv-content informe-content">
          <div className="informe-placeholder">
            <div className="rsm-empty">
              <span className="rsm-empty-icon" aria-hidden="true">
                {/* Grao de cafe — mesma silhueta do icone da aba Lotes. */}
                <svg viewBox="0 0 24 24" focusable="false">
                  <ellipse cx="12" cy="12" rx="6.2" ry="8.7" transform="rotate(28 12 12)" />
                  <path d="M15.9 4.9c-2.9 2.1-1.1 5-2.9 7.1-1.8 2.1-4.3 2.6-4.9 7" />
                </svg>
              </span>
              <p className="rsm-empty-title">Em construção</p>
              <p className="rsm-empty-sub">A página de métricas está sendo preparada.</p>
            </div>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
