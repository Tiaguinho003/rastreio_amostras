'use client';

import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

import { ANIMATION_MS, BottomSheet } from './BottomSheet';
import { OriginLotChips } from './OriginLotChips';
import { ClientLookupField } from './clients/ClientLookupField';
import { ClientQuickCreateModal } from './clients/ClientQuickCreateModal';
import { SampleCreatedSuccessModal } from './samples/SampleCreatedSuccessModal';
import { ApiError, createSample, getNextLotNumber } from '../lib/api-client';
import { useRegisterDirtyState } from '../lib/dirty-state/DirtyStateProvider';
import { createSampleDraftSchema } from '../lib/form-schemas';
import { buildHarvestPresets } from '../lib/sample-identification';
import type { ClientSummary, SessionData } from '../lib/types';

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

const HARVEST_PRESET_OPTIONS = buildHarvestPresets();

// Lote editavel: data de chegada default = hoje (no fuso do dispositivo, que
// para o uso interno e America/Sao_Paulo). O backend revalida e bloqueia futuro.
function todayAsInputDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════

type WizardStep = 'form' | 'created';
type WizardStatus = 'idle' | 'submitting' | 'error';

type RequiredFieldName = 'owner' | 'sacks' | 'harvest' | 'lotNumber' | 'receivedDate';
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
  sacks: null,
  harvest: null,
  lotNumber: null,
  receivedDate: null,
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
    sacks: values.sacks.trim() ? null : REQUIRED_FIELD_MESSAGE,
    harvest: values.harvest.trim() ? null : REQUIRED_FIELD_MESSAGE,
    lotNumber: null,
    receivedDate: null,
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
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateSeed, setQuickCreateSeed] = useState('');
  const [sacks, setSacks] = useState('');
  const [harvest, setHarvest] = useState('');
  const [originLot, setOriginLot] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [harvestOptionsOpen, setHarvestOptionsOpen] = useState(false);
  // LNW-L3: abre pra cima quando o espaco abaixo (no body rolavel) nao basta.
  const [harvestDropUp, setHarvestDropUp] = useState(false);
  // Lote editavel: numero (pre-preenchido com a sugestao da sequencia) + data
  // de chegada (default hoje). Manual vs automatico e decidido por
  // lotEditedRef (LNW-B2/D4): editou e nao esta vazio = manual.
  const [lotNumber, setLotNumber] = useState('');
  const [lotLoading, setLotLoading] = useState(false);
  const [receivedDate, setReceivedDate] = useState(() => todayAsInputDate());

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  const ownerInputRef = useRef<HTMLInputElement | null>(null);
  const sacksInputRef = useRef<HTMLInputElement | null>(null);
  const harvestInputRef = useRef<HTMLInputElement | null>(null);
  const harvestFieldRef = useRef<HTMLDivElement | null>(null);
  const lotNumberInputRef = useRef<HTMLInputElement | null>(null);
  const receivedDateInputRef = useRef<HTMLInputElement | null>(null);
  // true assim que o usuario digita um numero de lote (some ao limpar o campo).
  const lotEditedRef = useRef(false);
  const invalidFocusTimeoutRef = useRef<number | null>(null);
  const draftInitializedRef = useRef(false);

  // Hidratacao do clientDraftId: roda APENAS no primeiro mount com open=true.
  // Mantem comportamento atual (continua draft entre fechamentos via sessionStorage).
  useEffect(() => {
    if (!open || draftInitializedRef.current) return;
    draftInitializedRef.current = true;
    setClientDraftId(loadOrCreateDraftId());
  }, [open]);

  // Lote editavel: busca a sugestao do proximo numero da sequencia e pre-
  // preenche o campo (so se o usuario ainda nao mexeu). Falha silenciosa: sem
  // sugestao, o backend gera o numero no submit.
  const loadLotSuggestion = useCallback(async () => {
    setLotLoading(true);
    try {
      const res = await getNextLotNumber(session);
      // So pre-preenche/atualiza se o usuario nao editou manualmente — assim,
      // reabrir o modal mostra sempre a sugestao fresca da sequencia.
      if (!lotEditedRef.current) setLotNumber(res.nextLotNumber);
    } catch {
      // Falha silenciosa: sem sugestao, o backend gera o numero no submit.
    } finally {
      setLotLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!open || state.step !== 'form') return;
    void loadLotSuggestion();
  }, [open, state.step, loadLotSuggestion]);

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

  // Default: abre o detalhe como overlay sobre a lista (?lote=, F2 do
  // redesign). A lista continua passando onSuccessNavigate proprio
  // (fechar + refetch, decisao 5.29 = b).
  const navigateToSample =
    onSuccessNavigate ?? ((sampleId: string) => router.push(`/samples?lote=${sampleId}`));

  // ── Sincroniza o nome do proprietario com o cliente selecionado. O lote nao
  // vincula mais fazenda/unit, entao nao ha carregamento de filiais aqui.
  useEffect(() => {
    setOwner(selectedOwnerClient?.displayName ?? '');
  }, [selectedOwnerClient]);

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
  useRegisterDirtyState('novo-lote', state.dirty, 'Novo lote em preenchimento');

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
              : field === 'lotNumber'
                ? lotNumberInputRef.current
                : field === 'receivedDate'
                  ? receivedDateInputRef.current
                  : null;
      target?.focus();
      target?.scrollIntoView({ block: 'nearest' });
      invalidFocusTimeoutRef.current = null;
    }, 60);
  }

  function focusFirstInvalidField(fieldErrors: RequiredFieldErrors) {
    const firstInvalid = (['owner', 'sacks', 'harvest'] as const).find((f) =>
      Boolean(fieldErrors[f])
    );
    if (firstInvalid) focusRequiredField(firstInvalid);
  }

  function resetDraft() {
    setClientDraftId(renewDraftId());
    setOwner('');
    setSelectedOwnerClient(null);
    setQuickCreateOpen(false);
    setQuickCreateSeed('');
    setSacks('');
    setHarvest('');
    setOriginLot('');
    setLocation('');
    setNotes('');
    setHarvestOptionsOpen(false);
    setLotNumber('');
    lotEditedRef.current = false;
    setReceivedDate(todayAsInputDate());
    setError(null);
    setMessage(null);
    dispatch({ type: 'RESET' });
    void loadLotSuggestion();
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

    const missingRequiredFieldErrors = getMissingRequiredFieldErrors({ owner, sacks, harvest });

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
        setError(parsed.error.issues[0]?.message ?? 'Dados inválidos para criar o lote');
      }
      return;
    }

    dispatch({ type: 'SET_FIELD_ERRORS', errors: EMPTY_REQUIRED_FIELD_ERRORS });
    dispatch({ type: 'SUBMIT_START' });

    // Lote editavel (LNW-B2/D4): manual = o usuario EDITOU o campo (rastreado
    // por lotEditedRef) e ele nao esta vazio. Antes comparava com a sugestao:
    // digitar um numero IGUAL a ela era tratado como automatico e o servidor
    // podia gerar OUTRO numero se um lote nascesse no intervalo. Digitou =
    // fixa o numero; campo intocado/esvaziado = automatico.
    const trimmedLot = lotNumber.trim();
    const lotNumberManual = lotEditedRef.current && trimmedLot !== '';

    try {
      const result = await createSample(session, {
        clientDraftId,
        owner: parsed.data.owner,
        ownerClientId: selectedOwnerClient.id,
        sacks: parsed.data.sacks,
        harvest: parsed.data.harvest,
        originLot: parsed.data.originLot ?? null,
        location: parsed.data.location ?? null,
        notes: parsed.data.notes ?? null,
        lotNumber: trimmedLot || null,
        lotNumberManual,
        receivedDate: receivedDate || null,
      });

      clearPersistedDraftId();
      dispatch({
        type: 'SUBMIT_SUCCESS',
        sampleId: result.sample.id,
        lotNumber: result.sample.internalLotNumber ?? result.sample.id,
      });
    } catch (cause) {
      // Erros de campo (lote duplicado, data no futuro) vem com details.field
      // do backend -> exibe dentro do campo, sem banner generico.
      if (cause instanceof ApiError && cause.details && typeof cause.details === 'object') {
        const field = (cause.details as { field?: unknown }).field;
        if (field === 'lotNumber' || field === 'receivedDate') {
          dispatch({
            type: 'SET_FIELD_ERRORS',
            errors: { ...EMPTY_REQUIRED_FIELD_ERRORS, [field]: cause.message },
          });
          dispatch({ type: 'SUBMIT_ERROR', message: '' });
          focusRequiredField(field);
          return;
        }
      }
      const message =
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : 'Não foi possível criar o lote.';
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
            label="Proprietário"
            kind="owner"
            required
            inputRef={ownerInputRef}
            invalid={Boolean(fieldErrors.owner)}
            invalidText={fieldErrors.owner ?? 'Obrigatório'}
            selectedClient={selectedOwnerClient}
            onSelectClient={(client) => {
              markDirty();
              setSelectedOwnerClient(client);
              setOwner(client?.displayName ?? '');
              clearFieldError('owner');
              setError(null);
            }}
            onRequestCreate={(searchTerm) => {
              setQuickCreateSeed(searchTerm);
              setQuickCreateOpen(true);
            }}
            createLabel="Adicionar cliente"
            createButtonStyle="inline-cta"
          />
        </div>

        <div className="nsv2-grid-half">
          <label className="nsv2-field">
            <span className="nsv2-field-label">Número do lote</span>
            <div className="nsv2-field-input-wrap">
              <span className="nsv2-field-input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M4 9h16" />
                  <path d="M4 15h16" />
                  <path d="M10 3 8 21" />
                  <path d="M16 3l-2 18" />
                </svg>
              </span>
              <input
                ref={lotNumberInputRef}
                value={lotNumber}
                className={`nsv2-field-input has-icon-left ${fieldErrors.lotNumber ? 'has-error' : ''}`}
                aria-invalid={Boolean(fieldErrors.lotNumber)}
                onChange={(event) => {
                  markDirty();
                  const next = event.target.value.replace(/[^0-9]/g, '');
                  lotEditedRef.current = next.trim() !== '';
                  setLotNumber(next);
                  clearFieldError('lotNumber');
                }}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={7}
                placeholder={lotLoading ? '...' : 'Ex: 5658'}
              />
            </div>
            {fieldErrors.lotNumber ? (
              <span className="nsv2-field-error">{fieldErrors.lotNumber}</span>
            ) : null}
          </label>
        </div>

        <div className="nsv2-grid-half">
          <label className="nsv2-field">
            <span className="nsv2-field-label">Data de chegada</span>
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
                ref={receivedDateInputRef}
                type="date"
                value={receivedDate}
                max={todayAsInputDate()}
                className={`nsv2-field-input has-icon-left ${fieldErrors.receivedDate ? 'has-error' : ''}`}
                aria-invalid={Boolean(fieldErrors.receivedDate)}
                onChange={(event) => {
                  markDirty();
                  setReceivedDate(event.target.value);
                  clearFieldError('receivedDate');
                }}
              />
            </div>
            {fieldErrors.receivedDate ? (
              <span className="nsv2-field-error">{fieldErrors.receivedDate}</span>
            ) : null}
          </label>
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
                onFocus={() => {
                  // LNW-L3: o dropdown abre PRA CIMA quando nao ha espaco
                  // abaixo dentro do body rolavel do sheet (senao era
                  // recortado/virava scroll no fim do form).
                  const input = harvestInputRef.current;
                  const scroller = input?.closest('.bottom-sheet-body');
                  if (input && scroller) {
                    const inputRect = input.getBoundingClientRect();
                    const scrollerRect = scroller.getBoundingClientRect();
                    const spaceBelow = scrollerRect.bottom - inputRect.bottom;
                    const spaceAbove = inputRect.top - scrollerRect.top;
                    setHarvestDropUp(spaceBelow < 210 && spaceAbove > spaceBelow);
                  } else {
                    setHarvestDropUp(false);
                  }
                  setHarvestOptionsOpen(true);
                }}
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
            <div className={`new-sample-harvest-options${harvestDropUp ? ' is-drop-up' : ''}`}>
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
            <OriginLotChips
              value={originLot}
              onChange={(next) => {
                markDirty();
                setOriginLot(next);
              }}
            />
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
            <span className="nsv2-field-label">Observações</span>
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
          <span>Sem conexão</span>
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
        <span>{submitting ? 'Criando...' : 'Criar lote'}</span>
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
    // sucesso. Default (sem override) navega pro detail; o caller de
    // /samples (FAB) passa onSuccessNavigate que fecha + refetch
    // (Decisao 5.29 = b). A rota /samples/new foi removida (LNW-D1).
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
        title="Novo lote"
        footer={formFooter}
        ariaLabel="Novo lote"
        className="is-fit-content"
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
        title="Novo proprietário"
        initialSearch={quickCreateSeed}
        initialPersonType="PJ"
        initialIsBuyer={false}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={(client: ClientSummary) => {
          setQuickCreateOpen(false);
          markDirty();
          setSelectedOwnerClient(client);
          setOwner(client.displayName ?? '');
          clearFieldError('owner');
          setMessage('Cliente criado e selecionado para o lote.');
        }}
      />

      {confirmDiscardOpen
        ? createPortal(
            // Portal pro body: o sheet de Nova Amostra ja e portalado (z-modal);
            // sem portar, este confirm inline ficava preso no contexto de
            // empilhamento da pagina e aparecia ATRAS do sheet. Portado, o
            // .is-stacked (z-modal-stacked) fica na frente. Sem header
            // (.app-modal-header) — titulo vai no corpo, padrao de confirm enxuto.
            <div
              className="app-modal-backdrop is-stacked"
              onClick={() => setConfirmDiscardOpen(false)}
            >
              <section
                className="app-modal is-themed app-confirm-modal is-stacked"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="discard-sample-title"
                aria-describedby="discard-sample-description"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="app-modal-content">
                  <div className="app-confirm-modal-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                      <path d="M12 9v4" />
                      <path d="M12 17v.01" />
                    </svg>
                  </div>
                  <h3 id="discard-sample-title" className="app-confirm-modal-title">
                    Descartar lote?
                  </h3>
                  <p id="discard-sample-description" className="app-confirm-modal-message">
                    Os dados preenchidos serão perdidos. Esta ação não pode ser desfeita.
                  </p>
                </div>

                <div className="app-modal-actions">
                  <button
                    type="button"
                    className="app-modal-secondary"
                    onClick={() => setConfirmDiscardOpen(false)}
                    autoFocus
                  >
                    Continuar
                  </button>
                  <button
                    type="button"
                    className="app-modal-submit is-danger"
                    onClick={handleDiscard}
                  >
                    Descartar
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export type { NewSampleModalProps };
