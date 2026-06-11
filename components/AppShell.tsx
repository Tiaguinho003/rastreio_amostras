'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { MobileTabbar } from './MobileTabbar';
import { SampleSearchField } from './SampleSearchField';
import { UserAvatar } from './UserAvatar';
import { changeCurrentUserPassword, recordInitialPasswordDecision } from '../lib/api-client';
import { changePasswordSchema } from '../lib/form-schemas';
import { useVisitOutboxAutoSync } from '../lib/offline/use-visit-outbox-sync';
import { VISIT_SYNC_COMPLETED_EVENT, type VisitSyncResult } from '../lib/offline/visit-sync';
import { getRoleLabel, isAdmin, isProspector, isVisitReportViewer } from '../lib/roles';
import { useToast } from '../lib/toast/ToastProvider';
import type { SessionData } from '../lib/types';
import { mergeUserIntoSession } from '../lib/use-auth';
import { useFocusTrap } from '../lib/use-focus-trap';

interface AppShellProps {
  session: SessionData;
  onLogout: () => Promise<void> | void;
  onSessionChange?: (session: SessionData | null) => void;
  children: React.ReactNode;
}

type NavIcon = 'dashboard' | 'camera' | 'samples' | 'users' | 'clients' | 'avatar' | 'informe';
type MobileRouteMeta = {
  title: string;
  subtitle: string;
  ctaHref?: string;
  ctaLabel?: string;
  ctaIcon?: NavIcon;
};

const DESKTOP_NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' as NavIcon },
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
    href: '/samples',
    mobileLabel: 'Lotes',
    icon: 'samples' as NavIcon,
    emphasis: 'default' as const,
  },
  {
    href: '/camera',
    mobileLabel: 'Camera',
    icon: 'camera' as NavIcon,
    emphasis: 'primary' as const,
  },
  {
    href: '/clients',
    mobileLabel: 'Clientes',
    icon: 'clients' as NavIcon,
    emphasis: 'default' as const,
  },
  {
    href: '/informe',
    mobileLabel: 'Informe',
    icon: 'informe' as NavIcon,
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

  if (href === '/samples') {
    return pathname === '/samples' || /^\/samples\/[^/]+$/.test(pathname);
  }

  if (href === '/clients') {
    return pathname === '/clients' || pathname.startsWith('/clients/');
  }

  if (href === '/informe') {
    return pathname === '/informe';
  }

  return pathname === href;
}

function renderNavIcon(icon: NavIcon, user?: SessionData['user']) {
  if (icon === 'dashboard') {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M4.8 10.2 12 4.8l7.2 5.4" />
        <path d="M6.6 9.6V19h10.8V9.6" />
        <path d="M10.2 19v-5.2h3.6V19" />
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
    // Grao de cafe: elipse inclinada + fenda central em S (sulco do grao),
    // no mesmo estilo stroke dos demais icones do nav.
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <ellipse cx="12" cy="12" rx="6.2" ry="8.7" transform="rotate(28 12 12)" />
        <path d="M15.9 4.9c-2.9 2.1-1.1 5-2.9 7.1-1.8 2.1-4.3 2.6-4.9 7" />
      </svg>
    );
  }

  if (icon === 'clients') {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    );
  }

  if (icon === 'informe') {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <rect x="5.5" y="3.5" width="13" height="17" rx="2.2" />
        <path d="M9 8h6" />
        <path d="M9 11.5h6" />
        <path d="M9 15h4" />
      </svg>
    );
  }

  if (icon === 'avatar' && user) {
    return <UserAvatar size="sm" user={user} />;
  }

  // Fallback generico (icon 'users' ou avatar sem usuario disponivel)
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

  if (pathname === '/profile') {
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
  const isDashboard = pathname === '/dashboard';
  const isNewSample = pathname === '/samples/new';
  const isSamplesList = pathname === '/samples';
  const isClientsList = pathname === '/clients';
  const isSampleDetail = pathname.startsWith('/samples/') && pathname !== '/samples/new';
  const isClientDetail = pathname.startsWith('/clients/') && pathname !== '/clients';
  const isUsersPage = pathname === '/users';
  const isProfilePage = pathname === '/profile';
  const isInformePage = pathname === '/informe';
  const isResumoPage = pathname === '/resumo';
  const isLayeredRoute =
    isDashboard ||
    isNewSample ||
    isSamplesList ||
    isClientsList ||
    isSampleDetail ||
    isClientDetail ||
    isUsersPage ||
    isProfilePage ||
    isInformePage ||
    isResumoPage;
  const headerMobileClass = isLayeredRoute ? 'topbar--dashboard-only' : 'topbar--hidden';
  // Rotas onde a tabbar mobile NAO deve renderizar (paginas de detalhe com
  // header proprio + back button; a tabbar so polui visualmente). A tabbar
  // some do DOM, sem visibility:hidden — zero risco de bug visual iOS PWA.
  // Para modais/sheets que escondem dinamicamente, ver body.is-bottom-sheet-open
  // / body.is-app-modal-open em globals.css.
  // PROSPECTOR: app restrito SEM navbar — o lugar do botao central (camera)
  // e ocupado pelo "+" do formulario, renderizado pelo ProspectorDashboard.
  const prospector = isProspector(session.user.role);
  const hideMobileTabbar = isSampleDetail || isClientDetail || prospector;
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
  const toast = useToast();

  // Fila offline de informes de visita: tenta sincronizar ao montar, quando
  // a internet volta e quando o app retorna ao primeiro plano. O resultado
  // chega pelo evento global do modulo de sync — anunciado AQUI (unico
  // listener) pra valer em qualquer pagina sem duplicar toast.
  useVisitOutboxAutoSync(session);

  useEffect(() => {
    const handleSyncCompleted = (event: Event) => {
      const result = (event as CustomEvent<VisitSyncResult>).detail;
      if (!result) {
        return;
      }

      if (result.authExpired) {
        toast.error({
          title: 'Sessão expirada',
          description: 'Entre novamente para enviar os informes pendentes.',
        });
        return;
      }

      if (result.sent > 0) {
        toast.success({
          title:
            result.sent === 1
              ? 'Informe pendente enviado'
              : `${result.sent} informes pendentes enviados`,
        });
      }

      if (result.failed > 0) {
        toast.error({
          title:
            result.failed === 1
              ? '1 informe não pôde ser enviado'
              : `${result.failed} informes não puderam ser enviados`,
          description: 'Continuam salvos no aparelho.',
        });
      }
    };

    window.addEventListener(VISIT_SYNC_COMPLETED_EVENT, handleSyncCompleted);
    return () => window.removeEventListener(VISIT_SYNC_COMPLETED_EVENT, handleSyncCompleted);
  }, [toast]);

  const profileName =
    typeof session.user.fullName === 'string' && session.user.fullName.trim().length > 0
      ? session.user.fullName.trim()
      : session.user.username;
  const desktopNavItems = prospector
    ? DESKTOP_NAV_ITEMS.filter((item) => item.href === '/dashboard')
    : isAdmin(session.user.role)
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
    const KEYBOARD_SELECTOR =
      'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]), textarea, select, [contenteditable="true"]';

    // Salva tanto o scroll do window quanto o scrollTop do container
    // scrollable mais proximo do input. Necessario porque em paginas com
    // .app-shell-main { overflow: hidden }, o scroll real acontece em
    // containers internos (.sdv-content, .bottom-sheet-body, etc) — o
    // scroll-into-view do iOS scrolla esses containers, nao a window.
    let savedScroll: {
      x: number;
      y: number;
      container: HTMLElement | null;
      containerScrollTop: number;
    } | null = null;
    // Tracking do setTimeout do scroll reset. Sem isso, se o user navega
    // pra outra rota dentro de 300ms apos focusout, o setTimeout dispara
    // em DOM diferente — pode tentar scrollTo em pagina ja desmontada ou
    // resetar scroll de uma rota nova. Cleanup cancela qualquer pendente.
    let scrollResetTimeoutId: number | null = null;

    function isKeyboardTarget(el: EventTarget | null) {
      return el instanceof HTMLElement && el.matches(KEYBOARD_SELECTOR);
    }

    // Sobe na arvore procurando o primeiro ancestor com overflow-y
    // auto/scroll que tem conteudo overflowing (scrollHeight > clientHeight).
    // Esse e o container que o iOS mexe ao fazer scroll-into-view do input.
    function findScrollableAncestor(element: HTMLElement | null): HTMLElement | null {
      let el: HTMLElement | null = element?.parentElement ?? null;
      while (el && el !== document.body) {
        const style = window.getComputedStyle(el);
        if (
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight
        ) {
          return el;
        }
        el = el.parentElement;
      }
      return null;
    }

    function onFocusIn(event: FocusEvent) {
      if (isKeyboardTarget(event.target)) {
        if (savedScroll === null) {
          const target = event.target as HTMLElement;
          const container = findScrollableAncestor(target);
          savedScroll = {
            x: window.scrollX,
            y: window.scrollY,
            container,
            containerScrollTop: container?.scrollTop ?? 0,
          };
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
          // CRITICO em iOS Safari standalone: quando user focusa em
          // input abaixo da viewport, iOS desloca a layout viewport
          // pra cima pra mostrar o input. Apos keyboard close,
          // visualViewport.offsetTop e/ou scrollY ficam CACHEADOS num
          // valor stale — position:fixed elements (tabbar) ficam
          // visualmente desalinhados. WebKit bug 265578.
          //
          // Workaround: aguarda 300ms (animacao do teclado terminar) +
          // force reflow + scrollTo INSTANT (sem smooth, smooth pode
          // ser interrompido pelo iOS). Se ainda ha offset stuck depois
          // de 300ms sem input focado, scrollTo(0,0) pra quebrar cache.
          if (scrollResetTimeoutId !== null) {
            window.clearTimeout(scrollResetTimeoutId);
          }
          scrollResetTimeoutId = window.setTimeout(() => {
            scrollResetTimeoutId = null;
            // Re-check: se algum input recebeu foco nesses 300ms, abortamos.
            if (isKeyboardTarget(document.activeElement)) return;
            // Force reflow pra iOS recompute layout viewport.
            void document.body.offsetHeight;
            const restoreY = target?.y ?? 0;
            const restoreX = target?.x ?? 0;
            // ScrollTo INSTANT (sem behavior:smooth) — smooth pode ser
            // ignorado/interrompido pelo iOS durante keyboard close.
            window.scrollTo(restoreX, restoreY);
            document.documentElement.scrollTop = restoreY;
            document.body.scrollTop = restoreY;
            // CRITICO: restaura scrollTop do container scrollable interno
            // (.sdv-content, .bottom-sheet-body, .new-sample-step-body-content-details
            // etc). Em paginas com app-shell-main { overflow: hidden }, o
            // window NUNCA scrolla — o scroll-into-view do iOS mexe no
            // container interno mais proximo do input. Sem este reset, o
            // container fica com scrollTop > 0 apos keyboard fechar, e o
            // conteudo da pagina aparece "subido", expondo o fundo bege
            // entre o conteudo e a tabbar (fixed).
            if (target?.container) {
              target.container.scrollTop = target.containerScrollTop;
            }
            // Fallback: se visualViewport.offsetTop ainda > 0 (cache stuck),
            // force scrollTo(0,0) pra quebrar.
            const offsetTop = window.visualViewport?.offsetTop ?? 0;
            if (offsetTop > 0 && restoreY === 0) {
              void document.body.offsetHeight;
              window.scrollTo(0, 0);
            }
          }, 300);
        }
      });
    }

    // Safety net: orientationchange + visualViewport.resize tambem
    // limpam `is-keyboard-open` se ela tiver ficado presa (iOS standalone
    // PWA as vezes nao dispara focusout em todos os fluxos de keyboard
    // close). Sem isso, a tabbar fica `translateY(100%)` (escondida)
    // ou — em variantes do bug — em posicao errada apos keyboard fechar.
    function clearKeyboardOpen() {
      if (!isKeyboardTarget(document.activeElement)) {
        document.body.classList.remove('is-keyboard-open');
        savedScroll = null;
      }
    }

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('orientationchange', clearKeyboardOpen);
    window.visualViewport?.addEventListener('resize', clearKeyboardOpen);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('orientationchange', clearKeyboardOpen);
      window.visualViewport?.removeEventListener('resize', clearKeyboardOpen);
      document.body.classList.remove('is-keyboard-open');
      // Cancela qualquer scroll reset pendente — evita que dispare em
      // DOM ja desmontado/em outra rota se user navega antes de 300ms.
      if (scrollResetTimeoutId !== null) {
        window.clearTimeout(scrollResetTimeoutId);
        scrollResetTimeoutId = null;
      }
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
    <div
      className={`app-shell-root mobile-edge-shell mobile-edge-shell-auth${hideMobileTabbar ? ' is-tabbar-hidden' : ''}`}
    >
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
              {/* PROSPECTOR nao acessa amostras — a busca de lote chamaria
                  um endpoint negado pela allowlist de API (403). */}
              {!prospector ? <SampleSearchField session={session} compact /> : null}
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
                onClick={() => setProfileMenuOpen((current) => !current)}
              >
                <UserAvatar size="sm" user={session.user} />
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
                  {isVisitReportViewer(session.user.role) ? (
                    <Link
                      href="/resumo"
                      className="topbar-profile-link"
                      onClick={() => setProfileMenuOpen(false)}
                    >
                      Resumo
                    </Link>
                  ) : null}
                  {!prospector ? (
                    <Link
                      href="/clients"
                      className="topbar-profile-link"
                      onClick={() => setProfileMenuOpen(false)}
                    >
                      Clientes
                    </Link>
                  ) : null}
                  <Link
                    href="/profile"
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
                  {renderNavIcon(mobileRouteMeta.ctaIcon ?? 'samples')}
                </span>
                <span>{mobileRouteMeta.ctaLabel}</span>
              </Link>
            ) : null}
          </section>
        ) : null}

        <div className="app-shell-page-content">{children}</div>
      </main>

      {!hideMobileTabbar ? (
        <MobileTabbar
          items={MOBILE_NAV_ITEMS.map((item) => ({
            href: item.href,
            mobileLabel: item.mobileLabel,
            icon: renderNavIcon(item.icon, session.user),
            emphasis: item.emphasis,
          }))}
          isActive={(href) => isMainNavItemActive(pathname, href)}
        />
      ) : null}

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
