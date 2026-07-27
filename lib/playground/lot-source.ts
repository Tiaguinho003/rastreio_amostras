import { listSamples } from '../api-client';
import type { SampleSnapshot, SessionData } from '../types';

// Fonte de lotes do Simulador. O canvas conversa com ESTA interface, nunca
// com o api-client direto — foi o que permitiu trocar os mocks do protótipo
// pela busca real sem tocar em nenhum componente do canvas.
//
// PG9 (elegibilidade): só entram lotes CLASSIFICADOS com saldo.
// - status: `statusGroup=CLASSIFIED` no backend (INVALIDATED já sai na
//   exclusão base do listSamples, então não precisa de filtro próprio);
// - saldo: filtrado AQUI — o backend não tem parâmetro de availableSacks
//   (`sacksMin` olha o declarado, que é outra coisa).

/**
 * Teto de itens por busca. Espelha `SAMPLES_LIST_MAX_LIMIT` do backend
 * (`src/samples/sample-query-service.js`) — pedir mais é silenciosamente
 * capado lá. Quem não achar o lote refina o termo.
 */
const SEARCH_LIMIT = 30;

export interface PlaygroundLotSource {
  /**
   * Termo vazio lista a primeira página (browsing). Com termo, o backend casa
   * número do lote OU nome do proprietário, por PREFIXO — "62" traz os que
   * começam com 62, não os que contêm 62 no meio.
   */
  search(term: string, options?: { signal?: AbortSignal }): Promise<SampleSnapshot[]>;
}

export function createApiLotSource(session: SessionData): PlaygroundLotSource {
  return {
    async search(term, options = {}) {
      const trimmed = term.trim();
      const response = await listSamples(
        session,
        {
          ...(trimmed ? { search: trimmed } : {}),
          statusGroup: 'CLASSIFIED',
          limit: SEARCH_LIMIT,
        },
        { signal: options.signal }
      );
      return response.items.filter((item) => (item.availableSacks ?? 0) > 0);
    },
  };
}
