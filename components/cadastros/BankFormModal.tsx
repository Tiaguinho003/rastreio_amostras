'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useFocusTrap } from '../../lib/use-focus-trap';
import type { Bank } from '../../lib/types';

// Criar/editar banco (página Cadastros, aba Bancos). `bank=null` = criar.
type Props = {
  open: boolean;
  bank: Bank | null;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    compeCode: string;
    status?: 'ACTIVE' | 'INACTIVE';
  }) => Promise<void> | void;
};

export function BankFormModal({ open, bank, saving, errorMessage, onClose, onSubmit }: Props) {
  const focusTrapRef = useFocusTrap(open);
  const isEdit = Boolean(bank);
  const [name, setName] = useState('');
  const [compeCode, setCompeCode] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(bank?.name ?? '');
    setCompeCode(bank?.compeCode ?? '');
    setStatus(bank?.status ?? 'ACTIVE');
    setSubmitted(false);
  }, [open, bank]);

  if (!open) return null;

  const missingName = !name.trim();
  const missingCompe = compeCode.replace(/\D/g, '').length === 0;
  const submitDisabled = saving || missingName || missingCompe;
  const showErr = submitted;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (submitDisabled) return;
    await onSubmit({
      name: name.trim(),
      compeCode: compeCode.replace(/\D/g, ''),
      ...(isEdit ? { status } : {}),
    });
  }

  return createPortal(
    <div className="app-modal-backdrop" onClick={onClose}>
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-form-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="bank-form-title" className="app-modal-title">
              {isEdit ? 'Editar banco' : 'Novo banco'}
            </h3>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        {errorMessage ? <p className="client-unit-modal-error">{errorMessage}</p> : null}

        <form className="app-modal-content" onSubmit={handleSubmit}>
          <label className="app-modal-field">
            <span className="app-modal-label">Nome do banco (obrigatório)</span>
            <input
              className={`app-modal-input${showErr && missingName ? ' has-error' : ''}`}
              value={name}
              disabled={saving}
              maxLength={120}
              onChange={(event) => setName(event.target.value.toUpperCase())}
            />
          </label>

          <label className="app-modal-field">
            <span className="app-modal-label">Código COMPE (obrigatório)</span>
            <input
              className={`app-modal-input${showErr && missingCompe ? ' has-error' : ''}`}
              value={compeCode}
              disabled={saving}
              inputMode="numeric"
              maxLength={3}
              placeholder="ex.: 341"
              onChange={(event) => setCompeCode(event.target.value.replace(/\D/g, ''))}
            />
          </label>

          {isEdit ? (
            <label className="app-modal-field">
              <span className="app-modal-label">Status</span>
              <select
                className="app-modal-input"
                value={status}
                disabled={saving}
                onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'INACTIVE')}
              >
                <option value="ACTIVE">Ativo</option>
                <option value="INACTIVE">Inativo</option>
              </select>
            </label>
          ) : null}

          <div className="app-modal-actions">
            <button
              type="button"
              className="app-modal-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button type="submit" className="app-modal-submit" disabled={submitDisabled}>
              {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar banco'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
