'use client';

// Liga B2.1: bottom-sheet de confirmação da liga. Aberto pela seta `→`
// do FAB em /samples com >=2 amostras selecionadas. Apresenta cada
// amostra em uma linha com input numérico de contribuição (sacas) +
// remoção individual. Total rodando no rodapé. "Continuar" é placeholder
// até B2.2 (BlendCreateModal F3).
//
// Decisões UX:
// - Validação on-blur (some quando volta a editar).
// - F7.7: origem isBlend=true → input disabled fixo em declaredSacks +
//   tooltip explicativo via atributo title.
// - F2.4: warning âmbar inline quando sample.committedSacks > 0.
// - Remoção via × anima slide-out ~150ms antes de chamar onRemove no parent.
// - Última amostra removida via × → effect no parent (page.tsx) fecha o
//   sheet automaticamente, mantém modo seleção ativo.
//
// State interno via useReducer (consistente com NewSampleModal). Sync com
// props.samples revalida só ids já-touched pra não chatear quem digita.
//
// Reusa: <BottomSheet> (footer sticky + header verde), padrão de pill
// verde do lote (B1.5 popover), padrão de input numérico inline-error
// (NewSampleModal sacks field), animação `is-removing` (B1.5).

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { BottomSheet } from '../BottomSheet';
import { ClientLookupField } from '../clients/ClientLookupField';
import { getNextLotNumber } from '../../lib/api-client';
import type { ClientSummary, SampleSnapshot, SessionData } from '../../lib/types';

// Liga (dono fixado): mapeia o ownerClient enxuto do SampleSnapshot para o
// ClientSummary que o ClientLookupField exibe (pre-preenche o dono unanime).
function mapOwnerClientToSummary(
  client: NonNullable<SampleSnapshot['ownerClient']>
): ClientSummary {
  return {
    id: client.id,
    code: client.code,
    personType: client.personType,
    displayName: client.displayName,
    fullName: client.fullName,
    legalName: client.legalName,
    tradeName: client.tradeName,
    cpf: client.cpf,
    cnpj: client.cnpj,
    document: client.personType === 'PF' ? client.cpf : client.cnpj,
    phone: client.phone,
    email: null,
    addressLine: null,
    district: null,
    city: null,
    state: null,
    postalCode: null,
    complement: null,
    registrationNumber: null,
    isBuyer: client.isBuyer,
    isSeller: client.isSeller,
    isWarehouse: client.isWarehouse,
    status: client.status,
    commercialUser: null,
    commercialUsers: [],
    units: [],
    unitCount: 0,
    activeUnitCount: 0,
    primaryCity: null,
    primaryState: null,
    createdAt: null,
    updatedAt: null,
  };
}

const REMOVE_ANIMATION_MS = 150;

const TOOLTIP_BLEND_LOCKED = 'Para usar parte de uma liga, reverta-a primeiro e crie uma menor';

// Liga editavel: data default = hoje (fuso do dispositivo). Backend revalida futuro.
function todayAsInputDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface BlendContribution {
  originSampleId: string;
  contributedSacks: number;
}

export interface BlendCreateOptions {
  lotNumber: string | null;
  lotNumberManual: boolean;
  receivedDate: string | null;
  /** Dono ESCOLHIDO da liga; null = "carteira da corretora". Liga (dono fixado). */
  ownerClientId: string | null;
  /** Sempre true na criação pela UI: o dono escolhido nasce fixado (herda e fixa). */
  ownerFixed: boolean;
}

interface BlendConfirmationSheetProps {
  open: boolean;
  samples: SampleSnapshot[];
  /** Sessao — usada pra buscar a sugestao do proximo numero de lote. */
  session: SessionData | null;
  /** Loading state externo — true durante o request de createBlend.
   *  Bloqueia o botao "Criar liga" e impede fechamento (Voltar/ESC/backdrop). */
  submitting?: boolean;
  onClose: () => void;
  onRemove: (sampleId: string) => void;
  /** Tap em "Criar liga". Parent chama createBlend e atualiza submitting. */
  onProceed: (components: BlendContribution[], options: BlendCreateOptions) => void;
}

// ════════════════════════════════════════════════════════════════
// Reducer
// ════════════════════════════════════════════════════════════════

interface SheetState {
  values: Record<string, string>;
  errors: Record<string, string | null>;
  touched: Record<string, boolean>;
  removing: Record<string, boolean>;
}

type SheetAction =
  | { type: 'SYNC_SAMPLES'; samples: SampleSnapshot[] }
  | { type: 'SET_VALUE'; sampleId: string; value: string }
  | { type: 'BLUR'; sampleId: string; sample: SampleSnapshot }
  | { type: 'MARK_REMOVING'; sampleId: string }
  | { type: 'RESET' };

const initialState: SheetState = {
  values: {},
  errors: {},
  touched: {},
  removing: {},
};

function defaultValueForSample(sample: SampleSnapshot): string {
  if (sample.isBlend) {
    // F7.7: origem-liga participa com 100% (declared.sacks). Snapshot
    // sempre tem sacks numerico em ligas pre-comercializadas, mas tratamos
    // null defensivamente (cai pra availableSacks).
    return String(sample.declared.sacks ?? sample.availableSacks ?? 0);
  }
  return sample.availableSacks != null ? String(sample.availableSacks) : '';
}

function validate(value: string, sample: SampleSnapshot): string | null {
  // F7.7: origem é liga → valor fixo (declaredSacks), sem validação.
  if (sample.isBlend === true) return null;
  if (value === '') return 'Obrigatório';
  if (!/^\d+$/.test(value)) return 'Inválido';
  const numeric = Number(value);
  if (numeric === 0) return 'Mínimo 1';
  if (sample.availableSacks != null && numeric > sample.availableSacks) {
    return `Excede saldo (${sample.availableSacks})`;
  }
  return null;
}

function sheetReducer(state: SheetState, action: SheetAction): SheetState {
  switch (action.type) {
    case 'SYNC_SAMPLES': {
      const nextValues: Record<string, string> = {};
      const nextErrors: Record<string, string | null> = {};
      const nextTouched: Record<string, boolean> = {};
      const nextRemoving: Record<string, boolean> = {};
      for (const sample of action.samples) {
        const id = sample.id;
        const wasTouched = state.touched[id] === true;
        const existingValue = state.values[id];
        const value = existingValue ?? defaultValueForSample(sample);
        nextValues[id] = value;
        nextTouched[id] = wasTouched;
        // Re-validar apenas se o usuário já interagiu (touched). Caso
        // contrário, erro fica latente pra não distrair quem está digitando.
        nextErrors[id] = wasTouched ? validate(value, sample) : null;
        if (state.removing[id]) nextRemoving[id] = true;
      }
      return {
        values: nextValues,
        errors: nextErrors,
        touched: nextTouched,
        removing: nextRemoving,
      };
    }

    case 'SET_VALUE': {
      if (state.values[action.sampleId] === action.value) return state;
      return {
        ...state,
        values: { ...state.values, [action.sampleId]: action.value },
        // Limpa erro ao digitar (volta a poder validar no próximo blur).
        errors: state.errors[action.sampleId]
          ? { ...state.errors, [action.sampleId]: null }
          : state.errors,
      };
    }

    case 'BLUR': {
      const value = state.values[action.sampleId] ?? '';
      const error = validate(value, action.sample);
      return {
        ...state,
        touched: { ...state.touched, [action.sampleId]: true },
        errors: { ...state.errors, [action.sampleId]: error },
      };
    }

    case 'MARK_REMOVING': {
      if (state.removing[action.sampleId]) return state;
      return {
        ...state,
        removing: { ...state.removing, [action.sampleId]: true },
      };
    }

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// ════════════════════════════════════════════════════════════════
// Componente principal
// ════════════════════════════════════════════════════════════════

export function BlendConfirmationSheet({
  open,
  samples,
  session,
  submitting = false,
  onClose,
  onRemove,
  onProceed,
}: BlendConfirmationSheetProps) {
  const [state, dispatch] = useReducer(sheetReducer, initialState);
  const removeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Liga editavel: numero do lote (pre-preenchido com a sugestao da sequencia)
  // + data (default hoje). Espelha o NewSampleModal.
  const [blendLotNumber, setBlendLotNumber] = useState('');
  const [blendLotSuggestion, setBlendLotSuggestion] = useState('');
  const [blendLotLoading, setBlendLotLoading] = useState(false);
  const [blendReceivedDate, setBlendReceivedDate] = useState(() => todayAsInputDate());
  const blendLotEditedRef = useRef(false);

  // Liga (dono fixado): dono ESCOLHIDO da liga. Pre-preenche com o dono unanime
  // (quando ha); divergente/sem dono -> escolha obrigatoria. "Carteira da
  // corretora" (ownerIsCorretora) = sem dono, mas escolha explicita (fixada).
  const [selectedOwnerClient, setSelectedOwnerClient] = useState<ClientSummary | null>(null);
  const [ownerIsCorretora, setOwnerIsCorretora] = useState(false);
  const ownerTouchedRef = useRef(false);

  // Dono unanime das origens (mesma regra do deriveBlendOwner do backend): todas
  // com o mesmo ownerClientId nao-nulo -> herda; senao null (escolha obrigatoria).
  const unanimousOwner = useMemo<ClientSummary | null>(() => {
    const ids = samples.map((s) => s.ownerClientId ?? null);
    if (ids.length === 0 || new Set(ids).size !== 1 || ids[0] == null) return null;
    const withClient = samples.find((s) => s.ownerClient);
    return withClient?.ownerClient ? mapOwnerClientToSummary(withClient.ownerClient) : null;
  }, [samples]);

  const loadLotSuggestion = useCallback(async () => {
    if (!session) return;
    setBlendLotLoading(true);
    try {
      const res = await getNextLotNumber(session);
      setBlendLotSuggestion(res.nextLotNumber);
      // So pre-preenche se o usuario ainda nao mexeu (manual).
      if (!blendLotEditedRef.current) setBlendLotNumber(res.nextLotNumber);
    } catch {
      setBlendLotSuggestion('');
    } finally {
      setBlendLotLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!open) return;
    void loadLotSuggestion();
  }, [open, loadLotSuggestion]);

  // Sync sempre que a lista de samples (referencia ou IDs) mudar. Mantemos
  // ambas as deps (key estavel via IDs + samples) — o reducer usa o array
  // novo pra acessar availableSacks atualizado quando refetch dispara.
  const samplesKey = samples.map((s) => s.id).join('|');
  useEffect(() => {
    dispatch({ type: 'SYNC_SAMPLES', samples });
  }, [samplesKey, samples]);

  // Reset state quando sheet fecha (próxima abertura começa limpa).
  useEffect(() => {
    if (!open) {
      dispatch({ type: 'RESET' });
      setBlendLotNumber('');
      setBlendReceivedDate(todayAsInputDate());
      blendLotEditedRef.current = false;
      setSelectedOwnerClient(null);
      setOwnerIsCorretora(false);
      ownerTouchedRef.current = false;
    }
  }, [open]);

  // Liga (dono fixado): pre-preenche o dono com o unanime enquanto o usuario nao
  // escolheu manualmente. Aberto/troca de origens re-sugere; a escolha manual trava.
  useEffect(() => {
    if (!open || ownerTouchedRef.current) return;
    setSelectedOwnerClient(unanimousOwner);
  }, [open, unanimousOwner]);

  // Cleanup dos timers de remoção no unmount.
  useEffect(() => {
    const timers = removeTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  function handleSetValue(sampleId: string, raw: string) {
    const sanitized = raw.replace(/[^0-9]/g, '');
    dispatch({ type: 'SET_VALUE', sampleId, value: sanitized });
  }

  function handleBlur(sample: SampleSnapshot) {
    dispatch({ type: 'BLUR', sampleId: sample.id, sample });
  }

  function handleRemoveClick(sampleId: string) {
    if (state.removing[sampleId]) return;
    dispatch({ type: 'MARK_REMOVING', sampleId });
    const timer = setTimeout(() => {
      removeTimersRef.current.delete(sampleId);
      onRemove(sampleId);
    }, REMOVE_ANIMATION_MS);
    removeTimersRef.current.set(sampleId, timer);
  }

  const total = useMemo(() => {
    return samples.reduce((sum, sample) => {
      if (state.removing[sample.id]) return sum;
      const raw = state.values[sample.id];
      if (raw == null || raw === '') return sum;
      const num = Number(raw);
      return Number.isFinite(num) ? sum + num : sum;
    }, 0);
  }, [samples, state.values, state.removing]);

  const canProceed = useMemo(() => {
    if (samples.length < 2) return false;
    if (total <= 0) return false;
    // Liga (dono fixado): escolha do dono é obrigatória (um cliente OU carteira).
    if (!selectedOwnerClient && !ownerIsCorretora) return false;
    for (const sample of samples) {
      if (state.removing[sample.id]) continue;
      // Valida sempre (sem depender de touched) pra travar Continuar
      // se há algum input inválido mesmo sem o user ter saído do campo.
      const value = state.values[sample.id] ?? '';
      if (validate(value, sample) !== null) return false;
    }
    return true;
  }, [samples, state.values, state.removing, total, selectedOwnerClient, ownerIsCorretora]);

  function handleProceedClick() {
    if (!canProceed) return;
    const components: BlendContribution[] = samples
      .filter((s) => !state.removing[s.id])
      .map((s) => ({
        originSampleId: s.id,
        contributedSacks: Number(state.values[s.id]),
      }));
    const trimmedLot = blendLotNumber.trim();
    // Manual quando o usuario digitou algo diferente da sugestao da sequencia.
    const lotNumberManual = trimmedLot !== '' && trimmedLot !== blendLotSuggestion;
    onProceed(components, {
      lotNumber: trimmedLot || null,
      lotNumberManual,
      receivedDate: blendReceivedDate || null,
      // Liga (dono fixado): o dono escolhido (ou carteira = null) nasce fixado.
      ownerClientId: selectedOwnerClient?.id ?? null,
      ownerFixed: true,
    });
  }

  const footer: ReactNode = (
    <div className="blend-conf-footer">
      <div className="blend-conf-footer__total-card">
        <span className="blend-conf-footer__total-label">Total da liga</span>
        <span className="blend-conf-footer__total-value">
          {total}
          <span className="blend-conf-footer__total-unit">sc</span>
        </span>
      </div>
      <div className="blend-conf-footer__actions">
        <button
          type="button"
          className="blend-conf-footer__back"
          onClick={onClose}
          disabled={submitting}
        >
          Voltar
        </button>
        <button
          type="button"
          className="blend-conf-footer__continue"
          onClick={handleProceedClick}
          disabled={!canProceed || submitting}
        >
          {submitting ? 'Criando...' : 'Criar liga'}
        </button>
      </div>
    </div>
  );

  // Bloqueia fechamento (backdrop/ESC) durante submit pra evitar perder
  // o estado e duplicar a chamada.
  function handleDismiss() {
    if (submitting) return;
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={handleDismiss}
      title="Confirmação da liga"
      ariaLabel="Confirmar amostras e contribuições da liga"
      footer={footer}
      dragToDismiss={false}
      className="is-blend-confirm"
    >
      <div
        className="blend-conf-lotfields"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
          marginBottom: '0.85rem',
        }}
      >
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
              value={blendLotNumber}
              className="nsv2-field-input has-icon-left"
              onChange={(event) => {
                const next = event.target.value.replace(/[^0-9]/g, '');
                blendLotEditedRef.current = next.trim() !== '';
                setBlendLotNumber(next);
              }}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={7}
              placeholder={blendLotLoading ? '...' : 'Ex: 5658'}
              aria-label="Número do lote da liga"
              disabled={submitting}
            />
          </div>
        </label>
        <label className="nsv2-field">
          <span className="nsv2-field-label">Data</span>
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
              type="date"
              value={blendReceivedDate}
              max={todayAsInputDate()}
              className="nsv2-field-input has-icon-left"
              onChange={(event) => setBlendReceivedDate(event.target.value)}
              aria-label="Data da liga"
              disabled={submitting}
            />
          </div>
        </label>
      </div>

      {session ? (
        <div className="blend-conf-owner" style={{ marginBottom: '0.85rem' }}>
          <span className="nsv2-field-label">Dono da liga</span>
          <ClientLookupField
            session={session}
            label="Dono da liga"
            kind="owner"
            selectedClient={selectedOwnerClient}
            disabled={submitting || ownerIsCorretora}
            compact
            placeholder="Buscar cliente…"
            emptyMessage="Nenhum cliente encontrado."
            onSelectClient={(client) => {
              ownerTouchedRef.current = true;
              setSelectedOwnerClient(client);
              if (client) setOwnerIsCorretora(false);
            }}
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              marginTop: '0.5rem',
              fontSize: '0.85rem',
            }}
          >
            <input
              type="checkbox"
              checked={ownerIsCorretora}
              disabled={submitting}
              onChange={(event) => {
                ownerTouchedRef.current = true;
                const next = event.target.checked;
                setOwnerIsCorretora(next);
                if (next) setSelectedOwnerClient(null);
              }}
            />
            Carteira da corretora (sem dono)
          </label>
          {!selectedOwnerClient && !ownerIsCorretora ? (
            <span
              style={{
                display: 'block',
                marginTop: '0.35rem',
                fontSize: '0.78rem',
                color: '#6b7280',
              }}
            >
              Escolha o dono da liga ou marque &ldquo;carteira da corretora&rdquo;.
            </span>
          ) : null}
        </div>
      ) : null}

      <ul className="blend-conf-list" role="list">
        {samples.map((sample) => (
          <BlendConfirmationRow
            key={sample.id}
            sample={sample}
            value={state.values[sample.id] ?? ''}
            error={state.errors[sample.id] ?? null}
            touched={state.touched[sample.id] === true}
            isRemoving={state.removing[sample.id] === true}
            onChange={(raw) => handleSetValue(sample.id, raw)}
            onBlur={() => handleBlur(sample)}
            onRemove={() => handleRemoveClick(sample.id)}
          />
        ))}
      </ul>
    </BottomSheet>
  );
}

// ════════════════════════════════════════════════════════════════
// Sub-componente: Row
// ════════════════════════════════════════════════════════════════

interface BlendConfirmationRowProps {
  sample: SampleSnapshot;
  value: string;
  error: string | null;
  touched: boolean;
  isRemoving: boolean;
  onChange: (raw: string) => void;
  onBlur: () => void;
  onRemove: () => void;
}

function BlendConfirmationRow({
  sample,
  value,
  error,
  touched,
  isRemoving,
  onChange,
  onBlur,
  onRemove,
}: BlendConfirmationRowProps) {
  const isLocked = sample.isBlend === true;
  const showError = touched && error !== null;
  const showCommittedWarning =
    !isLocked && typeof sample.committedSacks === 'number' && sample.committedSacks > 0;

  const lot = sample.internalLotNumber ?? sample.id.slice(0, 8);
  const client = sample.declared?.owner?.trim() || sample.ownerClient?.displayName?.trim() || '—';
  const availableLabel =
    sample.availableSacks != null ? `${sample.availableSacks} disp.` : '— disp.';

  const className = ['blend-conf-row', isRemoving ? 'is-removing' : '', isLocked ? 'is-locked' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <li className={className}>
      <div className="blend-conf-row__head">
        <span className="blend-conf-row__lot">{lot}</span>
        <span className="blend-conf-row__client" title={client}>
          {client}
        </span>
        <span className="blend-conf-row__avail">{availableLabel}</span>
        <button
          type="button"
          className="blend-conf-row__remove"
          aria-label={`Remover amostra ${lot} da liga`}
          onClick={onRemove}
          disabled={isRemoving}
        >
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M6 6 18 18" />
            <path d="M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="blend-conf-row__input-wrap">
        <input
          type="text"
          className={`blend-conf-row__input${showError ? ' has-error' : ''}`}
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          disabled={isLocked}
          title={isLocked ? TOOLTIP_BLEND_LOCKED : undefined}
          placeholder={showError ? (error ?? undefined) : undefined}
          aria-invalid={showError}
          aria-label={`Contribuição em sacas — amostra ${lot}`}
        />
        <span className="blend-conf-row__input-suffix" aria-hidden="true">
          sc
        </span>
      </div>

      {showError ? <p className="blend-conf-row__error">{error}</p> : null}

      {showCommittedWarning ? (
        <p className="blend-conf-row__warning">
          <svg
            className="blend-conf-row__warning-icon"
            viewBox="0 0 24 24"
            focusable="false"
            aria-hidden="true"
          >
            <path d="M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
            <path d="M12 9v4" />
            <path d="M12 17v.01" />
          </svg>
          Comprometida em {sample.committedSacks} sc em outras ligas
        </p>
      ) : null}
    </li>
  );
}
