'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  ApiError,
  bulkAddCommercialUser,
  getUserClientsImpact,
  inactivateUser,
  lookupUsersForReference,
} from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { SessionData, UserLookupItem, UserSummary } from '../../lib/types';
import { CancelInactivationDialog } from './CancelInactivationDialog';
import { InactivateConfirmDialog } from './InactivateConfirmDialog';

type SoleClient = {
  id: string;
  code: number;
  displayName: string;
  status: string;
};

type CoCustodianClient = SoleClient & {
  otherUsers: { id: string; fullName: string }[];
};

type Impact = {
  userId: string;
  totalLinks: number;
  soleCustodianOf: SoleClient[];
  coCustodianOf: CoCustodianClient[];
};

type Props = {
  open: boolean;
  user: UserSummary;
  session: SessionData;
  onSuccess: (updated: UserSummary, reassignedCount: number) => void;
  onCancel: () => void;
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Admin',
  COMMERCIAL: 'Comercial',
  CLASSIFIER: 'Classificador',
  REGISTRATION: 'Registro',
};

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function InactivateUserModal({ open, user, session, onSuccess, onCancel }: Props) {
  const focusTrapRef = useFocusTrap(open);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [candidateUsers, setCandidateUsers] = useState<UserLookupItem[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [recipientUserId, setRecipientUserId] = useState<string | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(true);
  const [savingBatch, setSavingBatch] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchSuccess, setBatchSuccess] = useState<string | null>(null);
  const [showConfirmFinal, setShowConfirmFinal] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [savingFinal, setSavingFinal] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [reassignedCount, setReassignedCount] = useState(0);

  const loadImpact = useCallback(
    async (controller?: AbortController) => {
      setLoadingImpact(true);
      setFetchError(null);
      try {
        const result = await getUserClientsImpact(session, user.id);
        if (!controller || !controller.signal.aborted) {
          setImpact(result);
        }
      } catch (cause) {
        if (controller?.signal.aborted) return;
        setFetchError(
          cause instanceof ApiError ? cause.message : 'Falha ao carregar dados do usuário.'
        );
      } finally {
        if (!controller || !controller.signal.aborted) {
          setLoadingImpact(false);
        }
      }
    },
    [session, user.id]
  );

  // Carrega impact + candidatos ao abrir
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    loadImpact(controller);

    lookupUsersForReference(session, { limit: 200, excludeUserId: user.id })
      .then((response) => {
        if (controller.signal.aborted) return;
        setCandidateUsers(response.items);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setCandidateUsers([]);
      });

    return () => {
      controller.abort();
    };
  }, [open, session, user.id, loadImpact]);

  // Caso "0 sole-custodians" ao abrir → vai direto para confirmação
  useEffect(() => {
    if (!loadingImpact && impact && impact.soleCustodianOf.length === 0 && !showConfirmFinal) {
      setShowConfirmFinal(true);
    }
  }, [loadingImpact, impact, showConfirmFinal]);

  // Limpa toast após 3s
  useEffect(() => {
    if (!batchSuccess) return;
    const id = window.setTimeout(() => setBatchSuccess(null), 3000);
    return () => window.clearTimeout(id);
  }, [batchSuccess]);

  if (!open) return null;

  const soleList = impact?.soleCustodianOf ?? [];
  const allSelected = soleList.length > 0 && selectedClientIds.size === soleList.length;
  const someSelected = selectedClientIds.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) {
      setSelectedClientIds(new Set());
    } else {
      setSelectedClientIds(new Set(soleList.map((c) => c.id)));
    }
  }

  function toggleOne(id: string) {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleAssignBatch() {
    if (selectedClientIds.size === 0 || !recipientUserId) return;

    setSavingBatch(true);
    setBatchError(null);
    setBatchSuccess(null);
    const ids = Array.from(selectedClientIds);
    try {
      const result = await bulkAddCommercialUser(session, {
        clientIds: ids,
        userId: recipientUserId,
      });
      setReassignedCount((prev) => prev + result.added);
      setBatchSuccess(`${result.added} cliente(s) reatribuído(s).`);
      setSelectedClientIds(new Set());
      // re-fetch
      await loadImpact();
    } catch (cause) {
      setBatchError(
        cause instanceof ApiError ? cause.message : 'Falha ao reatribuir. Tente novamente.'
      );
    } finally {
      setSavingBatch(false);
    }
  }

  function tryOpenConfirmFinal() {
    if (soleList.length > 0) return;
    setConfirmError(null);
    setShowConfirmFinal(true);
  }

  async function handleConfirmInactivate(reasonText: string) {
    setSavingFinal(true);
    setConfirmError(null);
    try {
      const response = await inactivateUser(session, user.id, reasonText);
      onSuccess(response.user, reassignedCount);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        // Race: re-fetch e volta pro modal principal
        setShowConfirmFinal(false);
        await loadImpact();
        setBatchError(
          'Foram identificados novos clientes que precisam ser reatribuídos. Revise a lista.'
        );
      } else {
        setConfirmError(
          cause instanceof ApiError ? cause.message : 'Falha ao inativar. Tente novamente.'
        );
      }
    } finally {
      setSavingFinal(false);
    }
  }

  function handleCancelClicked() {
    setShowCancelDialog(true);
  }

  function handleCancelConfirmed() {
    setShowCancelDialog(false);
    onCancel();
  }

  // Bloqueio total — sem ESC, sem backdrop click, sem botão X
  const recipientCount = impact
    ? // users distintos vinculados a clients onde o user inativado também está
      new Set(impact.coCustodianOf.flatMap((c) => c.otherUsers.map((u) => u.id))).size
    : 0;
  const coCustodianCount = impact?.coCustodianOf.length ?? 0;
  const role = user.role ?? '';
  const roleLabel = ROLE_LABEL[role] ?? role;
  const roleClass = role ? `is-role-${role.toLowerCase()}` : '';

  return (
    <div className="app-modal-backdrop inactivate-user-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal inactivate-user-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inactivate-user-title"
      >
        <div className="inactivate-user-modal__header">
          <div className="inactivate-user-modal__header-warning">
            <span aria-hidden="true">⚠</span>
            <span>Inativação em andamento</span>
          </div>
          <div className="inactivate-user-modal__user-info">
            <span className="inactivate-user-modal__user-avatar" aria-hidden="true">
              {getInitials(user.fullName)}
            </span>
            <div className="inactivate-user-modal__user-text">
              <h3 id="inactivate-user-title" className="inactivate-user-modal__user-name">
                {user.fullName}
              </h3>
              <div className="inactivate-user-modal__user-meta">
                {role ? (
                  <span className={`inactivate-user-modal__role-badge ${roleClass}`}>
                    {roleLabel}
                  </span>
                ) : null}
                {impact ? (
                  <span className="inactivate-user-modal__user-stats">
                    {impact.totalLinks} cliente(s) vinculado(s)
                    {soleList.length > 0
                      ? `, ${soleList.length} sob responsabilidade exclusiva`
                      : ''}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="inactivate-user-modal__body">
          {fetchError ? (
            <div className="inactivate-user-modal__fatal-error">
              <p>{fetchError}</p>
              <button
                type="button"
                className="app-modal-secondary"
                onClick={() => loadImpact()}
                disabled={loadingImpact}
              >
                Tentar novamente
              </button>
            </div>
          ) : loadingImpact ? (
            <div className="inactivate-user-modal__loading">Carregando dados do usuário...</div>
          ) : soleList.length === 0 ? (
            <div className="inactivate-user-modal__empty">
              <p>Este usuário não possui clientes sob responsabilidade exclusiva.</p>
              <p>Você pode prosseguir com a inativação.</p>
            </div>
          ) : (
            <>
              <p className="inactivate-user-modal__instruction">
                Selecione os clientes abaixo e atribua-os a outro usuário responsável. É necessário
                reatribuir todos antes de inativar.
              </p>
              <div className="inactivate-user-modal__table">
                <div className="inactivate-user-modal__select-all">
                  <label className="inactivate-user-modal__checkbox-label">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      disabled={savingBatch}
                    />
                    <span>
                      Selecionar todos ({selectedClientIds.size} de {soleList.length})
                    </span>
                  </label>
                </div>
                <div className="inactivate-user-modal__rows">
                  {soleList.map((client) => {
                    const checked = selectedClientIds.has(client.id);
                    return (
                      <label
                        key={client.id}
                        className={`inactivate-user-modal__row ${checked ? 'is-selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(client.id)}
                          disabled={savingBatch}
                        />
                        <span className="inactivate-user-modal__row-code">#{client.code}</span>
                        <span className="inactivate-user-modal__row-name">
                          {client.displayName}
                        </span>
                        <span
                          className={`inactivate-user-modal__row-status is-${client.status.toLowerCase()}`}
                        >
                          {client.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {batchError ? (
                <div className="inactivate-user-modal__inline-toast is-error" role="alert">
                  {batchError}
                </div>
              ) : null}
              {batchSuccess ? (
                <div className="inactivate-user-modal__inline-toast is-success" role="status">
                  {batchSuccess}
                </div>
              ) : null}

              <div className="inactivate-user-modal__action-bar">
                <label className="inactivate-user-modal__recipient-label">
                  <span className="inactivate-user-modal__recipient-label-text">Atribuir a:</span>
                  <select
                    className="inactivate-user-modal__recipient-select"
                    value={recipientUserId ?? ''}
                    onChange={(e) => setRecipientUserId(e.target.value || null)}
                    disabled={savingBatch || candidateUsers.length === 0}
                  >
                    <option value="">Selecione um usuário…</option>
                    {candidateUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                        {u.role ? ` — ${ROLE_LABEL[u.role] ?? u.role}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="app-modal-submit inactivate-user-modal__assign-btn"
                  onClick={handleAssignBatch}
                  disabled={savingBatch || selectedClientIds.size === 0 || !recipientUserId}
                >
                  {savingBatch
                    ? 'Atribuindo...'
                    : `Atribuir ${selectedClientIds.size > 0 ? `${selectedClientIds.size} ` : ''}selecionado(s)`}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="inactivate-user-modal__footer">
          <button
            type="button"
            className="app-modal-secondary inactivate-user-modal__cancel-btn"
            onClick={handleCancelClicked}
            disabled={savingBatch}
          >
            Cancelar inativação
          </button>
          <button
            type="button"
            className="app-modal-submit inactivate-user-modal__confirm-btn"
            onClick={tryOpenConfirmFinal}
            disabled={savingBatch || loadingImpact || soleList.length > 0 || !!fetchError}
            title={
              soleList.length > 0
                ? 'Reatribua todos os clientes para habilitar'
                : 'Confirmar inativação'
            }
          >
            Confirmar inativação
          </button>
        </div>
      </section>

      <InactivateConfirmDialog
        open={showConfirmFinal}
        user={user}
        reassignedCount={reassignedCount}
        coCustodianCount={coCustodianCount}
        recipientCount={recipientCount}
        saving={savingFinal}
        errorMessage={confirmError}
        onConfirm={handleConfirmInactivate}
        onBack={() => {
          setShowConfirmFinal(false);
          setConfirmError(null);
        }}
      />

      <CancelInactivationDialog
        open={showCancelDialog}
        reassignedCount={reassignedCount}
        onConfirm={handleCancelConfirmed}
        onBack={() => setShowCancelDialog(false)}
      />
    </div>
  );
}
