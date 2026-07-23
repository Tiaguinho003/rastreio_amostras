'use client';

import { type FormEvent, useEffect, useState } from 'react';

import { BottomSheet } from '../BottomSheet';
import { maskCpfInput, maskPhoneInput } from '../../lib/client-field-formatters';
import { digitsOnly } from '../../lib/document-validation';
import { UserSelect } from '../users/UserSelect';
import type { Broker, BrokerInput, UserLookupItem } from '../../lib/types';

// Criar/editar corretor (página Cadastros, aba Corretores). `broker=null` =
// criar. Vínculo opcional com usuário (UserSelect, base da métrica D34).
// Rodada de ajustes finos: painel LATERAL (side-sheet stacked) em vez de modal
// central — seta ← da borda cancela; submit no footer sticky. Mesmo molde dos
// demais painéis de cliente (R5). Vale nos dois breakpoints e em todos os
// contextos (aba Corretores e o BrokerMultiSelectField do contrato, que o abre
// por cima do formulário de venda — daí o `stacked`).
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

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDismissAttempt={() => !saving}
      title={isEdit ? 'Editar corretor' : 'Novo corretor'}
      ariaLabel={isEdit ? 'Editar corretor' : 'Novo corretor'}
      stacked
      closeVariant="edge-back"
      dragDisabled={saving}
      className="client-panel-sheet side-sheet"
      footer={
        <button
          type="submit"
          form="broker-form"
          className="app-modal-submit"
          disabled={submitDisabled}
        >
          {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar corretor'}
        </button>
      }
    >
      <>
        {errorMessage ? <p className="client-unit-modal-error">{errorMessage}</p> : null}

        <form id="broker-form" className="client-unit-modal-form" onSubmit={handleSubmit}>
          <div className="client-unit-modal-body">
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
          </div>
        </form>
      </>
    </BottomSheet>
  );
}
