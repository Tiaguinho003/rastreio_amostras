import { NextRequest } from 'next/server';

import { toHttpErrorResponse } from '../../../../../src/api/http-utils.js';
import { executeBackend, readJsonBody, toNextResponse } from '../../_lib/adapter';

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    return executeBackend('createSampleAndPreparePrint', request, { body });
  } catch (error) {
    return toNextResponse(toHttpErrorResponse(error));
  }
}
