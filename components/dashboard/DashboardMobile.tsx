'use client';

import Link from 'next/link';

import { HeaderAvatarMenu } from '../HeaderAvatarMenu';
import { SalesAvailabilityCard } from '../SalesAvailabilityCard';
import { getRoleLabel } from '../../lib/roles';
import { getGreeting, getInitials } from './greeting';
import type { DashboardSalesAvailabilityResponse, SessionData } from '../../lib/types';

interface DashboardMobileProps {
  session: SessionData;
  salesData: DashboardSalesAvailabilityResponse | null;
  error: string | null;
  onLogout: () => void | Promise<void>;
}

export function DashboardMobile({ session, salesData, error, onLogout }: DashboardMobileProps) {
  const fullName = session.user.fullName ?? session.user.username;
  const firstName = fullName.split(' ')[0];
  const roleLabel = getRoleLabel(session.user.role);
  const initials = getInitials(fullName);

  return (
    <div className="dashboard-mobile">
      <section className="dashboard-page">
        {/* Scroll simples da pagina inteira: a saudacao (hero) e o sheet
            vivem dentro do .dashboard-scroll e rolam juntos como uma pagina
            normal — nada fica fixo no topo. */}
        <div className="dashboard-scroll">
          <section className="dashboard-hero">
            <div className="dashboard-hero-header">
              <div className="dashboard-greeting">
                <span className="dashboard-greeting-label">{getGreeting()}</span>
                <span className="dashboard-greeting-name">{firstName}</span>
                <span className="dashboard-greeting-role">
                  <svg
                    className="dashboard-greeting-role-icon"
                    viewBox="0 0 24 24"
                    focusable="false"
                    aria-hidden="true"
                  >
                    <path d="M12 3 5 5.5v6c0 4.5 3 8.3 7 9.5 4-1.2 7-5 7-9.5v-6L12 3z" />
                    <path d="m9 12 2 2 4-4.5" />
                  </svg>
                  {roleLabel}
                </span>
              </div>
              <HeaderAvatarMenu session={session} onLogout={onLogout} />
              <Link href="/profile" className="dashboard-hero-avatar" aria-label="Ir para perfil">
                <span className="dashboard-hero-avatar-initials">{initials}</span>
              </Link>
            </div>
          </section>

          <section className="dashboard-sheet">
            {error ? (
              <p className="dashboard-error-banner" role="status">
                {error}
              </p>
            ) : null}

            <section className="dashboard-sheet-section dashboard-sheet-content is-slot-sales">
              {salesData ? (
                <SalesAvailabilityCard data={salesData} />
              ) : (
                <div className="sales-card sales-card-skeleton" aria-hidden="true" />
              )}
            </section>
          </section>
        </div>
      </section>
    </div>
  );
}
