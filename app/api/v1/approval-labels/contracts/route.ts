import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

// Seletor de contratos da Aprovacao (view REDUZIDA, D113): so os status
// elegiveis, mais recente primeiro, sem valores financeiros nem snapshots
// crus. Gate = qualquer autenticado nao-PROSPECTOR (central, por methodName).
export async function GET(request: NextRequest) {
  return executeBackend('listApprovalContractOptions', request);
}
