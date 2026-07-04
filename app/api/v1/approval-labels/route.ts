import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../_lib/adapter';

// Envio auditado da Etiqueta de Aprovacao (Fase I, D112-D119): enfileira a
// impressao (custom_print_job) + grava a auditoria (approval_label_log) na
// MESMA transacao. body.saleContractId opcional (ausente = etiqueta avulsa).
export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);

  return executeBackend('sendApprovalLabel', request, { body });
}
