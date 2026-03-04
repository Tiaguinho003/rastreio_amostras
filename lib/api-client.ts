import type {
  CommandResponse,
  CreateSampleAndPreparePrintResponse,
  DashboardPendingResponse,
  InvalidateReasonCode,
  ListSamplesResponse,
  ResolveSampleByQrResponse,
  SampleDetailResponse,
  SampleEventsResponse,
  UpdateReasonCode,
  SessionData,
  SampleExportType
} from './types';

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const API_BASE = '/api/v1';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];
type PhotoKind = 'ARRIVAL_PHOTO' | 'CLASSIFICATION_PHOTO';

async function parseJsonSafe(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = (await response.json()) as Record<string, unknown>;
    return parsed;
  } catch {
    return {};
  }
}

async function request<TResponse>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: JsonValue;
    session?: SessionData | null;
    formData?: FormData;
  } = {}
): Promise<TResponse> {
  const { method = 'GET', body, session, formData } = options;

  const headers: HeadersInit = {};
  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  let finalBody: BodyInit | undefined;
  if (formData) {
    finalBody = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    finalBody = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: finalBody,
    cache: 'no-store'
  });

  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    const maybeError = payload.error as { message?: string; details?: unknown } | undefined;
    throw new ApiError(response.status, maybeError?.message ?? 'Request failed', maybeError?.details ?? null);
  }

  return payload as TResponse;
}

function parseFileNameFromContentDisposition(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const utf8Match = value.match(/filename\\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).replace(/\"/g, '').trim();
    } catch {
      return utf8Match[1].replace(/\"/g, '').trim() || null;
    }
  }

  const classicMatch = value.match(/filename=\"?([^\";]+)\"?/i);
  if (classicMatch?.[1]) {
    return classicMatch[1].trim() || null;
  }

  return null;
}

export function login(username: string, password: string) {
  return request<SessionData>('/auth/login', {
    method: 'POST',
    body: { username, password }
  });
}

export function getDashboardPending(session: SessionData) {
  return request<DashboardPendingResponse>('/dashboard/pending', {
    method: 'GET',
    session
  });
}

export function listSamples(session: SessionData, query: { status?: string; limit?: number; offset?: number } = {}) {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  if (typeof query.offset === 'number') params.set('offset', String(query.offset));

  const suffix = params.size ? `?${params.toString()}` : '';
  return request<ListSamplesResponse>(`/samples${suffix}`, {
    method: 'GET',
    session
  });
}

export function receiveSample(
  session: SessionData,
  data: { sampleId?: string; receivedChannel: 'in_person' | 'courier' | 'driver' | 'other'; notes?: string | null }
) {
  return request<CommandResponse>('/samples/receive', {
    method: 'POST',
    session,
    body: data
  });
}

export function createSampleAndPreparePrint(
  session: SessionData,
  data: {
    clientDraftId: string;
    owner: string;
    sacks: number;
    harvest: string;
    originLot: string;
    receivedChannel?: 'in_person' | 'courier' | 'driver' | 'other';
    notes?: string | null;
    printerId?: string | null;
    arrivalPhoto?: File | null;
  }
) {
  if (data.arrivalPhoto) {
    const formData = new FormData();
    formData.append('clientDraftId', data.clientDraftId);
    formData.append('owner', data.owner);
    formData.append('sacks', String(data.sacks));
    formData.append('harvest', data.harvest);
    formData.append('originLot', data.originLot);
    formData.append('receivedChannel', data.receivedChannel ?? 'in_person');

    if (data.notes !== undefined && data.notes !== null) {
      formData.append('notes', data.notes);
    }
    if (data.printerId !== undefined && data.printerId !== null) {
      formData.append('printerId', data.printerId);
    }

    formData.append('arrivalPhoto', data.arrivalPhoto);

    return request<CreateSampleAndPreparePrintResponse>('/samples/create', {
      method: 'POST',
      session,
      formData
    });
  }

  return request<CreateSampleAndPreparePrintResponse>('/samples/create', {
    method: 'POST',
    session,
    body: {
      clientDraftId: data.clientDraftId,
      owner: data.owner,
      sacks: data.sacks,
      harvest: data.harvest,
      originLot: data.originLot,
      receivedChannel: data.receivedChannel ?? 'in_person',
      notes: data.notes ?? null,
      printerId: data.printerId ?? null
    }
  });
}

export function startRegistration(session: SessionData, sampleId: string, expectedVersion: number, notes?: string | null) {
  return request<CommandResponse>(`/samples/${sampleId}/registration/start`, {
    method: 'POST',
    session,
    body: {
      expectedVersion,
      notes: notes ?? null
    }
  });
}

export function getSampleDetail(session: SessionData, sampleId: string) {
  return request<SampleDetailResponse>(`/samples/${sampleId}`, {
    method: 'GET',
    session
  });
}

export async function exportSamplePdf(
  session: SessionData,
  sampleId: string,
  data: {
    exportType: SampleExportType;
    destination?: string | null;
  }
) {
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };

  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  const response = await fetch(`${API_BASE}/samples/${sampleId}/export/pdf`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      exportType: data.exportType,
      destination: data.destination ?? null
    }),
    cache: 'no-store'
  });

  if (!response.ok) {
    const payload = await parseJsonSafe(response);
    const maybeError = payload.error as { message?: string; details?: unknown } | undefined;
    throw new ApiError(response.status, maybeError?.message ?? 'Request failed', maybeError?.details ?? null);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get('content-disposition');
  const parsedName = parseFileNameFromContentDisposition(contentDisposition);
  const fileName = parsedName || 'amostra.pdf';

  return {
    blob,
    fileName
  };
}

export function resolveSampleByQr(session: SessionData, qrContent: string) {
  const params = new URLSearchParams();
  params.set('qr', qrContent);

  return request<ResolveSampleByQrResponse>(`/samples/resolve?${params.toString()}`, {
    method: 'GET',
    session
  });
}

export function uploadSamplePhoto(
  session: SessionData,
  sampleId: string,
  file: File,
  options: {
    kind: PhotoKind;
    replaceExisting?: boolean;
  }
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('kind', options.kind);
  formData.append('replaceExisting', String(options.replaceExisting ?? true));
  return request<CommandResponse>(`/samples/${sampleId}/photos`, {
    method: 'POST',
    session,
    formData
  });
}

export function uploadLabelPhoto(session: SessionData, sampleId: string, file: File, replaceExisting = true) {
  return uploadSamplePhoto(session, sampleId, file, {
    kind: 'ARRIVAL_PHOTO',
    replaceExisting
  });
}

export function uploadClassificationPhoto(session: SessionData, sampleId: string, file: File, replaceExisting = true) {
  return uploadSamplePhoto(session, sampleId, file, {
    kind: 'CLASSIFICATION_PHOTO',
    replaceExisting
  });
}

export function confirmRegistration(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    declared: {
      owner: string;
      sacks: number;
      harvest: string;
      originLot: string;
    };
  }
) {
  return request<CommandResponse>(`/samples/${sampleId}/registration/confirm`, {
    method: 'POST',
    session,
    body: {
      expectedVersion: data.expectedVersion,
      declared: data.declared,
      ocr: {
        provider: 'LOCAL',
        overallConfidence: 0,
        fieldConfidence: {
          owner: 0,
          sacks: 0,
          harvest: 0,
          originLot: 0
        },
        rawTextRef: null
      }
    }
  });
}

export function requestQrPrint(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    attemptNumber: number;
    printerId?: string | null;
  }
) {
  return request<CommandResponse>(`/samples/${sampleId}/qr/print/request`, {
    method: 'POST',
    session,
    body: {
      expectedVersion: data.expectedVersion,
      attemptNumber: data.attemptNumber,
      printerId: data.printerId ?? null
    }
  });
}

export function requestQrReprint(
  session: SessionData,
  sampleId: string,
  data: {
    attemptNumber?: number;
    printerId?: string | null;
    reasonText?: string | null;
    idempotencyKey?: string;
  }
) {
  const body: { [key: string]: JsonValue } = {};

  if (typeof data.attemptNumber === 'number') {
    body.attemptNumber = data.attemptNumber;
  }

  body.printerId = data.printerId ?? null;
  body.reasonText = data.reasonText ?? null;

  if (typeof data.idempotencyKey === 'string' && data.idempotencyKey.length > 0) {
    body.idempotencyKey = data.idempotencyKey;
  }

  return request<CommandResponse>(`/samples/${sampleId}/qr/reprint/request`, {
    method: 'POST',
    session,
    body
  });
}

export function recordQrPrintFailed(
  session: SessionData,
  sampleId: string,
  data: {
    attemptNumber: number;
    printerId?: string | null;
    error: string;
    printAction?: 'PRINT' | 'REPRINT';
  }
) {
  return request<CommandResponse>(`/samples/${sampleId}/qr/print/failed`, {
    method: 'POST',
    session,
    body: {
      printAction: data.printAction ?? 'PRINT',
      attemptNumber: data.attemptNumber,
      printerId: data.printerId ?? null,
      error: data.error
    }
  });
}

export function recordQrPrinted(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    attemptNumber: number;
    printerId?: string | null;
    printAction?: 'PRINT' | 'REPRINT';
  }
) {
  return request<CommandResponse>(`/samples/${sampleId}/qr/printed`, {
    method: 'POST',
    session,
    body: {
      expectedVersion: data.expectedVersion,
      printAction: data.printAction ?? 'PRINT',
      attemptNumber: data.attemptNumber,
      printerId: data.printerId ?? null
    }
  });
}

export function startClassification(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    classificationId?: string | null;
    notes?: string | null;
  }
) {
  return request<CommandResponse>(`/samples/${sampleId}/classification/start`, {
    method: 'POST',
    session,
    body: {
      expectedVersion: data.expectedVersion,
      classificationId: data.classificationId ?? null,
      notes: data.notes ?? null
    }
  });
}

export function saveClassificationPartial(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    snapshotPartial: { [key: string]: JsonValue };
    completionPercent?: number;
  }
) {
  const body: { [key: string]: JsonValue } = {
    expectedVersion: data.expectedVersion,
    snapshotPartial: data.snapshotPartial
  };

  if (data.completionPercent !== undefined) {
    body.completionPercent = data.completionPercent;
  }

  return request<CommandResponse>(`/samples/${sampleId}/classification/partial`, {
    method: 'POST',
    session,
    body
  });
}

export function completeClassification(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    technical?: {
      type?: string;
      screen?: string;
      defectsCount?: number;
      moisture?: number;
      density?: number | null;
      colorAspect?: string | null;
      notes?: string | null;
    };
    classificationData?: {
      dataClassificacao?: string | null;
      padrao?: string | null;
      catacao?: string | null;
      aspecto?: string | null;
      bebida?: string | null;
      broca?: number | null;
      pva?: number | null;
      imp?: number | null;
      classificador?: string | null;
      peneirasPercentuais?: {
        p18?: number | null;
        p17?: number | null;
        p16?: number | null;
        mk?: number | null;
        p15?: number | null;
        p14?: number | null;
        p13?: number | null;
        p10?: number | null;
        fundo?: number | null;
      } | null;
      defeito?: number | null;
      umidade?: number | null;
      aspectoCor?: string | null;
      observacoes?: string | null;
      loteOrigem?: string | null;
    };
    consumptionGrams?: number | null;
    classificationVersion?: number;
    classifierUserId?: string | null;
    classifierName?: string | null;
    idempotencyKey?: string;
  }
) {
  const body: { [key: string]: JsonValue } = {
    expectedVersion: data.expectedVersion
  };

  if (data.technical) {
    body.technical = data.technical;
  }

  if (data.classificationData) {
    body.classificationData = data.classificationData;
  }

  if (data.consumptionGrams !== undefined) {
    body.consumptionGrams = data.consumptionGrams;
  }

  if (typeof data.classificationVersion === 'number') {
    body.classificationVersion = data.classificationVersion;
  }

  if (typeof data.classifierUserId === 'string' || data.classifierUserId === null) {
    body.classifierUserId = data.classifierUserId;
  }

  if (typeof data.classifierName === 'string' || data.classifierName === null) {
    body.classifierName = data.classifierName;
  }

  if (typeof data.idempotencyKey === 'string' && data.idempotencyKey.length > 0) {
    body.idempotencyKey = data.idempotencyKey;
  }

  return request<CommandResponse>(`/samples/${sampleId}/classification/complete`, {
    method: 'POST',
    session,
    body
  });
}

export function updateRegistration(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    after: { [key: string]: JsonValue };
    reasonCode: UpdateReasonCode;
    reasonText: string;
    before?: { [key: string]: JsonValue };
  }
) {
  const body: { [key: string]: JsonValue } = {
    expectedVersion: data.expectedVersion,
    after: data.after,
    reasonCode: data.reasonCode,
    reasonText: data.reasonText
  };

  if (data.before) {
    body.before = data.before;
  }

  return request<CommandResponse>(`/samples/${sampleId}/registration/update`, {
    method: 'POST',
    session,
    body
  });
}

export function updateClassification(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    after: { [key: string]: JsonValue };
    reasonCode: UpdateReasonCode;
    reasonText: string;
    before?: { [key: string]: JsonValue };
  }
) {
  const body: { [key: string]: JsonValue } = {
    expectedVersion: data.expectedVersion,
    after: data.after,
    reasonCode: data.reasonCode,
    reasonText: data.reasonText
  };

  if (data.before) {
    body.before = data.before;
  }

  return request<CommandResponse>(`/samples/${sampleId}/classification/update`, {
    method: 'POST',
    session,
    body
  });
}

export function revertSampleUpdate(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    targetEventId: string;
    reasonCode: UpdateReasonCode;
    reasonText: string;
  }
) {
  return request<CommandResponse>(`/samples/${sampleId}/edits/revert`, {
    method: 'POST',
    session,
    body: {
      expectedVersion: data.expectedVersion,
      targetEventId: data.targetEventId,
      reasonCode: data.reasonCode,
      reasonText: data.reasonText
    }
  });
}

export function invalidateSample(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    reasonCode: InvalidateReasonCode;
    reasonText: string;
    idempotencyKey?: string;
  }
) {
  const body: { [key: string]: JsonValue } = {
    expectedVersion: data.expectedVersion,
    reasonCode: data.reasonCode,
    reasonText: data.reasonText
  };

  if (typeof data.idempotencyKey === 'string' && data.idempotencyKey.length > 0) {
    body.idempotencyKey = data.idempotencyKey;
  }

  return request<CommandResponse>(`/samples/${sampleId}/invalidate`, {
    method: 'POST',
    session,
    body
  });
}

export function listSampleEvents(
  session: SessionData,
  sampleId: string,
  query: { limit?: number; afterSequence?: number } = {}
) {
  const params = new URLSearchParams();
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  if (typeof query.afterSequence === 'number') params.set('afterSequence', String(query.afterSequence));

  const suffix = params.size ? `?${params.toString()}` : '';
  return request<SampleEventsResponse>(`/samples/${sampleId}/events${suffix}`, {
    method: 'GET',
    session
  });
}
