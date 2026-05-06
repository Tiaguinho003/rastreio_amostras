export type UserRole = 'ADMIN' | 'CLASSIFIER' | 'REGISTRATION' | 'COMMERCIAL';
export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface ClassifierSnapshot {
  id: string;
  fullName: string;
  username: string;
}

export interface UserLookupItem {
  id: string;
  fullName: string;
  username: string;
  role?: UserRole;
}

export interface UserLookupResponse {
  items: UserLookupItem[];
}
export type InitialPasswordDecision = 'PENDING' | 'KEPT' | 'CHANGED';
export type UpdateReasonCode = 'DATA_FIX' | 'TYPO' | 'MISSING_INFO' | 'OTHER';
export type InvalidateReasonCode = 'DUPLICATE' | 'WRONG_SAMPLE' | 'DAMAGED' | 'CANCELLED' | 'OTHER';
export type ClassificationType = 'PREPARADO' | 'LOW_CAFF' | 'BICA';
export type ClientPersonType = 'PF' | 'PJ';
export type ClientStatus = 'ACTIVE' | 'INACTIVE';
export type ClientUnitStatus = 'ACTIVE' | 'INACTIVE';
export type ClientLookupKind = 'owner' | 'buyer' | 'any';
// L5: enum reduzido a 8 valores. Audit de unit usa CLIENT_UNIT_*.
export type ClientAuditEventType =
  | 'CLIENT_CREATED'
  | 'CLIENT_UPDATED'
  | 'CLIENT_INACTIVATED'
  | 'CLIENT_REACTIVATED'
  | 'CLIENT_UNIT_CREATED'
  | 'CLIENT_UNIT_UPDATED'
  | 'CLIENT_UNIT_INACTIVATED'
  | 'CLIENT_UNIT_REACTIVATED';

export type SampleStatus =
  | 'PHYSICAL_RECEIVED'
  | 'REGISTRATION_IN_PROGRESS'
  | 'REGISTRATION_CONFIRMED'
  | 'QR_PENDING_PRINT'
  | 'QR_PRINTED'
  | 'CLASSIFICATION_IN_PROGRESS'
  | 'CLASSIFIED'
  | 'INVALIDATED';

export type CommercialStatus = 'OPEN' | 'PARTIALLY_SOLD' | 'SOLD' | 'LOST';
export type PrintAction = 'PRINT' | 'REPRINT';
export type PrintJobStatus = 'PENDING' | 'SUCCESS' | 'FAILED';
export type SampleMovementType = 'SALE' | 'LOSS';
export type SampleMovementStatus = 'ACTIVE' | 'CANCELLED';

export type SampleExportType = 'COMPLETO' | 'COMPRADOR_PARCIAL';

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  initialPasswordDecision: InitialPasswordDecision;
  pendingEmailChange?: PendingEmailChange | null;
}

export interface SessionData {
  expiresAt: string;
  sessionId: string;
  user: SessionUser;
}

export interface PendingEmailChange {
  requestId: string | null;
  newEmail: string;
  expiresAt: string;
}

export interface UserSummary {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  initialPasswordDecision: InitialPasswordDecision;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
  pendingEmailChange: PendingEmailChange | null;
}

export interface UserResponse {
  user: UserSummary;
}

export interface UserMutationResponse extends UserResponse {
  sessionRevoked?: boolean;
}

export interface UserPasswordMutationResponse extends UserResponse {
  generatedPassword: string;
}

export interface UsersListResponse {
  items: UserSummary[];
  page: {
    limit: number;
    page: number;
    offset: number;
    total: number;
    totalPages: number;
    hasPrev: boolean;
    hasNext: boolean;
  };
}

export interface UserAuditEventResponse {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  reasonText: string | null;
  createdAt: string;
  actorUser: {
    id: string;
    fullName: string;
    username: string;
  } | null;
  targetUser: {
    id: string;
    fullName: string;
    username: string;
  } | null;
  metadata: {
    ip: string | null;
    userAgent: string | null;
  };
}

export interface UserAuditListResponse {
  items: UserAuditEventResponse[];
  page: {
    limit: number;
    page: number;
    offset: number;
    total: number;
    totalPages: number;
    hasPrev: boolean;
    hasNext: boolean;
  };
}

export interface ClientSummary {
  id: string;
  code: number;
  personType: ClientPersonType;
  displayName: string | null;
  fullName: string | null;
  legalName: string | null;
  tradeName: string | null;
  cpf: string | null;
  cnpj: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  // L5: PJ guarda endereco/IE direto no Client.
  addressLine: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  complement: string | null;
  registrationNumber: string | null;
  isBuyer: boolean;
  isSeller: boolean;
  status: ClientStatus;
  commercialUser: { id: string; fullName: string } | null;
  commercialUsers: { id: string; fullName: string }[];
  units: ClientUnitSummary[];
  unitCount: number;
  activeUnitCount: number;
  primaryCity: string | null;
  primaryState: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ClientUnitSummary {
  id: string;
  clientId: string;
  name: string | null;
  code: number;
  cnpj: string | null;
  legalName: string | null;
  tradeName: string | null;
  phone: string | null;
  addressLine: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  complement: string | null;
  registrationNumber: string | null;
  car: string | null;
  status: ClientUnitStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

// L5: ClientUnitInput so e aceito em createClient.units[] de PF
// e em POST /clients/:id/units (apenas PF).
// PJ NAO aceita units; backend rejeita com 422 CLIENT_PJ_HAS_NO_UNITS.
export interface ClientUnitInput {
  name: string;
  cnpj?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  phone?: string | null;
  addressLine?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  complement?: string | null;
  registrationNumber?: string | null;
  car?: string | null;
}

export interface ClientResponse {
  client: ClientSummary;
}

export interface ClientsListResponse {
  items: ClientSummary[];
  page: {
    limit: number;
    total: number;
    incompleteTotal: number;
    nextCursor: { displayName: string; id: string } | null;
  };
}

export interface ClientLookupResponse {
  items: ClientSummary[];
  // L5: smart resolve por 14 digitos pode bater em Client (PJ) ou ClientUnit
  // (filial PF). Quando o match e via unit, a UI destaca essa linha.
  matchedUnitId?: string | null;
}

export interface ClientDetailResponse extends ClientResponse {
  units: ClientUnitSummary[];
  // 14.7.D: agregado de lotes em aberto do cliente. count = numero de
  // samples nao invalidadas com commercialStatus OPEN/PARTIALLY_SOLD;
  // sacks = soma de declaredSacks desses lotes.
  openLots: {
    count: number;
    sacks: number;
  };
}

export interface ClientUnitMutationResponse {
  client: {
    id: string;
    code: number;
    displayName: string | null;
  };
  unit: ClientUnitSummary;
}

// L5: inactivateUnit nao tem auto-promote. PJ nao aceita units.
export interface ClientUnitInactivateResponse extends ClientUnitMutationResponse {
  impact: {
    linkedSamples: number;
    linkedMovements: number;
  };
}

export interface ClientCommercialSummaryResponse {
  openCount: number;
  soldCount: number;
  lostCount: number;
  boughtCount: number;
}

export interface ClientSampleListItem {
  id: string;
  internalLotNumber: string | null;
  declaredSacks: number;
  declaredHarvest: string | null;
  createdAt: string | null;
  commercialStatus: string;
  status: string;
}

export interface ClientPurchaseListItem {
  id: string;
  sampleId: string;
  sampleLotNumber: string | null;
  sellerName: string | null;
  quantitySacks: number;
  movementDate: string | null;
  commercialStatus: string | null;
  status: string | null;
}

export interface ClientPagedListPage {
  limit: number;
  page: number;
  offset: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export interface ClientSamplesListResponse {
  items: ClientSampleListItem[];
  page: ClientPagedListPage;
}

export interface ClientPurchasesListResponse {
  items: ClientPurchaseListItem[];
  page: ClientPagedListPage;
}

export interface ClientAuditEventResponse {
  eventId: string;
  eventType: ClientAuditEventType | string;
  payload: Record<string, unknown>;
  reasonText: string | null;
  createdAt: string | null;
  actorUser: {
    id: string;
    fullName: string;
    username: string;
  } | null;
  targetClient: {
    id: string;
    code: number;
    displayName: string | null;
    status: ClientStatus;
    personType: ClientPersonType;
  } | null;
  targetUnit: {
    id: string;
    name: string | null;
    code: number;
    cnpj: string | null;
    legalName: string | null;
    status: ClientUnitStatus;
  } | null;
  metadata: {
    ip: string | null;
    userAgent: string | null;
  };
}

export interface ClientAuditListResponse {
  items: ClientAuditEventResponse[];
  page: {
    limit: number;
    page: number;
    offset: number;
    total: number;
    totalPages: number;
    hasPrev: boolean;
    hasNext: boolean;
  };
}

export interface PasswordResetRequestResponse {
  resetRequest: {
    requestId: string;
    expiresAt: string;
    resendAvailableAt: string;
  };
}

export interface PasswordResetCodeVerificationResponse {
  verification: {
    verified: true;
  };
}

export interface SampleSnapshot {
  id: string;
  internalLotNumber: string | null;
  classificationType: ClassificationType | null;
  status: SampleStatus;
  commercialStatus: CommercialStatus;
  version: number;
  lastEventSequence: number;
  ownerClientId?: string | null;
  ownerUnitId?: string | null;
  declared: {
    owner: string | null;
    sacks: number | null;
    harvest: string | null;
    originLot: string | null;
    location: string | null;
  };
  ownerClient?: {
    id: string;
    code: number;
    personType: ClientPersonType;
    displayName: string | null;
    fullName: string | null;
    legalName: string | null;
    tradeName: string | null;
    cpf: string | null;
    cnpj: string | null;
    phone: string | null;
    isBuyer: boolean;
    isSeller: boolean;
    status: ClientStatus;
  } | null;
  ownerUnit?: ClientUnitSummary | null;
  soldSacks?: number;
  lostSacks?: number;
  availableSacks?: number | null;
  latestClassification: {
    version: number | null;
    data: Record<string, unknown> | null;
    technical: {
      type: string | null;
      screen: string | null;
      defectsCount: number | null;
      density: number | null;
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
  kind: 'CLASSIFICATION_PHOTO';
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
    module: 'registration' | 'classification' | 'print' | 'commercial';
    ip: string | null;
    userAgent: string | null;
  };
}

export interface LatestPrintJob {
  jobId: string;
  printAction: PrintAction;
  attemptNumber: number;
  status: PrintJobStatus;
  printerId: string | null;
  error: string | null;
  createdAt: string;
}

export interface SampleDetailResponse {
  sample: SampleSnapshot;
  attachments: SampleAttachment[];
  events: SampleEvent[];
  movements?: SampleMovement[];
  latestPrintJob: LatestPrintJob | null;
}

export interface SampleMovement {
  id: string;
  sampleId: string;
  movementType: SampleMovementType;
  status: SampleMovementStatus;
  buyerClientId: string | null;
  buyerUnitId: string | null;
  quantitySacks: number;
  movementDate: string;
  notes: string | null;
  lossReasonText: string | null;
  buyerClientSnapshot: Record<string, unknown> | null;
  buyerUnitSnapshot: Record<string, unknown> | null;
  version: number;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  buyerClient: SampleSnapshot['ownerClient'] | null;
  buyerUnit: ClientUnitSummary | null;
}

export interface SampleMovementsResponse {
  sampleId: string;
  movements: SampleMovement[];
}

export interface ListSamplesResponse {
  items: SampleSnapshot[];
  page: {
    limit: number;
    page: number | null;
    offset: number | null;
    total: number;
    totalPages: number;
    hasPrev: boolean;
    hasNext: boolean;
    nextCursor: { createdAt: string; id: string } | null;
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
}

export interface DashboardSalesAvailabilityResponse {
  total: number;
  classifiedToday: number;
  bands: {
    over30: number;
    from15to30: number;
    under15: number;
  };
}

export interface DashboardOperationalMetricsResponse {
  overall: number | null;
  meta: number;
  sampleCount: number;
  buckets: Array<{
    date: string;
    value: number;
    count: number;
  }>;
}

export type DashboardRecentActivityType =
  | 'REGISTRATION_CONFIRMED'
  | 'SALE_CREATED'
  | 'LOSS_RECORDED'
  | 'PHYSICAL_SAMPLE_SENT';

export interface DashboardRecentActivityItem {
  sampleId: string;
  internalLotNumber: string | null;
  producer: string | null;
  sacks: number | null;
  recipient: string | null;
  activity: {
    type: DashboardRecentActivityType;
    at: string;
  };
}

export interface DashboardRecentActivityResponse {
  items: DashboardRecentActivityItem[];
}

export interface ResolveSampleByQrResponse {
  query: string;
  sample: {
    id: string;
    internalLotNumber: string | null;
    status: SampleStatus;
    commercialStatus: CommercialStatus;
    declared: {
      owner: string | null;
      sacks: number | null;
      harvest: string | null;
      originLot: string | null;
    };
  };
  redirectPath: string;
}

export interface SampleEventsResponse {
  sampleId: string;
  events: SampleEvent[];
}

export interface ExtractionCrossValidationDetail {
  field: string;
  extracted: string | null;
  registered: string | null;
  match: boolean;
}

export interface ExtractionResult {
  extractedFields: Record<string, string | null>;
  crossValidation: {
    hasMismatches: boolean;
    details: ExtractionCrossValidationDetail[];
  };
  model: string;
  photoAttachmentId: string;
  processingTimeMs: number;
}

export interface CommandResponse<TSample = unknown> {
  statusCode: number;
  idempotent: boolean;
  sample?: TSample;
  event: SampleEvent;
  photo?: {
    attachmentId: string;
    kind: 'CLASSIFICATION_PHOTO';
    storagePath: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: number;
    checksumSha256: string;
  };
  extraction?: ExtractionResult | null;
}

export interface DetectFormResponse {
  statusCode: number;
  photoToken: string;
  detected: boolean;
}

export interface ExtractAndPrepareResponse {
  statusCode: number;
  extractedFields: Record<string, string | null>;
  identification: {
    lote: string | null;
    sacas: string | null;
    safra: string | null;
    data: string | null;
  };
  photoToken: string;
  formDetected?: boolean;
  processingTimeMs: number;
}

export interface ResolveSampleByLotResponse {
  found: boolean;
  sample?: {
    id: string;
    internalLotNumber: string | null;
    classificationType: ClassificationType | null;
    status: string;
    version: number;
    declared: {
      owner: string | null;
      sacks: number | null;
      harvest: string | null;
      originLot: string | null;
    };
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
  print: {
    printAction: PrintAction;
    attemptNumber: number;
    printerId: string | null;
    status: PrintJobStatus;
  } | null;
}

export interface PendingPrintJob {
  jobId: string;
  sampleId: string;
  printAction: PrintAction;
  attemptNumber: number;
  printerId: string | null;
  createdAt: string;
  sample: {
    id: string;
    internalLotNumber: string | null;
    status: SampleStatus;
    version: number;
    qrValue: string;
    declared: {
      owner: string | null;
      sacks: number | null;
      harvest: string | null;
      originLot: string | null;
    };
  };
}

export interface PendingPrintQueueResponse {
  items: PendingPrintJob[];
  total: number;
}
