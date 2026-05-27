'use client';

import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { ANIMATION_MS, BottomSheet } from './BottomSheet';
import { ClientLookupField } from './clients/ClientLookupField';
import { ClientQuickCreateModal } from './clients/ClientQuickCreateModal';
import { OwnerUnitField } from './samples/OwnerUnitField';
import { SampleCreatedSuccessModal } from './samples/SampleCreatedSuccessModal';
import { ApiError, createSample, getClient } from '../lib/api-client';
import { useRegisterDirtyState } from '../lib/dirty-state/DirtyStateProvider';
import { createSampleDraftSchema } from '../lib/form-schemas';
import type {
  ClientSummary,
  ClientUnitSummary,
  CreateSampleResponse,
  SessionData,
} from '../lib/types';

// ════════════════════════════════════════════════════════════════
// Constantes e helpers (escopo de modulo)
// ════════════════════════════════════════════════════════════════

const DRAFT_ID_STORAGE_KEY = 'new-sample-draft-id';
const REQUIRED_FIELD_MESSAGE = 'Obrigatório';

function buildDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function persistDraftId(id: string) {
  try {
    sessionStorage.setItem(DRAFT_ID_STORAGE_KEY, id);
  } catch {}
}

function loadOrCreateDraftId(): string {
  try {
    const stored = sessionStorage.getItem(DRAFT_ID_STORAGE_KEY);
    if (stored) return stored;
  } catch {}
  const id = buildDraftId();
  persistDraftId(id);
  return id;
}

function renewDraftId(): string {
  const id = buildDraftId();
  persistDraftId(id);
  return id;
}

function clearPersistedDraftId() {
  try {
    sessionStorage.removeItem(DRAFT_ID_STORAGE_KEY);
  } catch {}
}

function buildHarvestPresets(): readonly string[] {
  const year = new Date().getFullYear() % 100;
  return [
    `${year - 2}/${year - 1}`,
    `${year - 1}/${year}`,
    `${year}/${year + 1}`,
    `${year + 1}/${year + 2}`,
  ];
}

const HARVEST_PRESET_OPTIONS = buildHarvestPresets();

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════

type WizardStep = 'form' | 'created';
type WizardStatus = 'idle' | 'submitting' | 'error';

type RequiredFieldName = 'owner' | 'ownerUnit' | 'sacks' | 'harvest';
type RequiredFieldErrors = Record<RequiredFieldName, string | null>;

interface WizardState {
  step: WizardStep;
  status: WizardStatus;
  error: string | null;
  createdSampleId: string | null;
  createdLotNumber: string | null;
  dirty: boolean;
  fieldErrors: RequiredFieldErrors;
}

type WizardAction =
  | { type: 'MARK_DIRTY' }
  | { type: 'SET_FIELD_ERRORS'; errors: RequiredFieldErrors }
  | { type: 'CLEAR_FIELD_ERROR'; field: RequiredFieldName }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS'; sampleId: string; lotNumber: string }
  | { type: 'SUBMIT_ERROR'; message: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RESET' };

interface NewSampleModalProps {
  open: boolean;
  onClose: () => void;
  session: SessionData;
  onSuccessNavigate?: (sampleId: string) => void;
}

const EMPTY_REQUIRED_FIELD_ERRORS: RequiredFieldErrors = {
  owner: null,
  ownerUnit: null,
  sacks: null,
  harvest: null,
};

const initialState: WizardState = {
  step: 'form',
  status: 'idle',
  error: null,
  createdSampleId: null,
  createdLotNumber: null,
  dirty: false,
  fieldErrors: EMPTY_REQUIRED_FIELD_ERRORS,
};

function hasRequiredFieldErrors(fieldErrors: RequiredFieldErrors) {
  return Object.values(fieldErrors).some((value) => Boolean(value));
}

function getMissingRequiredFieldErrors(
  values: Record<'owner' | 'sacks' | 'harvest', string>
): RequiredFieldErrors {
  return {
    owner: values.owner.trim() ? null : REQUIRED_FIELD_MESSAGE,
    ownerUnit: null,
    sacks: values.sacks.trim() ? null : REQUIRED_FIELD_MESSAGE,
    harvest: values.harvest.trim() ? null : REQUIRED_FIELD_MESSAGE,
  };
}

function getSchemaFieldErrors(
  issues: Array<{ path: PropertyKey[]; message: string }>
): RequiredFieldErrors {
  const next = { ...EMPTY_REQUIRED_FIELD_ERRORS };
  for (const issue of issues) {
    const path = issue.path[0];
    if (path !== 'owner' && path !== 'sacks' && path !== 'harvest') continue;
    next[path] = issue.message;
  }
  return next;
}

// ════════════════════════════════════════════════════════════════
// Reducer
// ════════════════════════════════════════════════════════════════

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'MARK_DIRTY':
      if (state.dirty) return state;
      return { ...state, dirty: true };

    case 'SET_FIELD_ERRORS':
      return { ...state, fieldErrors: action.errors };

    case 'CLEAR_FIELD_ERROR':
      if (!state.fieldErrors[action.field]) return state;
      return {
        ...state,
        fieldErrors: { ...state.fieldErrors, [action.field]: null },
      };

    case 'SUBMIT_START':
      if (state.status === 'submitting') return state;
      return { ...state, status: 'submitting', error: null };

    case 'SUBMIT_SUCCESS':
      return {
        ...state,
        step: 'created',
        status: 'idle',
        createdSampleId: action.sampleId,
        createdLotNumber: action.lotNumber,
        error: null,
      };

    case 'SUBMIT_ERROR':
      return { ...state, status: 'error', error: action.message };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
        status: state.status === 'error' ? 'idle' : state.status,
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// ════════════════════════════════════════════════════════════════
// Component
// ════════════════════════════════════════════════════════════════

export function NewSampleModal({ open, onClose, session, onSuccessNavigate }: NewSampleModalProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(wizardReducer, initialState);

  // ── State local do form (separado do reducer pra evitar
  // verbosidade desnecessaria; mudancas disparam MARK_DIRTY no reducer)
  const [clientDraftId, setClientDraftId] = useState<string>(() => '');
  const [owner, setOwner] = useState('');
  const [selectedOwnerClient, setSelectedOwnerClient] = useState<ClientSummary | null>(null);
  const [ownerUnits, setOwnerUnits] = useState<ClientUnitSummary[]>([]);
  const [selectedOwnerUnitId, setSelectedOwnerUnitId] = useState<string | null>(null);
  const [ownerUnitLoading, setOwnerUnitLoading] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateSeed, setQuickCreateSeed] = useState('');
  const [sacks, setSacks] = useState('');
  const [harvest, setHarvest] = useState('');
  const [originLot, setOriginLot] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [harvestOptionsOpen, setHarvestOptionsOpen] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  const ownerInputRef = useRef<HTMLInputElement | null>(null);
  const sacksInputRef = useRef<HTMLInputElement | null>(null);
  const harvestInputRef = useRef<HTMLInputElement | null>(null);
  const harvestFieldRef = useRef<HTMLDivElement | null>(null);
  const invalidFocusTimeoutRef = useRef<number | null>(null);
  const draftInitializedRef = useRef(false);

  // Hidratacao do clientDraftId: roda APENAS no primeiro mount com open=true.
  // Mantem comportamento atual (continua draft entre fechamentos via sessionStorage).
  useEffect(() => {
    if (!open || draftInitializedRef.current) return;
    draftInitializedRef.current = true;
    setClientDraftId(loadOrCreateDraftId());
  }, [open]);

  // Apos SUBMIT_SUCCESS, state.step vira 'created'. O BottomSheet recebe
  // open={false} (animacao de saida ~ANIMATION_MS). Aguardamos esse tempo +
  // pequena margem e abrimos o modal central de sucesso.
  useEffect(() => {
    if (state.step !== 'created') {
      setSuccessModalOpen(false);
      return;
    }
    const timer = window.setTimeout(() => setSuccessModalOpen(true), ANIMATION_MS + 30);
    return () => window.clearTimeout(timer);
  }, [state.step]);

  // Quando o pai sinaliza fechamento (open=false), fecha modais aninhados
  // imediatamente — eles nao tem animacao de saida (returnam null direto),
  // entao deixa-los abertos durante o delayed unmount do pai (~400ms)
  // criaria um "flash" de modal pendurado apos a acao do user.
  useEffect(() => {
    if (!open) {
      setSuccessModalOpen(false);
      setConfirmDiscardOpen(false);
      setQuickCreateOpen(false);
    }
  }, [open]);

  const navigateToSample =
    onSuccessNavigate ?? ((sampleId: string) => router.push(`/samples/${sampleId}`));

  // ── Owner units load (mesmo padrao do form atual)
  useEffect(() => {
    if (!session || !selectedOwnerClient) {
      setOwnerUnits([]);
      setSelectedOwnerUnitId(null);
      setOwnerUnitLoading(false);
      setOwner(selectedOwnerClient?.displayName ?? '');
      return;
    }

    let active = true;
    setOwnerUnitLoading(true);
    setError(null);
    setOwner(selectedOwnerClient.displayName ?? '');

    getClient(session, selectedOwnerClient.id)
      .then((response) => {
        if (!active) return;
        const activeUnits = response.units.filter((unit) => unit.status === 'ACTIVE');
        setOwnerUnits(activeUnits);
        setSelectedOwnerUnitId((current) =>
          activeUnits.some((unit) => unit.id === current) ? current : null
        );
      })
      .catch((cause) => {
        if (!active) return;
        setOwnerUnits([]);
        setSelectedOwnerUnitId(null);
        setError(
          cause instanceof ApiError ? cause.message : 'Falha ao carregar filiais do proprietario'
        );
      })
      .finally(() => {
        if (active) setOwnerUnitLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedOwnerClient, session]);

  // ── Cleanup timeouts ao desmontar
  useEffect(() => {
    return () => {
      if (invalidFocusTimeoutRef.current !== null) {
        window.clearTimeout(invalidFocusTimeoutRef.current);
      }
    };
  }, []);

  // ── Outside-click pra fechar dropdown de presets de safra
  useEffect(() => {
    if (!harvestOptionsOpen) return;

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!harvestFieldRef.current?.contains(target)) {
        setHarvestOptionsOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => document.removeEventListener('mousedown', onDocumentMouseDown);
  }, [harvestOptionsOpen]);

  // ── Online/offline listeners
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ── DirtyState global (router Link / back interception)
  useRegisterDirtyState('samples/new', state.dirty, 'Nova amostra em preenchimento');

  function markDirty() {
    if (!state.dirty) dispatch({ type: 'MARK_DIRTY' });
  }

  function clearFieldError(field: RequiredFieldName) {
    dispatch({ type: 'CLEAR_FIELD_ERROR', field });
  }

  function focusRequiredField(field: RequiredFieldName) {
    if (invalidFocusTimeoutRef.current !== null) {
      window.clearTimeout(invalidFocusTimeoutRef.current);
    }
    invalidFocusTimeoutRef.current = window.setTimeout(() => {
      const target =
        field === 'owner'
          ? ownerInputRef.current
          : field === 'sacks'
            ? sacksInputRef.current
            : field === 'harvest'
              ? harvestInputRef.current
              : null;
      target?.focus();
      target?.scrollIntoView({ block: 'nearest' });
      invalidFocusTimeoutRef.current = null;
    }, 60);
  }

  function focusFirstInvalidField(fieldErrors: RequiredFieldErrors) {
    const firstInvalid = (['owner', 'ownerUnit', 'sacks', 'harvest'] as const).find((f) =>
      Boolean(fieldErrors[f])
    );
    if (firstInvalid) focusRequiredField(firstInvalid);
  }

  function resetDraft() {
    setClientDraftId(renewDraftId());
    setOwner('');
    setSelectedOwnerClient(null);
    setOwnerUnits([]);
    setSelectedOwnerUnitId(null);
    setOwnerUnitLoading(false);
    setQuickCreateOpen(false);
    setQuickCreateSeed('');
    setSacks('');
    setHarvest('');
    setOriginLot('');
    setLocation('');
    setNotes('');
    setHarvestOptionsOpen(false);
    setError(null);
    setMessage(null);
    dispatch({ type: 'RESET' });
  }

  function hasUnsavedData() {
    return Boolean(
      owner.trim() ||
      sacks.trim() ||
      harvest.trim() ||
      originLot.trim() ||
      location.trim() ||
      notes.trim()
    );
  }

  async function handleConfirmDraft() {
    setError(null);
    setMessage(null);

    if (!selectedOwnerClient) {
      dispatch({
        type: 'SET_FIELD_ERRORS',
        errors: { ...state.fieldErrors, owner: REQUIRED_FIELD_MESSAGE },
      });
      focusRequiredField('owner');
      return;
    }

    if (selectedOwnerClient.personType === 'PF' && ownerUnits.length === 0) {
      setError(
        'Este cliente PF nao tem fazenda ativa. Cadastre uma fazenda na pagina do cliente antes de registrar amostras.'
      );
      return;
    }

    const missingRequiredFieldErrors = getMissingRequiredFieldErrors({ owner, sacks, harvest });

    if (selectedOwnerClient.personType === 'PF' && !selectedOwnerUnitId) {
      missingRequiredFieldErrors.ownerUnit = REQUIRED_FIELD_MESSAGE;
    }

    if (hasRequiredFieldErrors(missingRequiredFieldErrors)) {
      dispatch({ type: 'SET_FIELD_ERRORS', errors: missingRequiredFieldErrors });
      focusFirstInvalidField(missingRequiredFieldErrors);
      return;
    }

    const parsed = createSampleDraftSchema.safeParse({
      owner,
      sacks,
      harvest,
      originLot: originLot.trim() ? originLot : null,
      location: location.trim() ? location : null,
      notes: notes.trim() ? notes : null,
    });

    if (!parsed.success) {
      const schemaFieldErrors = getSchemaFieldErrors(parsed.error.issues);
      if (hasRequiredFieldErrors(schemaFieldErrors)) {
        dispatch({ type: 'SET_FIELD_ERRORS', errors: schemaFieldErrors });
        focusFirstInvalidField(schemaFieldErrors);
      } else {
        setError(parsed.error.issues[0]?.message ?? 'Dados invalidos para criar amostra');
      }
      return;
    }

    dispatch({ type: 'SET_FIELD_ERRORS', errors: EMPTY_REQUIRED_FIELD_ERRORS });
    dispatch({ type: 'SUBMIT_START' });

    try {
      const result = await createSample(session, {
        clientDraftId,
        owner: parsed.data.owner,
        ownerClientId: selectedOwnerClient.id,
        ownerUnitId: selectedOwnerUnitId,
        sacks: parsed.data.sacks,
        harvest: parsed.data.harvest,
        originLot: parsed.data.originLot ?? null,
        location: parsed.data.location ?? null,
        receivedChannel: parsed.data.receivedChannel,
        notes: parsed.data.notes ?? null,
      });

      clearPersistedDraftId();
      dispatch({
        type: 'SUBMIT_SUCCESS',
        sampleId: result.sample.id,
        lotNumber: result.sample.internalLotNumber ?? result.sample.id,
      });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : 'Falha ao criar amostra';
      dispatch({ type: 'SUBMIT_ERROR', message });
    }
  }

  function handleDiscard() {
    setConfirmDiscardOpen(false);
    resetDraft();
    onClose();
  }

  async function handleDismissAttempt(): Promise<boolean> {
    if (state.status === 'submitting') return false;
    if (state.dirty) {
      setConfirmDiscardOpen(true);
      return false;
    }
    return true;
  }

  const fieldErrors = state.fieldErrors;
  const submitting = state.status === 'submitting';

  // ── Renderizacao do step "form"
  const formContent: ReactNode = (
    <>
      {error ? <p className="nsv2-inline-error">{error}</p> : null}
      {message ? <p className="nsv2-inline-success">{message}</p> : null}

      <div className="nsv2-form-grid">
        <div className="nsv2-grid-full">
          <ClientLookupField
            session={session}
            label="Proprietario"
            kind="owner"
            required
            inputRef={ownerInputRef}
            invalid={Boolean(fieldErrors.owner)}
            invalidText={fieldErrors.owner ?? 'Obrigatorio'}
            selectedClient={selectedOwnerClient}
            onSelectClient={(client) => {
              markDirty();
              setSelectedOwnerClient(client);
              setOwner(client?.displayName ?? '');
              if (!client) {
                setSelectedOwnerUnitId(null);
              } else if (selectedOwnerClient?.id !== client.id) {
                setSelectedOwnerUnitId(null);
              }
              clearFieldError('owner');
              clearFieldError('ownerUnit');
              setError(null);
            }}
            onRequestCreate={(searchTerm) => {
              setQuickCreateSeed(searchTerm);
              setQuickCreateOpen(true);
            }}
            createLabel="+ Novo cliente"
            createButtonStyle="inline-cta"
          />
        </div>

        <div className="nsv2-grid-full">
          <OwnerUnitField
            session={session}
            client={selectedOwnerClient}
            units={ownerUnits}
            loading={ownerUnitLoading}
            selectedUnitId={selectedOwnerUnitId}
            onSelect={(unitId) => {
              markDirty();
              setSelectedOwnerUnitId(unitId);
              clearFieldError('ownerUnit');
            }}
            onUnitCreated={(unit) => {
              setOwnerUnits((prev) => [...prev, unit]);
            }}
            required={selectedOwnerClient?.personType === 'PF'}
            invalid={Boolean(fieldErrors.ownerUnit)}
            invalidText={fieldErrors.ownerUnit ?? 'Obrigatório'}
            onClearError={() => clearFieldError('ownerUnit')}
          />
        </div>

        <div className="nsv2-grid-half">
          <label className="nsv2-field">
            <span className="nsv2-field-label">
              Sacas<span className="nsv2-required-star"> *</span>
            </span>
            <div className="nsv2-field-input-wrap">
              <span className="nsv2-field-input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <rect x="4" y="8" width="16" height="13" rx="2" />
                  <path d="M9 8V6a3 3 0 0 1 6 0v2" />
                </svg>
              </span>
              <input
                ref={sacksInputRef}
                value={sacks}
                className={`nsv2-field-input has-icon-left ${fieldErrors.sacks ? 'has-error' : ''}`}
                aria-invalid={Boolean(fieldErrors.sacks)}
                onChange={(event) => {
                  markDirty();
                  setSacks(event.target.value.replace(/[^0-9]/g, ''));
                  clearFieldError('sacks');
                }}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder={fieldErrors.sacks ? fieldErrors.sacks : 'Ex: 40'}
              />
            </div>
          </label>
        </div>

        <div className="nsv2-grid-half" ref={harvestFieldRef}>
          <label className="nsv2-field" htmlFor="nsv2-harvest-input-modal">
            <span className="nsv2-field-label">
              Safra<span className="nsv2-required-star"> *</span>
            </span>
            <div className="nsv2-field-input-wrap">
              <span className="nsv2-field-input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M3 10h18" />
                  <path d="M8 3v4" />
                  <path d="M16 3v4" />
                </svg>
              </span>
              <input
                id="nsv2-harvest-input-modal"
                ref={harvestInputRef}
                className={`nsv2-field-input has-icon-left ${fieldErrors.harvest ? 'has-error' : ''}`}
                aria-invalid={Boolean(fieldErrors.harvest)}
                value={harvest}
                onFocus={() => setHarvestOptionsOpen(true)}
                onChange={(event) => {
                  markDirty();
                  setHarvest(event.target.value.toUpperCase());
                  clearFieldError('harvest');
                }}
                placeholder={
                  fieldErrors.harvest
                    ? fieldErrors.harvest
                    : `Ex: ${HARVEST_PRESET_OPTIONS[1] ?? '25/26'}`
                }
              />
            </div>
          </label>
          {harvestOptionsOpen ? (
            <div className="new-sample-harvest-options">
              {HARVEST_PRESET_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`new-sample-harvest-option${harvest.trim() === option ? ' is-active' : ''}`}
                  onClick={() => {
                    markDirty();
                    setHarvest(option);
                    clearFieldError('harvest');
                    setHarvestOptionsOpen(false);
                  }}
                  disabled={submitting}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="nsv2-grid-half">
          <label className="nsv2-field">
            <span className="nsv2-field-label">Lote de origem</span>
            <div className="nsv2-field-input-wrap">
              <span className="nsv2-field-input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                  <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                  <path d="M8 8v8" />
                  <path d="M16 8v8" />
                  <path d="M12 8v8" />
                </svg>
              </span>
              <input
                value={originLot}
                className="nsv2-field-input has-icon-left"
                onChange={(event) => {
                  markDirty();
                  setOriginLot(event.target.value.toUpperCase());
                }}
                placeholder="Codigo do lote"
              />
            </div>
          </label>
        </div>

        <div className="nsv2-grid-half">
          <label className="nsv2-field">
            <span className="nsv2-field-label">Local</span>
            <div className="nsv2-field-input-wrap">
              <span className="nsv2-field-input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M12 22s8-7 8-13a8 8 0 0 0-16 0c0 6 8 13 8 13z" />
                  <circle cx="12" cy="9" r="3" />
                </svg>
              </span>
              <input
                value={location}
                className="nsv2-field-input has-icon-left"
                onChange={(event) => {
                  markDirty();
                  setLocation(event.target.value.toUpperCase());
                }}
                placeholder="Ex: BM, Patos"
                maxLength={30}
              />
            </div>
          </label>
        </div>

        <div className="nsv2-grid-full">
          <label className="nsv2-field">
            <span className="nsv2-field-label">Observacoes</span>
            <div className="nsv2-field-input-wrap">
              <input
                value={notes}
                className="nsv2-field-input has-icon-right"
                onChange={(event) => {
                  markDirty();
                  setNotes(event.target.value.toUpperCase());
                }}
                placeholder=""
              />
              <span className="nsv2-field-input-icon is-right" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </span>
            </div>
          </label>
        </div>
      </div>

      {!isOnline ? (
        <div className="nsv2-offline-banner" role="status">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M1 1l22 22" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <span>Sem conexao</span>
        </div>
      ) : null}
    </>
  );

  const formFooter: ReactNode = (
    <div className="nsv2-submit-wrap">
      <button
        type="button"
        className="nsv2-clear-btn"
        disabled={submitting || !hasUnsavedData()}
        onClick={resetDraft}
      >
        <span>Limpar</span>
      </button>
      <button
        type="button"
        className="nsv2-submit-btn"
        disabled={submitting || !isOnline}
        onClick={() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          void handleConfirmDraft();
        }}
      >
        <span>{submitting ? 'Criando...' : 'Criar amostra'}</span>
      </button>
    </div>
  );

  // Handlers do modal central de sucesso.
  function handleNavigateToSample() {
    if (state.createdSampleId) {
      navigateToSample(state.createdSampleId);
    }
  }

  function handleCreateAnother() {
    setSuccessModalOpen(false);
    resetDraft();
  }

  function handleSuccessClose() {
    // Mesmo destino do botao primario: o user fechou o modal apos criar com
    // sucesso. Em /samples/new -> navega pra detail; em /samples (FAB) ->
    // override fecha + refetch (Decisao 5.29 = b).
    if (state.createdSampleId) {
      navigateToSample(state.createdSampleId);
    }
  }

  return (
    <>
      <BottomSheet
        open={open && state.step === 'form'}
        onClose={onClose}
        onDismissAttempt={handleDismissAttempt}
        title="Nova amostra"
        footer={formFooter}
        ariaLabel="Nova amostra"
        dragToDismiss
        dragDisabled={quickCreateOpen}
      >
        <div className="new-sample-step-content">{formContent}</div>
      </BottomSheet>

      <SampleCreatedSuccessModal
        open={successModalOpen}
        lotNumber={state.createdLotNumber ?? '—'}
        onNavigateToSample={handleNavigateToSample}
        onCreateAnother={handleCreateAnother}
        onClose={handleSuccessClose}
      />

      <ClientQuickCreateModal
        session={session}
        open={quickCreateOpen}
        title="Novo proprietario"
        initialSearch={quickCreateSeed}
        initialPersonType="PJ"
        initialIsSeller
        initialIsBuyer={false}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={(client: ClientSummary) => {
          setQuickCreateOpen(false);
          markDirty();
          setSelectedOwnerClient(client);
          setOwner(client.displayName ?? '');
          setSelectedOwnerUnitId(null);
          clearFieldError('owner');
          setMessage('Cliente criado e selecionado para a amostra.');
        }}
      />

      {confirmDiscardOpen ? (
        <div className="app-modal-backdrop is-stacked" onClick={() => setConfirmDiscardOpen(false)}>
          <section
            className="app-modal app-confirm-modal is-stacked"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-sample-title"
            aria-describedby="discard-sample-description"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="discard-sample-title" className="app-modal-title">
                  Descartar amostra em andamento?
                </h3>
                <p id="discard-sample-description" className="app-modal-description">
                  Os dados preenchidos serao perdidos. Esta acao nao pode ser desfeita.
                </p>
              </div>
            </header>
            <div className="app-confirm-modal-warning">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 9v4" />
                <path d="M12 17v.01" />
                <path d="M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
              </svg>
              <span>Nova amostra em preenchimento</span>
            </div>
            <div className="app-modal-actions">
              <button
                type="button"
                className="app-modal-secondary"
                onClick={() => setConfirmDiscardOpen(false)}
                autoFocus
              >
                Continuar editando
              </button>
              <button type="button" className="app-modal-submit is-danger" onClick={handleDiscard}>
                Descartar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export type { NewSampleModalProps };
export type { CreateSampleResponse };
