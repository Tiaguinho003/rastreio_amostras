'use client';

import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

import { BottomSheet } from './BottomSheet';
import { OriginLotChips } from './OriginLotChips';
import { ClientLookupField } from './clients/ClientLookupField';
import { SuccessCheckOverlay, SUCCESS_CHECK_MS } from './SuccessCheckOverlay';
import { ClientQuickCreateModal } from './clients/ClientQuickCreateModal';
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

  const ownerInputRef = useRef<HTMLInputElement | null>(null);
  const sacksInputRef = useRef<HTMLInputElement | null>(null);
  const harvestSelectRef = useRef<HTMLSelectElement | null>(null);
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

  // F3 do redesign (decisao 13): apos SUBMIT_SUCCESS o painel NAO fecha pra
  // dar lugar a um modal central de sucesso — ele mostra o check canonico por
  // cima do proprio form e, quando o check sai, o drawer do lote recem-criado
  // abre sozinho. O modal `SampleCreatedSuccessModal` morreu (e com ele o
  // "Criar outro": criar de novo e reabrir o painel pelo CTA da pagina).
  useEffect(() => {
    if (state.step !== 'created') return;
    const sampleId = state.createdSampleId;
    const timer = window.setTimeout(() => {
      if (sampleId) navigateToSample(sampleId);
    }, SUCCESS_CHECK_MS);
    return () => window.clearTimeout(timer);
    // navigateToSample e recriado a cada render (funcao do corpo); a dep
    // relevante e a chegada do passo 'created'.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, state.createdSampleId]);

  // Quando o pai sinaliza fechamento (open=false), fecha modais aninhados
  // imediatamente — eles nao tem animacao de saida (returnam null direto),
  // entao deixa-los abertos durante o delayed unmount do pai (~400ms)
  // criaria um "flash" de modal pendurado apos a acao do user.
  useEffect(() => {
    if (!open) {
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
              ? harvestSelectRef.current
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
    // Check de sucesso na tela: o painel ja esta a caminho do drawer.
    if (state.step === 'created') return false;
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

      {/* Campos no molde institucional do painel de criar cliente: rotulo
          pequeno muted acima, input hairline, linhas de 1 ou 2 colunas
          (kit `.fv-form-*`). */}
      <div className="fv-form-body">
        <div className="fv-form-row">
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

        <div className="fv-form-row fv-form-row-2col">
          <label className={`fv-form-field${fieldErrors.lotNumber ? ' is-field-error' : ''}`}>
            <span className="fv-form-label">Número do lote</span>
            <input
              ref={lotNumberInputRef}
              value={lotNumber}
              className={fieldErrors.lotNumber ? 'fv-form-input-error' : undefined}
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
            {fieldErrors.lotNumber ? (
              <span className="fv-form-field-error">{fieldErrors.lotNumber}</span>
            ) : null}
          </label>

          <label className={`fv-form-field${fieldErrors.receivedDate ? ' is-field-error' : ''}`}>
            <span className="fv-form-label">Data de chegada</span>
            <input
              ref={receivedDateInputRef}
              type="date"
              value={receivedDate}
              max={todayAsInputDate()}
              className={fieldErrors.receivedDate ? 'fv-form-input-error' : undefined}
              aria-invalid={Boolean(fieldErrors.receivedDate)}
              onChange={(event) => {
                markDirty();
                setReceivedDate(event.target.value);
                clearFieldError('receivedDate');
              }}
            />
            {fieldErrors.receivedDate ? (
              <span className="fv-form-field-error">{fieldErrors.receivedDate}</span>
            ) : null}
          </label>
        </div>

        <div className="fv-form-row fv-form-row-2col">
          <label className={`fv-form-field${fieldErrors.sacks ? ' is-field-error' : ''}`}>
            <span className="fv-form-label">
              Sacas<span className="fv-form-required"> *</span>
            </span>
            <input
              ref={sacksInputRef}
              value={sacks}
              className={fieldErrors.sacks ? 'fv-form-input-error' : undefined}
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
          </label>

          {/* Safra: dropdown NORMAL (<select> nativo) com as safras da janela
              corrente — o popover de presets proprio saiu. */}
          <label className={`fv-form-field${fieldErrors.harvest ? ' is-field-error' : ''}`}>
            <span className="fv-form-label">
              Safra<span className="fv-form-required"> *</span>
            </span>
            <select
              ref={harvestSelectRef}
              value={harvest}
              aria-invalid={Boolean(fieldErrors.harvest)}
              onChange={(event) => {
                markDirty();
                setHarvest(event.target.value);
                clearFieldError('harvest');
              }}
            >
              <option value="">Selecione</option>
              {HARVEST_PRESET_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {fieldErrors.harvest ? (
              <span className="fv-form-field-error">{fieldErrors.harvest}</span>
            ) : null}
          </label>
        </div>

        <div className="fv-form-row fv-form-row-2col">
          <label className="fv-form-field">
            <span className="fv-form-label">Lote de origem</span>
            <OriginLotChips
              value={originLot}
              onChange={(next) => {
                markDirty();
                setOriginLot(next);
              }}
            />
          </label>

          <label className="fv-form-field">
            <span className="fv-form-label">Local</span>
            <input
              value={location}
              onChange={(event) => {
                markDirty();
                setLocation(event.target.value.toUpperCase());
              }}
              placeholder="Ex: BM, Patos"
              maxLength={30}
            />
          </label>
        </div>

        <div className="fv-form-row">
          <label className="fv-form-field">
            <span className="fv-form-label">Observações</span>
            <input
              value={notes}
              onChange={(event) => {
                markDirty();
                setNotes(event.target.value.toUpperCase());
              }}
              placeholder=""
            />
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

  // Rodape no molde do painel de criar cliente: secundaria | primaria lado a
  // lado (o gradiente do `.nsv2-submit-btn` saiu com o kit institucional).
  const formFooter: ReactNode = (
    <div className="fv-form-actions">
      <button
        type="button"
        className="app-modal-secondary"
        disabled={submitting || !hasUnsavedData()}
        onClick={resetDraft}
      >
        Limpar
      </button>
      <button
        type="button"
        className="app-modal-submit"
        disabled={submitting || !isOnline}
        onClick={() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          void handleConfirmDraft();
        }}
      >
        {submitting ? 'Criando...' : 'Criar lote'}
      </button>
    </div>
  );

  return (
    <>
      <BottomSheet
        open={open && (state.step === 'form' || state.step === 'created')}
        onClose={onClose}
        onDismissAttempt={handleDismissAttempt}
        footer={state.step === 'created' ? null : formFooter}
        ariaLabel="Novo lote"
        // side-sheet: desktop = painel lateral direito (como o detalhe);
        // mobile segue o sheet fit-content de sempre.
        className="is-fit-content side-sheet new-sample-sheet"
        // Mesmo fechar dos demais paineis FV: seta ← na borda, no lugar do ×.
        closeVariant="edge-back"
        dragToDismiss
        dragDisabled={quickCreateOpen || state.step === 'created'}
      >
        <>
          <div className="new-sample-step-content">{formContent}</div>
          <SuccessCheckOverlay show={state.step === 'created'} />
        </>
      </BottomSheet>

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
            // empilhamento da pagina e aparecia ATRAS do sheet. Sem header
            // (.app-modal-header) — titulo vai no corpo, padrao de confirm enxuto.
            // `is-scrim-none` = backdrop transparente (fundo NAO escurece nem
            // borra) + centrado + tier acima dos paineis; `is-compact` = card
            // pequeno. Mesmo par do "Descartar cadastro?" do quick-create.
            <div
              className="app-modal-backdrop is-scrim-none"
              onClick={() => setConfirmDiscardOpen(false)}
            >
              <section
                className="app-modal is-themed app-confirm-modal is-compact"
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
