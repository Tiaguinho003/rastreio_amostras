import type {
  ClientAuditListResponse,
  ClientCommercialSummaryResponse,
  ClientDetailResponse,
  ClientLookupKind,
  ClientLookupResponse,
  ClientPurchasesListResponse,
  ClientRegistrationMutationResponse,
  ClientResponse,
  ClientSamplesListResponse,
  ClientsListResponse,
  CommandResponse,
  CreateSampleAndPreparePrintResponse,
  DashboardPendingResponse,
  DashboardSalesAvailabilityResponse,
  InvalidateReasonCode,
  PendingPrintQueueResponse,
  ListSamplesResponse,
  PasswordResetCodeVerificationResponse,
  PasswordResetRequestResponse,
  ResolveSampleByQrResponse,
  SampleDetailResponse,
  SampleMovementsResponse,
  SampleEventsResponse,
  SessionData,
  SampleExportType,
  UpdateReasonCode,
  UserAuditListResponse,
  UserMutationResponse,
  UserPasswordMutationResponse,
  UserResponse,
  UsersListResponse,
  WarehouseLookupResponse,
  WarehouseSummary
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
type PhotoKind = 'CLASSIFICATION_PHOTO';

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
    method?: 'GET' | 'POST' | 'PATCH';
    body?: JsonValue;
    session?: SessionData | null;
    formData?: FormData;
    signal?: AbortSignal;
  } = {}
): Promise<TResponse> {
  const { method = 'GET', body, formData, signal } = options;

  const headers: HeadersInit = {};
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
      cache: 'no-store',
      credentials: 'same-origin',
      signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    throw new ApiError(0, 'Sem conexao com o servidor. Verifique sua internet e tente novamente.', null);
  }

  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    const maybeError = payload.error as { message?: string; details?: unknown } | undefined;
    throw new ApiError(response.status, maybeError?.message ?? 'Erro ao processar a solicitacao.', maybeError?.details ?? null);
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
    body: { username, password }
  });
}

export function getCurrentSession() {
  return request<SessionData>('/auth/session', {
    method: 'GET'
  });
}

export function logout(session?: SessionData | null) {
  return request<{ ok: boolean }>('/auth/logout', {
    method: 'POST',
    session: session ?? null
  });
}

export function requestPasswordReset(email: string) {
  return request<PasswordResetRequestResponse>('/auth/forgot-password/request', {
    method: 'POST',
    body: { email }
  });
}

export function verifyPasswordResetCode(email: string, code: string) {
  return request<PasswordResetCodeVerificationResponse>('/auth/forgot-password/verify-code', {
    method: 'POST',
    body: { email, code }
  });
}

export function resetPasswordWithCode(email: string, code: string, password: string) {
  return request<UserResponse>('/auth/forgot-password/reset', {
    method: 'POST',
    body: { email, code, password }
  });
}

export function getCurrentUser(session: SessionData) {
  return request<UserResponse>('/users/me', {
    method: 'GET',
    session
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
    body: data
  });
}

export function changeCurrentUserPassword(session: SessionData, password: string) {
  return request<UserMutationResponse>('/users/me/password', {
    method: 'POST',
    session,
    body: { password }
  });
}

export function requestCurrentUserEmailChange(session: SessionData, email: string) {
  return request<UserResponse>('/users/me/email/request-change', {
    method: 'POST',
    session,
    body: { email }
  });
}

export function resendCurrentUserEmailChangeCode(session: SessionData) {
  return request<UserResponse>('/users/me/email/resend', {
    method: 'POST',
    session
  });
}

export function confirmCurrentUserEmailChange(session: SessionData, code: string) {
  return request<UserResponse>('/users/me/email/confirm-change', {
    method: 'POST',
    session,
    body: { code }
  });
}

export function recordInitialPasswordDecision(session: SessionData, decision: 'KEPT' | 'CHANGED') {
  return request<UserResponse>('/users/me/initial-password-decision', {
    method: 'POST',
    session,
    body: { decision }
  });
}

export function listUsers(
  session: SessionData,
  query: {
    search?: string;
    role?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}
) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.role) params.set('role', query.role);
  if (query.status) params.set('status', query.status);
  if (typeof query.page === 'number') params.set('page', String(query.page));
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  const suffix = params.size ? `?${params.toString()}` : '';
  return request<UsersListResponse>(`/users${suffix}`, {
    method: 'GET',
    session
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
    page?: number;
    limit?: number;
  } = {},
  options: { signal?: AbortSignal } = {}
) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  if (query.personType) params.set('personType', query.personType);
  if (typeof query.isBuyer === 'boolean') params.set('isBuyer', String(query.isBuyer));
  if (typeof query.isSeller === 'boolean') params.set('isSeller', String(query.isSeller));
  if (typeof query.page === 'number') params.set('page', String(query.page));
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  const suffix = params.size ? `?${params.toString()}` : '';

  return request<ClientsListResponse>(`/clients${suffix}`, {
    method: 'GET',
    session,
    signal: options.signal
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
    session
  });
}

export function lookupWarehouses(
  session: SessionData,
  query: {
    search: string;
  }
) {
  const params = new URLSearchParams();
  params.set('search', query.search);

  return request<WarehouseLookupResponse>(`/warehouses/lookup?${params.toString()}`, {
    method: 'GET',
    session
  });
}

export function listWarehouses(
  session: SessionData,
  query: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {},
  options: { signal?: AbortSignal } = {}
) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  if (typeof query.page === 'number') params.set('page', String(query.page));
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  const suffix = params.size ? `?${params.toString()}` : '';

  return request<{ items: WarehouseSummary[]; page: { limit: number; page: number; total: number; totalPages: number; hasPrev: boolean; hasNext: boolean } }>(`/warehouses${suffix}`, {
    method: 'GET',
    session,
    signal: options.signal
  });
}

export function createWarehouse(
  session: SessionData,
  data: { name: string; address?: string | null; phone?: string | null }
) {
  return request<{ warehouse: WarehouseSummary }>('/warehouses', {
    method: 'POST',
    session,
    body: data
  });
}

export function getWarehouse(session: SessionData, warehouseId: string) {
  return request<{ warehouse: WarehouseSummary }>(`/warehouses/${warehouseId}`, {
    method: 'GET',
    session
  });
}

export function updateWarehouse(
  session: SessionData,
  warehouseId: string,
  data: { name?: string; address?: string | null; phone?: string | null; reasonText?: string | null }
) {
  return request<{ warehouse: WarehouseSummary }>(`/warehouses/${warehouseId}`, {
    method: 'PATCH',
    session,
    body: data
  });
}

export function inactivateWarehouse(session: SessionData, warehouseId: string, data: { reasonText: string }) {
  return request<{ warehouse: WarehouseSummary }>(`/warehouses/${warehouseId}/inactivate`, {
    method: 'POST',
    session,
    body: data
  });
}

export function reactivateWarehouse(session: SessionData, warehouseId: string, data: { reasonText: string }) {
  return request<{ warehouse: WarehouseSummary }>(`/warehouses/${warehouseId}/reactivate`, {
    method: 'POST',
    session,
    body: data
  });
}

export function getClient(session: SessionData, clientId: string, options: { signal?: AbortSignal } = {}) {
  return request<ClientDetailResponse>(`/clients/${clientId}`, {
    method: 'GET',
    session,
    signal: options.signal
  });
}

export function createClient(
  session: SessionData,
  data: {
    personType: 'PF' | 'PJ';
    fullName?: string;
    legalName?: string;
    tradeName?: string | null;
    cpf?: string;
    cnpj?: string;
    phone?: string | null;
    isBuyer: boolean;
    isSeller: boolean;
  }
) {
  return request<ClientResponse>('/clients', {
    method: 'POST',
    session,
    body: data
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
    cpf?: string;
    cnpj?: string;
    phone?: string | null;
    isBuyer?: boolean;
    isSeller?: boolean;
    reasonText: string;
  }
) {
  return request<ClientResponse>(`/clients/${clientId}`, {
    method: 'PATCH',
    session,
    body: data
  });
}

export function getClientImpact(session: SessionData, clientId: string) {
  return request<{
    client: { id: string; displayName: string; status: string };
    usage: { ownedSamples: number; activeMovements: number; activeRegistrations: number };
  }>(`/clients/${clientId}/impact`, { session });
}

export function listClientSamples(
  session: SessionData,
  clientId: string,
  query?: {
    page?: number;
    limit?: number;
    search?: string;
    buyer?: string;
    commercialStatus?: string;
    harvest?: string;
    sacksMin?: string;
    sacksMax?: string;
    periodMode?: string;
    periodValue?: string;
  },
  options?: { signal?: AbortSignal }
) {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.search) params.set('search', query.search);
  if (query?.buyer) params.set('buyer', query.buyer);
  if (query?.commercialStatus) params.set('commercialStatus', query.commercialStatus);
  if (query?.harvest) params.set('harvest', query.harvest);
  if (query?.sacksMin) params.set('sacksMin', query.sacksMin);
  if (query?.sacksMax) params.set('sacksMax', query.sacksMax);
  if (query?.periodMode) params.set('periodMode', query.periodMode);
  if (query?.periodValue) params.set('periodValue', query.periodValue);
  const qs = params.toString();
  return request<ClientSamplesListResponse>(`/clients/${clientId}/samples${qs ? `?${qs}` : ''}`, { session, signal: options?.signal });
}

export function listClientPurchases(
  session: SessionData,
  clientId: string,
  query?: {
    page?: number;
    limit?: number;
    search?: string;
    owner?: string;
    sacksMin?: string;
    sacksMax?: string;
    periodMode?: string;
    periodValue?: string;
  },
  options?: { signal?: AbortSignal }
) {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.search) params.set('search', query.search);
  if (query?.owner) params.set('owner', query.owner);
  if (query?.sacksMin) params.set('sacksMin', query.sacksMin);
  if (query?.sacksMax) params.set('sacksMax', query.sacksMax);
  if (query?.periodMode) params.set('periodMode', query.periodMode);
  if (query?.periodValue) params.set('periodValue', query.periodValue);
  const qs = params.toString();
  return request<ClientPurchasesListResponse>(`/clients/${clientId}/purchases${qs ? `?${qs}` : ''}`, { session, signal: options?.signal });
}

export function getClientCommercialSummary(
  session: SessionData,
  clientId: string,
  options?: { signal?: AbortSignal }
) {
  return request<ClientCommercialSummaryResponse>(`/clients/${clientId}/commercial-summary`, { session, signal: options?.signal });
}

export function inactivateClient(session: SessionData, clientId: string, reasonText: string) {
  return request<ClientResponse>(`/clients/${clientId}/inactivate`, {
    method: 'POST',
    session,
    body: { reasonText }
  });
}

export function reactivateClient(session: SessionData, clientId: string, reasonText: string) {
  return request<ClientResponse>(`/clients/${clientId}/reactivate`, {
    method: 'POST',
    session,
    body: { reasonText }
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
    signal: options.signal
  });
}

export function createClientRegistration(
  session: SessionData,
  clientId: string,
  data: {
    registrationNumber: string;
    registrationType: string;
    addressLine: string;
    district: string;
    city: string;
    state: string;
    postalCode: string;
    complement?: string | null;
  }
) {
  return request<ClientRegistrationMutationResponse>(`/clients/${clientId}/registrations`, {
    method: 'POST',
    session,
    body: data
  });
}

export function updateClientRegistration(
  session: SessionData,
  clientId: string,
  registrationId: string,
  data: {
    registrationNumber?: string;
    registrationType?: string;
    addressLine?: string;
    district?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    complement?: string | null;
    reasonText: string;
  }
) {
  return request<ClientRegistrationMutationResponse>(`/clients/${clientId}/registrations/${registrationId}`, {
    method: 'PATCH',
    session,
    body: data
  });
}

export function inactivateClientRegistration(
  session: SessionData,
  clientId: string,
  registrationId: string,
  reasonText: string
) {
  return request<ClientRegistrationMutationResponse>(`/clients/${clientId}/registrations/${registrationId}/inactivate`, {
    method: 'POST',
    session,
    body: { reasonText }
  });
}

export function reactivateClientRegistration(
  session: SessionData,
  clientId: string,
  registrationId: string,
  reasonText: string
) {
  return request<ClientRegistrationMutationResponse>(`/clients/${clientId}/registrations/${registrationId}/reactivate`, {
    method: 'POST',
    session,
    body: { reasonText }
  });
}

export function getUser(session: SessionData, userId: string) {
  return request<UserResponse>(`/users/${userId}`, {
    method: 'GET',
    session
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
    body: data
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
    body: data
  });
}

export function inactivateUser(session: SessionData, userId: string, reasonText: string) {
  return request<UserResponse>(`/users/${userId}/inactivate`, {
    method: 'POST',
    session,
    body: { reasonText }
  });
}

export function reactivateUser(session: SessionData, userId: string) {
  return request<UserResponse>(`/users/${userId}/reactivate`, {
    method: 'POST',
    session
  });
}

export function unlockUser(session: SessionData, userId: string) {
  return request<UserResponse>(`/users/${userId}/unlock`, {
    method: 'POST',
    session
  });
}

export function resetUserPassword(session: SessionData, userId: string, password: string) {
  return request<UserPasswordMutationResponse>(`/users/${userId}/password/reset`, {
    method: 'POST',
    session,
    body: { password }
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
    session
  });
}

export function getDashboardPending(session: SessionData) {
  return request<DashboardPendingResponse>('/dashboard/pending', {
    method: 'GET',
    session
  });
}

export function getDashboardSalesAvailability(session: SessionData) {
  return request<DashboardSalesAvailabilityResponse>('/dashboard/sales-availability', {
    method: 'GET',
    session
  });
}

export function getPendingPrintJobs(session: SessionData, options: { limit?: number; sampleId?: string } = {}) {
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
    session
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
    lot?: string;
    owner?: string;
    buyer?: string;
    statusGroup?: string;
    commercialStatus?: string;
    harvest?: string;
    sacksMin?: string;
    sacksMax?: string;
    createdDate?: string;
    createdMonth?: string;
    createdYear?: string;
    classifiedAging?: string;
  } = {},
  options: { signal?: AbortSignal } = {}
) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));
  if (typeof query.offset === 'number') params.set('offset', String(query.offset));
  if (typeof query.page === 'number') params.set('page', String(query.page));
  if (query.lot) params.set('lot', query.lot);
  if (query.owner) params.set('owner', query.owner);
  if (query.buyer) params.set('buyer', query.buyer);
  if (query.statusGroup) params.set('statusGroup', query.statusGroup);
  if (query.commercialStatus) params.set('commercialStatus', query.commercialStatus);
  if (query.harvest) params.set('harvest', query.harvest);
  if (query.sacksMin) params.set('sacksMin', query.sacksMin);
  if (query.sacksMax) params.set('sacksMax', query.sacksMax);
  if (query.createdDate) params.set('createdDate', query.createdDate);
  if (query.createdMonth) params.set('createdMonth', query.createdMonth);
  if (query.createdYear) params.set('createdYear', query.createdYear);
  if (query.classifiedAging) params.set('classifiedAging', query.classifiedAging);

  const suffix = params.size ? `?${params.toString()}` : '';
  return request<ListSamplesResponse>(`/samples${suffix}`, {
    method: 'GET',
    session,
    signal: options.signal
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
    ownerClientId?: string | null;
    ownerRegistrationId?: string | null;
    sacks: number;
    harvest: string;
    originLot: string;
    receivedChannel?: 'in_person' | 'courier' | 'driver' | 'other';
    notes?: string | null;
    printerId?: string | null;
    warehouseName?: string | null;
    warehouseId?: string | null;
  }
) {
  return request<CreateSampleAndPreparePrintResponse>('/samples/create', {
    method: 'POST',
    session,
    body: {
      clientDraftId: data.clientDraftId,
      owner: data.owner,
      ownerClientId: data.ownerClientId ?? null,
      ownerRegistrationId: data.ownerRegistrationId ?? null,
      sacks: data.sacks,
      harvest: data.harvest,
      originLot: data.originLot,
      receivedChannel: data.receivedChannel ?? 'in_person',
      notes: data.notes ?? null,
      printerId: data.printerId ?? null,
      warehouseName: data.warehouseName ?? null,
      warehouseId: data.warehouseId ?? null
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
    signal: query.signal
  });
}

export async function exportSamplePdf(
  session: SessionData,
  sampleId: string,
  data: {
    exportType: SampleExportType;
    destination?: string | null;
    recipientClientId?: string | null;
  }
) {
  const response = await fetch(`${API_BASE}/samples/${sampleId}/export/pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      exportType: data.exportType,
      destination: data.destination ?? null,
      recipientClientId: data.recipientClientId ?? null
    }),
    cache: 'no-store',
    credentials: 'same-origin'
  });

  if (!response.ok) {
    const payload = await parseJsonSafe(response);
    const maybeError = payload.error as { message?: string; details?: unknown } | undefined;
    throw new ApiError(response.status, maybeError?.message ?? 'Erro ao processar a solicitacao.', maybeError?.details ?? null);
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

export function recordPhysicalSampleSent(
  session: SessionData,
  sampleId: string,
  data: {
    recipientClientId: string;
    sentDate: string;
  }
) {
  return request<CommandResponse>(`/samples/${sampleId}/physical-send`, {
    method: 'POST',
    session,
    body: {
      recipientClientId: data.recipientClientId,
      sentDate: data.sentDate
    }
  });
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
    ownerClientId?: string | null;
    ownerRegistrationId?: string | null;
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
      ownerClientId: data.ownerClientId ?? null,
      ownerRegistrationId: data.ownerRegistrationId ?? null,
      declared: data.declared
    }
  });
}

export function requestQrPrint(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    attemptNumber?: number;
    printerId?: string | null;
  }
) {
  const body: { [key: string]: JsonValue } = {
    expectedVersion: data.expectedVersion,
    printerId: data.printerId ?? null
  };

  if (typeof data.attemptNumber === 'number') {
    body.attemptNumber = data.attemptNumber;
  }

  return request<CommandResponse>(`/samples/${sampleId}/qr/print/request`, {
    method: 'POST',
    session,
    body
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
      broca?: string | null;
      pva?: string | null;
      imp?: string | null;
      pau?: string | null;
      classificador?: string | null;
      peneirasPercentuais?: {
        p18?: number | null;
        p17?: number | null;
        p16?: number | null;
        p15?: number | null;
        p14?: number | null;
        p13?: number | null;
        p12?: number | null;
        p10?: number | null;
        mk9?: number | null;
        mk10?: number | null;
        mk11?: number | null;
        fundos?: Array<{ peneira: string; percentual: number }> | null;
      } | null;
      defeito?: string | null;
      umidade?: number | null;
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
    reasonCode?: UpdateReasonCode;
    reasonText?: string;
    before?: { [key: string]: JsonValue };
  }
) {
  const body: { [key: string]: JsonValue } = {
    expectedVersion: data.expectedVersion,
    after: data.after
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
    reasonText: data.reasonText
  };

  if (typeof data.idempotencyKey === 'string' && data.idempotencyKey.length > 0) {
    body.idempotencyKey = data.idempotencyKey;
  }

  return request<CommandResponse>(`/samples/${sampleId}/commercial-status`, {
    method: 'POST',
    session,
    body
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
    session
  });
}

export function createSampleMovement(
  session: SessionData,
  sampleId: string,
  data: {
    expectedVersion: number;
    movementType: 'SALE' | 'LOSS';
    buyerClientId?: string | null;
    buyerRegistrationId?: string | null;
    quantitySacks: number;
    movementDate: string;
    notes?: string | null;
    lossReasonText?: string | null;
  }
) {
  return request<CommandResponse>(`/samples/${sampleId}/movements`, {
    method: 'POST',
    session,
    body: data
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
    body: data
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
    body: data
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
