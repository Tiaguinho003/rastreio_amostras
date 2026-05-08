'use client';

import { useEffect } from 'react';

import { useFocusTrap } from '../../lib/use-focus-trap';

// Q.cls.2 sub-caminho 2: lote extraido da ficha nao bate com o lote
// esperado do sample em context (Flow B). Sem opcao de "forcar" — o
// operador precisa corrigir (foto certa) ou desistir.
//
// Mostra os dois lotes em destaque visual + miniatura da foto capturada
// (ajuda confirmacao de qual ficha foi fotografada). Botoes:
// "Tirar outra foto" (primary) → volta pra camera; "Cancelar" → router.back.

type Props = {
  open: boolean;
  extractedLot: string | null;
  expectedLot: string | null;
  photoUrl: string | null;
  onCancel: () => void;
  onRetake: () => void;
};

export function ClassificationLotMismatchModal({
  open,
  extractedLot,
  expectedLot,
  photoUrl,
  onCancel,
  onRetake,
}: Props) {
  const focusTrapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed lot-mismatch-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lot-mismatch-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="lot-mismatch-title" className="app-modal-title">
              Lote não confere
            </h3>
            <p className="app-modal-description">
              O lote lido da foto não corresponde à amostra que você está classificando.
            </p>
          </div>
          <button type="button" className="app-modal-close" onClick={onCancel} aria-label="Fechar">
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="app-modal-content lot-mismatch-content">
          <div className="lot-mismatch-comparison">
            <div className="lot-mismatch-cell">
              <span className="lot-mismatch-cell-label">Lote da ficha</span>
              <span className="lot-mismatch-cell-value is-extracted">{extractedLot || '—'}</span>
            </div>
            <span className="lot-mismatch-divider" aria-hidden="true">
              ≠
            </span>
            <div className="lot-mismatch-cell">
              <span className="lot-mismatch-cell-label">Lote da amostra</span>
              <span className="lot-mismatch-cell-value is-expected">{expectedLot || '—'}</span>
            </div>
          </div>

          {photoUrl ? (
            <div className="lot-mismatch-photo-wrap">
              <span className="lot-mismatch-photo-label">Foto capturada</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt="Foto da ficha capturada" className="lot-mismatch-photo" />
            </div>
          ) : null}

          <p className="lot-mismatch-hint">
            Confira se você fotografou a ficha correta. Se sim, refaça a foto focando bem no campo
            do lote.
          </p>

          <div className="app-modal-actions">
            <button type="button" className="app-modal-submit" onClick={onRetake}>
              Tirar outra foto
            </button>
            <button type="button" className="app-modal-secondary" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
