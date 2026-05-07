'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { ApiError, createClientUnit } from '../../lib/api-client';
import { isUnitComplete } from '../../lib/clients/client-completeness';
import type {
  ClientSummary,
  ClientUnitInput,
  ClientUnitSummary,
  SessionData,
} from '../../lib/types';
import { ClientUnitModal } from '../clients/ClientUnitModal';
import { IncompleteIcon } from '../clients/IncompleteIcon';

// Fase R: campo de "Filial / Fazenda" exibido logo abaixo do propri-
// etário no /samples/new. Comporta-se em 4 estados visuais conforme o
// cliente selecionado:
//   - sem cliente            -> disabled, placeholder convidando seleção
//   - PJ                     -> disabled, "Não aplicável (PJ)"
//   - PF + 1 fazenda ativa   -> auto-selecionada (usuário pode trocar)
//   - PF + 2+ fazendas ATIVAS -> dropdown obrigatório, vazio até escolher
// Atalho "+ Nova fazenda" no rodapé do dropdown abre o ClientUnitModal
// e faz POST direto via createClientUnit, refrescando a lista via
// onUnitCreated.
type Props = {
  session: SessionData;
  client: ClientSummary | null;
  units: ClientUnitSummary[]; // espera apenas ACTIVE
  loading: boolean;
  selectedUnitId: string | null;
  onSelect: (unitId: string | null) => void;
  onUnitCreated: (unit: ClientUnitSummary) => void;
  required?: boolean;
  invalid?: boolean;
  invalidText?: string;
  onClearError?: () => void;
};

const DISABLED_PLACEHOLDER_NO_CLIENT = 'Selecione o proprietário primeiro';
const DISABLED_PLACEHOLDER_PJ = 'Não aplicável (PJ)';
const PF_CHOOSE_PLACEHOLDER = 'Selecione a fazenda';
const NEW_FARM_LABEL = 'Nova filial';

export function OwnerUnitField({
  session,
  client,
  units,
  loading,
  selectedUnitId,
  onSelect,
  onUnitCreated,
  required = false,
  invalid = false,
  invalidText = 'Obrigatório',
  onClearError,
}: Props) {
  const inputId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const isPf = client?.personType === 'PF';
  const isPj = client?.personType === 'PJ';
  const isDisabled = !client || isPj || loading;

  // Auto-selecionar quando PF tem exatamente 1 fazenda ativa.
  useEffect(() => {
    if (!isPf) return;
    if (selectedUnitId) return;
    if (units.length === 1) {
      onSelect(units[0].id);
    }
  }, [isPf, selectedUnitId, units, onSelect]);

  // Fecha dropdown ao clicar fora.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === selectedUnitId) ?? null,
    [units, selectedUnitId]
  );

  function handleToggle() {
    if (isDisabled) return;
    setOpen((current) => !current);
  }

  function handlePick(unitId: string) {
    onSelect(unitId);
    setOpen(false);
    onClearError?.();
  }

  function handleOpenCreate() {
    if (!client) return;
    setOpen(false);
    setCreateError(null);
    setCreateOpen(true);
  }

  async function handleCreateSubmit(data: ClientUnitInput) {
    if (!client) return;
    setCreating(true);
    setCreateError(null);
    try {
      const response = await createClientUnit(session, client.id, data);
      const created = response.unit;
      onUnitCreated(created);
      onSelect(created.id);
      onClearError?.();
      setCreateOpen(false);
    } catch (cause) {
      setCreateError(translateCreateUnitError(cause));
    } finally {
      setCreating(false);
    }
  }

  const buttonLabel = (() => {
    if (!client) return DISABLED_PLACEHOLDER_NO_CLIENT;
    if (isPj) return DISABLED_PLACEHOLDER_PJ;
    if (loading) return 'Carregando fazendas…';
    if (selectedUnit) return selectedUnit.name ?? `Fazenda ${selectedUnit.code}`;
    return PF_CHOOSE_PLACEHOLDER;
  })();

  const buttonClassName = [
    'nsv2-field-input',
    'owner-unit-field__trigger',
    invalid ? 'has-error' : '',
    isDisabled ? 'is-disabled' : '',
    open ? 'is-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="nsv2-field owner-unit-field" ref={containerRef}>
      <label htmlFor={inputId} className="nsv2-field-label">
        Fazenda{required ? <span className="nsv2-required-star"> *</span> : null}
      </label>
      <button
        id={inputId}
        type="button"
        className={buttonClassName}
        disabled={isDisabled}
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="owner-unit-field__trigger-label">
          {buttonLabel}
          {selectedUnit && !isUnitComplete(selectedUnit) ? (
            <IncompleteIcon className="owner-unit-field__incomplete-icon" />
          ) : null}
        </span>
        {!isDisabled ? <span className="owner-unit-field__caret">▾</span> : null}
      </button>
      {invalid ? (
        <span className="app-modal-error" role="alert">
          {invalidText}
        </span>
      ) : null}

      {open && isPf ? (
        <div className="owner-unit-field__dropdown" role="listbox">
          {units.length === 0 ? (
            <div className="owner-unit-field__empty">Nenhuma fazenda ativa</div>
          ) : (
            units.map((unit) => {
              const incomplete = !isUnitComplete(unit);
              const selected = unit.id === selectedUnitId;
              return (
                <button
                  type="button"
                  key={unit.id}
                  className={`owner-unit-field__option${selected ? ' is-selected' : ''}`}
                  onClick={() => handlePick(unit.id)}
                  role="option"
                  aria-selected={selected}
                >
                  <span className="owner-unit-field__option-name">
                    {unit.name ?? `Fazenda ${unit.code}`}
                  </span>
                  {incomplete ? (
                    <IncompleteIcon className="owner-unit-field__option-incomplete" />
                  ) : null}
                </button>
              );
            })
          )}
          <button type="button" className="lookup-create-cta" onClick={handleOpenCreate}>
            {NEW_FARM_LABEL}
          </button>
        </div>
      ) : null}

      <ClientUnitModal
        open={createOpen}
        saving={creating}
        errorMessage={createError}
        onClose={() => {
          if (creating) return;
          setCreateOpen(false);
          setCreateError(null);
        }}
        onSubmit={handleCreateSubmit}
      />
    </div>
  );
}

function translateCreateUnitError(cause: unknown): string {
  if (!(cause instanceof ApiError)) {
    return 'Falha ao cadastrar fazenda. Tente novamente.';
  }
  if (cause.status === 0) {
    return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
  }
  if (cause.status === 401) {
    return 'Sessão expirada. Faça login novamente.';
  }
  if (cause.status === 403) {
    return 'Sem permissão para cadastrar fazenda.';
  }
  return cause.message || 'Falha ao cadastrar fazenda. Tente novamente.';
}
