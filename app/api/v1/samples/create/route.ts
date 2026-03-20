import { NextRequest } from 'next/server';

import { toHttpErrorResponse } from '../../../../../src/api/http-utils.js';
import { assertAcceptedUploadSize } from '../../../../../src/uploads/upload-policy.js';
import { executeBackend, readJsonBody, toNextResponse } from '../../_lib/adapter';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const arrivalPhoto = formData.get('arrivalPhoto');

      let arrivalPhotoFileBuffer: Buffer | null = null;
      let arrivalPhotoMimeType: string | null = null;
      let arrivalPhotoOriginalFileName: string | null = null;

      if (arrivalPhoto instanceof File) {
        assertAcceptedUploadSize(arrivalPhoto.size, {
          fieldLabel: 'Arrival photo'
        });
        const bytes = await arrivalPhoto.arrayBuffer();
        arrivalPhotoFileBuffer = Buffer.from(bytes);
        arrivalPhotoMimeType = arrivalPhoto.type || null;
        arrivalPhotoOriginalFileName = arrivalPhoto.name || null;
      }

      const body = {
        clientDraftId: formData.get('clientDraftId'),
        owner: formData.get('owner'),
        ownerClientId: formData.get('ownerClientId'),
        ownerRegistrationId: formData.get('ownerRegistrationId'),
        sacks: formData.get('sacks'),
        harvest: formData.get('harvest'),
        originLot: formData.get('originLot'),
        receivedChannel: formData.get('receivedChannel'),
        notes: formData.get('notes'),
        printerId: formData.get('printerId'),
        arrivalPhotoFileBuffer,
        arrivalPhotoMimeType,
        arrivalPhotoOriginalFileName
      };

      return executeBackend('createSampleAndPreparePrint', request, { body });
    }

    const body = await readJsonBody(request);
    return executeBackend('createSampleAndPreparePrint', request, { body });
  } catch (error) {
    return toNextResponse(toHttpErrorResponse(error));
  }
}
