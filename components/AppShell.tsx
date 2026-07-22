'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { HeaderAvatarMenu } from './HeaderAvatarMenu';
import { HeaderCameraButton } from './HeaderCameraButton';
import { MobileTabbar } from './MobileTabbar';
import { UserAvatar } from './UserAvatar';
import { changeCurrentUserPassword, recordInitialPasswordDecision } from '../lib/api-client';
import { CameraSheetProvider } from '../lib/camera-sheet/CameraSheetProvider';
import { changePasswordSchema } from '../lib/form-schemas';
import {
  CONTRATOS_ROLES,
  getRoleLabel,
  INFORME_ROLES,
  isAdmin,
  isProspector,
  isRoleAllowed,
  NON_PROSPECTOR_ROLES,
} from '../lib/roles';
import { useToast } from '../lib/toast/ToastProvider';
import type { SessionData } from '../lib/types';
import { mergeUserIntoSession } from '../lib/use-auth';
import { useFocusTrap } from '../lib/use-focus-trap';

interface AppShellProps {
  session: SessionData;
  onLogout: () => Promise<void> | void;
  onSessionChange?: (session: SessionData | null) => void;
  // RD13: sub-item ativo da secao expandida na sidenav (ex.: 'corretores',
  // 'financeiro'). Vem por PROP das paginas com abas (?tab=) — o AppShell nao
  // le useSearchParams de proposito (exigiria Suspense em toda pagina).
  activeSubTab?: string;
  children: React.ReactNode;
}

type NavIcon =
  | 'dashboard'
  | 'samples'
  | 'users'
  | 'clients'
  | 'avatar'
  | 'informe'
  | 'cadastros'
  | 'contratos'
  | 'embarques'
  | 'financeiro'
  | 'profile';
type MobileRouteMeta = {
  title: string;
  subtitle: string;
  ctaHref?: string;
  ctaLabel?: string;
  ctaIcon?: NavIcon;
};

const DESKTOP_NAV_ITEMS = [
  { href: '/dashboard', label: 'Início', icon: 'dashboard' as NavIcon },
  { href: '/samples', label: 'Lotes', icon: 'samples' as NavIcon },
] as const;

const ADMIN_NAV_ITEM = {
  href: '/users',
  label: 'Usuarios',
  icon: 'users' as NavIcon,
} as const;

// Item da sidebar desktop que depende do papel: Relatorios (rota /informe —
// INFORME_ROLES OU viewers; unifica o antigo Informe + Resumo).
const INFORME_NAV_ITEM = {
  href: '/relatorios',
  label: 'Relatórios',
  icon: 'informe' as NavIcon,
} as const;

// Item da sidebar: Cadastros (Clientes/Corretores — a aba Bancos saiu na D141).
// Todo nao-PROSPECTOR ve (acesso unificado 2026-07-15); desde a F1 do redesign
// e a UNICA entrada pra lista de clientes (a rota /clients virou redirect).
const CADASTROS_NAV_ITEM = {
  href: '/cadastros',
  label: 'Cadastros',
  icon: 'cadastros' as NavIcon,
} as const;

// Itens de nav das 2 páginas de contrato (SPLIT 2026-07-13): "Contratos" (rota
// /contratos = Contratos + Financeiro, gated CONTRATOS_ROLES) e "Embarques" (rota
// /embarques = Embarque + Aprovações, gated NON_PROSPECTOR). Ambos também no avatar
// menu p/ mobile (HeaderAvatarMenu). Ver docs/Contratos-Visao-Geral.md §2.
const CONTRATOS_NAV_ITEM = {
  href: '/contratos',
  label: 'Contratos',
  icon: 'contratos' as NavIcon,
} as const;

const EMBARQUES_NAV_ITEM = {
  href: '/embarques',
  label: 'Embarques',
  icon: 'embarques' as NavIcon,
} as const;

// RD13: secoes da sidenav com SUB-ITENS expansiveis (chrome institucional).
// Deep-link via ?tab= (padrao da casa: o param e fonte de verdade na pagina);
// o sub-item ativo chega pela prop activeSubTab. Quando a pagina esta ativa e
// nenhum activeSubTab foi passado, o primeiro sub-item e o default visual.
type NavSubItem = { tab: string; label: string; href: string };
const NAV_SUB_ITEMS: Record<string, readonly NavSubItem[]> = {
  '/samples': [
    { tab: 'lotes', label: 'Lotes', href: '/samples' },
    { tab: 'simulador', label: 'Simulador', href: '/samples?tab=simulador' },
  ],
  '/cadastros': [
    { tab: 'clientes', label: 'Clientes', href: '/cadastros' },
    { tab: 'corretores', label: 'Corretores', href: '/cadastros?tab=corretores' },
  ],
  '/contratos': [
    { tab: 'contratos', label: 'Contratos', href: '/contratos?tab=contratos' },
    { tab: 'financeiro', label: 'Financeiro', href: '/contratos?tab=financeiro' },
  ],
  '/embarques': [
    { tab: 'embarque', label: 'Embarque', href: '/embarques?tab=embarque' },
    { tab: 'aprovacoes', label: 'Aprovações', href: '/embarques?tab=aprovacoes' },
  ],
};

const MOBILE_NAV_ITEMS = [
  {
    href: '/dashboard',
    mobileLabel: 'Inicio',
    icon: 'dashboard' as NavIcon,
  },
  {
    href: '/samples',
    mobileLabel: 'Lotes',
    icon: 'samples' as NavIcon,
  },
  // CAM-P3: o slot central da camera saiu — a camera virou bottom sheet
  // global aberto pelo icone no header (HeaderAvatarMenu). Tabbar com 4
  // itens; grid-auto-flow redistribui sozinho.
  {
    href: '/cadastros',
    mobileLabel: 'Cadastros',
    icon: 'cadastros' as NavIcon,
  },
  {
    href: '/relatorios',
    mobileLabel: 'Relatórios',
    icon: 'informe' as NavIcon,
  },
  {
    // Slot alternativo: papeis fora de INFORME_ROLES (CLASSIFIER, CADASTRO
    // e REGISTRATION) nao tem Relatorios; recebem Perfil aqui para manter a
    // tabbar com 4 itens como os demais. A filtragem (mutuamente exclusiva com
    // /informe) fica no render da MobileTabbar.
    href: '/profile',
    mobileLabel: 'Perfil',
    icon: 'profile' as NavIcon,
  },
] as const;

function isMainNavItemActive(pathname: string, href: string) {
  if (href === '/dashboard') {
    return pathname === '/dashboard';
  }

  if (href === '/samples') {
    return pathname === '/samples' || /^\/samples\/[^/]+$/.test(pathname);
  }

  if (href === '/relatorios') {
    return pathname === '/relatorios';
  }

  if (href === '/profile') {
    return pathname === '/profile';
  }

  if (href === '/cadastros') {
    return pathname === '/cadastros';
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

  if (icon === 'cadastros') {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
        <path d="M8 13h8" />
        <path d="M8 16h5" />
      </svg>
    );
  }

  if (icon === 'contratos') {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6" />
        <path d="M9 17h5" />
      </svg>
    );
  }

  if (icon === 'embarques') {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M3 6h11v9H3z" />
        <path d="M14 9h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="1.6" />
        <circle cx="17.5" cy="18" r="1.6" />
      </svg>
    );
  }

  if (icon === 'financeiro') {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6.5 9.5h.01M17.5 14.5h.01" />
      </svg>
    );
  }

  if (icon === 'avatar' && user) {
    return <UserAvatar size="sm" user={user} />;
  }

  if (icon === 'profile') {
    // Pessoa dentro de um circulo (convencao "conta/perfil"), em traco como
    // os demais icones do nav — distinta da silhueta aberta de "Clientes".
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="9.7" r="2.5" />
        <path d="M7 18.2a5 5 0 0 1 10 0" />
      </svg>
    );
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

// Card do menu de perfil — mesmo desenho do menu da conta do mobile
// (HeaderAvatarMenu): resumo com avatar + nome/cargo no topo e linhas com
// icone. Usado em DOIS ancoradouros (DSB-D15): dropdown da top bar
// (mobile/PROSPECTOR desktop) e dropup do trilho da sidenav (nao-PROSPECTOR).
function ProfileMenuCard({
  session,
  profileName,
  onClose,
  onLogout,
}: {
  session: SessionData;
  profileName: string;
  onClose: () => void;
  onLogout: () => Promise<void> | void;
}) {
  return (
    <div className="header-avatar-menu">
      <div className="header-avatar-menu-summary">
        <UserAvatar size="md" user={session.user} />
        <div className="header-avatar-menu-summary-text">
          <span className="header-avatar-menu-summary-name">{profileName}</span>
          <span className="header-avatar-menu-summary-role">{getRoleLabel(session.user.role)}</span>
        </div>
      </div>

      <div className="header-avatar-menu-list">
        <Link href="/profile" className="header-avatar-menu-row" onClick={onClose}>
          <svg className="header-avatar-menu-row-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M5 20a7 7 0 0 1 14 0" />
          </svg>
          <span className="header-avatar-menu-row-label">Meu perfil</span>
        </Link>

        <button
          type="button"
          className="header-avatar-menu-row is-danger"
          onClick={() => {
            onClose();
            onLogout();
          }}
        >
          <svg className="header-avatar-menu-row-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
            <path d="M10 16l-4-4 4-4" />
            <path d="M6 12h11" />
          </svg>
          <span className="header-avatar-menu-row-label">Sair</span>
        </button>
      </div>
    </div>
  );
}

// Fecha um menu ancorado (dropdown/dropup) em clique-fora e Escape (devolvendo
// o foco ao trigger). Compartilhado pelo menu da top bar e pelo do trilho da
// sidenav (DSB-D15).
function useMenuDismiss(
  open: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  setOpen: (open: boolean) => void
) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!containerRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [open, containerRef, triggerRef, setOpen]);
}

function resolveMobileRouteMeta(pathname: string): MobileRouteMeta | null {
  if (pathname === '/profile') {
    return null;
  }

  if (pathname === '/users') {
    return null;
  }

  return null;
}

export function AppShell({
  session,
  onLogout,
  onSessionChange,
  activeSubTab,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  // Menu do perfil na TOP BAR desktop (RD13; ex-dropup do trilho, DSB-D15).
  const [sidenavMenuOpen, setSidenavMenuOpen] = useState(false);
  // RD13: override manual de expansao das secoes da sidenav. Sem entrada aqui,
  // a secao ativa (pathname) fica expandida; navegar reseta os overrides.
  const [sectionOverrides, setSectionOverrides] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setSectionOverrides({});
  }, [pathname]);
  const isDashboard = pathname === '/dashboard';
  const isSamplesList = pathname === '/samples';
  const isUsersPage = pathname === '/users';
  const isProfilePage = pathname === '/profile';
  const isInformePage = pathname === '/relatorios';
  // /samples/[sampleId] saiu da lista: a rota virou redirect na F2 do redesign
  // (o detalhe do lote e overlay sobre /samples, como o cliente em /cadastros).
  const isLayeredRoute =
    isDashboard || isSamplesList || isUsersPage || isProfilePage || isInformePage;
  const headerMobileClass = isLayeredRoute ? 'topbar--dashboard-only' : 'topbar--hidden';
  // Overlays/sheets (ex.: detalhes de cliente/lote) escondem a tabbar mobile
  // dinamicamente via body.is-bottom-sheet-open em globals.css.
  // PROSPECTOR: app restrito SEM navbar — o lugar do botao central (camera)
  // e ocupado pelo "+" do formulario, renderizado pelo ProspectorDashboard.
  const prospector = isProspector(session.user.role);
  const hideMobileTabbar = prospector;
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
  // Guarda de SSR pro createPortal do modal de senha (padrao do MobileTabbar).
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    setPortalReady(true);
  }, []);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sidenavMenuRef = useRef<HTMLDivElement | null>(null);
  const sidenavTriggerRef = useRef<HTMLButtonElement | null>(null);
  const toast = useToast();

  const profileName =
    typeof session.user.fullName === 'string' && session.user.fullName.trim().length > 0
      ? session.user.fullName.trim()
      : session.user.username;
  // Navegacao principal (desktop) montada por papel. Ordem (pedido do usuario):
  // Inicio / Lotes (base) -> Relatorios (INFORME_ROLES) -> Cadastros (todo
  // nao-PROSPECTOR) -> Contratos/Embarques -> Usuarios (ADMIN). Itens
  // condicionais somem por papel mantendo essa ordem relativa.
  const desktopNavItems = prospector
    ? DESKTOP_NAV_ITEMS.filter((item) => item.href === '/dashboard')
    : [
        ...DESKTOP_NAV_ITEMS,
        ...(isRoleAllowed(session.user.role, INFORME_ROLES) ? [INFORME_NAV_ITEM] : []),
        CADASTROS_NAV_ITEM,
        // 2 páginas de contrato (SPLIT 2026-07-13): "Contratos" (Contratos+Financeiro)
        // p/ ADMIN/COMMERCIAL; "Embarques" (Embarque+Aprovações) p/ todos os
        // não-PROSPECTOR. Usuários segue ADMIN-only.
        ...(isRoleAllowed(session.user.role, CONTRATOS_ROLES) ? [CONTRATOS_NAV_ITEM] : []),
        ...(isRoleAllowed(session.user.role, NON_PROSPECTOR_ROLES) ? [EMBARQUES_NAV_ITEM] : []),
        ...(isAdmin(session.user.role) ? [ADMIN_NAV_ITEM] : []),
      ];
  const mobileRouteMeta = resolveMobileRouteMeta(pathname);
  // Titulo da secao no desktop (RD13; ex-DSB-D17 dentro da pagina): o rotulo
  // do item de nav ativo, agora renderizado NA TOP BAR. Rotas principais por
  // match exato + Perfil (item do rodape da sidenav).
  const activePageTitle = prospector
    ? null
    : (desktopNavItems.find((item) => item.href === pathname)?.label ??
      (pathname === '/profile' ? 'Perfil' : null));
  // RD16: titulo da faixa verde mobile. MESMO mapa do desktop (nao criar um
  // segundo), com fallback por prefixo pras sub-rotas que nao batem exato.
  const mobileTitle = prospector
    ? null
    : (activePageTitle ??
      desktopNavItems.find((item) => isMainNavItemActive(pathname, item.href))?.label ??
      null);

  // Clique-fora + Escape dos dois menus de perfil (top bar e trilho da sidenav).
  useMenuDismiss(profileMenuOpen, profileMenuRef, profileTriggerRef, setProfileMenuOpen);
  useMenuDismiss(sidenavMenuOpen, sidenavMenuRef, sidenavTriggerRef, setSidenavMenuOpen);

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
      {/* Sidebar vertical: mantida SÓ pro PROSPECTOR (app restrito — o
          desktop dos demais papéis migrou pra top bar, DSB-D6). O grid do
          shell alterna via :has(.app-sidebar) no CSS. */}
      {prospector ? (
        <aside className="app-sidebar" aria-label="Navegacao principal">
          <Link href="/dashboard" className="app-sidebar-logo" aria-label="Pagina inicial">
            <Image
              src="/logo-safras-branco.png"
              alt="Safras e Negocios"
              width={1024}
              height={299}
              priority
              className="app-sidebar-logo-image"
            />
          </Link>

          <nav className="app-sidebar-nav" aria-label="Paginas principais">
            {desktopNavItems.map((item) => {
              const active = isMainNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`app-sidebar-link${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="app-sidebar-link-icon" aria-hidden="true">
                    {renderNavIcon(item.icon)}
                  </span>
                  <span className="app-sidebar-link-label">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <button type="button" className="app-sidebar-logout" onClick={() => onLogout()}>
            <span className="app-sidebar-logout-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
                <path d="M10 16l-4-4 4-4" />
                <path d="M6 12h11" />
              </svg>
            </span>
            Sair
          </button>
        </aside>
      ) : null}

      {/* Top bar desktop dos nao-PROSPECTOR (RD13, chrome institucional):
          fica A DIREITA da sidenav (col 2 do grid — o logo desceu pro topo da
          sidenav). Esquerda: titulo da secao ativa (ex-.app-page-title,
          DSB-D17). Direita: sino (inerte) + PERFIL nome+papel+chevron, cujo
          dropdown reusa o ProfileMenuCard (ex-dropup do trilho). */}
      {!prospector ? (
        <header className="app-topbar">
          <div className="app-topbar-lead">
            {activePageTitle ? <h1 className="fv-topbar-title">{activePageTitle}</h1> : null}
          </div>

          <div className="app-topbar-actions">
            <button type="button" className="app-topbar-action" aria-label="Notificações">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
                <path d="M10.3 19a2 2 0 0 0 3.4 0" />
              </svg>
            </button>

            <div className="fv-topbar-profile" ref={sidenavMenuRef}>
              <button
                ref={sidenavTriggerRef}
                type="button"
                className="fv-topbar-profile-trigger"
                aria-haspopup="menu"
                aria-expanded={sidenavMenuOpen}
                aria-controls="fv-topbar-profile-menu"
                aria-label="Abrir menu de perfil"
                onClick={() => setSidenavMenuOpen((current) => !current)}
              >
                <UserAvatar size="sm" user={session.user} />
                <span className="fv-topbar-profile-text">
                  <span className="fv-topbar-profile-name">{profileName}</span>
                  <span className="fv-topbar-profile-role">{getRoleLabel(session.user.role)}</span>
                </span>
                <svg
                  className="fv-topbar-profile-chevron"
                  viewBox="0 0 24 24"
                  focusable="false"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {sidenavMenuOpen ? (
                <section id="fv-topbar-profile-menu" className="fv-topbar-profile-menu" role="menu">
                  <ProfileMenuCard
                    session={session}
                    profileName={profileName}
                    onClose={() => setSidenavMenuOpen(false)}
                    onLogout={onLogout}
                  />
                </section>
              ) : null}
            </div>
          </div>
        </header>
      ) : null}

      {/* Sidenav desktop dos nao-PROSPECTOR (RD13, chrome institucional):
          painel UNICO branco de altura inteira (o trilho do DSB-D15 morreu; o
          avatar migrou pra top bar). Topo: logo + "Safras" (link pro
          dashboard, altura da top bar — as hairlines emendam). Miolo: label
          "Menu" + navegacao com secoes EXPANSIVEIS (Cadastros/Contratos/
          Embarques; sub-itens deep-linkam via ?tab=). Rodape: Perfil + Ajuda.
          Sempre montada; o CSS liga so em >=901px (mobile usa a tabbar). */}
      {!prospector ? (
        <aside className="app-sidenav" aria-label="Navegacao principal">
          <div className="fv-sidenav-brand">
            <Link href="/dashboard" className="fv-sidenav-brand-link" aria-label="Pagina inicial">
              {/* Ajustes rodada 1: logo COMPLETO (arvore + wordmark) centralizado
                  no topo do painel — sai o icone quadrado + span "Safras". */}
              <Image
                src="/logo-safras-color.png"
                alt="Safras e Negocios"
                width={473}
                height={160}
                priority
                className="fv-sidenav-brand-logo"
              />
            </Link>
          </div>

          <div className="fv-sidenav-scroll">
            <span className="fv-sidenav-heading" aria-hidden="true">
              Menu
            </span>

            <nav className="app-sidenav-nav" aria-label="Paginas principais">
              {desktopNavItems.map((item) => {
                const active = isMainNavItemActive(pathname, item.href);
                const subItems = NAV_SUB_ITEMS[item.href];

                if (!subItems) {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`app-sidenav-link${active ? ' is-active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span className="app-sidenav-link-icon" aria-hidden="true">
                        {renderNavIcon(item.icon)}
                      </span>
                      <span className="app-sidenav-link-label">{item.label}</span>
                    </Link>
                  );
                }

                const expanded = sectionOverrides[item.href] ?? active;
                return (
                  <div key={item.href} className="fv-sidenav-section">
                    <button
                      type="button"
                      className={`app-sidenav-link fv-sidenav-section-toggle${active ? ' is-active' : ''}`}
                      aria-expanded={expanded}
                      onClick={() =>
                        setSectionOverrides((current) => ({
                          ...current,
                          [item.href]: !expanded,
                        }))
                      }
                    >
                      <span className="app-sidenav-link-icon" aria-hidden="true">
                        {renderNavIcon(item.icon)}
                      </span>
                      <span className="app-sidenav-link-label">{item.label}</span>
                      <svg
                        className={`fv-sidenav-chevron${expanded ? ' is-open' : ''}`}
                        viewBox="0 0 24 24"
                        focusable="false"
                        aria-hidden="true"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>

                    {expanded ? (
                      <div className="fv-sidenav-subnav">
                        {subItems.map((sub, index) => {
                          const subActive =
                            active && (activeSubTab ? activeSubTab === sub.tab : index === 0);
                          return (
                            <Link
                              key={sub.tab}
                              href={sub.href}
                              className={`fv-sidenav-sublink${subActive ? ' is-active' : ''}`}
                              aria-current={subActive ? 'page' : undefined}
                            >
                              {sub.label}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>

            <div className="fv-sidenav-footer">
              <Link
                href="/profile"
                className={`app-sidenav-link${pathname === '/profile' ? ' is-active' : ''}`}
                aria-current={pathname === '/profile' ? 'page' : undefined}
              >
                <span className="app-sidenav-link-icon" aria-hidden="true">
                  {renderNavIcon('profile')}
                </span>
                <span className="app-sidenav-link-label">Perfil</span>
              </Link>

              {/* Inerte por ora (ganha funcao no futuro) — veio da top bar. */}
              <button type="button" className="app-sidenav-link" aria-label="Ajuda">
                <span className="app-sidenav-link-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <circle cx="12" cy="12" r="8.5" />
                    <path d="M9.8 9.4a2.3 2.3 0 0 1 4.5.6c0 1.5-2.2 1.9-2.2 3.2" />
                    <path d="M12 16.4h.01" />
                  </svg>
                </span>
                <span className="app-sidenav-link-label">Ajuda</span>
              </button>
            </div>
          </div>
        </aside>
      ) : null}

      {/* Faixa verde antiga: RD16 deixou-a SO pro PROSPECTOR (o desktop dele
          nao tem sidenav). Pros demais papeis ela ja era DOM morto em 100% das
          rotas — display:none no desktop (`:has(.app-sidenav)`) e transparente
          com os filhos escondidos no mobile — e agora o header mobile e a
          .fv-mtopbar. DIVIDA: o <SampleSearchField> que morava aqui era
          inalcancavel (so montava pra nao-PROSPECTOR, dentro de um header que
          nunca aparecia pra eles) — saiu junto; a busca global de lote precisa
          de casa nova. */}
      {prospector ? (
        <header className={`topbar ${headerMobileClass}`}>
          <div className="topbar-inner">
            <div className="topbar-mobile-spacer" aria-hidden="true" />

            <Link href="/dashboard" className="topbar-logo-slot" aria-label="Pagina inicial">
              {/* Logo branco na barra verde. DSB-D15: o logo colorido do
                  desktop saiu daqui — mora no trilho da sidenav. */}
              <Image
                src="/logo-safras-branco.png"
                alt="Safras e Negocios"
                width={1024}
                height={299}
                priority
                className="topbar-logo-image is-white"
              />
            </Link>

            <div className="topbar-tools">
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
                  <UserAvatar size="md" user={session.user} />
                </button>

                {profileMenuOpen ? (
                  <section id="topbar-profile-menu" className="topbar-profile-menu" role="menu">
                    {/* Mesmo card do trilho da sidenav; aqui num DROPDOWN. */}
                    <ProfileMenuCard
                      session={session}
                      profileName={profileName}
                      onClose={() => setProfileMenuOpen(false)}
                      onLogout={onLogout}
                    />
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        </header>
      ) : null}

      {/* CAM-P3 + RD16: o provider da camera envolve o HEADER MOBILE e o
          conteudo — os gatilhos vivem nos dois (icone do header + botoes do
          detalhe do lote). Context.Provider NAO cria DOM, entao <header> e
          <main> seguem filhos DIRETOS do .app-shell-root (ha seletores `>` e
          o grid do desktop contando com isso); o sheet em si e os modais do
          fluxo portam pro document.body. */}
      <CameraSheetProvider session={session}>
        {/* RD16: faixa verde curta — o UNICO header mobile do app. Substitui os
            4 moldes por pagina (.samples-page-v2-header, .clients-v2-header,
            .sdv-header-top, .dashboard-hero-header). Some no desktop por CSS,
            onde o chrome e a .app-topbar + sidenav (RD13). PROSPECTOR fica de
            fora: app restrito, sem tabbar e sem camera. */}
        {!prospector ? (
          <header className={`fv-mtopbar${isDashboard ? ' is-title-lead' : ''}`}>
            {/* 3 slots simetricos (grid 1fr auto 1fr): camera a ESQUERDA,
                titulo ao CENTRO de verdade — geometrico, nao por compensacao de
                largura como no header antigo — e menu da conta a DIREITA.
                Excecao do /dashboard: titulo encostado a esquerda, pra nao
                disputar com a saudacao logo abaixo. */}
            <span className="fv-mtopbar-slot">
              <HeaderCameraButton />
            </span>

            <h1 className="fv-mtopbar-title">{mobileTitle}</h1>

            <span className="fv-mtopbar-slot is-end">
              <HeaderAvatarMenu session={session} onLogout={onLogout} trigger="menu" />
            </span>
          </header>
        ) : null}

        <main className={`app-shell-main${isLayeredRoute ? ' is-dashboard-route' : ''}`}>
          {mobileRouteMeta ? (
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
      </CameraSheetProvider>

      {!hideMobileTabbar ? (
        <MobileTabbar
          items={MOBILE_NAV_ITEMS.filter((item) => {
            // 5o slot da tabbar (mutuamente exclusivo): Relatorios (/informe)
            // para quem esta em INFORME_ROLES; Perfil (/profile) para quem nao
            // esta — hoje so o CLASSIFIER, unico nao-prospector fora de
            // INFORME_ROLES. Assim todo papel da tabbar fica com 5 itens.
            // (PROSPECTOR nao chega aqui: tabbar escondida por hideMobileTabbar.)
            if (item.href === '/relatorios') {
              return isRoleAllowed(session.user.role, INFORME_ROLES);
            }
            if (item.href === '/profile') {
              return !isRoleAllowed(session.user.role, INFORME_ROLES);
            }
            return true;
          }).map((item) => ({
            href: item.href,
            mobileLabel: item.mobileLabel,
            icon: renderNavIcon(item.icon, session.user),
          }))}
          isActive={(href) => isMainNavItemActive(pathname, href)}
        />
      ) : null}

      {showPasswordDecisionModal && portalReady
        ? createPortal(
            <div className="app-modal-backdrop app-modal-backdrop-no-dismiss">
              <section
                ref={passwordModalTrapRef}
                className="app-modal app-modal-password-decision"
                role="dialog"
                aria-modal="true"
                aria-labelledby="app-shell-password-modal-title"
              >
                {passwordModalStep === 'decision' ? (
                  <>
                    <header className="app-modal-header">
                      <div className="app-modal-title-wrap">
                        <h3 className="app-modal-title" id="app-shell-password-modal-title">
                          Senha inicial
                        </h3>
                        <p className="app-modal-description">
                          Sua conta esta usando a senha definida pelo administrador. Voce pode
                          mante-la ou escolher uma nova senha agora.
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
                        <h3 className="app-modal-title" id="app-shell-password-modal-title">
                          Nova senha
                        </h3>
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
                    <div className="app-modal-actions app-modal-password-form-actions">
                      <button
                        type="button"
                        className="app-modal-submit"
                        onClick={() => void handleSubmitNewPassword()}
                        disabled={passwordChangeLoading || newPassword.length < 8}
                      >
                        {passwordChangeLoading ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </>
                )}
              </section>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
