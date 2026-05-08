'use client';

import { useState, type FormEvent } from 'react';

import { type ClassificationFormState } from '../../lib/classification-form';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { PhotoZoomViewer } from '../PhotoZoomViewer';

// Q.cls.2.3: Modal de revisao dos dados extraidos pela IA. Espelha a ficha
// fisica da classificacao unificada (22 campos): identificacao read-only no
// fluxo normal + identificacao visual + peneiras + fundos + catacao/defeitos
// + observacoes + bebida. Foto em cima nao-sticky, click abre zoom em
// overlay (qualquer ponto da imagem). Validacao "pelo menos 1 campo da
// classificacao preenchido alem do lote" via overlay de aviso interno.

const CLASSIFICATION_FIELD_KEYS: Array<keyof ClassificationFormState> = [
  'padrao',
  'aspecto',
  'certif',
  'peneiraP18',
  'peneiraP17',
  'peneiraP16',
  'peneiraP15',
  'peneiraP14',
  'peneiraP13',
  'peneiraP12',
  'peneiraP11',
  'peneiraP10',
  'peneiraMk',
  'fundo1Peneira',
  'fundo1Percent',
  'fundo2Peneira',
  'fundo2Percent',
  'catacao',
  'imp',
  'pva',
  'broca',
  'gpi',
  'ap',
  'defeito',
  'observacoes',
  'bebida',
];

type ClassificationReviewModalProps = {
  open: boolean;
  photoUrl: string | null;
  // Cabecalho lote/sacas/safra: vem da extracao da IA. Sempre mostrado.
  identification: {
    lote: string | null;
    sacas: string | null;
    safra: string | null;
  };
  // Flow A (sem sampleId no URL): operador edita lote pra resolver amostra.
  // Flow B (com sampleId): lote read-only, vem do sample em context.
  lotEditable: boolean;
  lotValue: string;
  onLotChange: (next: string) => void;
  // Form com os 22 campos da ficha unificada. Mantido externo (no parent)
  // pra preservar valores entre reaberturas (lot-mismatch, data-mismatch,
  // erro de save → modal reabre com tudo preenchido).
  form: ClassificationFormState;
  onFormChange: (key: keyof ClassificationFormState, value: string) => void;
  // Erro do save vindo do backend (mostrado no topo do form).
  errorMessage?: string | null;
  saving?: boolean;
  onCancel: () => void;
  onAdvance: () => void;
};

export function ClassificationReviewModal({
  open,
  photoUrl,
  identification,
  lotEditable,
  lotValue,
  onLotChange,
  form,
  onFormChange,
  errorMessage,
  saving = false,
  onCancel,
  onAdvance,
}: ClassificationReviewModalProps) {
  const focusTrapRef = useFocusTrap(open);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);

  if (!open) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const hasAtLeastOneField = CLASSIFICATION_FIELD_KEYS.some((key) => form[key].trim() !== '');
    if (!hasAtLeastOneField) {
      setWarningOpen(true);
      return;
    }
    onAdvance();
  }

  function renderField(
    key: keyof ClassificationFormState,
    label: string,
    options: { inputMode?: 'text' | 'decimal'; uppercase?: boolean; maxLength?: number } = {}
  ) {
    const { inputMode = 'text', uppercase = true, maxLength } = options;
    return (
      <label className="review-field">
        <span className="review-field-label">{label}</span>
        <input
          type="text"
          inputMode={inputMode}
          className="review-field-input"
          value={form[key]}
          disabled={saving}
          maxLength={maxLength}
          onChange={(event) => {
            const raw = event.target.value;
            onFormChange(key, uppercase && inputMode === 'text' ? raw.toUpperCase() : raw);
          }}
        />
      </label>
    );
  }

  return (
    <>
      <div className="app-modal-backdrop">
        <section
          ref={focusTrapRef}
          className="app-modal is-themed is-wide review-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-modal-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="app-modal-header">
            <div className="app-modal-title-wrap">
              <h3 id="review-modal-title" className="app-modal-title">
                Revisar dados da classificação
              </h3>
              <p className="app-modal-description">
                Confira os campos extraídos da ficha. Edite se algo estiver errado.
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

          <form className="app-modal-content review-modal-form" onSubmit={handleSubmit}>
            {photoUrl ? (
              <button
                type="button"
                className="review-photo"
                onClick={() => setZoomOpen(true)}
                aria-label="Ampliar foto da ficha"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl} alt="Ficha de classificação capturada" />
                <span className="review-photo-zoom" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M16 16l4 4M11 8v6M8 11h6" />
                  </svg>
                  Ampliar
                </span>
              </button>
            ) : null}

            {errorMessage ? <p className="sdv-modal-error">{errorMessage}</p> : null}

            <section className="review-section">
              <h4 className="review-section-title">Identificação</h4>
              <div className="review-grid review-grid-3">
                <label className="review-field">
                  <span className="review-field-label">Lote</span>
                  {lotEditable ? (
                    <input
                      type="text"
                      className="review-field-input"
                      value={lotValue}
                      disabled={saving}
                      onChange={(event) => onLotChange(event.target.value.toUpperCase())}
                      placeholder="Número do lote"
                    />
                  ) : (
                    <input
                      type="text"
                      className="review-field-input is-readonly"
                      value={lotValue || identification.lote || ''}
                      readOnly
                      disabled
                    />
                  )}
                </label>
                <label className="review-field">
                  <span className="review-field-label">Sacas</span>
                  <input
                    type="text"
                    className="review-field-input is-readonly"
                    value={identification.sacas ?? ''}
                    readOnly
                    disabled
                  />
                </label>
                <label className="review-field">
                  <span className="review-field-label">Safra</span>
                  <input
                    type="text"
                    className="review-field-input is-readonly"
                    value={identification.safra ?? ''}
                    readOnly
                    disabled
                  />
                </label>
              </div>
            </section>

            <section className="review-section">
              <h4 className="review-section-title">Identificação visual</h4>
              <div className="review-grid review-grid-3">
                {renderField('padrao', 'Padrão')}
                {renderField('aspecto', 'Aspecto')}
                {renderField('certif', 'Certif.')}
              </div>
            </section>

            <section className="review-section">
              <h4 className="review-section-title">Peneiras (%)</h4>
              <div className="review-grid review-grid-5">
                {renderField('peneiraP18', 'P18', { inputMode: 'decimal' })}
                {renderField('peneiraP17', 'P17', { inputMode: 'decimal' })}
                {renderField('peneiraP16', 'P16', { inputMode: 'decimal' })}
                {renderField('peneiraP15', 'P15', { inputMode: 'decimal' })}
                {renderField('peneiraP14', 'P14', { inputMode: 'decimal' })}
              </div>
              <div className="review-grid review-grid-5">
                {renderField('peneiraP13', 'P13', { inputMode: 'decimal' })}
                {renderField('peneiraP12', 'P12', { inputMode: 'decimal' })}
                {renderField('peneiraP11', 'P11', { inputMode: 'decimal' })}
                {renderField('peneiraP10', 'P10', { inputMode: 'decimal' })}
                {renderField('peneiraMk', 'MK', { inputMode: 'decimal' })}
              </div>
            </section>

            <section className="review-section">
              <h4 className="review-section-title">Fundos</h4>
              <div className="review-fundos-row">
                <label className="review-fundos-cell">
                  <span className="review-field-label">Peneira</span>
                  <input
                    type="text"
                    className="review-field-input"
                    value={form.fundo1Peneira}
                    disabled={saving}
                    onChange={(e) => onFormChange('fundo1Peneira', e.target.value.toUpperCase())}
                  />
                </label>
                <span className="review-fundos-eq" aria-hidden="true">
                  =
                </span>
                <label className="review-fundos-cell">
                  <span className="review-field-label">%</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="review-field-input"
                    value={form.fundo1Percent}
                    disabled={saving}
                    onChange={(e) => onFormChange('fundo1Percent', e.target.value)}
                  />
                </label>
              </div>
              <div className="review-fundos-row">
                <label className="review-fundos-cell">
                  <span className="review-field-label">Peneira</span>
                  <input
                    type="text"
                    className="review-field-input"
                    value={form.fundo2Peneira}
                    disabled={saving}
                    onChange={(e) => onFormChange('fundo2Peneira', e.target.value.toUpperCase())}
                  />
                </label>
                <span className="review-fundos-eq" aria-hidden="true">
                  =
                </span>
                <label className="review-fundos-cell">
                  <span className="review-field-label">%</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="review-field-input"
                    value={form.fundo2Percent}
                    disabled={saving}
                    onChange={(e) => onFormChange('fundo2Percent', e.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="review-section">
              <h4 className="review-section-title">Catação e defeitos</h4>
              <div className="review-grid review-grid-3">
                {renderField('catacao', 'Cat.', { inputMode: 'decimal', uppercase: false })}
                {renderField('imp', 'Imp.', { inputMode: 'decimal', uppercase: false })}
                {renderField('pva', 'PVA', { inputMode: 'decimal', uppercase: false })}
              </div>
              <div className="review-grid review-grid-3">
                {renderField('broca', 'Broca', { inputMode: 'decimal', uppercase: false })}
                {renderField('gpi', 'GPI', { inputMode: 'decimal', uppercase: false })}
                {renderField('ap', 'AP', { inputMode: 'decimal', uppercase: false })}
              </div>
              <div className="review-grid review-grid-1">{renderField('defeito', 'Def.')}</div>
            </section>

            <section className="review-section">
              <h4 className="review-section-title">Observações</h4>
              {renderField('observacoes', 'Obs.', { maxLength: 500 })}
            </section>

            <section className="review-section">
              <h4 className="review-section-title">Bebida</h4>
              {renderField('bebida', 'Beb.')}
            </section>

            <div className="app-modal-actions">
              <button type="submit" className="app-modal-submit" disabled={saving}>
                {saving ? 'Avançando...' : 'Avançar'}
              </button>
              <button
                type="button"
                className="app-modal-secondary"
                onClick={onCancel}
                disabled={saving}
              >
                Cancelar
              </button>
            </div>
          </form>

          {warningOpen ? (
            <div
              className="review-warning-overlay"
              role="alertdialog"
              aria-labelledby="review-warning-title"
            >
              <div className="review-warning-card">
                <svg
                  className="review-warning-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="13" />
                  <line x1="12" y1="16.5" x2="12" y2="16.5" />
                </svg>
                <h4 id="review-warning-title" className="review-warning-title">
                  Preencha pelo menos um campo
                </h4>
                <p className="review-warning-text">
                  Salvar uma classificação só com o lote não faz sentido. Edite ao menos um campo da
                  ficha (peneiras, defeitos, bebida ou outros) antes de avançar.
                </p>
                <button
                  type="button"
                  className="app-modal-submit"
                  onClick={() => setWarningOpen(false)}
                  autoFocus
                >
                  OK
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {zoomOpen && photoUrl ? (
        <PhotoZoomViewer
          src={photoUrl}
          alt="Ficha de classificação capturada"
          onClose={() => setZoomOpen(false)}
        />
      ) : null}
    </>
  );
}
