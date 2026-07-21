'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiError, createClientBankAccount, listClientBankAccounts } from '../../lib/api-client';
import { ClientBankAccountModal } from '../clients/ClientBankAccountModal';
import { InlineSelectField } from './InlineSelectField';
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
    const bank = account.bankName || 'Banco';
    return `${bank} · Ag ${account.agency} · CC ${account.accountNumber}`;
  }

  return (
    <>
      <InlineSelectField
        options={accounts.map((account) => ({ id: account.id, label: describe(account) }))}
        value={value ?? ''}
        onChange={(id) => onChange(id || null)}
        disabled={disabled || !clientId}
        loading={loading}
        placeholder={clientId ? 'Selecione uma conta' : 'Selecione o vendedor primeiro'}
        emptyMessage="Nenhuma conta cadastrada."
        onRequestCreate={
          clientId && !disabled
            ? () => {
                setModalError(null);
                setModalOpen(true);
              }
            : undefined
        }
        createLabel="Adicionar conta"
      />

      {/* Rodada 5 FV: o modal virou painel lateral sempre-stacked — o prop
          `stacked` repassado morreu junto com o modal central. */}
      <ClientBankAccountModal
        open={modalOpen}
        saving={saving}
        errorMessage={modalError}
        defaultHolderName={defaultHolderName}
        defaultHolderTaxId={defaultHolderTaxId}
        onClose={() => {
          if (!saving) setModalOpen(false);
        }}
        onSubmit={handleCreate}
      />
    </>
  );
}
