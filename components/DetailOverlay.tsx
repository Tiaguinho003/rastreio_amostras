'use client';

import { type MutableRefObject, type ReactNode } from 'react';

import { BottomSheet } from './BottomSheet';

interface DetailOverlayProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Acoes fixas no rodape do overlay (sticky, molde do BottomSheet). */
  footer?: ReactNode;
  /** Com `current=true` (modal interno aberto), ESC/X do overlay nao fecham. */
  dismissGuardRef?: MutableRefObject<boolean>;
  ariaLabel?: string;
  /** Classe extra ao lado de `.detail-overlay` pra overrides escopados do
   *  conteudo (ex.: `.ctr-details-overlay` devolve o respiro/fundo que o
   *  detalhe do contrato esperava do sheet). */
  className?: string;
  /** Repassado ao BottomSheet: 'edge-back' troca o X pela seta ← na borda
   *  esquerda (drawers do redesign, ex. detalhe do cliente). */
  closeVariant?: 'x' | 'edge-back';
}

// Contentor canonico de DETALHE do redesign (RD5): overlay dirigido por URL
// sobre a pagina de lista. Mobile = sheet de tela cheia; desktop (>=901px) =
// painel lateral direito (peek) com a lista viva atras — ver o bloco CSS
// `.detail-overlay` no globals.css. A history NAO e do sheet (manageHistory
// false): quem abre/fecha e o query param da URL — back fecha porque consome
// a entry da propria URL (ex.: /cadastros?cliente=<id>).
export function DetailOverlay({
  open,
  onClose,
  title,
  children,
  footer,
  dismissGuardRef,
  ariaLabel,
  className,
  closeVariant,
}: DetailOverlayProps) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDismissAttempt={() => !dismissGuardRef?.current}
      title={title}
      footer={footer}
      ariaLabel={ariaLabel}
      className={className ? `detail-overlay ${className}` : 'detail-overlay'}
      manageHistory={false}
      dragToDismiss={false}
      closeVariant={closeVariant}
    >
      {children}
    </BottomSheet>
  );
}
