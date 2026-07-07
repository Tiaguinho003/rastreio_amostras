import type { SampleSnapshot } from '../types';

// Reducer da lista de /samples (scroll infinito com cursor keyset).
// Extraído de app/samples/page.tsx na revisão geral (LOT-T1) pra ganhar
// cobertura de regressão — as correções B1–B5 da revisão faseada da página
// vivem neste estado + nos effects da página. Extração mecânica: a lógica é
// idêntica à versão inline. O guard de resposta velha (token do load-more)
// continua na página (loadMoreStateRef) — não pertence ao reducer.

export type SampleCursor = { lotInt: number | null; id: string };
export type SamplesListStatus = 'loading-initial' | 'loading-more' | 'idle' | 'error';

export interface SamplesListState {
  items: SampleSnapshot[];
  total: number;
  nextCursor: SampleCursor | null;
  status: SamplesListStatus;
  error: string | null;
}

export type SamplesListAction =
  | { type: 'fetch-initial' }
  | { type: 'fetch-more' }
  | {
      type: 'success-initial';
      items: SampleSnapshot[];
      total: number;
      nextCursor: SampleCursor | null;
    }
  | {
      type: 'success-more';
      items: SampleSnapshot[];
      nextCursor: SampleCursor | null;
    }
  | { type: 'error'; message: string };

export const SAMPLES_INITIAL: SamplesListState = {
  items: [],
  total: 0,
  nextCursor: null,
  status: 'loading-initial',
  error: null,
};

export function samplesListReducer(
  state: SamplesListState,
  action: SamplesListAction
): SamplesListState {
  switch (action.type) {
    case 'fetch-initial':
      return { ...SAMPLES_INITIAL, status: 'loading-initial' };
    case 'fetch-more':
      return { ...state, status: 'loading-more', error: null };
    case 'success-initial':
      return {
        items: action.items,
        total: action.total,
        nextCursor: action.nextCursor,
        status: 'idle',
        error: null,
      };
    case 'success-more':
      return {
        ...state,
        items: [...state.items, ...action.items],
        nextCursor: action.nextCursor,
        status: 'idle',
        error: null,
      };
    case 'error':
      return { ...state, status: 'error', error: action.message };
    default:
      return state;
  }
}
