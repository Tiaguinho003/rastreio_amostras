'use client';

import { useReducer, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { BottomSheet } from './BottomSheet';
import type { SessionData } from '../lib/types';

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════

type WizardStep = 'form' | 'review' | 'created';
type WizardStatus = 'idle' | 'submitting' | 'error';

type RequiredFieldName = 'owner' | 'ownerUnit' | 'sacks' | 'harvest';
type RequiredFieldErrors = Record<RequiredFieldName, string | null>;

interface PendingDraftPayload {
  clientDraftId: string;
  owner: string;
  ownerClientId: string | null;
  ownerUnitId: string | null;
  sacks: number;
  harvest: string;
  originLot: string | null;
  location: string | null;
  receivedChannel: 'in_person' | 'courier' | 'driver' | 'other';
  notes: string | null;
}

interface WizardState {
  step: WizardStep;
  status: WizardStatus;
  error: string | null;
  createdSampleId: string | null;
  createdLotNumber: string | null;
  dirty: boolean;
  pendingDraft: PendingDraftPayload | null;
  fieldErrors: RequiredFieldErrors;
}

type WizardAction =
  | { type: 'MARK_DIRTY' }
  | { type: 'SET_FIELD_ERRORS'; errors: RequiredFieldErrors }
  | { type: 'CLEAR_FIELD_ERROR'; field: RequiredFieldName }
  | { type: 'GO_TO_REVIEW'; pendingDraft: PendingDraftPayload }
  | { type: 'BACK_TO_FORM' }
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
  pendingDraft: null,
  fieldErrors: EMPTY_REQUIRED_FIELD_ERRORS,
};

// ════════════════════════════════════════════════════════════════
// Reducer
//
// Transicoes invalidas sao IGNORADAS (state inalterado) — evita race
// conditions como tap "Confirmar" duplo, ou tentar fechar durante submit.
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

    case 'GO_TO_REVIEW':
      if (state.status === 'submitting') return state;
      return {
        ...state,
        step: 'review',
        pendingDraft: action.pendingDraft,
        error: null,
        status: 'idle',
      };

    case 'BACK_TO_FORM':
      if (state.status === 'submitting') return state;
      return { ...state, step: 'form', error: null, status: 'idle' };

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

const TITLE_BY_STEP: Record<WizardStep, string> = {
  form: 'Nova amostra',
  review: 'Confirme os dados',
  created: 'Amostra criada',
};

export function NewSampleModal({
  open,
  onClose,
  session: _session,
  onSuccessNavigate,
}: NewSampleModalProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(wizardReducer, initialState);

  const navigateToSample =
    onSuccessNavigate ?? ((sampleId: string) => router.push(`/samples/${sampleId}`));

  // Bloco 2.c: abrira modal "Descartar?" se state.dirty=true.
  // Por enquanto sempre permite fechar.
  async function handleDismissAttempt(): Promise<boolean> {
    if (state.status === 'submitting') {
      return false;
    }
    return true;
  }

  let stepContent: ReactNode;
  let stepFooter: ReactNode = null;

  if (state.step === 'form') {
    stepContent = (
      <div style={{ padding: '1rem 0' }}>
        <p>
          <strong>[Skeleton]</strong> Form step (Bloco 2.b).
        </p>
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: 'GO_TO_REVIEW',
              pendingDraft: {
                clientDraftId: 'placeholder',
                owner: 'Cliente placeholder',
                ownerClientId: null,
                ownerUnitId: null,
                sacks: 1,
                harvest: '24/25',
                originLot: null,
                location: null,
                receivedChannel: 'in_person',
                notes: null,
              },
            })
          }
        >
          Avançar para revisão
        </button>
      </div>
    );
  } else if (state.step === 'review') {
    stepContent = (
      <div style={{ padding: '1rem 0' }}>
        <p>
          <strong>[Skeleton]</strong> Review step (Bloco 2.c).
        </p>
        <p>Cliente: {state.pendingDraft?.owner ?? '—'}</p>
        <button type="button" onClick={() => dispatch({ type: 'BACK_TO_FORM' })}>
          Voltar para form
        </button>
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: 'SUBMIT_SUCCESS',
              sampleId: 'placeholder-id',
              lotNumber: 'A-0001',
            })
          }
        >
          Simular sucesso
        </button>
      </div>
    );
  } else {
    stepContent = (
      <div style={{ padding: '1rem 0' }}>
        <p>
          <strong>[Skeleton]</strong> Created step (Bloco 2.d).
        </p>
        <p>Lote: {state.createdLotNumber ?? '—'}</p>
        <button
          type="button"
          onClick={() => {
            if (state.createdSampleId) {
              navigateToSample(state.createdSampleId);
            }
            onClose();
          }}
        >
          Ir para amostra
        </button>
      </div>
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDismissAttempt={handleDismissAttempt}
      title={TITLE_BY_STEP[state.step]}
      footer={stepFooter}
      ariaLabel="Nova amostra"
      dragToDismiss={state.step === 'form'}
    >
      {stepContent}
    </BottomSheet>
  );
}
