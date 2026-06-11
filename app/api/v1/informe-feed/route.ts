import { NextRequest } from 'next/server';

import { executeBackend } from '../_lib/adapter';

// Feed combinado dos formularios (visita do comercial + relatorio semanal
// + informe do prospector no escopo all). scope=mine alimenta a pagina
// /informe do comercial; scope=all alimenta o /resumo.
export async function GET(request: NextRequest) {
  return executeBackend('listInformeFeed', request);
}
