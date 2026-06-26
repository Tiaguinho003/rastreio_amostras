'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiError, createClientBankAccount, listClientBankAccounts } from '../../lib/api-client';
import { ClientBankAccountModal } from '../clients/ClientBankAccountModal';
import type {
  ClientBankAccountInput,
  ClientBankAccountSummary,
  SessionData,
} from '../../lib/types';

type ClientBankAccountSelectFieldProps = {
  session: SessionData;
  clientId: string | null;
  value: string | null;
  onChange: (accountId: string | null) => void;
  disabled?: boolean;
  defaultHolderName?: string | null;
  defaultHolderTaxId?: string | null;
};

// Fechamento (Fase B.3): seleciona uma conta bancaria do vendedor (obrigatorio
// na etapa 2) + "+adicionar conta" inline (ClientBankAccountModal). Difere do
// BankSelectField (que escolhe um Banco, nao uma conta de cliente).
export function ClientBankAccountSelectField({
  session,
  clientId,
  value,
  onChange,
  disabled = false,
  defaultHolderName = null,
  defaultHolderTaxId = null,
}: ClientBankAccountSelectFieldProps) {
  const [accounts, setAccounts] = useState<ClientBankAccountSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!clientId) {
      setAccounts([]);
      return;
    }
    setLoading(true);
    try {
      const res = await listClientBankAccounts(session, clientId);
      setAccounts(res.items.filter((account) => account.status === 'ACTIVE'));
    } catch {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [session, clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(data: ClientBankAccountInput) {
    if (!clientId) return;
    setSaving(true);
    setModalError(null);
    try {
      const res = await createClientBankAccount(session, clientId, data);
      setModalOpen(false);
      await refresh();
      onChange(res.account.id);
    } catch (cause) {
      setModalError(cause instanceof ApiError ? cause.message : 'Falha ao adicionar a conta.');
    } finally {
      setSaving(false);
    }
  }

  function describe(account: ClientBankAccountSummary): string {
    const bank = account.bank ? account.bank.name : 'Banco';
    return `${bank} · Ag ${account.agency} · CC ${account.accountNumber}`;
  }

  const emptyLabel = !clientId
    ? 'Selecione o vendedor primeiro'
    : loading
      ? 'Carregando...'
      : accounts.length
        ? 'Selecione uma conta'
        : 'Nenhuma conta cadastrada';

  return (
    <div className="ctr-bankacct">
      <select
        className="app-modal-input"
        value={value ?? ''}
        disabled={disabled || !clientId || loading}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">{emptyLabel}</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {describe(account)}
          </option>
        ))}
      </select>
      {!disabled && clientId ? (
        <button
          type="button"
          className="ctr-inline-add"
          onClick={() => {
            setModalError(null);
            setModalOpen(true);
          }}
        >
          + adicionar conta
        </button>
      ) : null}

      <ClientBankAccountModal
        open={modalOpen}
        session={session}
        saving={saving}
        errorMessage={modalError}
        defaultHolderName={defaultHolderName}
        defaultHolderTaxId={defaultHolderTaxId}
        onClose={() => {
          if (!saving) setModalOpen(false);
        }}
        onSubmit={handleCreate}
      />
    </div>
  );
}
