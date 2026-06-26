import { NextRequest } from 'next/server';

import { toHttpErrorResponse } from '../../../../../../src/api/http-utils.js';
import { assertAcceptedUploadSize } from '../../../../../../src/uploads/upload-policy.js';
import { executeBackend, toNextResponse } from '../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    clientId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return executeBackend('listClientAttachments', request, { params });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const formData = await request.formData();

    const fileValue = formData.get('file');
    const descriptionValue = formData.get('description');
    const originalFileNameValue = formData.get('originalFileName');

    let fileBuffer: Buffer | null = null;
    let originalFileName: string | null = null;

    if (fileValue instanceof File) {
      // Pre-check de tamanho antes de bufferizar (o service revalida + magic bytes).
      assertAcceptedUploadSize(fileValue.size, { fieldLabel: 'Client attachment' });
      const bytes = await fileValue.arrayBuffer();
      fileBuffer = Buffer.from(bytes);
      originalFileName = fileValue.name || null;
    }

    if (typeof originalFileNameValue === 'string' && originalFileNameValue.length > 0) {
      originalFileName = originalFileNameValue;
    }

    const description = typeof descriptionValue === 'string' ? descriptionValue : null;

    return executeBackend('addClientAttachment', request, {
      params: { clientId: params.clientId },
      body: { fileBuffer, originalFileName, description },
    });
  } catch (error) {
    return toNextResponse(toHttpErrorResponse(error));
  }
}
