import { NextRequest } from 'next/server';

import { toHttpErrorResponse } from '../../../../../src/api/http-utils.js';
import { executeBackend, readJsonBody, toNextResponse } from '../../_lib/adapter';

// Liga A3.1: POST /api/v1/samples/blends — cria uma liga (Sample com
// isBlend=true) a partir de N amostras-origem. Ver Liga F1.D + Wave A2.2.
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    return executeBackend('createBlend', request, { body });
  } catch (error) {
    return toNextResponse(toHttpErrorResponse(error));
  }
}
