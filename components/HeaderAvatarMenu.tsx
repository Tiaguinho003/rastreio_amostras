'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FINANCEIRO_ROLES, getRoleLabel, isAdmin, isRoleAllowed } from '../lib/roles';
import type { SessionData } from '../lib/types';
import { BottomSheet } from './BottomSheet';
import { UserAvatar } from './UserAvatar';

// Gatilho do "menu da conta" no header mobile. Abre um bottom sheet curto.
// Launcher: cada item fecha o sheet e navega pra rota completa (com o navbar
// visivel) — nao renderiza paginas dentro do sheet. No desktop o acesso ao
// perfil continua pelo dropdown do topbar do AppShell; espelha as opcoes dele.
//
// RD16: a camera saiu daqui pro canto ESQUERDO da faixa (HeaderCameraButton).
interface HeaderAvatarMenuProps {
  session: SessionData;
  onLogout: () => void | Promise<void>;
  // Aparencia do gatilho. `menu` (tres tracos) e o da faixa unica do shell;
  // `avatar` (avatar + chevron) sobrou no dashboard do PROSPECTOR, que tem
  // header proprio e fica fora do ciclo do RD16.
  trigger?: 'avatar' | 'menu';
}

export function HeaderAvatarMenu({ session, onLogout, trigger = 'avatar' }: HeaderAvatarMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const displayName = session.user.fullName?.trim() || session.user.username;
  const isMenuTrigger = trigger === 'menu';

  // Item launcher: fecha o sheet e navega pra rota.
  //
  // O BottomSheet injeta uma entry de history (`state.bottomSheet`) pra fechar
  // com o back do Android e a desfaz via `history.back()` no cleanup do close.
  // No App Router o `router.push` e assincrono, entao esse `history.back()`
  // rodava antes e DESFAZIA a navegacao (bug: Perfil/Usuarios nao abriam). Aqui
  // limpamos o marcador da entry atual ANTES de fechar: o cleanup ve
  // `state.bottomSheet` falsy, nao chama `history.back()`, e o `push` se mantem.
  // O back do Android segue fechando o sheet nos dismissals normais
  // (X / backdrop / swipe), que nao passam por aqui.
  function go(href: string) {
    if (typeof window !== 'undefined' && window.history.state?.bottomSheet) {
      window.history.replaceState({ ...window.history.state, bottomSheet: false }, '');
    }
    setOpen(false);
    router.push(href);
  }

  return (
    <span className="header-actions-cluster">
      <button
        type="button"
        className={isMenuTrigger ? 'fv-mtopbar-btn' : 'header-avatar-trigger'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Abrir menu da conta"
        onClick={() => setOpen(true)}
      >
        {isMenuTrigger ? (
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M4 7h16" />
            <path d="M4 12h16" />
            <path d="M4 17h16" />
          </svg>
        ) : (
          <>
            <UserAvatar size="md" user={session.user} />
            <svg
              className="header-avatar-chevron"
              viewBox="0 0 24 24"
              focusable="false"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </>
        )}
      </button>

      {/* Sem titulo visivel: o resumo (avatar + nome/cargo) ja encabeca o
          menu. title="" mantem o <h3> vazio como flex item, entao o X
          continua a direita (header com space-between) e a altura nao muda —
          nada se move de lugar. O nome acessivel do dialog vem do ariaLabel. */}
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title=""
        ariaLabel="Menu da conta"
        className="is-menu"
        dragToDismiss
      >
        <div className="header-avatar-menu">
          <div className="header-avatar-menu-summary">
            <UserAvatar size="md" user={session.user} />
            <div className="header-avatar-menu-summary-text">
              <span className="header-avatar-menu-summary-name">{displayName}</span>
              <span className="header-avatar-menu-summary-role">
                {getRoleLabel(session.user.role)}
              </span>
            </div>
          </div>

          <div className="header-avatar-menu-list">
            <button type="button" className="header-avatar-menu-row" onClick={() => go('/profile')}>
              <svg className="header-avatar-menu-row-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M5 20a7 7 0 0 1 14 0" />
              </svg>
              <span className="header-avatar-menu-row-label">Perfil</span>
            </button>

            {isAdmin(session.user.role) ? (
              <button type="button" className="header-avatar-menu-row" onClick={() => go('/users')}>
                <svg className="header-avatar-menu-row-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="9" cy="8" r="3.2" />
                  <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
                  <path d="M15.5 6.6a3 3 0 0 1 0 5.8" />
                  <path d="M17.2 19a5.5 5.5 0 0 0-2.6-4.7" />
                </svg>
                <span className="header-avatar-menu-row-label">Usuários</span>
              </button>
            ) : null}

            {/* Cadastros e Contratos saíram daqui em 2026-07-28: as duas viraram
                aba da tabbar (MOBILE_NAV_ITEMS no AppShell) e o menu ficou só
                com o que NÃO está na barra — sem caminho duplicado. */}

            {/* RC-D1/RC-D3: Financeiro voltou a ser pagina propria, so ADMIN. */}
            {isRoleAllowed(session.user.role, FINANCEIRO_ROLES) ? (
              <button
                type="button"
                className="header-avatar-menu-row"
                onClick={() => go('/financeiro')}
              >
                <svg className="header-avatar-menu-row-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 7.5v9" />
                  <path d="M14.4 9.6a2.4 2.4 0 0 0-2.4-1.2c-1.4 0-2.4.8-2.4 1.9 0 2.4 4.8 1.4 4.8 3.8 0 1.1-1 1.9-2.4 1.9a2.4 2.4 0 0 1-2.4-1.2" />
                </svg>
                <span className="header-avatar-menu-row-label">Financeiro</span>
              </button>
            ) : null}

            <button
              type="button"
              className="header-avatar-menu-row is-danger"
              onClick={() => {
                setOpen(false);
                void onLogout();
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
      </BottomSheet>
    </span>
  );
}
