'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { SampleSearchField } from './SampleSearchField';
import { recordInitialPasswordDecision } from '../lib/api-client';
import { getRoleLabel, isAdmin } from '../lib/roles';
import type { SessionData } from '../lib/types';

interface AppShellProps {
  session: SessionData;
  onLogout: () => Promise<void> | void;
  onSessionChange?: (session: SessionData | null) => void;
  children: React.ReactNode;
}

const MAIN_NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/samples/new', label: 'Novo Registro' },
  { href: '/samples', label: 'Registros' }
] as const;

function isMainNavItemActive(pathname: string, href: string) {
  if (href === '/dashboard') {
    return pathname === '/dashboard';
  }

  if (href === '/samples/new') {
    return pathname === '/samples/new';
  }

  if (href === '/samples') {
    return pathname === '/samples' || /^\/samples\/[^/]+$/.test(pathname);
  }

  return pathname === href;
}

export function AppShell({ session, onLogout, onSessionChange, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null);

  const profileName =
    typeof session.user.fullName === 'string' && session.user.fullName.trim().length > 0
      ? session.user.fullName.trim()
      : session.user.username;
  const navItems = isAdmin(session.user.role)
    ? [...MAIN_NAV_ITEMS, { href: '/users', label: 'Usuarios' as const }]
    : MAIN_NAV_ITEMS;

  useEffect(() => {
    if (!profileMenuOpen) {
      return;
    }

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!profileMenuRef.current?.contains(target)) {
        setProfileMenuOpen(false);
      }
    };

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      setProfileMenuOpen(false);
      profileTriggerRef.current?.focus();
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [profileMenuOpen]);

  async function handleInitialPasswordDecision(decision: 'KEPT' | 'CHANGED') {
    setDecisionLoading(true);
    setDecisionError(null);

    try {
      const response = await recordInitialPasswordDecision(session, decision);
      if (onSessionChange) {
        onSessionChange({
          ...session,
          user: {
            ...session.user,
            ...response.user
          }
        });
      }

      if (decision === 'CHANGED') {
        router.push('/settings?section=password');
      }
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : 'Falha ao registrar a escolha');
    } finally {
      setDecisionLoading(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/dashboard" className="topbar-logo-slot" aria-label="Pagina inicial">
            <Image
              src="/logo-safras-branco.png"
              alt="Safras e Negocios"
              width={1024}
              height={299}
              priority
              className="topbar-logo-image"
            />
          </Link>

          <nav className="topbar-nav" aria-label="Paginas principais">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`topbar-nav-link${isMainNavItemActive(pathname, item.href) ? ' is-active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="topbar-tools">
            <div className="topbar-search-slot">
              <SampleSearchField session={session} compact submitLabel="Ir" />
            </div>

            <button type="button" className="topbar-notification-trigger" aria-label="Notificacoes pendentes">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M12 4a5 5 0 0 0-5 5v2.6c0 .8-.3 1.6-.9 2.2l-1 1a1 1 0 0 0 .7 1.7h12.4a1 1 0 0 0 .7-1.7l-1-1a3.1 3.1 0 0 1-.9-2.2V9a5 5 0 0 0-5-5Z" />
                <path d="M9.5 18a2.5 2.5 0 0 0 5 0" />
              </svg>
              <span className="topbar-notification-badge" aria-hidden="true">
                2
              </span>
            </button>

            <div className="topbar-profile" ref={profileMenuRef}>
              <button
                ref={profileTriggerRef}
                type="button"
                className="topbar-profile-trigger"
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
                aria-controls="topbar-profile-menu"
                aria-label="Abrir menu de perfil"
                onClick={() => setProfileMenuOpen((current) => !current)}
              >
                <span className="topbar-profile-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
                    <path d="M4 20a8 8 0 0 1 16 0" />
                  </svg>
                </span>
              </button>

              {profileMenuOpen ? (
                <section id="topbar-profile-menu" className="topbar-profile-menu" role="menu">
                  <div className="topbar-profile-summary">
                    <p className="topbar-profile-name">{profileName}</p>
                    <p className="topbar-profile-meta">
                      {getRoleLabel(session.user.role)} | {session.user.username}
                    </p>
                  </div>

                  <Link href="/settings" className="topbar-profile-link" onClick={() => setProfileMenuOpen(false)}>
                    Meu perfil
                  </Link>
                  <button
                    type="button"
                    className="topbar-profile-action danger"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onLogout();
                    }}
                  >
                    Sair
                  </button>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {session.user.initialPasswordDecision === 'PENDING' ? (
        <section className="panel stack" style={{ margin: '1rem auto', width: 'min(1180px, calc(100vw - 2rem))' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap'
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Senha inicial</h3>
              <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)' }}>
                Voce pode manter a senha inicial por enquanto ou ir agora para altera-la.
              </p>
              {decisionError ? (
                <p className="error" style={{ margin: '0.5rem 0 0' }}>
                  {decisionError}
                </p>
              ) : null}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => handleInitialPasswordDecision('KEPT')} disabled={decisionLoading}>
                {decisionLoading ? 'Salvando...' : 'Manter'}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleInitialPasswordDecision('CHANGED')}
                disabled={decisionLoading}
              >
                Alterar
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <main>{children}</main>
    </>
  );
}
