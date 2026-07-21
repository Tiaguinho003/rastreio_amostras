export type UserRole =
  | 'ADMIN'
  | 'CLASSIFIER'
  | 'REGISTRATION'
  | 'COMMERCIAL'
  | 'PROSPECTOR'
  | 'CADASTRO';
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
export type ClientLookupKind = 'owner' | 'buyer' | 'warehouse' | 'any';
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
    total: number;
    // Scroll infinito por cursor (fullName ASC, id ASC). null = ultima pagina.
    nextCursor: { fullName: string; id: string } | null;
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
  isWarehouse: boolean;
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

// RD14: KPI row de /cadastros. Contagens GLOBAIS (sem filtros da lista);
// "incomplete" = so clientes ATIVOS incompletos; "newThisMonth" = criados no
// mes corrente (BRT).
export interface ClientStatsResponse {
  total: number;
  active: number;
  incomplete: number;
  newThisMonth: number;
  /** Criados dentro do mês anterior (BRT) — base do "vs mês anterior". */
  newLastMonth: number;
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

// --- Fechamento Fase 0: contas bancarias e anexos do cliente ---
// (Entidade Bank removida na D141 — banco virou texto livre na conta.)

export type LookupStatus = 'ACTIVE' | 'INACTIVE';

export interface Broker {
  id: string;
  name: string;
  userId: string | null;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  status: LookupStatus;
  user: { id: string; fullName: string; username: string } | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BrokerInput {
  name: string;
  userId?: string | null;
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface BrokerListResponse {
  items: Broker[];
}

export interface BrokerResponse {
  broker: Broker;
}

// Fechamento (Fase B.2): contrato de venda "Mercado a vista". Os snapshots sao
// JSON congelados de identidade/banco/armazens (preenchidos ao longo do fluxo).
export type SaleContractType = 'MERCADO_A_VISTA' | 'FUTURO';
export type SaleContractStatus = 'EMITIDO' | 'FATURADO' | 'PAGO' | 'WASH_OUT';
export type AgioDesagioType = 'AGIO' | 'DESAGIO';

export interface SaleContractBrokerView {
  id: string;
  brokerId: string;
  brokerNameSnapshot: string;
}

// Aprovação do contrato (Fase I, D112–D119): prefill da etiqueta montado no
// backend (campos já cortados nos limites físicos e lotes quebrados do Lote
// de origem, D115/D116).
export interface ApprovalLabelPrefill {
  fields: {
    compra: string;
    fechamento: string;
    produtor: string;
    armazem: string;
    sacas: string;
  };
  lots: string[];
  originLotText: string | null;
}

export interface SaleContract {
  id: string;
  type: SaleContractType;
  contractSeq: number;
  contractNumber: string;
  status: SaleContractStatus;
  washoutReason: string | null;
  washoutAt: string | null;
  contractDate: string | null;
  purchaseNumber: string | null;
  sampleId: string | null;
  movementId: string | null;
  sellerClientId: string | null;
  sellerUnitId: string | null;
  sellerSnapshot: Record<string, unknown> | null;
  buyerClientId: string | null;
  buyerUnitId: string | null;
  buyerSnapshot: Record<string, unknown> | null;
  buyerWarehouseClientId: string | null;
  buyerWarehouseSnapshot: Record<string, unknown> | null;
  sellerWarehouseClientId: string | null;
  sellerWarehouseSnapshot: Record<string, unknown> | null;
  sellerBankAccountId: string | null;
  sellerBankSnapshot: Record<string, unknown> | null;
  quantitySacks: number;
  unitPrice: number | null;
  agioDesagioType: AgioDesagioType | null;
  agioDesagioValue: number | null;
  // Espelho: preço efetivo/saca (cru ± ágio) da fonte única — a Conferência lê daqui.
  effectiveUnitPrice: number | null;
  totalValue: number | null;
  weightKg: number | null;
  sellerBrokeragePct: number | null;
  sellerBrokerageValue: number | null;
  buyerBrokeragePct: number | null;
  buyerBrokerageValue: number | null;
  paymentCondition: string | null;
  paymentFormId: string | null;
  paymentFormText: string | null;
  modalityId: string | null;
  modalityText: string | null;
  packagingId: string | null;
  packagingText: string | null;
  invoiceDate: string | null;
  paymentDate: string | null;
  invoicedAt: string | null;
  paidAt: string | null;
  observations: string | null;
  description: string | null;
  // Aprovacao (reforma AP1/AP6): sinal + lembrete (dias antes do faturamento).
  requiresApproval: boolean;
  approvalReminderLeadDays: number | null;
  // Embarque (EMB21/EMB22): sinal herdado da modalidade + data real do embarque.
  requiresShipment: boolean;
  shippedAt: string | null;
  // Embarque FASE 2 (EMB30): transporte + nome do responsável (snapshot), só no Detalhes.
  shipmentCarrier: 'COMPANY' | 'THIRD_PARTY' | null;
  shipmentResponsibleName: string | null;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SaleContractDetail extends SaleContract {
  brokers: SaleContractBrokerView[];
  // Liga? — quando o contrato a vista vem de uma liga (isBlend), as sacas sao
  // travadas (F7.1). null quando nao ha amostra vinculada (ex.: Futuro).
  sampleIsBlend: boolean | null;
}

// Embarque (EMB27) — fotos da confirmacao. A view nao expoe storagePath/checksum;
// o download e por rota-proxy autenticada (shipmentPhotoDownloadUrl).
export interface ShipmentPhoto {
  id: string;
  contractId: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string | null;
}

export interface ShipmentPhotoListResponse {
  items: ShipmentPhoto[];
}

// Resumo NAO-sensivel do embarque (sem preco/corretagem): modal de confirmacao
// (worklist + portao do pagamento) e secao "Embarque" do Detalhes.
export interface ShipmentContext {
  contractId: string;
  contractNumber: string;
  status: SaleContractStatus;
  quantitySacks: number;
  invoiceDate: string | null;
  requiresShipment: boolean;
  shippedAt: string | null;
  buyerName: string | null;
  sellerWarehouse: string | null;
}

export interface ShipmentContextResponse {
  context: ShipmentContext;
}

// Fechamento ("Editar"): bloco da fase 1 (venda) editavel num contrato emitido.
// Presente so no "Editar"; ausente no wizard create->emit (o create ja os fixou).
export interface SaleContractSaleFieldsInput {
  quantitySacks: number;
  unitPrice: number;
  sellerBrokeragePct: number;
  buyerBrokeragePct: number;
  contractDate: string;
  brokerIds: string[];
}

// Fechamento (D97): criacao de um contrato num passo so — nasce EMITIDO. Combina
// a fase 1 (comercial + comprador) com a etapa 2 completa (vendedor, banco,
// filiais, armazens, listas, datas, textos). A vista (MERCADO_A_VISTA) traz
// sampleId + expectedVersion (registra a venda no lote); Futuro (FUTURO) nao tem
// lote.
export interface CreateSaleContractInput {
  type: SaleContractType;
  sampleId?: string;
  expectedVersion?: number;
  // fase 1 (comercial + comprador)
  buyerClientId: string;
  quantitySacks: number;
  unitPrice: number;
  sellerBrokeragePct: number;
  buyerBrokeragePct: number;
  contractDate: string;
  brokerIds: string[];
  // etapa 2
  sellerClientId: string;
  sellerUnitId?: string | null;
  buyerUnitId?: string | null;
  sellerBankAccountId: string;
  buyerWarehouseClientId?: string | null;
  sellerWarehouseClientId?: string | null;
  paymentFormId: string;
  modalityId: string;
  packagingId: string;
  // D144: null explícito = "À definir" (aceito só quando o contrato é FUTURO).
  invoiceDate: string | null;
  paymentDate: string | null;
  purchaseNumber?: string | null;
  paymentCondition?: string | null;
  observations?: string | null;
  description?: string | null;
  weightKg?: number | null;
  agioDesagioType?: AgioDesagioType | null;
  agioDesagioValue?: number | null;
  // Aprovacao (reforma AP1/AP6): sinal obrigatorio + lembrete (opcional; so quando Sim).
  requiresApproval: boolean;
  approvalReminderLeadDays?: number | null;
}

export interface SaleContractListResponse {
  items: SaleContract[];
}

export interface SaleContractResponse {
  contract: SaleContractDetail;
}

// Fase J (D125): item do timeline do modal de Detalhes — auditorias agregadas
// (criação/edições, ágio, aprovações, marcos de status, espelhos) em ordem
// decrescente. `legacy` = marco anterior à sale_contract_status_log (só data,
// sem autor).
export interface SaleContractTimelineItem {
  id: string;
  kind: 'CRIACAO' | 'EDICAO' | 'AGIO' | 'APROVACAO' | 'STATUS' | 'ESPELHO';
  at: string;
  actorUserId: string | null;
  actorName: string | null;
  agioDesagioType?: AgioDesagioType;
  agioDesagioValue?: number | null;
  toStatus?: SaleContractStatus;
  reason?: string | null;
  legacy?: boolean;
  side?: string;
}

export interface SaleContractTimelineResponse {
  items: SaleContractTimelineItem[];
}

// Financeiro (Fase F): corretagem a receber por fechamento (relatório derivado).
export interface FinanceiroBroker {
  brokerId: string;
  name: string;
}

// Revisão do Pagamento (FN1): estado de pagamento derivado — a lente do Financeiro.
export type FinanceiroPaymentState = 'a_vencer' | 'vencido' | 'pago' | 'cancelado';

// Revisão do Pagamento (FN5): filtro do Financeiro (default 'todos').
export type FinanceiroFilter = 'todos' | 'a_vencer' | 'vencido' | 'pago' | 'cancelado';

export interface FinanceiroReceivable {
  id: string;
  version: number;
  contractNumber: string;
  contractDate: string | null;
  paymentDate: string | null;
  // Revisão do Pagamento (FN3): data real do pagamento ("pago em") + estado derivado
  // (chip) + nome do comprador. paymentState vem do servidor (fonte única de "hoje").
  paidAt: string | null;
  paymentState: FinanceiroPaymentState;
  buyerName: string | null;
  status: SaleContractStatus;
  totalValue: number | null;
  commissionTotal: number;
  sellerBrokeragePct: number | null;
  sellerBrokerageValue: number;
  buyerBrokeragePct: number | null;
  buyerBrokerageValue: number;
  // Corretores = atribuição/métrica (D34): só nomes, SEM valor por corretor.
  // D136 removeu o rateio ÷N (a divisão real, quando há, é externa).
  brokers: FinanceiroBroker[];
}

export interface FinanceiroListResponse {
  items: FinanceiroReceivable[];
  // Revisão do Pagamento (FN4): cursor keyset OPACO (base64url {g,pd,seq}); null =
  // última página. O front trata como string opaca (só ecoa de volta).
  nextCursor: string | null;
  // Total de corretagem a receber do conjunto que casa com a busca (server-side).
  totalCommission: number;
  // Revisão do Pagamento (FN6): "N vencidos · R$ X" — contagem + corretagem dos
  // vencidos (não pagos + paymentDate < hoje), no mesmo escopo/busca.
  overdueCount: number;
  overdueCommission: number;
}

// Embarque (EMB23): estado derivado da worklist (chip). Sem enum no banco.
export type ShipmentState = 'a_embarcar' | 'atrasado' | 'embarcado' | 'cancelado';

// Filtro da worklist (EMB25, default 'todos').
export type ShipmentFilter = 'todos' | 'a_embarcar' | 'atrasado' | 'embarcado' | 'cancelado';

// Linha da worklist (EMB25): só dado NÃO-sensível (a aba é visível a todos os
// não-PROSPECTOR) — sem preço/corretagem.
export interface ShipmentReceivable {
  id: string;
  contractNumber: string;
  state: ShipmentState;
  status: SaleContractStatus;
  buyerName: string | null;
  sellerWarehouse: string | null;
  quantitySacks: number;
  invoiceDate: string | null;
  shippedAt: string | null;
}

export interface ShipmentListResponse {
  items: ShipmentReceivable[];
  // Cursor keyset OPACO (base64url {g,key,seq}); null = última página.
  nextCursor: string | null;
  // "N atrasados" (EMB24): contagem estável dos não-embarcados vencidos (independe
  // do filtro/cursor ativo).
  overdueCount: number;
}

// Aprovação (AP26): estado derivado da worklist (chip). Sem enum no banco.
export type ApprovalState = 'a_enviar' | 'enviada' | 'cancelado';

// Filtro da worklist (AP28, default 'a_enviar' — o acionável em cima).
export type ApprovalFilter = 'a_enviar' | 'enviada' | 'cancelado' | 'todos';

// Linha da worklist (AP26): só dado NÃO-sensível (a aba é visível a todos os
// não-PROSPECTOR) — sem preço/corretagem. `date` = faturamento planejado (a_enviar/
// cancelado) ou último envio (enviada); `sendCount` alimenta o "·N×" (AP24, só >1).
export interface ApprovalReceivable {
  id: string;
  contractNumber: string;
  state: ApprovalState;
  status: SaleContractStatus;
  buyerName: string | null;
  quantitySacks: number;
  date: string | null;
  sendCount: number;
}

export interface ApprovalListResponse {
  items: ApprovalReceivable[];
  // Cursor keyset OPACO (base64url {g,key,seq}); null = última página.
  nextCursor: string | null;
  // "N a enviar" (AP25): contagem estável dos pendentes (independe do filtro/cursor).
  pendingCount: number;
}

// Fechamento (Fase B.2 Passo 2): listas da etapa 2 + payload de "Emitir".
export interface ContractLookupItem {
  id: string;
  name: string;
}

export interface ContractLookupsResponse {
  paymentForms: ContractLookupItem[];
  modalities: ContractLookupItem[];
  packagings: ContractLookupItem[];
}

// "+ Adicionar" inline (D91): chave lógica de cada uma das 3 listas + resposta da
// criação (o item novo, já com id, pra selecionar no dropdown).
export type ContractLookupListKey = 'paymentForm' | 'modality' | 'packaging';

export interface CreateContractLookupResponse {
  list: ContractLookupListKey;
  item: ContractLookupItem;
}

export interface SaleContractEtapa2Input {
  expectedVersion: number;
  sellerClientId?: string | null;
  buyerClientId?: string | null;
  sellerUnitId?: string | null;
  buyerUnitId?: string | null;
  sellerBankAccountId: string;
  buyerWarehouseClientId?: string | null;
  sellerWarehouseClientId?: string | null;
  paymentFormId: string;
  modalityId: string;
  packagingId: string;
  // D144: null explícito = "À definir" (aceito só quando o contrato é FUTURO).
  invoiceDate: string | null;
  paymentDate: string | null;
  purchaseNumber?: string | null;
  paymentCondition?: string | null;
  observations?: string | null;
  description?: string | null;
  weightKg?: number | null;
  agioDesagioType?: AgioDesagioType | null;
  agioDesagioValue?: number | null;
  // Aprovacao (reforma AP1/AP6): sinal obrigatorio + lembrete (opcional; so quando Sim).
  requiresApproval: boolean;
  approvalReminderLeadDays?: number | null;
  // "Editar": fase 1 (venda). Ausente no wizard create->emit.
  saleFields?: SaleContractSaleFieldsInput;
}

export interface ClientBankAccountSummary {
  id: string;
  clientId: string;
  bankName: string;
  agency: string;
  accountNumber: string;
  holderName: string;
  holderTaxId: string;
  pixKey: string | null;
  status: LookupStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ClientBankAccountInput {
  bankName: string;
  agency: string;
  accountNumber: string;
  holderName: string;
  holderTaxId: string;
  pixKey?: string | null;
}

export interface ClientBankAccountListResponse {
  items: ClientBankAccountSummary[];
}

export interface ClientBankAccountResponse {
  account: ClientBankAccountSummary;
}

export interface ClientAttachmentSummary {
  id: string;
  clientId: string;
  /** Filial/fazenda dona do anexo. null = anexo do proprio cliente. */
  unitId: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  description: string | null;
  uploadedByUserId: string | null;
  uploadedBy: { id: string; fullName: string } | null;
  unit: { id: string; name: string | null; status: ClientUnitStatus } | null;
  createdAt: string | null;
}

export interface ClientAttachmentListResponse {
  items: ClientAttachmentSummary[];
}

export interface ClientAttachmentResponse {
  attachment: ClientAttachmentSummary;
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
  // Liga (dono fixado): true quando o dono da liga foi fixado manualmente.
  // "Carteira da corretora" = blendOwnerPinned true + ownerClientId null
  // (escolha explícita), distinto de "sem dono" derivado (pinned false).
  blendOwnerPinned?: boolean;
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
    isWarehouse: boolean;
    status: ClientStatus;
  } | null;
  soldSacks?: number;
  lostSacks?: number;
  availableSacks?: number | null;
  latestClassification: {
    version: number | null;
    data: Record<string, unknown> | null;
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
    // total/totalPages sao null no load-more (keyset com cursor): o backend pula
    // o COUNT, que o front ignora no success-more. So a carga inicial os traz.
    total: number | null;
    totalPages: number | null;
    hasPrev: boolean;
    hasNext: boolean;
    nextCursor: { lotInt: number | null; id: string } | null;
  };
}

// getDashboardPending enxugado pra COUNT-ONLY (DSB-H4/H5, check-up do dashboard): o
// único consumidor (card de /samples, ClassificationPendingCard) usa só `.total`. Os
// antigos `counts`/`items` (projeção parcial de sample) e `clientsIncomplete` eram
// payload morto — removidos.
export interface DashboardPendingResponse {
  classificationPending: {
    total: number;
  };
}

// Cards de envios (DSB-D14: "Amostras enviadas" mora em /samples e "Aprovações
// enviadas" na aba Aprovações de /embarques; nasceram no dashboard, DSH-D5/DSB-D5).
// Amostra = física PHYSICAL_SAMPLE_SENT + laudo REPORT_EXPORTED; aprovação =
// etiqueta de APROVAÇÃO (approval_label_log, pós-AP16). Cada linha é um envio,
// do mais recente pro mais antigo.
export interface RecentSendItem {
  id: string; // event_id (amostra) ou 'approval:<id>' (aprovação); único por linha
  sampleId: string | null; // null na aprovação (não tem amostra)
  internalLotNumber: string | null;
  isBlend: boolean;
  kind: 'PHYSICAL_SAMPLE' | 'REPORT' | 'APPROVAL';
  recipient: string | null; // destinatário ATUAL (pós-edição) ou destination do laudo
  cancelled: boolean; // envio físico cancelado — UI esmaece
  at: string; // ISO do occurred_at (amostra) / createdAt (aprovação)
  // Aprovação (AP16): nº do contrato + comprador (o feed mostra em vez do lote).
  contractNumber?: string | null;
  buyer?: string | null;
}

// Resposta dos DOIS endpoints de envios recentes (cada um com seu top-40):
// GET /samples/recent-sends e GET /sale-contracts/approvals/recent-sends.
export interface RecentSendsResponse {
  items: RecentSendItem[];
}

// AP31/DSB-D19: item do card de "Avisos" do dashboard. Card GERAL extensível — o
// `kind` discrimina o tipo de aviso (só "aprovacao_a_enviar" hoje). `dueInDays` = dias
// de hoje (BRT) até a data de faturamento; `null` = "À definir" (D144) → texto "sem data".
export interface DashboardAviso {
  id: string;
  kind: 'aprovacao_a_enviar';
  contractId: string;
  contractNumber: string;
  buyerName: string | null;
  dueInDays: number | null;
}

export interface DashboardAvisosResponse {
  items: DashboardAviso[];
}

// Card de Eventos do dashboard (F1, E21-E27/D138): feed de "pagamentos de contrato".
// Cada evento = 1 contrato no dia da sua data de pagamento — agendado
// (contract_payment_due, no paymentDate) ou realizado (contract_payment_paid, no
// paidAt). Escopado por papel (ADMIN todos / COMMERCIAL só os dele).
export interface DashboardCalendarEvent {
  id: string; // = contractId (1 evento por contrato)
  typeKey: string;
  label: string; // recolhido: "tipo · nº · comprador"
  // DSB-D10: estado do evento — o card colore o chip por ESTADO (azul previsto /
  // vermelho atrasado / verde realizado), não por tipo; o NOME DO TIPO no `label`
  // é que diferencia os eventos. Derivado do typeKey nos builders (support).
  state?: 'previsto' | 'atrasado' | 'realizado';
  // Metadados do contrato (os 3 feeds setam contractId/contractNumber/buyerName/status).
  // `version` e `sellerName` saíram no check-up: eram do atalho "Pago"/acordeão E25,
  // removidos por E28 (navegação pura) — nenhum componente os lia.
  contractId?: string;
  contractNumber?: string;
  buyerName?: string | null;
  status?: SaleContractStatus;
}

export interface DashboardPaymentEventsResponse {
  // Mapa 'YYYY-MM-DD' → eventos do dia (formato da prop `events` do card).
  events: Record<string, DashboardCalendarEvent[]>;
}

// Embarque (EMB10/EMB17/EMB26): feed de eventos de embarque do card de Eventos. Mesmo
// formato (o `DashboardCalendarEvent` é genérico por `typeKey`); usa `contract_shipment`
// (previsto), `contract_shipment_overdue` (atrasado) e `contract_shipment_done` (realizado)
// — cor por ESTADO desde DSB-D10 (azul/vermelho/verde). `id` namespaced ('shipment:').
// Navegação pura no front (→ /embarques?tab=embarque — SPLIT 2026-07-13).
export interface DashboardShipmentEventsResponse {
  events: Record<string, DashboardCalendarEvent[]>;
}

// Faturamento (DSB-D11): feed de eventos de faturamento do card de Eventos. Mesmo
// formato (o `DashboardCalendarEvent` é genérico por `typeKey`); usa `contract_invoice`
// / `contract_invoice_overdue` / `contract_invoice_done`, `id` namespaced ('invoice:').
// Navegação pura no front (→ /contratos?tab=contratos, com realce p/ quem tem a aba).
export interface DashboardInvoiceEventsResponse {
  events: Record<string, DashboardCalendarEvent[]>;
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
  // Classificação pela câmera: se a impressão automática da etiqueta foi de
  // fato disparada (é best-effort — Print Agent offline ou PrintJob PENDING
  // recente derrubam a tentativa). A tela de sucesso só afirma "Etiqueta
  // impressa" quando true.
  autoPrintRequested?: boolean;
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
  // Fechamento (Fase B.2): venda a vista cria o contrato na mesma tx; o numero
  // gerado volta aqui para o toast de confirmacao.
  saleContract?: { id: string; contractNumber: string };
}

export interface DetectFormResponse {
  statusCode: number;
  photoToken: string;
  detected: boolean;
}

export interface ExtractAndPrepareResponse {
  statusCode: number;
  // false = servidor sem OPENAI_API_KEY (degrade 200 vazio) — o fluxo da
  // camera roteia direto pro modo manual. Ausente em respostas antigas.
  extractionAvailable?: boolean;
  extractedFields: ExtractedClassificationFields;
  // O schema de extracao so tem lote/sacas/safra — a data da classificacao e
  // carimbada pelo backend no confirm, nunca extraida da ficha.
  identification: {
    lote: string | null;
    sacas: string | null;
    safra: string | null;
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

// ── Relatorios (pagina "Relatorios", rota /relatorios): VISITA unificada
//    (prospector + comercial) + relatorio SEMANAL ──

export type VisitClientKind = 'EXISTING' | 'NEW';
export type VisitFarmSize = 'SMALL' | 'MEDIUM' | 'LARGE';
export type VisitInterestLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export type CommercialVisitReason =
  | 'NEGOTIATION'
  | 'SAMPLE_DELIVERY_OR_PICKUP'
  // LEGADO: descontinuado do formulario e nao criavel via API; mantido para
  // ler/exibir visitas ja registradas (label em lib/commercial-visit.ts).
  | 'COLLECTION'
  | 'RELATIONSHIP';

export type CommercialVisitOutcome =
  | 'DEAL_CLOSED'
  | 'PROPOSAL_IN_PROGRESS'
  | 'NO_PROGRESS'
  | 'NO_INTEREST';

// VISITA unificada (funde o antigo informe do prospector + a visita do
// comercial; unificacao 2026-07-15). NASCE vinculada a um cliente real; os
// campos de dominio (fazenda/interesse/comercializa + motivo/resultado) sao
// OPCIONAIS. Imutavel: cancelledAt != null = cancelada (soft).
export interface VisitReportSummary {
  id: string;
  type: 'VISIT_REPORT';
  user: {
    id: string;
    fullName: string;
    username: string;
  } | null;
  /** Declaração do autor ("Já é cliente" / "Cliente novo"). */
  clientKind: VisitClientKind;
  /** Cliente vinculado (a visita nasce vinculada). */
  client: {
    id: string;
    code: number;
    displayName: string | null;
    status: ClientStatus;
  } | null;
  /** Anotação de campo do "Cliente novo" (nome/cidade/telefone), ao lado do vínculo. */
  newClient: {
    name: string | null;
    city: string | null;
    phone: string | null;
  } | null;
  farmSize: VisitFarmSize | null;
  farmSizeNotes: string | null;
  interestLevel: VisitInterestLevel | null;
  interestNotes: string | null;
  sellsCurrently: boolean | null;
  sellsToWhom: string | null;
  /** Herdados da visita comercial (opcionais no form unificado). */
  reason: CommercialVisitReason | null;
  reasonNotes: string | null;
  outcome: CommercialVisitOutcome | null;
  outcomeNotes: string | null;
  /** Observações gerais (discursivo, opcional). */
  generalNotes: string | null;
  /** Cancelamento (soft): != null = cancelada. */
  cancelledAt: string | null;
  /** "Enviado em" — carimbado pelo servidor. */
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

// Contadores do dashboard do prospector — sempre do proprio usuario,
// janela do dia no fuso de Brasilia (base capturedAt ?? createdAt).
export interface VisitReportStatsResponse {
  /** Visitas enviadas hoje. */
  todayCount: number;
  /** Visitas de hoje com "Cliente novo". */
  todayNewClientsCount: number;
}

// ── Relatorio SEMANAL (weekly_report) + feed combinado ──

export interface WeeklyReportSummary {
  id: string;
  type: 'WEEKLY_REPORT';
  user: {
    id: string;
    fullName: string;
    username: string;
  } | null;
  /** Segunda da semana de referencia (YYYY-MM-DD, BRT). */
  weekStart: string;
  /** Domingo da semana de referencia (YYYY-MM-DD, BRT). */
  weekEnd: string;
  summary: string;
  difficulties: string | null;
  nextWeekPlan: string | null;
  /** Cancelamento (soft): != null = cancelado. */
  cancelledAt: string | null;
  createdAt: string;
}

// Feed da pagina "Relatorios" (scope=all): visita + semanal, discriminados
// pelo `type` que cada view carrega.
export type InformeFeedItem = VisitReportSummary | WeeklyReportSummary;

export interface InformeFeedResponse {
  items: InformeFeedItem[];
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

export interface WeeklyReportMutationResponse {
  report: WeeklyReportSummary;
}

// ── Web Push (notificações nativas) ──

export interface PushConfigResponse {
  publicKey: string;
  /** Este aparelho (endpoint enviado na query) está inscrito pro usuário atual. */
  subscribed: boolean;
}

export interface PushSubscriptionMutationResponse {
  subscription?: { endpoint: string };
  removed?: boolean;
}
