'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { maskCpfInput, maskPhoneInput } from '../../lib/client-field-formatters';
import { digitsOnly } from '../../lib/document-validation';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { UserSelect } from '../users/UserSelect';
import type { Broker, BrokerInput, UserLookupItem } from '../../lib/types';

// Criar/editar corretor (página Cadastros, aba Corretores). `broker=null` =
// criar. Vínculo opcional com usuário (UserSelect, base da métrica D34).
type Props = {
  open: boolean;
  broker: Broker | null;
  /** Pre-preenche o nome ao criar (ex.: termo digitado no seletor de corretor). */
  initialName?: string;
  users: UserLookupItem[];
  loadingUsers: boolean;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (data: BrokerInput & { status?: 'ACTIVE' | 'INACTIVE' }) => Promise<void> | void;
};

export function BrokerFormModal({
  open,
  broker,
  initialName = '',
  users,
  loadingUsers,
  saving,
  errorMessage,
  onClose,
  onSubmit,
}: Props) {
  const focusTrapRef = useFocusTrap(open);
  const isEdit = Boolean(broker);
  const [name, setName] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(broker?.name ?? initialName.toUpperCase());
    setUserId(broker?.userId ?? null);
    setCpf(broker?.cpf ? maskCpfInput(broker.cpf) : '');
    setPhone(broker?.phone ?? '');
    setEmail(broker?.email ?? '');
    setStatus(broker?.status ?? 'ACTIVE');
    setSubmitted(false);
  }, [open, broker, initialName]);

  if (!open) return null;

  const cpfDigits = digitsOnly(cpf);
  const cpfValid = cpfDigits.length === 0 || cpfDigits.length === 11;
  const missingName = !name.trim();
  const submitDisabled = saving || missingName || !cpfValid;
  const showErr = submitted;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (submitDisabled) return;
    await onSubmit({
      name: name.trim(),
      userId: userId ?? null,
      cpf: cpfDigits ? cpfDigits : null,
      phone: phone.trim() ? phone.trim() : null,
      email: email.trim() ? email.trim() : null,
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
        aria-labelledby="broker-form-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="broker-form-title" className="app-modal-title">
              {isEdit ? 'Editar corretor' : 'Novo corretor'}
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
            <span className="app-modal-label">Nome (obrigatório)</span>
            <input
              className={`app-modal-input${showErr && missingName ? ' has-error' : ''}`}
              value={name}
              disabled={saving}
              maxLength={120}
              onChange={(event) => setName(event.target.value.toUpperCase())}
            />
          </label>

          <UserSelect
            label="Usuário vinculado (opcional)"
            users={users}
            value={userId}
            onChange={setUserId}
            disabled={saving}
            loading={loadingUsers}
            placeholder="Sem vínculo"
          />

          <div className="sdv-edit-row">
            <label className="app-modal-field">
              <span className="app-modal-label">CPF (opcional)</span>
              <input
                className={`app-modal-input${showErr && !cpfValid ? ' has-error' : ''}`}
                value={cpf}
                disabled={saving}
                inputMode="numeric"
                onChange={(event) => setCpf(maskCpfInput(event.target.value))}
              />
              {showErr && !cpfValid ? (
                <span className="sdv-edit-error" role="alert">
                  CPF deve ter 11 dígitos
                </span>
              ) : null}
            </label>
            <label className="app-modal-field">
              <span className="app-modal-label">Telefone (opcional)</span>
              <input
                className="app-modal-input"
                value={phone}
                disabled={saving}
                inputMode="numeric"
                onChange={(event) => setPhone(maskPhoneInput(event.target.value))}
              />
            </label>
          </div>

          <label className="app-modal-field">
            <span className="app-modal-label">E-mail (opcional)</span>
            <input
              className="app-modal-input"
              value={email}
              type="email"
              disabled={saving}
              maxLength={120}
              onChange={(event) => setEmail(event.target.value)}
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
              {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar corretor'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
