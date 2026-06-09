'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { getRoleLabel, isAdmin } from '../lib/roles';
import type { SessionData } from '../lib/types';
import { BottomSheet } from './BottomSheet';
import { UserAvatar } from './UserAvatar';

// Botao de avatar do header mobile (substitui o antigo sino). Abre um bottom
// sheet curto de "menu da conta". Launcher: cada item fecha o sheet e navega
// pra rota completa (com o navbar visivel) — nao renderiza paginas dentro do
// sheet. Mobile-only: o botao fica escondido em >900px via `.header-avatar-
// trigger` (globals.css); no desktop o acesso ao perfil continua pelo dropdown
// do topbar do AppShell. Espelha as opcoes daquele dropdown.
interface HeaderAvatarMenuProps {
  session: SessionData;
  onLogout: () => void | Promise<void>;
}

export function HeaderAvatarMenu({ session, onLogout }: HeaderAvatarMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const displayName = session.user.fullName?.trim() || session.user.username;

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
    <>
      <button
        type="button"
        className="header-avatar-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Abrir menu da conta"
        onClick={() => setOpen(true)}
      >
        <UserAvatar size="md" user={session.user} />
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Conta"
        ariaLabel="Menu da conta"
        className="is-menu"
        dragToDismiss
      >
        <div className="header-avatar-menu">
          <div className="header-avatar-menu-summary">
            <span className="header-avatar-menu-summary-name">{displayName}</span>
            <span className="header-avatar-menu-summary-role">
              {getRoleLabel(session.user.role)}
            </span>
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

            <button
              type="button"
              className="header-avatar-menu-row is-disabled"
              disabled
              aria-disabled="true"
            >
              <svg className="header-avatar-menu-row-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
              </svg>
              <span className="header-avatar-menu-row-label">Métricas</span>
              <span className="header-avatar-menu-row-tag">Em breve</span>
            </button>

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
    </>
  );
}
