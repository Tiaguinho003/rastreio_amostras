'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isAdmin } from '../lib/roles';
import { getRoleLabel } from '../lib/roles';
import type { SessionData } from '../lib/types';

interface ProfileBottomSheetProps {
  session: SessionData;
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
}

const SWIPE_THRESHOLD = 60;

export function ProfileBottomSheet({ session, open, onClose, onLogout }: ProfileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startY: number; currentY: number; dragging: boolean }>({
    startY: 0,
    currentY: 0,
    dragging: false
  });
  const [dragOffset, setDragOffset] = useState(0);
  const [visible, setVisible] = useState(false);
  const [animatingIn, setAnimatingIn] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);

  const profileName =
    typeof session.user.fullName === 'string' && session.user.fullName.trim().length > 0
      ? session.user.fullName.trim()
      : session.user.username;

  const closeWithAnimation = useCallback(() => {
    setAnimatingIn(false);
    setAnimatingOut(true);
    setTimeout(() => {
      setAnimatingOut(false);
      setVisible(false);
      onClose();
    }, 500);
  }, [onClose]);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setAnimatingOut(false);
      setAnimatingIn(false);
      setDragOffset(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimatingIn(true);
        });
      });
    }
  }, [open]);

  useEffect(() => {
    if (!visible) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeWithAnimation();
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [visible, closeWithAnimation]);

  function handleTouchStart(event: React.TouchEvent) {
    dragState.current.startY = event.touches[0].clientY;
    dragState.current.currentY = event.touches[0].clientY;
    dragState.current.dragging = true;
  }

  function handleTouchMove(event: React.TouchEvent) {
    if (!dragState.current.dragging) return;

    dragState.current.currentY = event.touches[0].clientY;
    const delta = dragState.current.currentY - dragState.current.startY;
    setDragOffset(Math.max(0, delta));
  }

  function handleTouchEnd() {
    if (!dragState.current.dragging) return;

    dragState.current.dragging = false;
    const delta = dragState.current.currentY - dragState.current.startY;

    if (delta > SWIPE_THRESHOLD) {
      closeWithAnimation();
    } else {
      setDragOffset(0);
    }
  }

  if (!visible) return null;

  const isOpen = visible && animatingIn && !animatingOut;
  const sheetTransform = dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined;

  return (
    <div
      className={`profile-sheet-backdrop ${isOpen ? 'is-open' : ''}`}
      onClick={closeWithAnimation}
    >
      <div
        ref={sheetRef}
        className={`profile-sheet ${isOpen ? 'is-open' : ''}`}
        style={dragOffset > 0 ? { transform: sheetTransform, transition: 'none' } : undefined}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de perfil"
      >
        <div className="profile-sheet-handle" aria-hidden="true">
          <span className="profile-sheet-handle-bar" />
        </div>

        <div className="profile-sheet-user">
          <div className="profile-sheet-avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
              <path d="M4 20a8 8 0 0 1 16 0" />
            </svg>
          </div>
          <div className="profile-sheet-user-info">
            <p className="profile-sheet-user-name">{profileName}</p>
            <p className="profile-sheet-user-meta">
              {getRoleLabel(session.user.role)} · {session.user.username}
            </p>
          </div>
        </div>

        <div className="profile-sheet-divider" />

        <nav className="profile-sheet-menu">
          {isAdmin(session.user.role) ? (
            <Link href="/users" className="profile-sheet-menu-item" onClick={closeWithAnimation}>
              <span className="profile-sheet-menu-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <circle cx="9" cy="7.5" r="3" />
                  <path d="M3 19.5a6 6 0 0 1 12 0" />
                  <circle cx="17.5" cy="8.5" r="2.2" />
                  <path d="M15.5 19.5a4.5 4.5 0 0 1 5.5-4.4" />
                </svg>
              </span>
              <span>Usuarios</span>
            </Link>
          ) : null}

          <Link href="/settings" className="profile-sheet-menu-item" onClick={closeWithAnimation}>
            <span className="profile-sheet-menu-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M12 12a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z" />
                <path d="M4.8 18.1a8.2 8.2 0 0 1 14.4 0" />
              </svg>
            </span>
            <span>Meu perfil</span>
          </Link>

        </nav>

        <div className="profile-sheet-divider" />

        <button
          type="button"
          className="profile-sheet-logout"
          onClick={() => {
            closeWithAnimation();
            onLogout();
          }}
        >
          <span className="profile-sheet-menu-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          <span>Sair</span>
        </button>
      </div>
    </div>
  );
}
