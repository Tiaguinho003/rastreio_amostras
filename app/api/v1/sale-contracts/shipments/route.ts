import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

// Embarque (EMB23-EMB25): worklist da sub-aba. Auth-only (todos os nao-PROSPECTOR).
// Paginada por cursor keyset (?search/?limit/?cursor/?filter).
export async function GET(request: NextRequest) {
  return executeBackend('listSaleContractShipments', request);
}
