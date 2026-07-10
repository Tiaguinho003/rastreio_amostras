import { NextRequest } from 'next/server';

import { toHttpErrorResponse } from '../../../../../../src/api/http-utils.js';
import { assertAcceptedUploadSize } from '../../../../../../src/uploads/upload-policy.js';
import { executeBackend, toNextResponse } from '../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    contractId: string;
  }>;
};

// Confirma o embarque (EMB27): multipart com `shippedAt` (data) + 0..10 `file`
// (fotos opcionais). O service grava shippedAt + as fotos numa tx. Auth-only.
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const formData = await request.formData();

    const shippedAtValue = formData.get('shippedAt');
    const shippedAt = typeof shippedAtValue === 'string' ? shippedAtValue : null;

    const files: { fileBuffer: Buffer; originalFileName: string | null }[] = [];
    for (const value of formData.getAll('file')) {
      if (value instanceof File) {
        // Pre-check de tamanho antes de bufferizar (o service revalida + magic bytes).
        assertAcceptedUploadSize(value.size, { fieldLabel: 'Shipment photo' });
        const bytes = await value.arrayBuffer();
        files.push({ fileBuffer: Buffer.from(bytes), originalFileName: value.name || null });
      }
    }

    return executeBackend('confirmSaleContractShipment', request, {
      params: { contractId: params.contractId },
      body: { shippedAt, files },
    });
  } catch (error) {
    return toNextResponse(toHttpErrorResponse(error));
  }
}
