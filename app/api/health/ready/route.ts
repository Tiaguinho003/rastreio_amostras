import { createReadinessResponse } from '../_lib/runtime-health';

export async function GET() {
  return createReadinessResponse();
}
