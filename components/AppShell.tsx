'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { SampleSearchField } from './SampleSearchField';
import { getRoleLabel } from '../lib/roles';
import type { SessionData } from '../lib/types';

interface AppShellProps {
  session: SessionData;
  onLogout: () => void;
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

export function AppShell({ session, onLogout, children }: AppShellProps) {
  const pathname = usePathname();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null);

  const profileName =
    typeof session.user.displayName === 'string' && session.user.displayName.trim().length > 0
      ? session.user.displayName.trim()
      : session.user.username;

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
            {MAIN_NAV_ITEMS.map((item) => (
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
                    Configuracoes
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

      <main>{children}</main>
    </>
  );
}
