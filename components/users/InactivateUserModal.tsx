'use client';

import { useState } from 'react';

import { ApiError, inactivateUser } from '../../lib/api-client';
import type { SessionData, UserSummary } from '../../lib/types';
import { InactivateConfirmDialog } from './InactivateConfirmDialog';

type Props = {
  open: boolean;
  user: UserSummary;
  session: SessionData;
  onSuccess: (updated: UserSummary) => void;
  onCancel: () => void;
};

// Responsavel do cliente virou OPCIONAL: inativar um usuario apenas o desvincula
// dos clientes (que podem ficar sem responsavel). Sem reatribuicao forcada nem
// e-mails de handover — a inativacao e um confirmar simples (motivo + confirmar).
export function InactivateUserModal({ open, user, session, onSuccess, onCancel }: Props) {
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleConfirm(reasonText: string) {
    setSaving(true);
    setErrorMessage(null);
    try {
      const response = await inactivateUser(session, user.id, reasonText);
      onSuccess(response.user);
    } catch (cause) {
      setErrorMessage(
        cause instanceof ApiError ? cause.message : 'Falha ao inativar. Tente novamente.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <InactivateConfirmDialog
      open={open}
      user={user}
      saving={saving}
      errorMessage={errorMessage}
      onConfirm={handleConfirm}
      onBack={onCancel}
    />
  );
}
