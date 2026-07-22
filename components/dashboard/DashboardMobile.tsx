'use client';

import { getRoleLabel } from '../../lib/roles';
import { getGreeting } from './greeting';
import type { SessionData } from '../../lib/types';

interface DashboardMobileProps {
  session: SessionData;
}

// DSB-D14: o dashboard mobile ficou SO com o hero (saudacao) por enquanto — o
// donut "Lotes disponiveis" foi apagado do sistema e o calendario de Eventos
// ainda e desktop-only (a cobertura mobile entra no ciclo do dashboard mobile,
// DSB-H6). Ver docs/Dashboard-Plano-de-Trabalho.md.
export function DashboardMobile({ session }: DashboardMobileProps) {
  const fullName = session.user.fullName ?? session.user.username;
  const firstName = fullName.split(' ')[0];
  const roleLabel = getRoleLabel(session.user.role);

  return (
    <div className="dashboard-mobile">
      <section className="dashboard-page">
        {/* Scroll simples da pagina inteira: o hero vive dentro do
            .dashboard-scroll e rola como uma pagina normal — nada fixo no topo. */}
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
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
