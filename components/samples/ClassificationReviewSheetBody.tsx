'use client';

import { useEffect, useState, type FormEvent } from 'react';

import {
  type ClassificationFormState,
  validateClassificationForm,
} from '../../lib/classification-form';
import { PhotoZoomViewer } from '../PhotoZoomViewer';

// Body reusavel do review de classificacao — mesmo conteudo do
// ClassificationReviewModal mas sem header/backdrop. Usado dentro do
// BottomSheet `camera-preview-sheet` quando flowState === 'confirming',
// pra que a transicao processing → review seja continua (sheet expande
// de volta em vez de abrir um modal central novo).
//
// Estado interno: zoom da foto + warning overlay (quando submit sem
// >=1 campo da classificacao preenchido). Form e form-id sao controlados
// externamente pra que o botao "Avancar" no footer do BottomSheet
// (fora do <form>) possa submitar via attr form="id".

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

type Props = {
  photoUrl: string | null;
  lotEditable: boolean;
  sacksEditable: boolean;
  harvestEditable: boolean;
  lotValue: string;
  sacksValue: string;
  harvestValue: string;
  onLotChange: (next: string) => void;
  onSacksChange: (next: string) => void;
  onHarvestChange: (next: string) => void;
  form: ClassificationFormState;
  onFormChange: (key: keyof ClassificationFormState, value: string) => void;
  errorMessage?: string | null;
  saving?: boolean;
  formId: string;
  onAdvance: () => void;
};

export function ClassificationReviewSheetBody({
  photoUrl,
  lotEditable,
  sacksEditable,
  harvestEditable,
  lotValue,
  sacksValue,
  harvestValue,
  onLotChange,
  onSacksChange,
  onHarvestChange,
  form,
  onFormChange,
  errorMessage,
  saving = false,
  formId,
  onAdvance,
}: Props) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  // Limpa o erro de validacao ao editar qualquer campo ("limpa ao digitar").
  useEffect(() => {
    setAdvanceError(null);
  }, [form]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const hasAtLeastOneField = CLASSIFICATION_FIELD_KEYS.some((key) => form[key].trim() !== '');
    if (!hasAtLeastOneField) {
      setWarningOpen(true);
      return;
    }
    // Recall-first: a extracao preserva valores brutos; aqui (com o campo
    // visivel) o operador e avisado se uma peneira / % de fundo nao for um
    // numero valido, em vez de so descobrir no save final.
    const numericError = validateClassificationForm(form);
    if (numericError) {
      setAdvanceError(numericError);
      return;
    }
    setAdvanceError(null);
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
      {photoUrl ? (
        <button
          type="button"
          className="review-photo"
          onClick={() => setZoomOpen(true)}
          aria-label="Ampliar foto da ficha"
        >
          {/* next/image nao se aplica: blob URL local com dimensoes dinamicas */}
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

      {advanceError || errorMessage ? (
        <p className="sdv-modal-error">{advanceError ?? errorMessage}</p>
      ) : null}

      <form id={formId} className="review-modal-form" onSubmit={handleSubmit}>
        <section className="review-section">
          <h4 className="review-section-title">Identificação</h4>
          <div className="review-grid review-grid-3">
            <label className="review-field">
              <span className="review-field-label">Lote</span>
              <input
                type="text"
                inputMode="numeric"
                className={`review-field-input${lotEditable ? '' : ' is-readonly'}`}
                value={lotValue}
                disabled={saving || !lotEditable}
                readOnly={!lotEditable}
                onChange={(event) =>
                  lotEditable ? onLotChange(event.target.value.toUpperCase()) : undefined
                }
                placeholder={lotEditable ? 'Número do lote' : ''}
              />
            </label>
            <label className="review-field">
              <span className="review-field-label">Sacas</span>
              <input
                type="text"
                inputMode="numeric"
                className={`review-field-input${sacksEditable ? '' : ' is-readonly'}`}
                value={sacksValue}
                disabled={saving || !sacksEditable}
                readOnly={!sacksEditable}
                onChange={(event) =>
                  sacksEditable ? onSacksChange(event.target.value) : undefined
                }
              />
            </label>
            <label className="review-field">
              <span className="review-field-label">Safra</span>
              <input
                type="text"
                className={`review-field-input${harvestEditable ? '' : ' is-readonly'}`}
                value={harvestValue}
                disabled={saving || !harvestEditable}
                readOnly={!harvestEditable}
                onChange={(event) =>
                  harvestEditable ? onHarvestChange(event.target.value) : undefined
                }
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
            {renderField('peneiraMk', 'MK', { inputMode: 'decimal' })}
            {renderField('peneiraP15', 'P15', { inputMode: 'decimal' })}
          </div>
          <div className="review-grid review-grid-5">
            {renderField('peneiraP14', 'P14', { inputMode: 'decimal' })}
            {renderField('peneiraP13', 'P13', { inputMode: 'decimal' })}
            {renderField('peneiraP12', 'P12', { inputMode: 'decimal' })}
            {renderField('peneiraP11', 'P11', { inputMode: 'decimal' })}
            {renderField('peneiraP10', 'P10', { inputMode: 'decimal' })}
          </div>
        </section>

        <section className="review-section">
          <h4 className="review-section-title">Fundos</h4>
          <div className="review-fundos-row">
            <label className="review-fundos-cell">
              <span className="review-field-label">Peneira</span>
              <input
                type="text"
                inputMode="numeric"
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
                inputMode="numeric"
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
