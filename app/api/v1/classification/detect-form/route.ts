import { NextRequest } from 'next/server';
import { HttpError } from '../../../../../src/contracts/errors.js';
import { toHttpErrorResponse } from '../../../../../src/api/http-utils.js';
import { assertAcceptedUploadSize } from '../../../../../src/uploads/upload-policy.js';
import { executeBackend, toNextResponse } from '../../_lib/adapter';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.startsWith('multipart/form-data')) {
      throw new HttpError(415, 'Body deve ser multipart/form-data');
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new HttpError(422, 'Body multipart/form-data invalido');
    }

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
