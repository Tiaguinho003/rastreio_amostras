'use client';

import { useEffect } from 'react';

import { useFocusTrap } from '../../lib/use-focus-trap';

// Q.cls.2 sub-caminho 5: reclassificacao de amostra ja CLASSIFIED.
// Permite mudar tudo (campos, tipo, classificadores). Reason code
// obrigatorio (DATA_FIX/TYPO/MISSING_INFO/OTHER); reason text obrigatorio
// SO se code=OTHER (campo vermelho com mensagem "Justificativa
// obrigatoria" se vazio).
//
// Reason code/text ficam no state local do parent ate Q.cls.2.7 incluir
// no payload de updateClassification. UI ja garante a UX decidida.
//
// Acoes: "Voltar" (esquerda, onBack) volta pro modal de revisao (dados
// extraidos) pra facilitar a conferencia do lote; "Confirmar
// reclassificacao" (direita, laranja/is-warning, onConfirm) salva. O "x"
// do header (onCancel) cancela o processo todo e volta pra camera.
// Escape = onCancel (mesmo do x).

export type ReclassifyReasonCode = 'DATA_FIX' | 'TYPO' | 'MISSING_INFO' | 'OTHER';

const REASON_OPTIONS: Array<{ value: ReclassifyReasonCode; label: string }> = [
  { value: 'DATA_FIX', label: 'Correção de dados' },
  { value: 'TYPO', label: 'Erro de digitação' },
  { value: 'MISSING_INFO', label: 'Informação faltando' },
  { value: 'OTHER', label: 'Outro' },
];

type Props = {
  open: boolean;
  sampleLot: string | null;
  reasonCode: ReclassifyReasonCode | null;
  reasonText: string;
  // True quando o operador clicou Confirmar com algum campo invalido —
  // a partir dai os erros sao mostrados em vermelho.
  showErrors: boolean;
  onReasonCodeChange: (code: ReclassifyReasonCode) => void;
  onReasonTextChange: (text: string) => void;
  // Voltar pro modal de revisao (dados extraidos), pra facilitar a
  // conferencia do lote antes de reclassificar.
  onBack: () => void;
  // Cancela o processo de classificacao (x do header) → volta pra camera.
  onCancel: () => void;
  onConfirm: () => void;
  saving?: boolean;
};

export function ClassificationReclassifyModal({
  open,
  sampleLot,
  reasonCode,
  reasonText,
  showErrors,
  onReasonCodeChange,
  onReasonTextChange,
  onBack,
  onCancel,
  onConfirm,
  saving = false,
}: Props) {
  const focusTrapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!saving) onCancel();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel, saving]);

  if (!open) return null;

  const reasonCodeMissing = showErrors && reasonCode === null;
  const reasonTextMissing = showErrors && reasonCode === 'OTHER' && reasonText.trim().length === 0;

  return (
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed reclassify-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reclassify-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="reclassify-title" className="app-modal-title">
              Reclassificar amostra
            </h3>
            <p className="app-modal-description">
              {sampleLot
                ? `A amostra ${sampleLot} já foi classificada. Reclassificar substituirá os dados anteriores.`
                : 'Esta amostra já foi classificada. Reclassificar substituirá os dados anteriores.'}
            </p>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onCancel}
            disabled={saving}
            aria-label="Fechar"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="app-modal-content reclassify-content">
          <div className={`reclassify-field${reasonCodeMissing ? ' is-error' : ''}`}>
            <span className="reclassify-field-label">
              Motivo da reclassificação{' '}
              <span className="reclassify-field-required">(obrigatório)</span>
            </span>
            <div className="reclassify-reason-grid" role="radiogroup">
              {REASON_OPTIONS.map((opt) => {
                const checked = reasonCode === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`reclassify-reason-option${checked ? ' is-selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="reclassify-reason"
                      checked={checked}
                      disabled={saving}
                      onChange={() => onReasonCodeChange(opt.value)}
                    />
                    <span className="reclassify-reason-label">{opt.label}</span>
                  </label>
                );
              })}
            </div>
            {reasonCodeMissing ? (
              <span className="reclassify-error-text">Selecione um motivo para continuar.</span>
            ) : null}
          </div>

          {reasonCode === 'OTHER' ? (
            <label className={`reclassify-field${reasonTextMissing ? ' is-error' : ''}`}>
              <span className="reclassify-field-label">
                Justificativa <span className="reclassify-field-required">(obrigatório)</span>
              </span>
              <textarea
                className={`reclassify-text-input${reasonTextMissing ? ' has-error' : ''}`}
                value={reasonText}
                disabled={saving}
                rows={3}
                maxLength={500}
                onChange={(e) => onReasonTextChange(e.target.value)}
                placeholder={
                  reasonTextMissing
                    ? 'Justificativa obrigatória'
                    : 'Descreva o motivo da reclassificação'
                }
              />
              {reasonTextMissing ? (
                <span className="reclassify-error-text">Descreva o motivo.</span>
              ) : null}
            </label>
          ) : null}

          <div className="app-modal-actions reclassify-actions">
            <button
              type="button"
              className="app-modal-secondary"
              onClick={onBack}
              disabled={saving}
            >
              Voltar
            </button>
            <button
              type="button"
              className="app-modal-submit is-warning"
              onClick={onConfirm}
              disabled={saving}
            >
              {saving ? 'Salvando...' : 'Confirmar reclassificação'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
