'use client';

import type {
  DashboardPendingResponse,
  DashboardSalesAvailabilityResponse,
  SessionData,
} from '../../lib/types';

interface DashboardDesktopProps {
  session: SessionData;
  data: DashboardPendingResponse | null;
  salesData: DashboardSalesAvailabilityResponse | null;
  error: string | null;
}

export function DashboardDesktop({ data, salesData }: DashboardDesktopProps) {
  return (
    <div className="dashboard-desktop">
      <section className="dashboard-page">
        <p style={{ padding: '2rem', color: '#8a9285' }}>Desktop layout em construcao</p>
      </section>
    </div>
  );
}
