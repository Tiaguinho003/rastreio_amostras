'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiError, confirmShipment, getShipmentContext } from '../../lib/api-client';
import { isWeekendIso, WEEKEND_DATE_MESSAGE } from '../../lib/business-days';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { SessionData, ShipmentContext } from '../../lib/types';

// Embarque (EMB27): modal de confirmação — resumo (não-sensível) + seletor de data
// (máx hoje; confirma-se depois do fato) + upload OPCIONAL 0..10 fotos + aviso de
// irreversibilidade. Terminal, sem undo (EMB19). Alcançado por 2 portas: a worklist
// e o portão do pagamento (EMB28); busca o próprio contexto por contractId.

const MAX_PHOTOS = 10;

function todayInputValue(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

type Props = {
  session: SessionData;
  contractId: string;
  onClose: () => void;
  onDone: (context: ShipmentContext) => void;
};

export function ShipmentConfirmationModal({ session, contractId, onClose, onDone }: Props) {
  const focusTrapRef = useFocusTrap(true);
  const [context, setContext] = useState<ShipmentContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const today = todayInputValue();
  const [date, setDate] = useState(today);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    getShipmentContext(session, contractId)
      .then((res) => {
        if (active) setContext(res.context);
      })
      .catch((cause) => {
        if (active) setLoadError(cause instanceof ApiError ? cause.message : 'Falha ao carregar.');
      });
    return () => {
      active = false;
    };
  }, [session, contractId]);

  const dateInFuture = date !== '' && date > today;
  // DSB-D7: a data do embarque (data de ação) não pode cair em fim de semana.
  const dateIsWeekend = date !== '' && isWeekendIso(date);
  const canSubmit = !saving && date !== '' && !dateInFuture && !dateIsWeekend && context !== null;

  function onFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (picked.length === 0) return;
    setFiles((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
    setError(null);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const res = await confirmShipment(session, contractId, { shippedAt: date, files });
      onDone(res.context);
    } catch (cause) {
      const code =
        cause instanceof ApiError && cause.details && typeof cause.details === 'object'
          ? (cause.details as { code?: unknown }).code
          : null;
      if (code === 'WEEKEND_DATE') {
        setError(WEEKEND_DATE_MESSAGE);
      } else if (cause instanceof ApiError && cause.status === 409) {
        setError(
          'Este embarque já foi confirmado ou o contrato mudou. Recarregue a página e tente de novo.'
        );
      } else {
        setError(cause instanceof ApiError ? cause.message : 'Falha ao confirmar o embarque.');
      }
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action sample-detail-compact-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="emb-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="emb-confirm-title" className="app-modal-title">
              Confirmar embarque
            </h3>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        {error ? <p className="sdv-modal-error">{error}</p> : null}
        {loadError ? <p className="sdv-modal-error">{loadError}</p> : null}

        <div className="app-modal-content">
          {context ? (
            <div className="emb-confirm-summary">
              <div className="emb-confirm-row">
                <span>Contrato</span>
                <strong>{context.contractNumber}</strong>
              </div>
              <div className="emb-confirm-row">
                <span>Comprador</span>
                <strong>{context.buyerName ?? '—'}</strong>
              </div>
              <div className="emb-confirm-row">
                <span>Armazém do vendedor</span>
                <strong>{context.sellerWarehouse ?? '—'}</strong>
              </div>
              <div className="emb-confirm-row">
                <span>Sacas</span>
                <strong>{context.quantitySacks}</strong>
              </div>
              <div className="emb-confirm-row">
                <span>Previsto</span>
                <strong>{context.invoiceDate ? dateBR(context.invoiceDate) : 'À definir'}</strong>
              </div>
            </div>
          ) : loadError ? null : (
            <p className="ctr-confirm-text">Carregando...</p>
          )}

          <label className="app-modal-field">
            <span className="app-modal-label">Data do embarque</span>
            <input
              className="app-modal-input"
              type="date"
              value={date}
              max={today}
              disabled={saving}
              onChange={(event) => {
                setDate(event.target.value);
                setError(null);
              }}
            />
            {dateInFuture ? (
              <span className="app-modal-field-error">A data do embarque não pode ser futura.</span>
            ) : dateIsWeekend ? (
              <span className="app-modal-field-error">{WEEKEND_DATE_MESSAGE}</span>
            ) : null}
          </label>

          <div className="app-modal-field">
            <span className="app-modal-label">Fotos (opcional, até {MAX_PHOTOS})</span>
            <button
              type="button"
              className="fin-btn emb-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving || files.length >= MAX_PHOTOS}
            >
              Adicionar fotos
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              style={{ display: 'none' }}
              onChange={onFilesSelected}
            />
            {files.length > 0 ? (
              <ul className="emb-file-list">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="emb-file-item">
                    <span className="emb-file-name">{file.name}</span>
                    <button
                      type="button"
                      className="emb-file-remove"
                      onClick={() => removeFile(index)}
                      disabled={saving}
                      aria-label={`Remover ${file.name}`}
                    >
                      <span aria-hidden="true">&times;</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <p className="emb-confirm-warning">
            A confirmação do embarque é definitiva — não é possível desfazer nem trocar as fotos
            depois.
          </p>
        </div>

        <div className="app-modal-actions">
          <button type="button" className="app-modal-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="app-modal-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {saving ? 'Confirmando...' : 'Confirmar embarque'}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
