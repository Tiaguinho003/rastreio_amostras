export type UserRole = 'ADMIN' | 'CLASSIFIER' | 'REGISTRATION' | 'COMMERCIAL';
export type UserStatus = 'ACTIVE' | 'INACTIVE';
export type InitialPasswordDecision = 'PENDING' | 'KEPT' | 'CHANGED';
export type UpdateReasonCode = 'DATA_FIX' | 'TYPO' | 'MISSING_INFO' | 'OTHER';
export type InvalidateReasonCode = 'DUPLICATE' | 'WRONG_SAMPLE' | 'DAMAGED' | 'CANCELLED' | 'OTHER';
export type ClientPersonType = 'PF' | 'PJ';
export type ClientStatus = 'ACTIVE' | 'INACTIVE';
export type ClientRegistrationStatus = 'ACTIVE' | 'INACTIVE';
export type ClientLookupKind = 'owner' | 'buyer' | 'any';
export type ClientAuditEventType =
  | 'CLIENT_CREATED'
  | 'CLIENT_UPDATED'
  | 'CLIENT_INACTIVATED'
  | 'CLIENT_REACTIVATED'
  | 'CLIENT_REGISTRATION_CREATED'
  | 'CLIENT_REGISTRATION_UPDATED'
  | 'CLIENT_REGISTRATION_INACTIVATED'
  | 'CLIENT_REGISTRATION_REACTIVATED';

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
  isBuyer: boolean;
  isSeller: boolean;
  status: ClientStatus;
  registrationCount: number;
  activeRegistrationCount: number;
  primaryCity: string | null;
  primaryState: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ClientRegistrationSummary {
  id: string;
  clientId: string;
  status: ClientRegistrationStatus;
  registrationNumber: string;
  registrationType: string;
  addressLine: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  complement: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type WarehouseStatus = 'ACTIVE' | 'INACTIVE';

export interface WarehouseSummary {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  status: WarehouseStatus;
  sampleCount?: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface WarehouseLookupResponse {
  items: WarehouseSummary[];
}

export interface ClientResponse {
  client: ClientSummary;
}

export interface ClientsListResponse {
  items: ClientSummary[];
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

export interface ClientLookupResponse {
  items: ClientSummary[];
}

export interface ClientDetailResponse extends ClientResponse {
  registrations: ClientRegistrationSummary[];
}

export interface ClientRegistrationMutationResponse {
  client: {
    id: string;
    code: number;
    displayName: string | null;
  };
  registration: ClientRegistrationSummary;
}

export interface ClientSampleItem {
  id: string;
  internalLotNumber: string | null;
  status: string;
  commercialStatus: string;
  declaredOwner: string | null;
  declaredSacks: number | null;
  declaredHarvest: string | null;
  soldSacks: number;
  lostSacks: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ClientPurchaseItem {
  id: string;
  sampleId: string;
  sampleLotNumber: string | null;
  ownerName: string | null;
  quantitySacks: number;
  movementDate: string | null;
  createdAt: string | null;
}

export interface ClientCommercialSummary {
  seller: {
    registeredSamples: number;
    totalSacks: number;
    soldSacks: number;
    lostSacks: number;
  };
  buyer: {
    totalPurchases: number;
    purchasedSacks: number;
  };
}

export interface ClientSamplesListResponse {
  items: ClientSampleItem[];
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

export interface ClientPurchasesListResponse {
  items: ClientPurchaseItem[];
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

export interface ClientCommercialSummaryResponse {
  seller: ClientCommercialSummary['seller'];
  buyer: ClientCommercialSummary['buyer'];
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
  targetRegistration: {
    id: string;
    registrationNumber: string;
    registrationType: string;
    status: ClientRegistrationStatus;
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
  status: SampleStatus;
  commercialStatus: CommercialStatus;
  version: number;
  lastEventSequence: number;
  ownerClientId?: string | null;
  ownerRegistrationId?: string | null;
  warehouseId?: string | null;
  declared: {
    owner: string | null;
    sacks: number | null;
    harvest: string | null;
    originLot: string | null;
    warehouse?: string | null;
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
  ownerRegistration?: {
    id: string;
    clientId: string;
    status: ClientRegistrationStatus;
    registrationNumber: string;
    registrationType: string;
    addressLine: string;
    district: string;
    city: string;
    state: string;
    postalCode: string;
    complement: string | null;
  } | null;
  warehouse?: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    status: WarehouseStatus;
  } | null;
  soldSacks?: number;
  lostSacks?: number;
  availableSacks?: number | null;
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
    module: 'registration' | 'classification' | 'print' | 'commercial' | 'ocr';
    ip: string | null;
    userAgent: string | null;
  };
}

export interface SampleDetailResponse {
  sample: SampleSnapshot;
  attachments: SampleAttachment[];
  events: SampleEvent[];
  movements?: SampleMovement[];
}

export interface SampleMovement {
  id: string;
  sampleId: string;
  movementType: SampleMovementType;
  status: SampleMovementStatus;
  buyerClientId: string | null;
  buyerRegistrationId: string | null;
  quantitySacks: number;
  movementDate: string;
  notes: string | null;
  lossReasonText: string | null;
  buyerClientSnapshot: Record<string, unknown> | null;
  buyerRegistrationSnapshot: Record<string, unknown> | null;
  version: number;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  buyerClient: SampleSnapshot['ownerClient'] | null;
  buyerRegistration: SampleSnapshot['ownerRegistration'] | null;
}

export interface SampleMovementsResponse {
  sampleId: string;
  movements: SampleMovement[];
}

export interface ListSamplesResponse {
  items: SampleSnapshot[];
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

export interface DashboardSalesAvailabilityResponse {
  total: number;
  classifiedToday: number;
  bands: {
    over30: number;
    from15to30: number;
    under15: number;
  };
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
