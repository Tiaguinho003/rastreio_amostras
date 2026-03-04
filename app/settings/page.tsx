'use client';

import { AppShell } from '../../components/AppShell';
import { useRequireAuth } from '../../lib/use-auth';

export default function SettingsPage() {
  const { session, loading, logout } = useRequireAuth();

  if (loading || !session) {
    return null;
  }

  return (
    <AppShell session={session} onLogout={logout}>
      <section className="panel stack">
        <h2 style={{ margin: 0 }}>Configuracoes</h2>
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Area reservada para as configuracoes do sistema e do perfil. As funcionalidades serao definidas nas proximas fases.
        </p>
      </section>
    </AppShell>
  );
}
