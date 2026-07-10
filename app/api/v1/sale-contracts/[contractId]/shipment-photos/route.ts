import { NextRequest } from 'next/server';

import { executeBackend } from '../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    contractId: string;
  }>;
};

// Lista as fotos do embarque de um contrato (galeria read-only do Detalhes).
// Auth-only (todos os nao-PROSPECTOR).
export async function GET(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return executeBackend('listSaleContractShipmentPhotos', request, { params });
}
