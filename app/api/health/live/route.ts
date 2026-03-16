import { createLivenessResponse } from '../_lib/runtime-health';

export async function GET() {
  return createLivenessResponse();
}
