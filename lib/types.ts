export type UserRole = 'ADMIN' | 'CLASSIFIER' | 'REGISTRATION' | 'COMMERCIAL' | 'PROSPECTOR';
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
export type ClassificationType = 'BICA' | 'PREPARADO' | 'BAIXO' | 'ESCOLHA' | 'CONILON';
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

// Q.final: enum reduzido a 3 valores no banco. Lifecycle do Sample passa
// por REGISTRATION_CONFIRMED -> CLASSIFIED, com INVALIDATED como branch
// terminal. Impressao virou acao pura (PrintJob como fonte de verdade,
// PENDING/SUCCESS/FAILED/EXPIRED).
export type SampleStatus = 'REGISTRATION_CONFIRMED' | 'CLASSIFIED' | 'INVALIDATED';

export type CommercialStatus = 'OPEN' | 'PARTIALLY_SOLD' | 'SOLD' | 'LOST';
export type PrintJobStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
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
  // Liga B3.1: true quando o sample e uma liga (isBlend). Frontend
  // renderiza <BlendBadge> ao lado do lote.
  isBlend: boolean;
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

// Liga B1.1 (Liga F1.B): elegibilidade de um sample pra contribuir em
// uma liga (resposta de GET /samples?eligibleForBlend=true).
// Backend e dono da regra; frontend mapeia reason -> tooltip pt-BR via
// lib/samples/eligibility-labels.ts.
export type SampleEligibilityReason = 'INVALIDATED' | 'NO_BALANCE' | null;

export interface SampleEligibility {
  eligible: boolean;
  reason: SampleEligibilityReason;
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
  // Liga A1: flag denotando se este sample é uma liga (Sample com
  // composição em SampleBlendComponent). Sample normal: false.
  isBlend?: boolean;
  // Liga B1.1 (Liga F1.B + T0.B): só presentes quando o listSamples for
  // chamado com eligibleForBlend=true ou getSampleDetail correspondente.
  // Em outros consumidores (dashboard etc), ficam undefined.
  eligibility?: SampleEligibility;
  committedSacks?: number;
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

// Q.print: printAction nao distingue mais PRINT/REPRINT — toda impressao
// usa attemptNumber sequencial (1, 2, 3...).
export interface LatestPrintJob {
  jobId: string;
  attemptNumber: number;
  status: PrintJobStatus;
  printerId: string | null;
  error: string | null;
  createdAt: string;
}

// Liga B3.2: composicao da liga (origens + contribuicoes). Backend embute
// snapshot da origem em `originSample` (declaredOwner string direto — sem
// ownerClient expandido). Quando origem foi removida ou esta inacessivel,
// originSample === null (graceful — UI renderiza '—' ou mensagem).
export interface BlendComponentDetail {
  id: string;
  originSampleId: string;
  contributedSacks: number;
  originSample: {
    id: string;
    internalLotNumber: string | null;
    declaredOwner: string | null;
    declaredHarvest: string | null;
    declaredSacks: number;
    isBlend: boolean;
    status: SampleStatus;
  } | null;
}

// Liga B3.3: liga ativa (status != INVALIDATED) que usa essa amostra como
// origem. Backend filtra INVALIDATED — Wave A2.5/A3.4. declaredOwner e
// declaredHarvest sao snapshot da liga (B3.7) — owner costuma ser null
// (carteira da corretora), harvest e derivado das origens.
export interface ActiveBlendDetail {
  sampleId: string;
  lotNumber: string | null;
  status: SampleStatus;
  contributedSacks: number;
  declaredOwner: string | null;
  declaredHarvest: string | null;
}

// Liga: liga ancestral cuja safra muda por uma edicao de safra de origem
// (propagacao reativa). Retornada no 409 BLEND_HARVEST_PROPAGATION_REQUIRED
// pra UI confirmar antes de aplicar — destaca ligas ja comercializadas
// (commercialStatus != 'OPEN') e a transicao currentHarvest -> newHarvest.
export interface AffectedBlendDetail {
  sampleId: string;
  lotNumber: string | null;
  status: SampleStatus;
  commercialStatus: CommercialStatus;
  soldSacks: number;
  lostSacks: number;
  currentHarvest: string | null;
  newHarvest: string | null;
  currentOwner: string | null;
  newOwner: string | null;
}

// Liga B4 Fase 2: viabilidade da venda de uma liga. `getBlendFeasibility`
// percorre a árvore recursiva de descendentes e marca, por origem, se o
// saldo disponível ainda cobre a contribuição exigida (hard block F7.6
// quantitativo). Consumido pela pré-validação do modal de venda (Fase 5)
// e pelo flag de viabilidade no detalhe da liga (Fase 7).
export interface BlendFeasibilityNode {
  sampleId: string;
  lotNumber: string | null;
  parentBlendId: string | null;
  depth: number;
  isBlend: boolean;
  status: SampleStatus;
  /** null no nó raiz (a liga); número em cada descendente. */
  contributedSacks: number | null;
  declaredSacks: number | null;
  soldSacks: number;
  lostSacks: number;
  availableSacks: number;
}

export interface BlendBlockingOrigin {
  sampleId: string;
  lotNumber: string | null;
  contributedSacks: number;
  availableSacks: number;
}

export interface BlendFeasibilityResponse {
  sampleId: string;
  isBlend: boolean;
  feasible: boolean;
  nodes: BlendFeasibilityNode[];
  blockingOrigins: BlendBlockingOrigin[];
}

export interface SampleDetailResponse {
  sample: SampleSnapshot;
  attachments: SampleAttachment[];
  events: SampleEvent[];
  movements?: SampleMovement[];
  latestPrintJob: LatestPrintJob | null;
  // Liga A3.4: presentes quando sample tem composicao/vinculo a ligas.
  // - components: nao-vazio apenas quando sample.isBlend === true.
  // - activeBlends: nao-vazio apenas quando sample e origem em liga(s)
  //   ativa(s). Em sample.isBlend === true, vazio ou ausente.
  components?: BlendComponentDetail[];
  activeBlends?: ActiveBlendDetail[];
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
  // Liga B3.6: a liga que originou este movimento via cascata, ou null se foi
  // um movimento direto. Um movimento cascateado (cascadedFrom != null) nao e
  // cancelavel/editavel isolado — so pela liga raiz. Presente so em
  // getSampleDetail; a rota /movements nao carrega.
  cascadedFrom?: { sampleId: string; lotNumber: string | null } | null;
}

export interface SampleMovementsResponse {
  sampleId: string;
  movements: SampleMovement[];
}

// Item projetado do historico de envios (laudo PDF exportado / amostra fisica
// enviada). Consumido tanto pela detail page (projecao a partir dos eventos)
// quanto pelo SampleMovementsPanel (timeline unificada de Movimentacoes).
export type SendHistoryItem =
  | {
      kind: 'REPORT';
      key: string;
      recipientName: string;
      dateLabel: string;
      occurredAt: string;
    }
  | {
      kind: 'PHYSICAL';
      key: string;
      sendEventId: string;
      recipientClientId: string | null;
      recipientName: string;
      sentDate: string;
      occurredAt: string;
      cancelled: boolean;
    };

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

// Q.print: dashboard simplificou — printPending sumiu (card "Aguardando
// impressao" cortado), pendingCounts/oldestPending/classificationInProgress
// ficaram obsoletos. Resta apenas classificationPending (samples em RC).
export interface DashboardPendingResponse {
  todayReceivedTotal: number;
  classificationPending: {
    counts: {
      REGISTRATION_CONFIRMED: number;
    };
    total: number;
    items: SampleSnapshot[];
  };
  clientsIncomplete: {
    total: number;
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
  | 'SALE_CANCELLED'
  | 'LOSS_CANCELLED'
  | 'PHYSICAL_SAMPLE_SENT';

export interface DashboardRecentActivityItem {
  // Chave unica por evento (`${sampleId}:${sequenceNumber}`) — o feed agora e
  // por-evento, entao um mesmo sample pode aparecer mais de uma vez (ex: venda
  // + cancelamento).
  id: string;
  sampleId: string;
  internalLotNumber: string | null;
  producer: string | null;
  sacks: number | null;
  recipient: string | null;
  // Liga B3.1: true quando o sample e uma liga (isBlend). Frontend
  // renderiza <BlendBadge> ao lado do lote.
  isBlend: boolean;
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

// Shape REAL (aninhado) que a extracao da IA retorna em `extractedFields` —
// espelha `raw.classificacao` do backend (normalizeClassificacao em
// src/samples/classification-extraction-service.js). Peneiras/fundos/percentual
// sao string (nao number): valores manuscritos crus, normalizados pra numero
// so no save. Antes este campo era tipado como Record<string,string|null>
// (flat), uma mentira de tipo: mapExtractionToForm lia chaves flat num objeto
// aninhado e as peneiras/fundos/defeitos nunca pre-preenchiam o review sheet.
export interface ExtractedClassificationFields {
  padrao: string | null;
  aspecto: string | null;
  certif: string | null;
  peneiras: Record<
    'p18' | 'p17' | 'p16' | 'p15' | 'p14' | 'p13' | 'p12' | 'p11' | 'p10' | 'mk',
    string | null
  > | null;
  fundos: Array<{ peneira: string | null; percentual: string | null }> | null;
  catacao: string | null;
  defeitos: Record<'imp' | 'pva' | 'broca' | 'gpi' | 'ap' | 'defeito', string | null> | null;
  observacoes: string | null;
  bebida: string | null;
}

export interface ExtractionResult {
  extractedFields: ExtractedClassificationFields;
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
  extractedFields: ExtractedClassificationFields;
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

// Fase P2: renomeada de `CreateSampleAndPreparePrintResponse`. Sem mais
// `qr` e `print` no response — registro termina em REGISTRATION_CONFIRMED
// e impressão de etiqueta acontece em outro momento (fluxo de reprint
// manual ou Fase Pb pós-classificação).
export interface CreateSampleResponse {
  statusCode: number;
  idempotent: boolean;
  event: SampleEvent | null;
  sample: SampleSnapshot;
  draft: {
    clientDraftId: string;
    sampleId: string;
  };
}

export interface PendingPrintJob {
  jobId: string;
  sampleId: string;
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

// ── Informe de visita (pagina /informe + listagem admin /resumo) ──

export type VisitClientKind = 'EXISTING' | 'NEW';
export type VisitFarmSize = 'SMALL' | 'MEDIUM' | 'LARGE';
export type VisitInterestLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface VisitReportSummary {
  id: string;
  user: {
    id: string;
    fullName: string;
    username: string;
  } | null;
  clientKind: VisitClientKind;
  client: {
    id: string;
    code: number;
    displayName: string | null;
    status: ClientStatus;
  } | null;
  newClient: {
    name: string | null;
    city: string | null;
    phone: string | null;
  } | null;
  farmSize: VisitFarmSize;
  farmSizeNotes: string | null;
  interestLevel: VisitInterestLevel;
  interestNotes: string | null;
  sellsCurrently: boolean;
  sellsToWhom: string | null;
  createdAt: string;
}

export interface VisitReportMutationResponse {
  report: VisitReportSummary;
}

export interface VisitReportsListResponse {
  items: VisitReportSummary[];
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
