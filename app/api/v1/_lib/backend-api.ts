import { createBackendApiV1FromEnv } from '../../../../src/api/v1/index.js';

type BackendApi = ReturnType<typeof createBackendApiV1FromEnv>;

let backendApiSingleton: BackendApi | null = null;

export function getBackendApi(): BackendApi {
  if (!backendApiSingleton) {
    backendApiSingleton = createBackendApiV1FromEnv();
  }
  return backendApiSingleton;
}
