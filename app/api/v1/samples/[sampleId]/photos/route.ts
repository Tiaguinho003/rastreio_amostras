import { NextRequest } from 'next/server';

import { toHttpErrorResponse } from '../../../../../../src/api/http-utils.js';
import { assertAcceptedUploadSize } from '../../../../../../src/uploads/upload-policy.js';
import { executeBackend, toNextResponse } from '../../../_lib/adapter';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sampleId: string }> }
) {
  try {
    const params = await context.params;
    const formData = await request.formData();

    const fileValue = formData.get('file');
    const kindValue = formData.get('kind');
    const mimeTypeValue = formData.get('mimeType');
    const originalFileNameValue = formData.get('originalFileName');
    const replaceExistingValue = formData.get('replaceExisting');

    let fileBuffer: Buffer | null = null;
    let mimeType: string | null = null;
    let originalFileName: string | null = null;
    let replaceExisting: boolean | undefined;
    let kind: string | null = null;

    if (fileValue instanceof File) {
      assertAcceptedUploadSize(fileValue.size, {
        fieldLabel: 'Sample photo',
      });
      const bytes = await fileValue.arrayBuffer();
      fileBuffer = Buffer.from(bytes);
      mimeType = fileValue.type || null;
      originalFileName = fileValue.name || null;
    }

    if (typeof mimeTypeValue === 'string' && mimeTypeValue.length > 0) {
      mimeType = mimeTypeValue;
    }

    if (typeof originalFileNameValue === 'string' && originalFileNameValue.length > 0) {
      originalFileName = originalFileNameValue;
    }

    if (typeof kindValue === 'string' && kindValue.length > 0) {
      kind = kindValue;
    }

    if (typeof replaceExistingValue === 'string') {
      const normalized = replaceExistingValue.toLowerCase();
      if (normalized === 'true') {
        replaceExisting = true;
      } else if (normalized === 'false') {
        replaceExisting = false;
      }
    }

    return executeBackend('addLabelPhoto', request, {
      params: { sampleId: params.sampleId },
      body: {
        fileBuffer,
        kind,
        mimeType,
        originalFileName,
        replaceExisting,
      },
    });
  } catch (error) {
    return toNextResponse(toHttpErrorResponse(error));
  }
}
