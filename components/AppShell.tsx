'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ProfileBottomSheet } from './ProfileBottomSheet';
import { SampleSearchField } from './SampleSearchField';
import { recordInitialPasswordDecision } from '../lib/api-client';
import { getRoleLabel, isAdmin } from '../lib/roles';
import type { SessionData } from '../lib/types';
import { mergeUserIntoSession } from '../lib/use-auth';

interface AppShellProps {
  session: SessionData;
  onLogout: () => Promise<void> | void;
  onSessionChange?: (session: SessionData | null) => void;
  children: React.ReactNode;
}

type NavIcon = 'dashboard' | 'camera' | 'samples' | 'users' | 'clients' | 'new-sample' | 'settings';
type MobileRouteMeta = {
  title: string;
  subtitle: string;
  ctaHref?: string;
  ctaLabel?: string;
  ctaIcon?: NavIcon;
};

const DESKTOP_NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' as NavIcon },
  { href: '/samples/new', label: 'Novo Registro', icon: 'new-sample' as NavIcon },
  { href: '/samples', label: 'Registros', icon: 'samples' as NavIcon },
  { href: '/clients', label: 'Clientes', icon: 'clients' as NavIcon }
] as const;

const ADMIN_NAV_ITEM = {
  href: '/users',
  label: 'Usuarios',
  icon: 'users' as NavIcon
} as const;

const MOBILE_NAV_ITEMS = [
  { href: '/dashboard', mobileLabel: 'Inicio', icon: 'dashboard' as NavIcon, emphasis: 'default' as const },
  { href: '/samples/new', mobileLabel: 'Novo', icon: 'new-sample' as NavIcon, emphasis: 'default' as const },
  { href: '/camera', mobileLabel: 'Camera', icon: 'camera' as NavIcon, emphasis: 'primary' as const },
  { href: '/samples', mobileLabel: 'Amostras', icon: 'samples' as NavIcon, emphasis: 'default' as const },
  { href: '/clients', mobileLabel: 'Clientes', icon: 'clients' as NavIcon, emphasis: 'default' as const }
] as const;

function isMainNavItemActive(pathname: string, href: string) {
  if (href === '/dashboard') {
    return pathname === '/dashboard';
  }

  if (href === '/camera') {
    return pathname === '/camera';
  }

  if (href === '/samples/new') {
    return pathname === '/samples/new';
  }

  if (href === '/samples') {
    return pathname === '/samples' || /^\/samples\/[^/]+$/.test(pathname);
  }

  if (href === '/clients') {
    return pathname === '/clients' || pathname.startsWith('/clients/');
  }

  if (href === '/settings') {
    return pathname === '/settings';
  }

  return pathname === href;
}

function renderNavIcon(icon: NavIcon) {
  if (icon === 'dashboard') {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M4.8 10.2 12 4.8l7.2 5.4" />
        <path d="M6.6 9.6V19h10.8V9.6" />
        <path d="M10.2 19v-5.2h3.6V19" />
      </svg>
    );
  }

  if (icon === 'new-sample') {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    );
  }

  if (icon === 'camera') {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M5.5 8.4h3l1.4-2.4h4.2l1.4 2.4h3A1.9 1.9 0 0 1 20.4 10v7.2a1.9 1.9 0 0 1-1.9 1.9H5.5a1.9 1.9 0 0 1-1.9-1.9V10a1.9 1.9 0 0 1 1.9-1.6Z" />
        <circle cx="12" cy="13.5" r="3.3" />
      </svg>
    );
  }

  if (icon === 'samples') {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <rect x="4.5" y="5" width="15" height="14" rx="2.4" />
        <path d="M8 9h8" />
        <path d="M8 12.5h8" />
        <path d="M8 16h5" />
      </svg>
    );
  }

  if (icon === 'clients') {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <circle cx="9" cy="7.5" r="3" />
        <path d="M3 19.5a6 6 0 0 1 12 0" />
        <circle cx="17.5" cy="8.5" r="2.2" />
        <path d="M15.5 19.5a4.5 4.5 0 0 1 5.5-4.4" />
      </svg>
    );
  }

  if (icon === 'settings') {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M12 12a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z" />
        <path d="M4.8 18.1a8.2 8.2 0 0 1 14.4 0" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.2" />
      <path d="M5 18.5a7.4 7.4 0 0 1 14 0" />
      <path d="M18.5 6.2h2" />
      <path d="M19.5 5.2v2" />
    </svg>
  );
}

function resolveMobileRouteMeta(pathname: string): MobileRouteMeta | null {
  if (pathname === '/camera') {
    return {
      title: 'Captura rapida',
      subtitle: 'Escaneie QR, confirme a amostra e siga direto para o proximo passo.',
      ctaHref: '/samples/new',
      ctaLabel: 'Novo manual',
      ctaIcon: 'new-sample'
    };
  }

  if (pathname === '/settings') {
    return null;
  }

  if (pathname === '/users') {
    return null;
  }

  if (pathname.startsWith('/clients/')) {
    return null;
  }

  return null;
}

export function AppShell({ session, onLogout, onSessionChange, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const isDashboard = pathname === '/dashboard';
  const isNewSample = pathname === '/samples/new';
  const isLayeredRoute = isDashboard || isNewSample;
  const headerMobileClass = isLayeredRoute ? 'topbar--dashboard-only' : 'topbar--hidden';
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [showPageTransition, setShowPageTransition] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const isFirstRender = useRef(true);
  const prevPathnameRef = useRef(pathname);

  const profileName =
    typeof session.user.fullName === 'string' && session.user.fullName.trim().length > 0
      ? session.user.fullName.trim()
      : session.user.username;
  const desktopNavItems = isAdmin(session.user.role) ? [...DESKTOP_NAV_ITEMS, ADMIN_NAV_ITEM] : DESKTOP_NAV_ITEMS;
  const mobileRouteMeta = resolveMobileRouteMeta(pathname);
  const isCameraRoute = pathname === '/camera';

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = pathname;
      setShowPageTransition(true);
      const timer = setTimeout(() => setShowPageTransition(false), 540);
      return () => clearTimeout(timer);
    }
  }, [pathname]);

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

  useEffect(() => {
    function handleOpenProfileSheet() {
      setProfileSheetOpen(true);
    }

    window.addEventListener('open-profile-sheet', handleOpenProfileSheet);
    return () => {
      window.removeEventListener('open-profile-sheet', handleOpenProfileSheet);
    };
  }, []);

  async function handleInitialPasswordDecision(decision: 'KEPT' | 'CHANGED') {
    setDecisionLoading(true);
    setDecisionError(null);

    try {
      const response = await recordInitialPasswordDecision(session, decision);
      if (onSessionChange) {
        onSessionChange(mergeUserIntoSession(session, response.user));
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
    <div className="app-shell-root mobile-edge-shell mobile-edge-shell-auth">
      {showPageTransition ? <div className="page-transition-overlay" aria-hidden="true" /> : null}
      <header className={`topbar ${headerMobileClass}`}>
        <div className="topbar-inner">
          <div className="topbar-mobile-spacer" aria-hidden="true" />

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
            {desktopNavItems.map((item) => (
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

            <div className="topbar-profile" ref={profileMenuRef}>
              <button
                ref={profileTriggerRef}
                type="button"
                className="topbar-profile-trigger"
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
                aria-controls="topbar-profile-menu"
                aria-label="Abrir menu de perfil"
                onClick={() => {
                  const isMobile = window.innerWidth < 769;
                  if (isMobile) {
                    setProfileSheetOpen(true);
                  } else {
                    setProfileMenuOpen((current) => !current);
                  }
                }}
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

                  {isAdmin(session.user.role) ? (
                    <Link href="/users" className="topbar-profile-link" onClick={() => setProfileMenuOpen(false)}>
                      Usuarios
                    </Link>
                  ) : null}
                  <Link href="/clients" className="topbar-profile-link" onClick={() => setProfileMenuOpen(false)}>
                    Clientes
                  </Link>
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

      <main className={`app-shell-main${isCameraRoute ? ' is-camera-route' : ''}${isLayeredRoute ? ' is-dashboard-route' : ''}${isNewSample ? ' is-new-sample-route' : ''}`}>
        {mobileRouteMeta && !isCameraRoute ? (
          <section className="app-shell-mobile-route-header">
            <div className="app-shell-mobile-route-copy">
              <h1 className="app-shell-mobile-route-title">{mobileRouteMeta.title}</h1>
              <p className="app-shell-mobile-route-subtitle">{mobileRouteMeta.subtitle}</p>
            </div>

            {mobileRouteMeta.ctaHref && mobileRouteMeta.ctaLabel ? (
              <Link href={mobileRouteMeta.ctaHref} className="app-shell-mobile-route-cta">
                <span className="app-shell-mobile-route-cta-icon" aria-hidden="true">
                  {renderNavIcon(mobileRouteMeta.ctaIcon ?? 'new-sample')}
                </span>
                <span>{mobileRouteMeta.ctaLabel}</span>
              </Link>
            ) : null}
          </section>
        ) : null}

        {session.user.initialPasswordDecision === 'PENDING' ? (
          <section className="panel stack app-shell-password-banner">
            <div className="app-shell-password-banner-inner">
              <div className="app-shell-password-banner-copy">
                <h3 style={{ margin: 0 }}>Senha inicial</h3>
                <p className="app-shell-password-banner-text">
                  Voce pode manter a senha inicial por enquanto ou ir agora para altera-la.
                </p>
                {decisionError ? (
                  <p className="error" style={{ margin: '0.5rem 0 0' }}>
                    {decisionError}
                  </p>
                ) : null}
              </div>

              <div className="app-shell-password-banner-actions">
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

        <div key={pathname} className="app-shell-page-content">
          {children}
        </div>
      </main>

      <ProfileBottomSheet
        session={session}
        open={profileSheetOpen}
        onClose={() => setProfileSheetOpen(false)}
        onLogout={onLogout}
      />

      <nav className="mobile-tabbar" aria-label="Paginas principais">
        <div className="mobile-tabbar-inner">
          {MOBILE_NAV_ITEMS.map((item) => {
            const active = isMainNavItemActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mobile-tabbar-link${item.emphasis === 'primary' ? ' is-primary' : ''}${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <span className="mobile-tabbar-pill">
                  <span className="mobile-tabbar-icon" aria-hidden="true">
                    {renderNavIcon(item.icon)}
                  </span>
                  <span className="mobile-tabbar-label">{item.mobileLabel}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
