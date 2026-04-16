'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ProfileBottomSheet } from './ProfileBottomSheet';
import { SampleSearchField } from './SampleSearchField';
import { changeCurrentUserPassword, recordInitialPasswordDecision } from '../lib/api-client';
import { changePasswordSchema } from '../lib/form-schemas';
import { getRoleLabel, isAdmin } from '../lib/roles';
import type { SessionData } from '../lib/types';
import { mergeUserIntoSession } from '../lib/use-auth';
import { useFocusTrap } from '../lib/use-focus-trap';

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
  { href: '/clients', label: 'Clientes', icon: 'clients' as NavIcon },
] as const;

const ADMIN_NAV_ITEM = {
  href: '/users',
  label: 'Usuarios',
  icon: 'users' as NavIcon,
} as const;

const MOBILE_NAV_ITEMS = [
  {
    href: '/dashboard',
    mobileLabel: 'Inicio',
    icon: 'dashboard' as NavIcon,
    emphasis: 'default' as const,
  },
  {
    href: '/samples/new',
    mobileLabel: 'Novo',
    icon: 'new-sample' as NavIcon,
    emphasis: 'default' as const,
  },
  {
    href: '/camera',
    mobileLabel: 'Camera',
    icon: 'camera' as NavIcon,
    emphasis: 'primary' as const,
  },
  {
    href: '/samples',
    mobileLabel: 'Amostras',
    icon: 'samples' as NavIcon,
    emphasis: 'default' as const,
  },
  {
    href: '/clients',
    mobileLabel: 'Clientes',
    icon: 'clients' as NavIcon,
    emphasis: 'default' as const,
  },
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
        <path d="M4 8V5.6A1.6 1.6 0 0 1 5.6 4H8" />
        <path d="M16 4h2.4A1.6 1.6 0 0 1 20 5.6V8" />
        <path d="M20 16v2.4a1.6 1.6 0 0 1-1.6 1.6H16" />
        <path d="M8 20H5.6A1.6 1.6 0 0 1 4 18.4V16" />
        <path d="M7.5 12h9" />
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
      title: 'Leitor QR',
      subtitle: 'Escaneie o QR code da etiqueta para localizar a amostra.',
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
  const isSamplesList = pathname === '/samples';
  const isClientsList = pathname === '/clients';
  const isSampleDetail = pathname.startsWith('/samples/') && pathname !== '/samples/new';
  const isClientDetail = pathname.startsWith('/clients/') && pathname !== '/clients';
  const isUsersPage = pathname === '/users';
  const isSettingsPage = pathname === '/settings';
  const isLayeredRoute =
    isDashboard ||
    isNewSample ||
    isSamplesList ||
    isClientsList ||
    isSampleDetail ||
    isClientDetail ||
    isUsersPage ||
    isSettingsPage;
  const headerMobileClass = isLayeredRoute ? 'topbar--dashboard-only' : 'topbar--hidden';
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [passwordModalStep, setPasswordModalStep] = useState<'decision' | 'change'>('decision');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const showPasswordDecisionModal =
    session.user.initialPasswordDecision === 'PENDING' || passwordModalStep === 'change';
  const passwordModalTrapRef = useFocusTrap(showPasswordDecisionModal);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null);

  const profileName =
    typeof session.user.fullName === 'string' && session.user.fullName.trim().length > 0
      ? session.user.fullName.trim()
      : session.user.username;
  const desktopNavItems = isAdmin(session.user.role)
    ? [...DESKTOP_NAV_ITEMS, ADMIN_NAV_ITEM]
    : DESKTOP_NAV_ITEMS;
  const mobileRouteMeta = resolveMobileRouteMeta(pathname);
  const isCameraRoute = pathname === '/camera';

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

  useEffect(() => {
    const KEYBOARD_SELECTOR =
      'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]), textarea, select, [contenteditable="true"]';

    let savedScroll: { x: number; y: number } | null = null;

    function isKeyboardTarget(el: EventTarget | null) {
      return el instanceof HTMLElement && el.matches(KEYBOARD_SELECTOR);
    }

    function onFocusIn(event: FocusEvent) {
      if (isKeyboardTarget(event.target)) {
        if (savedScroll === null) {
          savedScroll = { x: window.scrollX, y: window.scrollY };
        }
        document.body.classList.add('is-keyboard-open');
      }
    }

    function onFocusOut() {
      requestAnimationFrame(() => {
        if (!isKeyboardTarget(document.activeElement)) {
          document.body.classList.remove('is-keyboard-open');
          const target = savedScroll;
          savedScroll = null;
          if (target !== null) {
            window.setTimeout(() => {
              window.scrollTo({ top: target.y, left: target.x, behavior: 'smooth' });
            }, 320);
          }
        }
      });
    }

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.body.classList.remove('is-keyboard-open');
    };
  }, []);

  useEffect(() => {
    if (!showPasswordDecisionModal) return;
    const block = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault();
    };
    document.addEventListener('keydown', block);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', block);
      document.body.style.overflow = '';
    };
  }, [showPasswordDecisionModal]);

  async function handleKeepPassword() {
    setDecisionLoading(true);
    setDecisionError(null);

    try {
      const response = await recordInitialPasswordDecision(session, 'KEPT');
      if (onSessionChange) {
        onSessionChange(mergeUserIntoSession(session, response.user));
      }
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : 'Falha ao registrar a escolha');
    } finally {
      setDecisionLoading(false);
    }
  }

  async function handleChooseChangePassword() {
    setDecisionLoading(true);
    setDecisionError(null);

    try {
      const response = await recordInitialPasswordDecision(session, 'CHANGED');
      if (onSessionChange) {
        onSessionChange(mergeUserIntoSession(session, response.user));
      }
      setPasswordModalStep('change');
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : 'Falha ao registrar a escolha');
    } finally {
      setDecisionLoading(false);
    }
  }

  async function handleSubmitNewPassword() {
    setPasswordChangeError(null);

    if (newPassword !== confirmPassword) {
      setPasswordChangeError('As senhas nao coincidem.');
      return;
    }

    const parsed = changePasswordSchema.safeParse({ password: newPassword });
    if (!parsed.success) {
      setPasswordChangeError(parsed.error.issues[0]?.message ?? 'Senha invalida');
      return;
    }

    setPasswordChangeLoading(true);
    try {
      await changeCurrentUserPassword(session, parsed.data.password);
      if (onSessionChange) onSessionChange(null);
      router.replace('/login?reason=session-ended');
    } catch (error) {
      setPasswordChangeError(error instanceof Error ? error.message : 'Falha ao alterar senha');
    } finally {
      setPasswordChangeLoading(false);
    }
  }

  return (
    <div className="app-shell-root mobile-edge-shell mobile-edge-shell-auth">
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
                    <Link
                      href="/users"
                      className="topbar-profile-link"
                      onClick={() => setProfileMenuOpen(false)}
                    >
                      Usuarios
                    </Link>
                  ) : null}
                  <Link
                    href="/clients"
                    className="topbar-profile-link"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    Clientes
                  </Link>
                  <Link
                    href="/settings"
                    className="topbar-profile-link"
                    onClick={() => setProfileMenuOpen(false)}
                  >
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

      <main
        className={`app-shell-main${isCameraRoute ? ' is-camera-route' : ''}${isLayeredRoute ? ' is-dashboard-route' : ''}${isNewSample ? ' is-new-sample-route' : ''}`}
      >
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

        <div className="app-shell-page-content">{children}</div>
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

      {showPasswordDecisionModal ? (
        <div className="app-modal-backdrop app-modal-backdrop-no-dismiss">
          <section
            ref={passwordModalTrapRef}
            className="app-modal app-modal-password-decision"
            role="dialog"
            aria-modal="true"
          >
            {passwordModalStep === 'decision' ? (
              <>
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 className="app-modal-title">Senha inicial</h3>
                    <p className="app-modal-description">
                      Sua conta esta usando a senha definida pelo administrador. Voce pode mante-la
                      ou escolher uma nova senha agora.
                    </p>
                  </div>
                </header>
                {decisionError ? <p className="app-modal-error">{decisionError}</p> : null}
                <div className="app-modal-actions">
                  <button
                    type="button"
                    className="app-modal-secondary"
                    onClick={handleKeepPassword}
                    disabled={decisionLoading}
                  >
                    {decisionLoading ? 'Salvando...' : 'Manter senha'}
                  </button>
                  <button
                    type="button"
                    className="app-modal-submit"
                    onClick={handleChooseChangePassword}
                    disabled={decisionLoading}
                  >
                    Alterar senha
                  </button>
                </div>
              </>
            ) : (
              <>
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 className="app-modal-title">Nova senha</h3>
                    <p className="app-modal-description">
                      Escolha uma senha com no minimo 8 caracteres.
                    </p>
                  </div>
                </header>
                <div className="app-modal-content">
                  <form
                    className="app-modal-password-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleSubmitNewPassword();
                    }}
                  >
                    <div className="app-modal-password-field">
                      <span className="app-modal-password-label">Nova senha</span>
                      <div className="app-modal-password-input-wrap">
                        <input
                          className="app-modal-password-input"
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          autoComplete="new-password"
                          placeholder="Minimo de 8 caracteres"
                        />
                        <button
                          type="button"
                          className="app-modal-password-toggle"
                          onClick={() => setShowNewPassword((v) => !v)}
                          tabIndex={-1}
                          aria-label={showNewPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="app-shell-password-eye"
                            aria-hidden="true"
                          >
                            {showNewPassword ? (
                              <>
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </>
                            ) : (
                              <>
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </>
                            )}
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="app-modal-password-field">
                      <span className="app-modal-password-label">Confirmar nova senha</span>
                      <div className="app-modal-password-input-wrap">
                        <input
                          className="app-modal-password-input"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          autoComplete="new-password"
                          placeholder="Repita a nova senha"
                        />
                        <button
                          type="button"
                          className="app-modal-password-toggle"
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          tabIndex={-1}
                          aria-label={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="app-shell-password-eye"
                            aria-hidden="true"
                          >
                            {showConfirmPassword ? (
                              <>
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </>
                            ) : (
                              <>
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </>
                            )}
                          </svg>
                        </button>
                      </div>
                    </div>
                    {passwordChangeError ? (
                      <p className="app-modal-error">{passwordChangeError}</p>
                    ) : null}
                  </form>
                </div>
                <div className="app-modal-actions">
                  <button
                    type="button"
                    className="app-modal-submit"
                    onClick={() => void handleSubmitNewPassword()}
                    disabled={passwordChangeLoading || newPassword.length < 8}
                  >
                    {passwordChangeLoading ? 'Salvando...' : 'Salvar nova senha'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
