import { NextRequest } from 'next/server';

import { executeBackend } from '../_lib/adapter';

// Feed combinado da pagina "Relatorios" (/relatorios): VISITA unificada +
// relatorio SEMANAL de TODOS os autores. O escopo e `all` FIXO — nao ha
// parametro de escopo desde a unificacao 2026-07-15 (o ramo scope=mine do
// COMMERCIAL saiu junto com a pagina /informe dele). Filtros opcionais:
// search/type/authorId/from/to/status + paginacao.
export async function GET(request: NextRequest) {
  return executeBackend('listInformeFeed', request);
}
