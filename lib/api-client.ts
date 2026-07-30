import type {
  ApprovalLabelPrefill,
  BlendFeasibilityResponse,
  ClassificationType,
  ClientAuditListResponse,
  ClientCommercialSummaryResponse,
  ClientDetailResponse,
  BrokerInput,
  BrokerListResponse,
  BrokerResponse,
  ContractListState,
  ContractLookupListKey,
  ContractLookupsResponse,
  ContractPeriodBase,
  CreateContractLookupResponse,
  CreateSaleContractInput,
  FinanceiroFilter,
  FinanceiroListResponse,
  SaleContractEtapa2Input,
  SaleContractListResponse,
  SaleContractResponse,
  SaleContractTimelineResponse,
  SaleContractType,
  ClientBankAccountInput,
  ClientBankAccountListResponse,
  ClientBankAccountResponse,
  ClientAttachmentListResponse,
  ClientAttachmentResponse,
  ApprovalFilter,
  ApprovalListResponse,
  ClientLookupKind,
  ClientLookupResponse,
  ClientPurchasesListResponse,
  ClientSamplesListResponse,
  ClientUnitInactivateResponse,
  ClientUnitMutationResponse,
  ClientResponse,
  ClientsListResponse,
  ClientStatsResponse,
  CommandResponse,
  CreateSampleResponse,
  ExtractAndPrepareResponse,
  ResolveSampleByLotResponse,
  DashboardPendingResponse,
  DetectFormResponse,
  RecentSendsResponse,
  DashboardPaymentEventsResponse,
  DashboardInvoiceEventsResponse,
  DashboardAvisosResponse,
  InvalidateReasonCode,
  PendingPrintQueueResponse,
  ListSamplesResponse,
  PasswordResetCodeVerificationResponse,
  PasswordResetRequestResponse,
  ResolveSampleByQrResponse,
  SampleDetailResponse,
  SampleMovementsResponse,
  SampleStatsResponse,
  SampleEventsResponse,
  SessionData,
  UpdateReasonCode,
  UserAuditListResponse,
  UserLookupResponse,
  UserMutationResponse,
  UserPasswordMutationResponse,
  UserResponse,
  UsersListResponse,
  VisitClientKind,
  VisitFarmSize,
  VisitInterestLevel,
  VisitReportMutationResponse,
  VisitReportsListResponse,
  VisitReportStatsResponse,
  RelatoriosStatsResponse,
  CommercialVisitReason,
  CommercialVisitOutcome,
  WeeklyReportMutationResponse,
  InformeFeedResponse,
  InformeFeedQuery,
  PushConfigResponse,
  PushSubscriptionMutationResponse,
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
export type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];

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
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: JsonValue;
    session?: SessionData | null;
    formData?: FormData;
    signal?: AbortSignal;
    /**
     * Permite endpoints somente-leitura optar pelo cache HTTP do
     * browser (`'default'` respeita Cache-Control do response).
     * Default mantem `'no-store'` pra nao quebrar mutations e fluxos
     * que dependem de freshness garantida.
     */
    cachePolicy?: RequestCache;
    /** Headers extras (ex: Idempotency-Key no reenvio da fila offline). */
    extraHeaders?: Record<string, string>;
  } = {}
): Promise<TResponse> {
  const {
    method = 'GET',
    body,
    formData,
    signal,
    cachePolicy = 'no-store',
    extraHeaders,
  } = options;

  const headers: HeadersInit = { ...extraHeaders };
  let finalBody: BodyInit | undefined;
  if (formData) {
    finalBody = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    finalBody = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: finalBody,
      cache: cachePolicy,
      credentials: 'same-origin',
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    throw new ApiError(
      0,
      'Sem conexao com o servidor. Verifique sua internet e tente novamente.',
      null
    );
  }

  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    const maybeError = payload.error as { message?: string; details?: unknown } | undefined;
    throw new ApiError(
      response.status,
      maybeError?.message ?? 'Erro ao processar a solicitacao.',
      maybeError?.details ?? null
    );
  }

  if (response.status !== 204 && Object.keys(payload).length === 0) {
    throw new ApiError(response.status, 'Resposta invalida do servidor', null);
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
    body: { username, password },
  });
}

export function getCurrentSession() {
  return request<SessionData>('/auth/session', {
    method: 'GET',
  });
}

export function logout(session?: SessionData | null) {
  return request<{ ok: boolean }>('/auth/logout', {
    method: 'POST',
    session: session ?? null,
  });
}

export function requestPasswordReset(email: string) {
  return request<PasswordResetRequestResponse>('/auth/forgot-password/request', {
    method: 'POST',
    body: { email },
  });
}

export function verifyPasswordResetCode(email: string, code: string) {
  return request<PasswordResetCodeVerificationResponse>('/auth/forgot-password/verify-code', {
    method: 'POST',
    body: { email, code },
  });
}

export function resetPasswordWithCode(email: string, code: string, password: string) {
  return request<UserResponse>('/auth/forgot-password/reset', {
    method: 'POST',
    body: { email, code, password },
  });
}

export function getCurrentUser(session: SessionData) {
  return request<UserResponse>('/users/me', {
    method: 'GET',
    session,
  });
}

export function updateCurrentUserProfile(
  session: SessionData,
  data: {
    fullName?: string;
    username?: string;
    phone?: string | null;
  }
) {
  return request<UserMutationResponse>('/users/me/profile', {
    method: 'PATCH',
    session,
    body: data,
  });
}

export function changeCurrentUserPassword(session: SessionData, password: string) {
  return request<UserMutationResponse>('/users/me/password', {
    method: 'POST',
    session,
    body: { password },
  });
}

export function requestCurrentUserEmailChange(session: SessionData, email: string) {
  return request<UserResponse>('/users/me/email/request-change', {
    method: 'POST',
    session,
    body: { email },
  });
}

export function resendCurrentUserEmailChangeCode(session: SessionData) {
  return request<UserResponse>('/users/me/email/resend', {
    method: 'POST',
    session,
  });
}

export function confirmCurrentUserEmailChange(session: SessionData, code: string) {
  return request<UserResponse>('/users/me/email/confirm-change', {
    method: 'POST',
    session,
    body: { code },
  });
}

export function recordInitialPasswordDecision(session: SessionData, decision: 'KEPT' | 'CHANGED') {
  return request<UserResponse>('/users/me/initial-password-decision', {
    method: 'POST',
    session,
    body: { decision },
  });
}

export function listUsers(
  session: SessionData,
  query: {
    search?: string;
    role?: string;
    status?: string;
    limit?: number;
    cursorFullName?: string;
    cursorId?: string;
  } = {},
  options: { signal?: AbortSignal } = {}
) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.role) params.set('role', query.role);
  if (query.status) params.set('status', query.status);
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  if (typeof query.cursorFullName === 'string') {
    params.set('cursorFullName', query.cursorFullName);
  }
  if (query.cursorId) params.set('cursorId', query.cursorId);
  const suffix = params.size ? `?${params.toString()}` : '';
  return request<UsersListResponse>(`/users${suffix}`, {
    method: 'GET',
    session,
    signal: options.signal,
  });
}

export function listClients(
  session: SessionData,
  query: {
    search?: string;
    status?: string;
    personType?: string;
    isBuyer?: boolean;
    isSeller?: boolean;
    isWarehouse?: boolean;
    commercialUserId?: string;
    completeness?: string;
    limit?: number;
    cursorDisplayName?: string;
    cursorId?: string;
  } = {},
  options: { signal?: AbortSignal } = {}
) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  if (query.personType) params.set('personType', query.personType);
  if (typeof query.isBuyer === 'boolean') params.set('isBuyer', String(query.isBuyer));
  if (typeof query.isSeller === 'boolean') params.set('isSeller', String(query.isSeller));
  if (typeof query.isWarehouse === 'boolean') params.set('isWarehouse', String(query.isWarehouse));
  if (query.commercialUserId) params.set('commercialUserId', query.commercialUserId);
  if (query.completeness) params.set('completeness', query.completeness);
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  if (typeof query.cursorDisplayName === 'string') {
    params.set('cursorDisplayName', query.cursorDisplayName);
  }
  if (query.cursorId) params.set('cursorId', query.cursorId);
  const suffix = params.size ? `?${params.toString()}` : '';

  return request<ClientsListResponse>(`/clients${suffix}`, {
    method: 'GET',
    session,
    signal: options.signal,
  });
}

// RD14: KPI row de /cadastros (Total/Ativos/Incompletos/Novos no mes).
export function getClientStats(session: SessionData, options: { signal?: AbortSignal } = {}) {
  return request<ClientStatsResponse>('/clients/stats', {
    method: 'GET',
    session,
    signal: options.signal,
    // Respeita o Cache-Control private/max-age=30 do endpoint.
    cachePolicy: 'default',
  });
}

export function lookupClients(
  session: SessionData,
  query: {
    search: string;
    kind?: ClientLookupKind;
  }
) {
  const params = new URLSearchParams();
  params.set('search', query.search);
  if (query.kind) params.set('kind', query.kind);

  return request<ClientLookupResponse>(`/clients/lookup?${params.toString()}`, {
    method: 'GET',
    session,
  });
}

export function getClient(
  session: SessionData,
  clientId: string,
  options: { signal?: AbortSignal; onlyActive?: boolean } = {}
) {
  // Q-01: onlyActive=true filtra units inativas no payload retornado.
  const path = options.onlyActive ? `/clients/${clientId}?onlyActive=true` : `/clients/${clientId}`;
  return request<ClientDetailResponse>(path, {
    method: 'GET',
    session,
    signal: options.signal,
  });
}

export function createClient(
  session: SessionData,
  data: {
    personType: 'PF' | 'PJ';
    fullName?: string;
    legalName?: string;
    tradeName?: string | null;
    cpf?: string | null;
    // L5: PJ guarda cnpj/endereco/IE/email direto no Client.
    cnpj?: string | null;
    registrationNumber?: string | null;
    addressLine?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    complement?: string | null;
    email?: string | null;
    phone?: string | null;
    isBuyer: boolean;
    isSeller: boolean;
    isWarehouse: boolean;
    commercialUserId?: string | null;
    commercialUserIds?: string[];
    units?: import('./types').ClientUnitInput[];
  }
) {
  return request<ClientResponse>('/clients', {
    method: 'POST',
    session,
    body: data as unknown as JsonValue,
  });
}

export function updateClient(
  session: SessionData,
  clientId: string,
  data: {
    personType?: 'PF' | 'PJ';
    fullName?: string;
    legalName?: string;
    tradeName?: string | null;
    cpf?: string | null;
    cnpj?: string | null;
    registrationNumber?: string | null;
    addressLine?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    complement?: string | null;
    email?: string | null;
    phone?: string | null;
    isBuyer?: boolean;
    isSeller?: boolean;
    isWarehouse?: boolean;
    commercialUserId?: string | null;
    commercialUserIds?: string[];
    reasonText: string;
  }
) {
  return request<ClientResponse>(`/clients/${clientId}`, {
    method: 'PATCH',
    session,
    body: data,
  });
}

export function addCommercialUserToClient(session: SessionData, clientId: string, userId: string) {
  return request<ClientResponse>(`/clients/${clientId}/users`, {
    method: 'POST',
    session,
    body: { userId },
  });
}

export function removeCommercialUserFromClient(
  session: SessionData,
  clientId: string,
  userId: string
) {
  return request<ClientResponse>(`/clients/${clientId}/users/${userId}`, {
    method: 'DELETE',
    session,
  });
}

export function bulkAddCommercialUser(
  session: SessionData,
  data: { clientIds: string[]; userId: string }
) {
  return request<{
    userId: string;
    totalRequested: number;
    added: number;
    alreadyLinked: number;
  }>('/clients/bulk-add-commercial-user', {
    method: 'POST',
    session,
    body: data,
  });
}

export function getUserClientsImpact(session: SessionData, userId: string) {
  return request<{
    userId: string;
    totalLinks: number;
    soleCustodianOf: { id: string; code: number; displayName: string; status: string }[];
    coCustodianOf: {
      id: string;
      code: number;
      displayName: string;
      status: string;
      otherUsers: { id: string; fullName: string }[];
    }[];
  }>(`/users/${userId}/clients-impact`, {
    method: 'GET',
    session,
  });
}

export function getClientImpact(session: SessionData, clientId: string) {
  return request<{
    client: { id: string; displayName: string; status: string };
    usage: { ownedSamples: number; activeMovements: number; activeUnits: number };
  }>(`/clients/${clientId}/impact`, { session });
}

export function getClientCommercialSummary(
  session: SessionData,
  clientId: string,
  options?: { signal?: AbortSignal }
) {
  return request<ClientCommercialSummaryResponse>(`/clients/${clientId}/commercial-summary`, {
    session,
    signal: options?.signal,
  });
}

export function listClientSamples(
  session: SessionData,
  clientId: string,
  query: { status?: 'open' | 'sold' | 'lost'; page?: number; limit?: number },
  options?: { signal?: AbortSignal }
) {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return request<ClientSamplesListResponse>(`/clients/${clientId}/samples${qs ? `?${qs}` : ''}`, {
    session,
    signal: options?.signal,
  });
}

export function listClientPurchases(
  session: SessionData,
  clientId: string,
  query: { page?: number; limit?: number },
  options?: { signal?: AbortSignal }
) {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return request<ClientPurchasesListResponse>(
    `/clients/${clientId}/purchases${qs ? `?${qs}` : ''}`,
    { session, signal: options?.signal }
  );
}

export function inactivateClient(session: SessionData, clientId: string, reasonText: string) {
  return request<ClientResponse>(`/clients/${clientId}/inactivate`, {
    method: 'POST',
    session,
    body: { reasonText },
  });
}

export function reactivateClient(session: SessionData, clientId: string, reasonText: string) {
  return request<ClientResponse>(`/clients/${clientId}/reactivate`, {
    method: 'POST',
    session,
    body: { reasonText },
  });
}

// #6/Q-05+Q-08: inativacao em cascata.
export type ClientInactivateCascadeResponse = {
  client: {
    id: string;
    code: number;
    status: string;
    [key: string]: unknown;
  };
  cascade: {
    batchId: string;
    cascadedSampleIds: string[];
    cascadedSampleCount: number;
    skippedSampleIds: string[];
  };
};

export function inactivateClientWithCascade(
  session: SessionData,
  clientId: string,
  data: { confirmedSampleIds: string[]; reasonText?: string | null }
) {
  return request<ClientInactivateCascadeResponse>(`/clients/${clientId}/inactivate-with-cascade`, {
    method: 'POST',
    session,
    body: {
      confirmedSampleIds: data.confirmedSampleIds,
      reasonText: data.reasonText ?? null,
    },
  });
}

export function listClientAuditEvents(
  session: SessionData,
  clientId: string,
  query: {
    page?: number;
    limit?: number;
  } = {},
  options: { signal?: AbortSignal } = {}
) {
  const params = new URLSearchParams();
  if (typeof query.page === 'number') params.set('page', String(query.page));
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  const suffix = params.size ? `?${params.toString()}` : '';

  return request<ClientAuditListResponse>(`/clients/${clientId}/audit${suffix}`, {
    method: 'GET',
    session,
    signal: options.signal,
  });
}

export function createClientUnit(
  session: SessionData,
  clientId: string,
  data: {
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
) {
  return request<ClientUnitMutationResponse>(`/clients/${clientId}/units`, {
    method: 'POST',
    session,
    body: data,
  });
}

export function updateClientUnit(
  session: SessionData,
  clientId: string,
  unitId: string,
  data: {
    name?: string | null;
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
    reasonText?: string;
  }
) {
  return request<ClientUnitMutationResponse>(`/clients/${clientId}/units/${unitId}`, {
    method: 'PATCH',
    session,
    body: data,
  });
}

export function inactivateClientUnit(
  session: SessionData,
  clientId: string,
  unitId: string,
  reasonText: string
) {
  return request<ClientUnitInactivateResponse>(`/clients/${clientId}/units/${unitId}/inactivate`, {
    method: 'POST',
    session,
    body: { reasonText },
  });
}

export function reactivateClientUnit(
  session: SessionData,
  clientId: string,
  unitId: string,
  reasonText: string
) {
  return request<ClientUnitMutationResponse>(`/clients/${clientId}/units/${unitId}/reactivate`, {
    method: 'POST',
    session,
    body: { reasonText },
  });
}

// --- Fechamento Fase 0: contas bancarias e anexos do cliente ---
// (API /banks removida na D141 — banco virou texto livre na conta.)

export function listBrokers(
  session: SessionData,
  query: { search?: string; status?: 'ACTIVE' | 'INACTIVE' } = {},
  options: { signal?: AbortSignal } = {}
) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  const suffix = params.size ? `?${params.toString()}` : '';
  return request<BrokerListResponse>(`/brokers${suffix}`, {
    method: 'GET',
    session,
    signal: options.signal,
  });
}

export function createBroker(session: SessionData, data: BrokerInput) {
  return request<BrokerResponse>('/brokers', {
    method: 'POST',
    session,
    body: data as unknown as JsonValue,
  });
}

export function updateBroker(
  session: SessionData,
  brokerId: string,
  data: Partial<BrokerInput> & { status?: 'ACTIVE' | 'INACTIVE' }
) {
  return request<BrokerResponse>(`/brokers/${brokerId}`, {
    method: 'PATCH',
    session,
    body: data as unknown as JsonValue,
  });
}

// Fechamento (Fase B.2): gestao de contratos (ADMIN+COMMERCIAL, escopo aberto — ambos
// veem/gerenciam TODOS os contratos; own-only revogado 2026-07-13, D110 superada).
// RC-F6: busca, filtros e paginacao sao do SERVIDOR. `status`/`type` sao
// multi-selecao e viajam separados por virgula; `cursor` e o contractSeq da
// ultima linha da pagina anterior.
export function listSaleContracts(
  session: SessionData,
  query: {
    search?: string;
    // RC-D118: a situação viaja como ESTADO (atraso/aberto/finalizado/cancelado), e
    // não como o `status` do banco — a KPI row e o painel de filtros escolhem a mesma
    // coisa, num eixo só. Vazio = os quatro.
    state?: ContractListState[];
    type?: SaleContractType[];
    buyerClientId?: string;
    sellerClientId?: string;
    periodBase?: ContractPeriodBase;
    periodFrom?: string;
    periodTo?: string;
    limit?: number;
    cursor?: string | null;
  } = {},
  options: { signal?: AbortSignal } = {}
) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.state?.length) params.set('state', query.state.join(','));
  if (query.type?.length) params.set('type', query.type.join(','));
  if (query.buyerClientId) params.set('buyerClientId', query.buyerClientId);
  if (query.sellerClientId) params.set('sellerClientId', query.sellerClientId);
  // A base so viaja acompanhada de pelo menos uma ponta da janela — sozinha ela
  // nao recorta nada e so sujaria a URL.
  if (query.periodFrom || query.periodTo) {
    if (query.periodBase) params.set('periodBase', query.periodBase);
    if (query.periodFrom) params.set('periodFrom', query.periodFrom);
    if (query.periodTo) params.set('periodTo', query.periodTo);
  }
  if (query.limit) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  const suffix = params.size ? `?${params.toString()}` : '';
  return request<SaleContractListResponse>(`/sale-contracts${suffix}`, {
    method: 'GET',
    session,
    signal: options.signal,
  });
}

// Financeiro (Fase F): corretagem a receber por fechamento (ADMIN+COMMERCIAL, escopo
// aberto — ambos veem TODOS os fechamentos; own-only revogado 2026-07-13, D135 superada).
// Relatorio derivado, on-demand, paginado por cursor (S86: search/limit/cursor).
export function listFinanceiro(
  session: SessionData,
  query: { search?: string; limit?: number; cursor?: string; filter?: FinanceiroFilter } = {},
  options: { signal?: AbortSignal } = {}
) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.filter && query.filter !== 'todos') params.set('filter', query.filter);
  const suffix = params.size ? `?${params.toString()}` : '';
  return request<FinanceiroListResponse>(`/financeiro${suffix}`, {
    method: 'GET',
    session,
    signal: options.signal,
  });
}

export function getSaleContract(
  session: SessionData,
  contractId: string,
  options: { signal?: AbortSignal } = {}
) {
  return request<SaleContractResponse>(`/sale-contracts/${contractId}`, {
    method: 'GET',
    session,
    signal: options.signal,
  });
}

// Fase J (D125): timeline do modal de Detalhes — auditorias agregadas do
// contrato (criacao/edicoes, agio, aprovacoes, marcos, espelhos), ordem desc.
export function getSaleContractTimeline(session: SessionData, contractId: string) {
  return request<SaleContractTimelineResponse>(`/sale-contracts/${contractId}/timeline`, {
    method: 'GET',
    session,
  });
}

// Fechamento (Futuro, D97): cria um contrato FUTURO direto (sem lote) JA EMITIDO
// num passo so (fase 1 + etapa 2 no mesmo corpo). Gestao = ADMIN + COMMERCIAL (D140).
export function createFutureSaleContract(session: SessionData, data: CreateSaleContractInput) {
  return request<SaleContractResponse>(`/sale-contracts`, {
    method: 'POST',
    session,
    body: data as unknown as JsonValue,
  });
}

// Fechamento (Mercado a vista, D97): registra a venda no lote + cria o contrato
// JA EMITIDO num passo so (mesma tx). O corpo traz type=MERCADO_A_VISTA, o
// sampleId + expectedVersion do lote e a fase 1 + etapa 2. Gestao = ADMIN +
// COMMERCIAL (D140).
export function createSpotSaleContract(session: SessionData, data: CreateSaleContractInput) {
  return request<SaleContractResponse>(`/sale-contracts`, {
    method: 'POST',
    session,
    body: data as unknown as JsonValue,
  });
}

// Fechamento (D97): "Editar" um contrato EMITIDO re-salva a etapa 2 e regenera,
// mantendo EMITIDO. A criacao nasce EMITIDO em createSpot/createFuture.
// ADMIN + COMMERCIAL (D140).
export function emitSaleContract(
  session: SessionData,
  contractId: string,
  data: SaleContractEtapa2Input
) {
  return request<SaleContractResponse>(`/sale-contracts/${contractId}/emit`, {
    method: 'POST',
    session,
    body: data as unknown as JsonValue,
  });
}

// "Aplicar agio/desagio" no card de um contrato EMITIDO (D87): substitui o
// agio vigente e recalcula total + corretagem no servidor. Gestao = ADMIN +
// COMMERCIAL (D140).
export function applyAgioSaleContract(
  session: SessionData,
  contractId: string,
  data: { expectedVersion: number; agioDesagioType: 'AGIO' | 'DESAGIO'; agioDesagioValue: number }
) {
  return request<SaleContractResponse>(`/sale-contracts/${contractId}/apply-agio`, {
    method: 'POST',
    session,
    body: data,
  });
}

// AP23: toggle rápido Sim/Não do requiresApproval, do modal de Detalhes (sem abrir o
// "Editar" inteiro). Só ADMIN/COMMERCIAL; travas AP20 no backend.
export function setSaleContractApprovalFlag(
  session: SessionData,
  contractId: string,
  data: { requiresApproval: boolean; expectedVersion: number }
) {
  return request<SaleContractResponse>(`/sale-contracts/${contractId}/approval-flag`, {
    method: 'POST',
    session,
    body: data,
  });
}

// RC-D99: cascata do "Nº compra" da etiqueta de aprovação. Escrita estreita — não
// re-snapshota a etapa 2 nem deixa linha "EDIÇÃO" na timeline (o "Editar" faz as
// duas coisas). String vazia grava null. Congelado fora de EMITIDO.
export function setSaleContractPurchaseNumber(
  session: SessionData,
  contractId: string,
  data: { purchaseNumber: string; expectedVersion: number }
) {
  return request<SaleContractResponse>(`/sale-contracts/${contractId}/purchase-number`, {
    method: 'POST',
    session,
    body: data,
  });
}

// RC-D62/D63: "Finalizar" tira o contrato da fila; "Reabrir" devolve. Sem data —
// não é registro de um fato, é o contrato dizendo que não pede mais nada.
export function finalizeSaleContract(
  session: SessionData,
  contractId: string,
  data: { expectedVersion: number }
) {
  return request<SaleContractResponse>(`/sale-contracts/${contractId}/finalize`, {
    method: 'POST',
    session,
    body: data,
  });
}

export function reopenSaleContract(
  session: SessionData,
  contractId: string,
  data: { expectedVersion: number }
) {
  return request<SaleContractResponse>(`/sale-contracts/${contractId}/reopen`, {
    method: 'POST',
    session,
    body: data,
  });
}

// Quebra manual (P17): cancela a venda subjacente e marca o contrato WASH_OUT.
// Motivo obrigatório. Definitiva. Gestão = ADMIN+COMMERCIAL (D110).
// `washoutBillable` (RC-D89) é a resposta de corretagem — obrigatória, sem padrão:
// decide se o cancelado fica no Financeiro e se o Espelho sai.
export function washoutSaleContract(
  session: SessionData,
  contractId: string,
  data: { expectedVersion: number; reason: string; washoutBillable: boolean }
) {
  return request<SaleContractResponse>(`/sale-contracts/${contractId}/washout`, {
    method: 'POST',
    session,
    body: data,
  });
}

export function listContractLookups(session: SessionData, options: { signal?: AbortSignal } = {}) {
  return request<ContractLookupsResponse>('/contract-lookups', {
    method: 'GET',
    session,
    signal: options.signal,
  });
}

// "+ Adicionar" inline (D91): cria um valor numa das 3 listas e devolve o item novo
// (já com id) pra selecionar no dropdown. Qualquer autenticado (D59).
export function createContractLookup(
  session: SessionData,
  data: { list: ContractLookupListKey; name: string }
) {
  return request<CreateContractLookupResponse>('/contract-lookups', {
    method: 'POST',
    session,
    body: data,
  });
}

// Preview do proximo numero de contrato (NNNN/AA) — indicativo (o numero real e
// alocado na criacao). Usado no modal de venda pra mostrar o numero futuro.
export function getNextContractNumber(
  session: SessionData,
  options: { signal?: AbortSignal } = {}
) {
  return request<{ contractNumber: string }>('/sale-contracts/next-number', {
    method: 'GET',
    session,
    signal: options.signal,
  });
}

export function listClientBankAccounts(
  session: SessionData,
  clientId: string,
  options: { signal?: AbortSignal } = {}
) {
  return request<ClientBankAccountListResponse>(`/clients/${clientId}/bank-accounts`, {
    method: 'GET',
    session,
    signal: options.signal,
  });
}

export function createClientBankAccount(
  session: SessionData,
  clientId: string,
  data: ClientBankAccountInput
) {
  return request<ClientBankAccountResponse>(`/clients/${clientId}/bank-accounts`, {
    method: 'POST',
    session,
    body: data as unknown as JsonValue,
  });
}

export function updateClientBankAccount(
  session: SessionData,
  clientId: string,
  accountId: string,
  data: Partial<ClientBankAccountInput> & { status?: 'ACTIVE' | 'INACTIVE' }
) {
  return request<ClientBankAccountResponse>(`/clients/${clientId}/bank-accounts/${accountId}`, {
    method: 'PATCH',
    session,
    body: data as unknown as JsonValue,
  });
}

export function listClientAttachments(
  session: SessionData,
  clientId: string,
  options: { signal?: AbortSignal } = {}
) {
  return request<ClientAttachmentListResponse>(`/clients/${clientId}/attachments`, {
    method: 'GET',
    session,
    signal: options.signal,
  });
}

export function uploadClientAttachment(
  session: SessionData,
  clientId: string,
  file: File,
  description?: string | null
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('originalFileName', file.name);
  if (description) {
    formData.append('description', description);
  }
  return request<ClientAttachmentResponse>(`/clients/${clientId}/attachments`, {
    method: 'POST',
    session,
    formData,
  });
}

// Vincula o anexo a uma filial do cliente. Definitivo: o backend responde 409
// CLIENT_ATTACHMENT_ALREADY_LINKED se o anexo ja tiver filial.
export function linkClientAttachmentUnit(
  session: SessionData,
  clientId: string,
  attachmentId: string,
  unitId: string
) {
  return request<ClientAttachmentResponse>(`/clients/${clientId}/attachments/${attachmentId}`, {
    method: 'PATCH',
    session,
    body: { unitId } as unknown as JsonValue,
  });
}

export function deleteClientAttachment(
  session: SessionData,
  clientId: string,
  attachmentId: string
) {
  return request<{ ok: boolean }>(`/clients/${clientId}/attachments/${attachmentId}`, {
    method: 'DELETE',
    session,
  });
}

// URL da rota de download/preview de um anexo (serve inline). Usar em
// <a href>, <img src> ou <iframe src>; cookies same-origin acompanham.
export function clientAttachmentDownloadUrl(clientId: string, attachmentId: string): string {
  return `${API_BASE}/clients/${clientId}/attachments/${attachmentId}`;
}

// Aprovação (AP25-AP28): worklist paginada. Default 'a_enviar' (o param só vai quando
// difere do default). Auth-only (todos os não-PROSPECTOR). Como a de embarque acima,
// ficou SEM CONSUMIDOR de UI na RC-D2 e espera a RC-F3.
export function listApprovals(
  session: SessionData,
  query: { search?: string; limit?: number; cursor?: string; filter?: ApprovalFilter } = {},
  options: { signal?: AbortSignal } = {}
) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.filter && query.filter !== 'a_enviar') params.set('filter', query.filter);
  const suffix = params.size ? `?${params.toString()}` : '';
  return request<ApprovalListResponse>(`/sale-contracts/approvals${suffix}`, {
    method: 'GET',
    session,
    signal: options.signal,
  });
}

export function getUser(session: SessionData, userId: string) {
  return request<UserResponse>(`/users/${userId}`, {
    method: 'GET',
    session,
  });
}

export function createUser(
  session: SessionData,
  data: {
    fullName: string;
    username: string;
    email: string;
    phone?: string | null;
    password: string;
    role: string;
  }
) {
  return request<UserPasswordMutationResponse>('/users', {
    method: 'POST',
    session,
    body: data,
  });
}

export function updateUser(
  session: SessionData,
  userId: string,
  data: {
    fullName?: string;
    username?: string;
    email?: string;
    phone?: string | null;
    role?: string;
  }
) {
  return request<UserMutationResponse>(`/users/${userId}`, {
    method: 'PATCH',
    session,
    body: data,
  });
}

export function inactivateUser(session: SessionData, userId: string, reasonText: string) {
  return request<UserResponse>(`/users/${userId}/inactivate`, {
    method: 'POST',
    session,
    body: { reasonText },
  });
}

export function reactivateUser(session: SessionData, userId: string) {
  return request<UserResponse>(`/users/${userId}/reactivate`, {
    method: 'POST',
    session,
  });
}

export function unlockUser(session: SessionData, userId: string) {
  return request<UserResponse>(`/users/${userId}/unlock`, {
    method: 'POST',
    session,
  });
}

export function resetUserPassword(session: SessionData, userId: string, password: string) {
  return request<UserPasswordMutationResponse>(`/users/${userId}/password/reset`, {
    method: 'POST',
    session,
    body: { password },
  });
}

export function listUserAuditEvents(
  session: SessionData,
  query: {
    page?: number;
    limit?: number;
  } = {}
) {
  const params = new URLSearchParams();
  if (typeof query.page === 'number') params.set('page', String(query.page));
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  const suffix = params.size ? `?${params.toString()}` : '';
  return request<UserAuditListResponse>(`/users/audit${suffix}`, {
    method: 'GET',
    session,
  });
}

export function getDashboardPending(session: SessionData) {
  return request<DashboardPendingResponse>('/dashboard/pending', {
    method: 'GET',
    session,
  });
}

// KPI row da lista de Lotes (FV /samples): contagens globais de amostras.
export function getSampleStats(session: SessionData, options: { signal?: AbortSignal } = {}) {
  return request<SampleStatsResponse>('/samples/stats', {
    method: 'GET',
    session,
    signal: options.signal,
    // Respeita o Cache-Control private/max-age=30 do endpoint.
    cachePolicy: 'default',
  });
}

// Card "Amostras enviadas" da página de Lotes (DSB-D14; nasceu no dashboard).
export function getSampleRecentSends(session: SessionData) {
  return request<RecentSendsResponse>('/samples/recent-sends', {
    method: 'GET',
    session,
    // Respeita o Cache-Control private/max-age=30 do endpoint.
    cachePolicy: 'default',
  });
}

// AP31/DSB-D19: card de "Avisos" do dashboard — aprovação a enviar (binário, some
// quando a etiqueta é gerada). Sem janela de data. Auth-only (todos os não-PROSPECTOR).
export function getDashboardAvisos(session: SessionData) {
  return request<DashboardAvisosResponse>('/dashboard/avisos', {
    method: 'GET',
    session,
    cachePolicy: 'default',
  });
}

// F1 (E24/D138): feed de pagamentos do card de Eventos, por janela de data
// ('YYYY-MM-DD'). Só ADMIN+COMMERCIAL (o caller gateia; o endpoint escopa).
export function getDashboardPaymentEvents(
  session: SessionData,
  window: { from: string; to: string }
) {
  const params = new URLSearchParams({ from: window.from, to: window.to });
  return request<DashboardPaymentEventsResponse>(`/dashboard/payment-events?${params.toString()}`, {
    method: 'GET',
    session,
    cachePolicy: 'default',
  });
}

// Faturamento (DSB-D11): feed de eventos de faturamento do card de Eventos, por janela
// de data. Visível a todos os não-PROSPECTOR (o card só monta no desktop); navegação
// pura no front (→ /contratos?tab=contratos, com realce p/ quem tem a aba).
export function getDashboardInvoiceEvents(
  session: SessionData,
  window: { from: string; to: string }
) {
  const params = new URLSearchParams({ from: window.from, to: window.to });
  return request<DashboardInvoiceEventsResponse>(`/dashboard/invoice-events?${params.toString()}`, {
    method: 'GET',
    session,
    cachePolicy: 'default',
  });
}

export function getPendingPrintJobs(
  session: SessionData,
  options: { limit?: number; sampleId?: string } = {}
) {
  const params = new URLSearchParams();
  if (typeof options.limit === 'number') {
    params.set('limit', String(options.limit));
  }
  if (options.sampleId) {
    params.set('sampleId', options.sampleId);
  }
  const suffix = params.size ? `?${params.toString()}` : '';
  return request<PendingPrintQueueResponse>(`/print-queue/pending${suffix}`, {
    method: 'GET',
    session,
  });
}

export function listSamples(
  session: SessionData,
  query: {
    search?: string;
    status?: string;
    limit?: number;
    offset?: number;
    page?: number;
    cursorLotInt?: string;
    cursorId?: string;
    lot?: string;
    owner?: string;
    buyer?: string;
    ownerClientIds?: string[];
    buyerClientIds?: string[];
    sentToClientIds?: string[];
    padroes?: string[];
    aspectos?: string[];
    catacoes?: string[];
    certificados?: string[];
    statusGroup?: string;
    commercialStatus?: string;
    displayStatus?: string;
    /** Safra unica (legado). Preferir `harvests`. */
    harvest?: string;
    /** Safras (multi-selecao). CSV no backend; OR por componente. */
    harvests?: string[];
    sacksMin?: string;
    sacksMax?: string;
    createdFrom?: string;
    createdTo?: string;
    // Liga B1.1 (Wave A3.3 backend): quando true, cada item da resposta
    // ganha eligibility + committedSacks pra UI do modo seleção decidir
    // o que acinzentar e quanto está comprometido (F1.B + T0.B).
    eligibleForBlend?: boolean;
    /** Liga: filtro "Apenas ligas". */
    isBlend?: boolean;
    /**
     * RC-D30: só lote que dá venda — quantidade declarada > 0 e, sendo liga,
     * cascata viável. Mais estrito que `displayStatus: 'OPEN'`, que filtra pelo
     * rótulo `commercialStatus` e deixa passar lote sem quantidade e liga
     * inviável. Usado pelo picker de lote do contrato à vista.
     */
    sellableOnly?: boolean;
  } = {},
  options: { signal?: AbortSignal } = {}
) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  if (typeof query.offset === 'number') params.set('offset', String(query.offset));
  if (typeof query.page === 'number') params.set('page', String(query.page));
  if (query.cursorLotInt) params.set('cursorLotInt', query.cursorLotInt);
  if (query.cursorId) params.set('cursorId', query.cursorId);
  if (query.lot) params.set('lot', query.lot);
  if (query.owner) params.set('owner', query.owner);
  if (query.buyer) params.set('buyer', query.buyer);
  if (query.ownerClientIds && query.ownerClientIds.length > 0) {
    params.set('ownerClientIds', query.ownerClientIds.join(','));
  }
  if (query.buyerClientIds && query.buyerClientIds.length > 0) {
    params.set('buyerClientIds', query.buyerClientIds.join(','));
  }
  if (query.sentToClientIds && query.sentToClientIds.length > 0) {
    params.set('sentToClientIds', query.sentToClientIds.join(','));
  }
  if (query.padroes && query.padroes.length > 0) {
    params.set('padroes', query.padroes.join(','));
  }
  if (query.aspectos && query.aspectos.length > 0) {
    params.set('aspectos', query.aspectos.join(','));
  }
  if (query.catacoes && query.catacoes.length > 0) {
    params.set('catacoes', query.catacoes.join(','));
  }
  if (query.certificados && query.certificados.length > 0) {
    params.set('certificados', query.certificados.join(','));
  }
  if (query.statusGroup) params.set('statusGroup', query.statusGroup);
  if (query.commercialStatus) params.set('commercialStatus', query.commercialStatus);
  if (query.displayStatus) params.set('displayStatus', query.displayStatus);
  if (query.harvests && query.harvests.length > 0) {
    params.set('harvests', query.harvests.join(','));
  }
  if (query.harvest) params.set('harvest', query.harvest);
  if (query.sacksMin) params.set('sacksMin', query.sacksMin);
  if (query.sacksMax) params.set('sacksMax', query.sacksMax);
  if (query.createdFrom) params.set('createdFrom', query.createdFrom);
  if (query.createdTo) params.set('createdTo', query.createdTo);
  if (query.eligibleForBlend) params.set('eligibleForBlend', 'true');
  if (query.isBlend) params.set('isBlend', 'true');
  if (query.sellableOnly) params.set('sellableOnly', 'true');

  const suffix = params.size ? `?${params.toString()}` : '';
  return request<ListSamplesResponse>(`/samples${suffix}`, {
    method: 'GET',
    session,
    signal: options.signal,
  });
}

// Campos de classificacao filtraveis por valores distintos em /samples.
export type ClassificationFilterField = 'padrao' | 'aspecto' | 'catacao' | 'certif';

// Valores distintos canonicos de um campo de classificacao — opcoes dos filtros
// multi-select de /samples. Ja vem canonicos e ordenados do backend.
export function listClassificationValues(
  session: SessionData,
  field: ClassificationFilterField,
  options: { signal?: AbortSignal } = {}
) {
  return request<{ values: string[] }>(
    `/samples/classification-values?field=${encodeURIComponent(field)}`,
    {
      method: 'GET',
      session,
      signal: options.signal,
    }
  );
}

// Fase Q: orquestrador único do registro. Antes da Fase P2 chamava-se
// `createSampleAndPreparePrint` e fazia 4 passos (receive → start → confirm
// → request print). Após a Fase P2 saiu o print. Após a Fase Q virou um
// emit único de `REGISTRATION_CONFIRMED`.
export function createSample(
  session: SessionData,
  data: {
    clientDraftId: string;
    owner: string;
    ownerClientId?: string | null;
    sacks: number;
    harvest: string;
    originLot?: string | null;
    location?: string | null;
    notes?: string | null;
    // Lote editavel: numero informado manualmente (so quando lotNumberManual)
    // e data de chegada (YYYY-MM-DD).
    lotNumber?: string | null;
    lotNumberManual?: boolean;
    receivedDate?: string | null;
  }
) {
  return request<CreateSampleResponse>('/samples/create', {
    method: 'POST',
    session,
    body: {
      clientDraftId: data.clientDraftId,
      owner: data.owner,
      ownerClientId: data.ownerClientId ?? null,
      sacks: data.sacks,
      harvest: data.harvest,
      originLot: data.originLot ?? null,
      location: data.location ?? null,
      // receivedChannel nao vai mais (LNW-D3) — o backend aplica o default
      // 'in_person'.
      notes: data.notes ?? null,
      // Numero so vai quando manual (auto e gerado no servidor no submit);
      // receivedDate vira o occurredAt do registro (e a data do lote).
      ...(data.lotNumberManual && data.lotNumber ? { sampleLotNumber: data.lotNumber } : {}),
      lotNumberManual: data.lotNumberManual ?? false,
      receivedDate: data.receivedDate ?? null,
    },
  });
}

// Lote editavel: sugestao do proximo numero da sequencia pra pre-preencher o
// campo no modal de criacao. O numero real e gerado no submit (server-side).
export function getNextLotNumber(session: SessionData) {
  return request<{ nextLotNumber: string }>('/samples/next-lot-number', {
    method: 'GET',
    session,
  });
}

// Liga B2.2: cria uma liga a partir de origens selecionadas + contribuicoes.
// Endpoint REST: POST /api/v1/samples/blends (Wave A3.1). Backend monta
// um Sample com isBlend=true + N registros em SampleBlendComponent.
// Idempotente via clientDraftId.
//
// Safra, local e notes seguem fora da criacao (F3.* revogadas em 2026-05-19) —
// o backend deriva a safra das origens. O DONO voltou a ser coletado e, desde a
// RC-D38, e OBRIGATORIO: nao ha mais "carteira da corretora" na criacao.
export function createBlend(
  session: SessionData,
  data: {
    clientDraftId: string;
    components: Array<{ originSampleId: string; contributedSacks: number }>;
    /** RC-D38: dono da liga — obrigatorio, e sempre nasce fixado. */
    ownerClientId: string;
    // Liga editavel (espelha createSample): numero manual (so quando
    // lotNumberManual) + data de chegada (YYYY-MM-DD).
    lotNumber?: string | null;
    lotNumberManual?: boolean;
    receivedDate?: string | null;
    idempotencyKey?: string;
  }
) {
  const body: { [key: string]: JsonValue } = {
    clientDraftId: data.clientDraftId,
    components: data.components,
    ownerClientId: data.ownerClientId,
    ...(data.lotNumberManual && data.lotNumber ? { sampleLotNumber: data.lotNumber } : {}),
    lotNumberManual: data.lotNumberManual ?? false,
    receivedDate: data.receivedDate ?? null,
  };
  if (data.idempotencyKey) body.idempotencyKey = data.idempotencyKey;
  return request<CreateSampleResponse>('/samples/blends', {
    method: 'POST',
    session,
    body,
  });
}

// Liga A3.2 / B3.4: reverte uma liga existente (status -> INVALIDATED).
// Endpoint REST: POST /api/v1/samples/:sampleId/revert-blend. Backend emite
// BLEND_REVERTED (audit, carrega o motivo) + SAMPLE_INVALIDATED. Restrita a
// liga sem venda/perda (Liga F8.4). reasonText e opcional (Liga F8.2) — so
// vai no body quando nao-vazio; as origens nao sao afetadas (Q0.2).
export function revertBlend(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    reasonText?: string;
    idempotencyKey?: string;
  }
) {
  const body: { [key: string]: JsonValue } = {
    expectedVersion: data.expectedVersion,
  };

  const trimmedReason = data.reasonText?.trim();
  if (typeof trimmedReason === 'string' && trimmedReason.length > 0) {
    body.reasonText = trimmedReason;
  }

  if (typeof data.idempotencyKey === 'string' && data.idempotencyKey.length > 0) {
    body.idempotencyKey = data.idempotencyKey;
  }

  return request<CommandResponse>(`/samples/${sampleId}/revert-blend`, {
    method: 'POST',
    session,
    body,
  });
}

// Liga B4 Fase 2: viabilidade da venda de uma liga — árvore de descendentes
// com saldos + as origens que bloqueiam a cascata (hard block F7.6
// quantitativo). Alimenta a pré-validação do modal de venda e o flag de
// viabilidade no detalhe da liga.
export function getBlendFeasibility(
  session: SessionData,
  sampleId: string,
  options: { signal?: AbortSignal } = {}
) {
  return request<BlendFeasibilityResponse>(`/samples/${sampleId}/blend-feasibility`, {
    method: 'GET',
    session,
    signal: options.signal,
  });
}

export function getSampleDetail(
  session: SessionData,
  sampleId: string,
  query: {
    eventLimit?: number;
    signal?: AbortSignal;
  } = {}
) {
  const params = new URLSearchParams();
  if (typeof query.eventLimit === 'number') params.set('eventLimit', String(query.eventLimit));

  const suffix = params.size ? `?${params.toString()}` : '';
  return request<SampleDetailResponse>(`/samples/${sampleId}${suffix}`, {
    method: 'GET',
    session,
    signal: query.signal,
  });
}

export async function exportSamplePdf(
  session: SessionData,
  sampleId: string,
  data: {
    destination?: string | null;
    recipientClientId?: string | null;
    /** Liga: safra escolhida pro laudo quando a amostra tem mais de uma safra.
     *  Override de apresentacao (nao muda o declaredHarvest). */
    reportedHarvest?: string | null;
  }
) {
  const response = await fetch(`${API_BASE}/samples/${sampleId}/export/pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      destination: data.destination ?? null,
      recipientClientId: data.recipientClientId ?? null,
      reportedHarvest: data.reportedHarvest ?? null,
    }),
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    const payload = await parseJsonSafe(response);
    const maybeError = payload.error as { message?: string; details?: unknown } | undefined;
    throw new ApiError(
      response.status,
      maybeError?.message ?? 'Erro ao processar a solicitacao.',
      maybeError?.details ?? null
    );
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get('content-disposition');
  const parsedName = parseFileNameFromContentDisposition(contentDisposition);
  const fileName = parsedName || 'amostra.pdf';

  return {
    blob,
    fileName,
  };
}

// Fechamento (Fase C): baixa/visualiza o PDF do contrato (regenerado on-demand;
// só para contratos emitidos). Cookie de sessão via credentials same-origin.
export async function downloadSaleContractPdf(session: SessionData, contractId: string) {
  void session;
  const response = await fetch(`${API_BASE}/sale-contracts/${contractId}/pdf`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    const payload = await parseJsonSafe(response);
    const maybeError = payload.error as { message?: string; details?: unknown } | undefined;
    throw new ApiError(
      response.status,
      maybeError?.message ?? 'Erro ao gerar o PDF do contrato.',
      maybeError?.details ?? null
    );
  }

  const blob = await response.blob();
  const fileName =
    parseFileNameFromContentDisposition(response.headers.get('content-disposition')) ||
    'contrato.pdf';
  return { blob, fileName };
}

// Espelho de Corretagem (Fase E): baixa/visualiza o PDF do espelho. Elegíveis
// EMITIDO/FINALIZADO/WASH_OUT (RC-D62 aposentou FATURADO/PAGO; D105 incluiu o
// washout). Cookie de sessão via credentials. Dois modos, e só um deles é passado:
//   `side` — gera do contrato FRESCO; com `preview` (D127) não conta como auditoria
//   (a exportação real loga via logEspelhoExport);
//   `logId` (RC-D103) — re-renderiza um espelho GUARDADO do snapshot congelado na
//   entrega. 410 quando a retenção venceu (RC-D105).
export async function downloadEspelhoPdf(
  session: SessionData,
  contractId: string,
  side: 'seller' | 'buyer',
  options: { preview?: boolean; logId?: string } = {}
) {
  void session;
  const query = options.logId
    ? `logId=${encodeURIComponent(options.logId)}`
    : `side=${side}${options.preview ? '&preview=1' : ''}`;
  const response = await fetch(`${API_BASE}/sale-contracts/${contractId}/espelho/pdf?${query}`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    const payload = await parseJsonSafe(response);
    const maybeError = payload.error as { message?: string; details?: unknown } | undefined;
    throw new ApiError(
      response.status,
      maybeError?.message ?? 'Erro ao gerar o Espelho de Corretagem.',
      maybeError?.details ?? null
    );
  }

  const blob = await response.blob();
  const fileName =
    parseFileNameFromContentDisposition(response.headers.get('content-disposition')) ||
    'espelho-corretagem.pdf';
  return { blob, fileName };
}

// RC-D27/D28: PDF de PRÉVIA da emissão — o documento que o "Emitir" vai gerar,
// montado a partir do formulário e sem gravar nada. POST porque o contrato ainda
// não existe: o corpo do formulário é a entrada. `provisionalNumber` diz se o
// número no documento ainda vai ser alocado (criação) ou já é o do contrato
// (Editar).
export async function previewSaleContractPdf(session: SessionData, body: JsonValue) {
  void session;
  const response = await fetch(`${API_BASE}/sale-contracts/preview/pdf`, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await parseJsonSafe(response);
    const maybeError = payload.error as { message?: string; details?: unknown } | undefined;
    throw new ApiError(
      response.status,
      maybeError?.message ?? 'Erro ao gerar a prévia do contrato.',
      maybeError?.details ?? null
    );
  }

  const blob = await response.blob();
  const fileName =
    parseFileNameFromContentDisposition(response.headers.get('content-disposition')) ||
    'contrato-previa.pdf';
  const rawNumber = response.headers.get('x-contract-number') ?? '';
  let contractNumber: string | null = null;
  try {
    contractNumber = decodeURIComponent(rawNumber) || null;
  } catch {
    contractNumber = rawNumber || null;
  }
  return {
    blob,
    fileName,
    contractNumber,
    provisionalNumber: response.headers.get('x-provisional-number') === '1',
  };
}

// D127: registra a EXPORTAÇÃO do espelho (clique em Exportar/Baixar) — a prévia
// não audita.
//
// RC-D103: esta chamada é o que CONGELA o documento — o servidor grava o snapshot
// do que foi impresso na linha de auditoria, e devolve o `logId` com que o espelho
// será relido depois. Deixou de ser fire-and-forget (RC-D107): uma falha aqui
// significa que a entrega não ficou registrada, e o modal tem que dizer isso.
//
// `expectedVersion` = a version do contrato que a prévia mostrou. 409
// SALE_CONTRACT_VERSION_CONFLICT se o contrato mudou nesse meio — gravar seria
// congelar um documento que já não corresponde ao contrato.
export function logEspelhoExport(
  session: SessionData,
  contractId: string,
  side: 'seller' | 'buyer',
  expectedVersion?: number
) {
  return request<{ logged: boolean; logId: string }>(`/sale-contracts/${contractId}/espelho/log`, {
    method: 'POST',
    session,
    body: { side, ...(Number.isInteger(expectedVersion) ? { expectedVersion } : {}) },
  });
}

export function recordPhysicalSampleSent(
  session: SessionData,
  sampleId: string,
  data: {
    recipientClientId: string | null;
    sentDate: string;
    // Liga CLASSIFIED: safra escolhida pro laudo congelado (anti-vazamento).
    // null em safra unica / amostra nao classificada.
    reportedHarvest?: string | null;
  }
) {
  return request<CommandResponse>(`/samples/${sampleId}/physical-send`, {
    method: 'POST',
    session,
    body: {
      recipientClientId: data.recipientClientId,
      sentDate: data.sentDate,
      reportedHarvest: data.reportedHarvest ?? null,
    },
  });
}

export function updatePhysicalSampleSend(
  session: SessionData,
  sampleId: string,
  sendEventId: string,
  data: {
    recipientClientId: string | null;
    sentDate: string;
  }
) {
  return request<CommandResponse>(`/samples/${sampleId}/physical-send/${sendEventId}`, {
    method: 'PATCH',
    session,
    body: {
      recipientClientId: data.recipientClientId,
      sentDate: data.sentDate,
    },
  });
}

export function cancelPhysicalSampleSend(
  session: SessionData,
  sampleId: string,
  sendEventId: string
) {
  return request<CommandResponse>(`/samples/${sampleId}/physical-send/${sendEventId}`, {
    method: 'DELETE',
    session,
  });
}

export function resolveSampleByQr(session: SessionData, qrContent: string) {
  const params = new URLSearchParams();
  params.set('qr', qrContent);

  return request<ResolveSampleByQrResponse>(`/samples/resolve?${params.toString()}`, {
    method: 'GET',
    session,
  });
}

export function uploadSamplePhoto(
  session: SessionData,
  sampleId: string,
  file: File,
  options: {
    kind: 'CLASSIFICATION_PHOTO';
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
    formData,
  });
}

export function uploadClassificationPhoto(
  session: SessionData,
  sampleId: string,
  file: File,
  replaceExisting = true
) {
  return uploadSamplePhoto(session, sampleId, file, {
    kind: 'CLASSIFICATION_PHOTO',
    replaceExisting,
  });
}

// Worst case do backend da extracao: deteccao 5s + 2 tentativas de 25s na
// OpenAI + backoff 1.5s ~= 57s. Sem prazo no client, um request pendurado
// deixava o sheet da camera preso em "processando" com o dismiss bloqueado.
const CLASSIFICATION_AI_TIMEOUT_MS = 75_000;

async function withClassificationAiTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLASSIFICATION_AI_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(
        0,
        'A leitura da ficha demorou demais. Verifique sua conexao e tente novamente.',
        null
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function detectClassificationForm(session: SessionData, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return withClassificationAiTimeout((signal) =>
    request<DetectFormResponse>('/classification/detect-form', {
      method: 'POST',
      session,
      formData,
      signal,
    })
  );
}

export function extractAndPrepareClassification(session: SessionData, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return withClassificationAiTimeout((signal) =>
    request<ExtractAndPrepareResponse>('/classification/extract-and-prepare', {
      method: 'POST',
      session,
      formData,
      signal,
    })
  );
}

export function extractFromDetectedForm(session: SessionData, photoToken: string) {
  return withClassificationAiTimeout((signal) =>
    request<ExtractAndPrepareResponse>('/classification/extract-and-prepare', {
      method: 'POST',
      session,
      body: { photoToken },
      signal,
    })
  );
}

export function confirmClassificationFromCamera(
  session: SessionData,
  data: {
    sampleId: string;
    classificationData: { [key: string]: JsonValue };
    photoToken: string;
    classificationType?: string | null;
    classifiers: Array<{ userId: string }>;
    applySampleUpdates?: {
      declaredSacks?: number | null;
      declaredHarvest?: string | null;
    } | null;
    // Q.cls.2.7: reasonCode/reasonText vem do ClassificationReclassifyModal
    // quando o sample esta CLASSIFIED (sub-caminho 5). Backend so usa em
    // reclassificacao; em new classification ignora. Default backend:
    // 'DATA_FIX' / 'Reclassificacao via foto' (compat).
    reasonCode?: 'DATA_FIX' | 'TYPO' | 'MISSING_INFO' | 'OTHER' | null;
    reasonText?: string | null;
  }
) {
  return request<CommandResponse>('/classification/confirm', {
    method: 'POST',
    session,
    body: data,
  });
}

export function lookupUsersForReference(
  session: SessionData,
  query: { search?: string; excludeUserId?: string; limit?: number } = {}
) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.excludeUserId) params.set('excludeUserId', query.excludeUserId);
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  const suffix = params.size ? `?${params.toString()}` : '';
  return request<UserLookupResponse>(`/users/lookup${suffix}`, {
    method: 'GET',
    session,
  });
}

export function resolveSampleByLot(session: SessionData, lotNumber: string) {
  return request<ResolveSampleByLotResponse>(
    `/classification/resolve-lot?lot=${encodeURIComponent(lotNumber)}`,
    {
      method: 'GET',
      session,
    }
  );
}

// Q.print: requestQrPrint virou acao pura — backend gerencia attemptNumber
// e nao exige expectedVersion. requestQrReprint foi removido.
export function requestQrPrint(
  session: SessionData,
  sampleId: string,
  data: {
    printerId?: string | null;
    idempotencyKey?: string;
  } = {}
) {
  const body: { [key: string]: JsonValue } = {
    printerId: data.printerId ?? null,
  };

  if (typeof data.idempotencyKey === 'string' && data.idempotencyKey.length > 0) {
    body.idempotencyKey = data.idempotencyKey;
  }

  return request<CommandResponse>(`/samples/${sampleId}/qr/print/request`, {
    method: 'POST',
    session,
    body,
  });
}

// Aprovacao do contrato (Fase I, D112-D119) — endpoints da etiqueta AUDITADA.
// O prefill vem montado do backend; o envio grava o custom_print_job + a
// auditoria (approval_label_log) na MESMA transacao. (O wrapper do seletor
// de contratos saiu com o picker aposentado pela AP29.)
export function getApprovalLabelPrefill(session: SessionData, contractId: string) {
  return request<ApprovalLabelPrefill>(`/approval-labels/contracts/${contractId}/prefill`, {
    session,
  });
}

// lines = [{ label, value }] na ordem de impressao (mesmo shape do modal).
// saleContractId nulo/ausente = etiqueta AVULSA (caminho "Manual" do seletor).
export function sendApprovalLabel(
  session: SessionData,
  data: { saleContractId?: string | null; lines: Array<{ label: string; value: string }> }
) {
  return request<{ id: string; customPrintJobId: string; createdAt: string }>('/approval-labels', {
    method: 'POST',
    session,
    body: { saleContractId: data.saleContractId ?? null, lines: data.lines },
  });
}

export function recordQrPrintFailed(
  session: SessionData,
  sampleId: string,
  data: {
    attemptNumber: number;
    printerId?: string | null;
    error: string;
  }
) {
  return request<CommandResponse>(`/samples/${sampleId}/qr/print/failed`, {
    method: 'POST',
    session,
    body: {
      attemptNumber: data.attemptNumber,
      printerId: data.printerId ?? null,
      error: data.error,
    },
  });
}

export function recordQrPrinted(
  session: SessionData,
  sampleId: string,
  data: {
    attemptNumber: number;
    printerId?: string | null;
  }
) {
  return request<CommandResponse>(`/samples/${sampleId}/qr/printed`, {
    method: 'POST',
    session,
    body: {
      attemptNumber: data.attemptNumber,
      printerId: data.printerId ?? null,
    },
  });
}

// CL13 (auditoria 2026-07-13): a antiga completeClassification (front) foi
// removida — funcao morta com o contrato PRE-ficha-unificada (mk9/10/11,
// umidade, pau, peneirasPercentuais). Classificacao acontece exclusivamente
// via confirmClassificationFromCamera + updateClassification.

export function updateRegistration(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    after: { [key: string]: JsonValue };
    reasonCode?: UpdateReasonCode;
    reasonText?: string;
    before?: { [key: string]: JsonValue };
    /** Liga: confirma a propagacao da safra para as ligas ancestrais. Sem isso,
     *  uma edicao de safra que afeta ligas retorna 409 BLEND_HARVEST_PROPAGATION_REQUIRED. */
    confirmHarvestPropagation?: boolean;
  }
) {
  const body: { [key: string]: JsonValue } = {
    expectedVersion: data.expectedVersion,
    after: data.after,
  };

  if (data.reasonCode) {
    body.reasonCode = data.reasonCode;
  }

  if (typeof data.reasonText === 'string') {
    body.reasonText = data.reasonText;
  }

  if (data.before) {
    body.before = data.before;
  }

  if (data.confirmHarvestPropagation === true) {
    body.confirmHarvestPropagation = true;
  }

  return request<CommandResponse>(`/samples/${sampleId}/registration/update`, {
    method: 'POST',
    session,
    body,
  });
}

export function updateClassification(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    after: { [key: string]: JsonValue };
    reasonCode?: UpdateReasonCode;
    reasonText?: string;
    before?: { [key: string]: JsonValue };
    // Q.cls.2 audit do tipo: passado top-level. Backend detect mudanca
    // (vs sample.classificationType) e inclui no payload do evento.
    // Aceita tipo-only update — `after` pode ser {} se SO o tipo mudou.
    classificationType?: ClassificationType | null;
  }
) {
  const body: { [key: string]: JsonValue } = {
    expectedVersion: data.expectedVersion,
    after: data.after,
  };

  if (data.reasonCode) {
    body.reasonCode = data.reasonCode;
  }
  if (data.reasonText) {
    body.reasonText = data.reasonText;
  }
  if (data.before) {
    body.before = data.before;
  }
  if (data.classificationType !== undefined) {
    body.classificationType = data.classificationType;
  }

  return request<CommandResponse>(`/samples/${sampleId}/classification/update`, {
    method: 'POST',
    session,
    body,
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
      reasonText: data.reasonText,
    },
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
    reasonText: data.reasonText,
  };

  if (typeof data.idempotencyKey === 'string' && data.idempotencyKey.length > 0) {
    body.idempotencyKey = data.idempotencyKey;
  }

  return request<CommandResponse>(`/samples/${sampleId}/invalidate`, {
    method: 'POST',
    session,
    body,
  });
}

export function updateCommercialStatus(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    toCommercialStatus: 'OPEN' | 'PARTIALLY_SOLD' | 'SOLD' | 'LOST';
    reasonText: string;
    idempotencyKey?: string;
  }
) {
  const body: { [key: string]: JsonValue } = {
    expectedVersion: data.expectedVersion,
    toCommercialStatus: data.toCommercialStatus,
    reasonText: data.reasonText,
  };

  if (typeof data.idempotencyKey === 'string' && data.idempotencyKey.length > 0) {
    body.idempotencyKey = data.idempotencyKey;
  }

  return request<CommandResponse>(`/samples/${sampleId}/commercial-status`, {
    method: 'POST',
    session,
    body,
  });
}

export function listSampleMovements(
  session: SessionData,
  sampleId: string,
  query: { movementType?: string; status?: string } = {}
) {
  const params = new URLSearchParams();
  if (query.movementType) params.set('movementType', query.movementType);
  if (query.status) params.set('status', query.status);
  const suffix = params.size ? `?${params.toString()}` : '';

  return request<SampleMovementsResponse>(`/samples/${sampleId}/movements${suffix}`, {
    method: 'GET',
    session,
  });
}

export function createSampleMovement(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    movementType: 'SALE' | 'LOSS';
    buyerClientId?: string | null;
    buyerUnitId?: string | null;
    quantitySacks: number;
    movementDate: string;
    notes?: string | null;
    lossReasonText?: string | null;
    // Fechamento (Fase B.2): termos do contrato exigidos na venda a vista (SALE).
    unitPrice?: number;
    sellerBrokeragePct?: number;
    buyerBrokeragePct?: number;
    brokerIds?: string[];
  }
) {
  return request<CommandResponse>(`/samples/${sampleId}/movements`, {
    method: 'POST',
    session,
    body: data,
  });
}

export function updateSampleMovement(
  session: SessionData,
  sampleId: string,
  movementId: string,
  data: {
    expectedVersion: number;
    after: { [key: string]: JsonValue };
    reasonText: string;
  }
) {
  return request<CommandResponse>(`/samples/${sampleId}/movements/${movementId}`, {
    method: 'PATCH',
    session,
    body: data,
  });
}

export function cancelSampleMovement(
  session: SessionData,
  sampleId: string,
  movementId: string,
  data: {
    expectedVersion: number;
    reasonText: string;
  }
) {
  return request<CommandResponse>(`/samples/${sampleId}/movements/${movementId}/cancel`, {
    method: 'POST',
    session,
    body: data,
  });
}

export function listSampleEvents(
  session: SessionData,
  sampleId: string,
  query: { limit?: number; afterSequence?: number } = {}
) {
  const params = new URLSearchParams();
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  if (typeof query.afterSequence === 'number')
    params.set('afterSequence', String(query.afterSequence));

  const suffix = params.size ? `?${params.toString()}` : '';
  return request<SampleEventsResponse>(`/samples/${sampleId}/events${suffix}`, {
    method: 'GET',
    session,
  });
}

// ── Relatorios: VISITA unificada (prospector + comercial) + SEMANAL ──

// A visita NASCE VINCULADA (clientId obrigatorio no backend); os campos de
// dominio (fazenda/interesse/comercializa + motivo/resultado) sao opcionais.
// Sem fila offline (online-only desde a unificacao 2026-07-15).
export function createVisitReport(
  session: SessionData,
  data: {
    clientKind: VisitClientKind;
    clientId: string | null;
    newClientName: string | null;
    newClientCity: string | null;
    newClientPhone: string | null;
    farmSize: VisitFarmSize | null;
    farmSizeNotes: string | null;
    interestLevel: VisitInterestLevel | null;
    interestNotes: string | null;
    sellsCurrently: boolean | null;
    sellsToWhom: string | null;
    reason: CommercialVisitReason | null;
    reasonNotes: string | null;
    outcome: CommercialVisitOutcome | null;
    outcomeNotes: string | null;
    generalNotes: string | null;
  }
) {
  return request<VisitReportMutationResponse>('/visit-reports', {
    method: 'POST',
    session,
    body: data,
  });
}

// Cancelamento SOFT (a visita e imutavel): DELETE = cancelar. Devolve a view
// atualizada (cancelledAt preenchido). So o proprio autor (regra no backend).
export function cancelVisitReport(session: SessionData, reportId: string) {
  return request<VisitReportMutationResponse>(`/visit-reports/${reportId}`, {
    method: 'DELETE',
    session,
  });
}

export function listVisitReports(
  session: SessionData,
  query: { page?: number; limit?: number; search?: string } = {}
) {
  const params = new URLSearchParams();
  if (typeof query.page === 'number') params.set('page', String(query.page));
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  if (query.search) params.set('search', query.search);

  const suffix = params.size ? `?${params.toString()}` : '';
  return request<VisitReportsListResponse>(`/visit-reports${suffix}`, {
    method: 'GET',
    session,
  });
}

export function getMyVisitReportStats(session: SessionData) {
  return request<VisitReportStatsResponse>('/visit-reports/stats', {
    method: 'GET',
    session,
  });
}

// Cards do topo da pagina "Relatorios": semana atual + anterior (delta na UI)
// e a tendencia semanal do grafico.
export function getRelatoriosStats(session: SessionData) {
  return request<RelatoriosStatsResponse>('/relatorios/stats', {
    method: 'GET',
    session,
  });
}

// Relatorio SEMANAL — so ADMIN + COMMERCIAL criam (gate no backend).
export function createWeeklyReport(
  session: SessionData,
  data: {
    summary: string;
    difficulties: string | null;
    nextWeekPlan: string | null;
  }
) {
  return request<WeeklyReportMutationResponse>('/weekly-reports', {
    method: 'POST',
    session,
    body: data,
  });
}

// Cancelamento SOFT do semanal (DELETE = cancelar; so o proprio autor).
export function cancelWeeklyReport(session: SessionData, reportId: string) {
  return request<WeeklyReportMutationResponse>(`/weekly-reports/${reportId}`, {
    method: 'DELETE',
    session,
  });
}

// Feed da pagina "Relatorios" (escopo `all` fixo): visita + semanal de todos,
// com filtros opcionais (busca/tipo/autor/periodo/status). Hoje a UI so envia
// page/limit/search/type — os filtros da pagina viraram chips de tipo.
export function listInformeFeed(session: SessionData, query: InformeFeedQuery = {}) {
  const params = new URLSearchParams();
  if (typeof query.page === 'number') params.set('page', String(query.page));
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  if (query.search) params.set('search', query.search);
  if (query.type) params.set('type', query.type);
  if (query.authorId) params.set('authorId', query.authorId);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.status) params.set('status', query.status);

  const suffix = params.size ? `?${params.toString()}` : '';
  return request<InformeFeedResponse>(`/informe-feed${suffix}`, {
    method: 'GET',
    session,
  });
}

// ── Web Push ──

export function getPushConfig(session: SessionData, endpoint?: string | null) {
  const params = new URLSearchParams();
  if (endpoint) params.set('endpoint', endpoint);

  const suffix = params.size ? `?${params.toString()}` : '';
  return request<PushConfigResponse>(`/push/config${suffix}`, {
    method: 'GET',
    session,
  });
}

export function savePushSubscription(
  session: SessionData,
  data: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    userAgent?: string | null;
  }
) {
  return request<PushSubscriptionMutationResponse>('/push/subscriptions', {
    method: 'POST',
    session,
    body: data,
  });
}

export function deletePushSubscription(session: SessionData, endpoint: string) {
  return request<PushSubscriptionMutationResponse>('/push/subscriptions', {
    method: 'DELETE',
    session,
    body: { endpoint },
  });
}
