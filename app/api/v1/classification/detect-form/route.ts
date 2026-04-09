import { NextRequest } from 'next/server';
import { toHttpErrorResponse } from '../../../../../src/api/http-utils.js';
import { assertAcceptedUploadSize } from '../../../../../src/uploads/upload-policy.js';
import { executeBackend, toNextResponse } from '../../_lib/adapter';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const fileValue = formData.get('file');
    let fileBuffer: Buffer | null = null;
    let mimeType: string | null = null;
    let originalFileName: string | null = null;

    if (fileValue instanceof File) {
      assertAcceptedUploadSize(fileValue.size, { fieldLabel: 'Classification photo' });
      const bytes = await fileValue.arrayBuffer();
      fileBuffer = Buffer.from(bytes);
      mimeType = fileValue.type || null;
      originalFileName = fileValue.name || null;
    }

    return executeBackend('detectClassificationForm', request, {
      body: {
        fileBuffer,
        mimeType,
        originalFileName,
      },
    });
  } catch (error) {
    return toNextResponse(toHttpErrorResponse(error));
  }
}
