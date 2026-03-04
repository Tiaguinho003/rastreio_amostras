export type UserRole = 'ADMIN' | 'CLASSIFIER';
export type UpdateReasonCode = 'DATA_FIX' | 'TYPO' | 'MISSING_INFO' | 'OTHER';
export type InvalidateReasonCode = 'DUPLICATE' | 'WRONG_SAMPLE' | 'DAMAGED' | 'CANCELLED' | 'OTHER';

export type SampleStatus =
  | 'PHYSICAL_RECEIVED'
  | 'REGISTRATION_IN_PROGRESS'
  | 'REGISTRATION_CONFIRMED'
  | 'QR_PENDING_PRINT'
  | 'QR_PRINTED'
  | 'CLASSIFICATION_IN_PROGRESS'
  | 'CLASSIFIED'
  | 'INVALIDATED';

export type SampleExportField =
  | 'internalLotNumber'
  | 'owner'
  | 'sacks'
  | 'harvest'
  | 'originLot'
  | 'classificationDate'
  | 'padrao'
  | 'catacao'
  | 'aspecto'
  | 'bebida'
  | 'broca'
  | 'pva'
  | 'imp'
  | 'defeito'
  | 'umidade'
  | 'aspectoCor'
  | 'classificador'
  | 'observacoes'
  | 'classificationOriginLot'
  | 'peneirasPercentuais'
  | 'technicalType'
  | 'technicalScreen'
  | 'technicalDensity';

export type SampleExportType = 'COMPLETO' | 'COMPRADOR_PARCIAL';

export interface SessionUser {
  id: string;
  username: string;
  role: UserRole;
  displayName: string | null;
}

export interface SessionData {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: string;
  user: SessionUser;
}

export interface SampleSnapshot {
  id: string;
  internalLotNumber: string | null;
  status: SampleStatus;
  version: number;
  lastEventSequence: number;
  declared: {
    owner: string | null;
    sacks: number | null;
    harvest: string | null;
    originLot: string | null;
  };
  labelPhotoCount: number;
  latestClassification: {
    version: number | null;
    data: Record<string, unknown> | null;
    technical: {
      type: string | null;
      screen: string | null;
      defectsCount: number | null;
      moisture: number | null;
      density: number | null;
      colorAspect: string | null;
      notes: string | null;
    };
  };
  classificationDraft: {
    snapshot: Record<string, unknown> | null;
    completionPercent: number | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SampleAttachment {
  id: string;
  sampleId: string;
  kind: 'ARRIVAL_PHOTO' | 'CLASSIFICATION_PHOTO';
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  checksumSha256: string | null;
  createdAt: string;
}

export interface SampleEvent {
  eventId: string;
  eventType: string;
  sampleId: string;
  sequenceNumber: number;
  occurredAt: string;
  actorType: 'USER' | 'SYSTEM';
  actorUserId: string | null;
  source: 'web' | 'api' | 'worker';
  schemaVersion: number;
  payload: Record<string, unknown>;
  requestId: string;
  correlationId: string | null;
  causationId: string | null;
  idempotencyScope?: string;
  idempotencyKey?: string;
  fromStatus: SampleStatus | null;
  toStatus: SampleStatus | null;
  metadata: {
    module: 'registration' | 'classification' | 'print' | 'ocr';
    ip: string | null;
    userAgent: string | null;
  };
}

export interface SampleDetailResponse {
  sample: SampleSnapshot;
  attachments: SampleAttachment[];
  events: SampleEvent[];
}

export interface ListSamplesResponse {
  items: SampleSnapshot[];
  page: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface DashboardPendingResponse {
  pendingCounts: {
    PHYSICAL_RECEIVED: number;
    REGISTRATION_IN_PROGRESS: number;
    QR_PENDING_PRINT: number;
    CLASSIFICATION_IN_PROGRESS: number;
  };
  totalPending: number;
  todayReceivedTotal: number;
  oldestPending: SampleSnapshot[];
  printPending: {
    counts: {
      REGISTRATION_CONFIRMED: number;
      QR_PENDING_PRINT: number;
    };
    total: number;
    items: SampleSnapshot[];
  };
  classificationPending: {
    counts: {
      QR_PRINTED: number;
    };
    total: number;
    items: SampleSnapshot[];
  };
  classificationInProgress: {
    counts: {
      CLASSIFICATION_IN_PROGRESS: number;
    };
    total: number;
    items: SampleSnapshot[];
  };
  latestRegistrations: {
    total: number;
    items: SampleSnapshot[];
  };
}

export interface ResolveSampleByQrResponse {
  query: string;
  sample: {
    id: string;
    internalLotNumber: string | null;
    status: SampleStatus;
  };
  redirectPath: string;
}

export interface SampleEventsResponse {
  sampleId: string;
  events: SampleEvent[];
}

export interface CommandResponse<TSample = unknown> {
  statusCode: number;
  idempotent: boolean;
  sample?: TSample;
  event: SampleEvent;
  photo?: {
    attachmentId: string;
    kind: 'ARRIVAL_PHOTO' | 'CLASSIFICATION_PHOTO';
    storagePath: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: number;
    checksumSha256: string;
  };
}

export interface CreateSampleAndPreparePrintResponse {
  statusCode: number;
  idempotent: boolean;
  event: SampleEvent | null;
  sample: SampleSnapshot;
  draft: {
    clientDraftId: string;
    sampleId: string;
  };
  qr: {
    value: string;
    internalLotNumber: string | null;
    status: SampleStatus;
  };
}
