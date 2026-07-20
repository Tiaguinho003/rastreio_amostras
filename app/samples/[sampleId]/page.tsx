'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { AppShell } from '../../../components/AppShell';
import { HeaderAvatarMenu } from '../../../components/HeaderAvatarMenu';
import { OriginLotChips } from '../../../components/OriginLotChips';
import { PhotoZoomViewer } from '../../../components/PhotoZoomViewer';
import { ClientLookupField } from '../../../components/clients/ClientLookupField';
import { ClientQuickCreateModal } from '../../../components/clients/ClientQuickCreateModal';
import { BlendBadge } from '../../../components/samples/BlendBadge';
import { BlendHarvestPropagationModal } from '../../../components/samples/BlendHarvestPropagationModal';
import { HarvestDisplay } from '../../../components/samples/HarvestDisplay';
import { BlendRevertModal } from '../../../components/samples/BlendRevertModal';
import { RelatedSampleRow } from '../../../components/samples/RelatedSampleRow';
import { SampleInvalidateBlockedModal } from '../../../components/samples/SampleInvalidateBlockedModal';
import { SampleMovementsPanel } from '../../../components/samples/SampleMovementsPanel';
import { SampleSendFlow } from '../../../components/samples/SampleSendFlow';
import {
  ApiError,
  cancelSampleMovement,
  getBlendFeasibility,
  getSampleDetail,
  invalidateSample,
  listSampleEvents,
  listSampleMovements,
  lookupUsersForReference,
  requestQrPrint,
  revertBlend,
  updateClassification,
  updateRegistration,
} from '../../../lib/api-client';
import {
  invalidateSampleSchema,
  registrationFormSchema,
  updateReasonSchema,
} from '../../../lib/form-schemas';
import { useCameraSheet } from '../../../lib/camera-sheet/CameraSheetProvider';
import { useFocusTrap } from '../../../lib/use-focus-trap';
import { useListRevalidation } from '../../../lib/use-list-revalidation';
import { useGlobalLoading } from '../../../lib/loading/loading-context';
import { useRequireAuth } from '../../../lib/use-auth';
import { NON_PROSPECTOR_ROLES } from '../../../lib/roles';
import type {
  ActiveBlendDetail,
  AffectedBlendDetail,
  BlendFeasibilityResponse,
  ClassificationType,
  ClassifierSnapshot,
  ClientSummary,
  InvalidateReasonCode,
  SampleDetailResponse,
  SampleEvent,
  SampleMovement,
  SendHistoryItem,
  UpdateReasonCode,
  UserLookupItem,
  SampleStatus,
} from '../../../lib/types';
import {
  type ClassificationFormState,
  CLASSIFICATION_TYPE_LABEL,
  EMPTY_CLASSIFICATION_FORM,
  validateClassificationForm,
  buildClassificationDataPayload,
} from '../../../lib/classification-form';
import { formatPercentDisplay } from '../../../lib/classification-format';

// Q.print: QR_PENDING_PRINT/QR_PRINTED removidos — sample fica em
// REGISTRATION_CONFIRMED ate ser classificada.
const REGISTRATION_EDITABLE_STATUSES: SampleStatus[] = ['REGISTRATION_CONFIRMED', 'CLASSIFIED'];

const INVALIDATE_REASON_OPTIONS: Array<{ value: InvalidateReasonCode; label: string }> = [
  { value: 'DUPLICATE', label: 'Duplicada' },
  { value: 'WRONG_SAMPLE', label: 'Lote incorreto' },
  { value: 'DAMAGED', label: 'Danificada' },
  { value: 'CANCELLED', label: 'Cancelada' },
  { value: 'OTHER', label: 'Outro motivo' },
];

const UPDATE_REASON_OPTIONS: Array<{ value: UpdateReasonCode; label: string }> = [
  { value: 'DATA_FIX', label: 'Correção de dados' },
  { value: 'TYPO', label: 'Erro de digitação' },
  { value: 'MISSING_INFO', label: 'Informação faltante' },
  { value: 'OTHER', label: 'Outro motivo' },
];

type Notice = { kind: 'error' | 'success'; text: string } | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Liga B3.5: extrai o payload do 409 SAMPLE_HAS_ACTIVE_BLENDS pra alimentar
// o SampleInvalidateBlockedModal. ATENÇÃO ao shape: o backend lança
// HttpError(409, msg, { code, activeBlends }) — então `activeBlends` é IRMÃO
// de `code` dentro de ApiError.details (achatado). NÃO é aninhado sob outro
// `details`, como no CLIENT_HAS_ACTIVE_SAMPLES dos clientes. Retorna null
// quando não é esse erro (o catch cai no aviso genérico de hoje).
function extractActiveBlendsBlock(cause: unknown): ActiveBlendDetail[] | null {
  if (!(cause instanceof ApiError) || cause.status !== 409) {
    return null;
  }
  const details = cause.details;
  if (!isRecord(details)) {
    return null;
  }
  const { code, activeBlends } = details;
  if (code !== 'SAMPLE_HAS_ACTIVE_BLENDS') {
    return null;
  }
  return Array.isArray(activeBlends) ? (activeBlends as ActiveBlendDetail[]) : [];
}

// Liga: extrai o payload do 409 BLEND_HARVEST_PROPAGATION_REQUIRED (mesmo shape
// achatado de extractActiveBlendsBlock). Disparado ao editar a safra de um lote
// que e origem de ligas ativas — a UI abre o modal de confirmacao antes de
// propagar. Retorna null quando nao e esse erro (catch cai no aviso generico).
function extractHarvestPropagationBlock(cause: unknown): AffectedBlendDetail[] | null {
  if (!(cause instanceof ApiError) || cause.status !== 409) {
    return null;
  }
  const details = cause.details;
  if (!isRecord(details)) {
    return null;
  }
  const { code, affectedBlends } = details;
  if (code !== 'BLEND_HARVEST_PROPAGATION_REQUIRED') {
    return null;
  }
  return Array.isArray(affectedBlends) ? (affectedBlends as AffectedBlendDetail[]) : [];
}

function toText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
}

function toDateInput(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const directMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
}

function formatMovementDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return value;
}

function getMovementBuyerLabel(movement: SampleMovement): string | null {
  if (movement.movementType !== 'SALE') {
    return null;
  }
  const client = movement.buyerClient;
  if (!client) {
    return null;
  }
  return client.displayName ?? client.fullName ?? client.tradeName ?? null;
}

function buildClassificationFormState(detail: SampleDetailResponse): ClassificationFormState {
  // Q.draft: classificationDraft.snapshot foi descontinuado em Q.cls.1
  // junto com CLASSIFICATION_SAVED_PARTIAL. Form parte direto da ficha
  // mais recente (latestClassification.data).
  const latestData = isRecord(detail.sample.latestClassification.data)
    ? detail.sample.latestClassification.data
    : {};

  // Q.cls.2.7: ficha unificada agrupada — peneiras (sub-obj p18..p10/mk),
  // fundos (array top-level de 2), defeitos (sub-obj imp/pva/broca/gpi/ap/
  // defeito). Sem mais peneirasPercentuais nem flat broca/pva/imp/etc.
  const latestPeneiras = isRecord(latestData.peneiras) ? latestData.peneiras : {};
  const fundosSource = Array.isArray(latestData.fundos) ? latestData.fundos : [];
  const fundo0 = isRecord(fundosSource[0]) ? fundosSource[0] : {};
  const fundo1 = isRecord(fundosSource[1]) ? fundosSource[1] : {};
  const latestDefeitos = isRecord(latestData.defeitos) ? latestData.defeitos : {};

  return {
    ...EMPTY_CLASSIFICATION_FORM,
    dataClassificacao: toDateInput(latestData.dataClassificacao),
    padrao: toText(latestData.padrao),
    aspecto: toText(latestData.aspecto),
    certif: toText(latestData.certif),
    catacao: toText(latestData.catacao),
    observacoes: toText(latestData.observacoes),
    bebida: toText(latestData.bebida),
    peneiraP18: toText(latestPeneiras.p18),
    peneiraP17: toText(latestPeneiras.p17),
    peneiraP16: toText(latestPeneiras.p16),
    peneiraP15: toText(latestPeneiras.p15),
    peneiraP14: toText(latestPeneiras.p14),
    peneiraP13: toText(latestPeneiras.p13),
    peneiraP12: toText(latestPeneiras.p12),
    peneiraP11: toText(latestPeneiras.p11),
    peneiraP10: toText(latestPeneiras.p10),
    peneiraMk: toText(latestPeneiras.mk),
    fundo1Peneira: toText(fundo0.peneira),
    fundo1Percent: toText(fundo0.percentual),
    fundo2Peneira: toText(fundo1.peneira),
    fundo2Percent: toText(fundo1.percentual),
    imp: toText(latestDefeitos.imp),
    pva: toText(latestDefeitos.pva),
    broca: toText(latestDefeitos.broca),
    gpi: toText(latestDefeitos.gpi),
    ap: toText(latestDefeitos.ap),
    defeito: toText(latestDefeitos.defeito),
  };
}

function NoticeSlot({ notice }: { notice: Notice }) {
  return (
    <div className="notice-slot" aria-live="polite">
      {notice ? <p className={`notice-slot-text is-${notice.kind}`}>{notice.text}</p> : null}
    </div>
  );
}

function buildReadableValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim() ? value : '';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
}

// Liga (dono fixado): rótulo do dono no detalhe. Uma liga fixada como "carteira
// da corretora" (blendOwnerPinned + owner null) mostra o rótulo em vez de vazio;
// os demais casos caem no nome do dono (buildReadableValue).
function ownerDisplayValue(sample: SampleDetailResponse['sample']): string {
  if (sample.isBlend && sample.blendOwnerPinned && !sample.ownerClientId) {
    return 'Carteira da corretora';
  }
  return buildReadableValue(sample.declared.owner);
}

function canEditRegistrationStatus(status: SampleStatus): boolean {
  return REGISTRATION_EDITABLE_STATUSES.includes(status);
}

// Q.print: impressao virou acao pura — sempre permitida quando o sample
// nao esta INVALIDATED. Mantido o nome legacy `Reprint` na UI por simetria.
function canRequestReprintStatus(status: SampleStatus): boolean {
  return status !== 'INVALIDATED';
}

const PHYSICAL_SEND_ALLOWED_STATUSES = new Set<SampleStatus>([
  'REGISTRATION_CONFIRMED',
  'CLASSIFIED',
]);

function projectSendHistoryItems(events: SampleEvent[]): SendHistoryItem[] {
  const physicalById = new Map<
    string,
    {
      sendEventId: string;
      recipientClientId: string | null;
      recipientName: string;
      sentDate: string;
      occurredAt: string;
      cancelled: boolean;
    }
  >();
  const reports: SendHistoryItem[] = [];

  for (const evt of events) {
    if (evt.eventType === 'REPORT_EXPORTED') {
      const payload = evt.payload as Record<string, unknown>;
      const snapshot = payload.recipientClientSnapshot as Record<string, unknown> | null;
      const recipientName = String(snapshot?.displayName ?? payload.destination ?? '-');
      reports.push({
        kind: 'REPORT',
        key: evt.eventId,
        recipientName,
        dateLabel: new Date(evt.occurredAt).toLocaleDateString('pt-BR'),
        occurredAt: evt.occurredAt,
      });
      continue;
    }

    if (evt.eventType === 'PHYSICAL_SAMPLE_SENT') {
      const payload = evt.payload as Record<string, unknown>;
      const snapshot = payload.recipientClientSnapshot as Record<string, unknown> | null;
      physicalById.set(evt.eventId, {
        sendEventId: evt.eventId,
        recipientClientId: (payload.recipientClientId as string | null) ?? null,
        recipientName: String(snapshot?.displayName ?? '-'),
        sentDate: String(payload.sentDate ?? ''),
        occurredAt: evt.occurredAt,
        cancelled: false,
      });
      continue;
    }

    if (evt.eventType === 'PHYSICAL_SAMPLE_SEND_UPDATED') {
      const payload = evt.payload as Record<string, unknown>;
      const targetId = String(payload.sendEventId ?? '');
      const target = physicalById.get(targetId);
      if (!target) continue;
      const snapshot = payload.recipientClientSnapshot as Record<string, unknown> | null;
      target.recipientClientId = (payload.recipientClientId as string | null) ?? null;
      target.recipientName = String(snapshot?.displayName ?? '-');
      target.sentDate = String(payload.sentDate ?? target.sentDate);
      continue;
    }

    if (evt.eventType === 'PHYSICAL_SAMPLE_SEND_CANCELLED') {
      const payload = evt.payload as Record<string, unknown>;
      const targetId = String(payload.sendEventId ?? '');
      const target = physicalById.get(targetId);
      if (!target) continue;
      target.cancelled = true;
    }
  }

  const physicalItems: SendHistoryItem[] = Array.from(physicalById.values()).map((entry) => ({
    kind: 'PHYSICAL',
    key: entry.sendEventId,
    sendEventId: entry.sendEventId,
    recipientClientId: entry.recipientClientId,
    recipientName: entry.recipientName,
    sentDate: entry.sentDate,
    occurredAt: entry.occurredAt,
    cancelled: entry.cancelled,
  }));

  return [...reports, ...physicalItems].sort((a, b) =>
    a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0
  );
}

const DETAIL_EVENT_PREVIEW_LIMIT = 1;

function buildClassificationPhotoFilename(detail: SampleDetailResponse | null): string {
  const sample = detail?.sample;
  const lotRaw = sample?.internalLotNumber ?? sample?.id ?? 'amostra';
  const lot = lotRaw.replace(/[^a-zA-Z0-9._-]/g, '_');
  const data = isRecord(sample?.latestClassification?.data) ? sample.latestClassification.data : {};
  const rawDate = typeof data.dataClassificacao === 'string' ? data.dataClassificacao : '';
  const datePart = /^\d{4}-\d{2}-\d{2}/.test(rawDate)
    ? rawDate.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return `classificacao-${lot}-${datePart}.jpg`;
}

function mapSampleOwnerClientToSummary(
  client: SampleDetailResponse['sample']['ownerClient']
): ClientSummary | null {
  if (!client) {
    return null;
  }

  return {
    id: client.id,
    code: client.code,
    personType: client.personType,
    displayName: client.displayName,
    fullName: client.fullName,
    legalName: client.legalName,
    tradeName: client.tradeName,
    cpf: client.cpf,
    cnpj: client.cnpj,
    document: client.personType === 'PF' ? client.cpf : client.cnpj,
    phone: client.phone,
    email: null,
    addressLine: null,
    district: null,
    city: null,
    state: null,
    postalCode: null,
    complement: null,
    registrationNumber: null,
    isBuyer: client.isBuyer,
    isSeller: client.isSeller,
    isWarehouse: client.isWarehouse,
    status: client.status,
    commercialUser: null,
    commercialUsers: [],
    units: [],
    unitCount: 0,
    activeUnitCount: 0,
    primaryCity: null,
    primaryState: null,
    createdAt: null,
    updatedAt: null,
  };
}

export default function SampleDetailPage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: NON_PROSPECTOR_ROLES,
  });
  const router = useRouter();
  const cameraSheet = useCameraSheet();
  const params = useParams<{ sampleId: string }>();
  const searchParams = useSearchParams();
  const sampleId = typeof params.sampleId === 'string' ? params.sampleId : '';
  const highlightPrint = searchParams.get('highlight') === 'print';
  const [reclassifyModalOpen, setReclassifyModalOpen] = useState(false);

  const [detail, setDetail] = useState<SampleDetailResponse | null>(null);
  const detailRef = useRef<SampleDetailResponse | null>(null);
  // Foco vindo do dashboard (?focus=movimentacoes|informacoes): assim que o
  // detalhe carrega, navega-primeiro-rola-depois — scroll suave (rapido) ate o
  // container correspondente, uma unica vez.
  const focusScrolledRef = useRef(false);
  useEffect(() => {
    if (focusScrolledRef.current || !detail) {
      return;
    }
    const focus = searchParams.get('focus');
    const targetId =
      focus === 'movimentacoes'
        ? 'sdv-movimentacoes'
        : focus === 'informacoes'
          ? 'sdv-informacoes'
          : null;
    if (!targetId) {
      return;
    }
    focusScrolledRef.current = true;
    const raf = window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 90);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [detail, searchParams]);
  // Liga B4 Fase 7: viabilidade da liga (flag derivado "liga inviavel").
  // Buscado so pra liga ainda vendavel; null pra amostra normal ou em erro.
  const [blendFeasibility, setBlendFeasibility] = useState<BlendFeasibilityResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  // Enquanto a amostra carrega, mostra o loader da marca (logo + barra +
  // bolinhas) se demorar — substitui o "Carregando amostra..." verde.
  useGlobalLoading(loadingDetail);
  const [pageNotice, setPageNotice] = useState<Notice>(null);
  const [generalNotice, setGeneralNotice] = useState<Notice>(null);
  const [registrationModalNotice, setRegistrationModalNotice] = useState<Notice>(null);
  const [invalidateModalNotice, setInvalidateModalNotice] = useState<Notice>(null);

  const [classificationImageModalOpen, setClassificationImageModalOpen] = useState(false);
  // Desktop (>=901px): no card de classificacao, mostra Editar/Reclassificar no
  // header e torna a foto clicavel; o mobile mantem o "Expandir". matchMedia
  // client-side — o card so renderiza apos o fetch dos dados, sem hydration mismatch.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 901px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const [printHighlighted, setPrintHighlighted] = useState(false);
  // Envio (extraido p/ SampleSendFlow): edicao/cancelamento de envios EXISTENTES,
  // disparados pela timeline. O envio NOVO migrou p/ o card da lista (/samples).
  const [editSendItem, setEditSendItem] = useState<Extract<
    SendHistoryItem,
    { kind: 'PHYSICAL' }
  > | null>(null);
  const [cancelSendId, setCancelSendId] = useState<string | null>(null);

  // Lote editavel: modal de edicao da data de chegada (createdAt do lote),
  // acionado pelo item "Registro" da timeline de Movimentacoes.
  const [dateEditOpen, setDateEditOpen] = useState(false);
  const [dateEditValue, setDateEditValue] = useState('');
  const [dateEditSaving, setDateEditSaving] = useState(false);
  const [dateEditError, setDateEditError] = useState<string | null>(null);

  const [sendHistory, setSendHistory] = useState<SampleEvent[]>([]);
  const [, setLoadingSendHistory] = useState(false);

  const [owner, setOwner] = useState('');
  const [selectedOwnerClient, setSelectedOwnerClient] = useState<ClientSummary | null>(null);
  const [ownerQuickCreateOpen, setOwnerQuickCreateOpen] = useState(false);
  const [ownerQuickCreateSeed, setOwnerQuickCreateSeed] = useState('');
  const [sacks, setSacks] = useState('');
  const [harvest, setHarvest] = useState('');
  const [originLot, setOriginLot] = useState('');
  const [location, setLocation] = useState('');

  const [printerId] = useState('printer-main');
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [labelModalSubmitting, setLabelModalSubmitting] = useState(false);
  const [labelModalError, setLabelModalError] = useState<string | null>(null);
  const [labelPrintSuccess, setLabelPrintSuccess] = useState(false);
  const [invalidateReasonCode, setInvalidateReasonCode] = useState<InvalidateReasonCode>('OTHER');
  const [invalidateReasonText, setInvalidateReasonText] = useState('');
  const [invalidating, setInvalidating] = useState(false);
  const [invalidateModalOpen, setInvalidateModalOpen] = useState(false);
  // Liga B3.4: reversão de liga (revertBlend). Modal próprio — BlendRevertModal.
  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);
  // Efeito de X vermelho (movimentacoes canceladas / amostra invalidada) que
  // substitui as mensagens verdes de sucesso. Guarda o rotulo (ou null).
  const [xEffect, setXEffect] = useState<string | null>(null);
  // Liga B3.5: modal de bloqueio quando a amostra é origem de liga(s) ativa(s).
  const [blockedBlends, setBlockedBlends] = useState<ActiveBlendDetail[]>([]);
  const [invalidateBlockedOpen, setInvalidateBlockedOpen] = useState(false);
  const [activeMovements, setActiveMovements] = useState<SampleMovement[] | null>(null);
  const [activeMovementsError, setActiveMovementsError] = useState<string | null>(null);

  const [registrationEditMode, setRegistrationEditMode] = useState(false);
  const registrationEditModeRef = useRef(false);
  const [registrationUpdating, setRegistrationUpdating] = useState(false);
  // Liga: ligas afetadas pela propagacao reativa de safra (null = modal de
  // confirmacao fechado). Preenchido pelo 409 BLEND_HARVEST_PROPAGATION_REQUIRED.
  const [harvestPropagationBlends, setHarvestPropagationBlends] = useState<
    AffectedBlendDetail[] | null
  >(null);
  const [registrationEditReasonCode, setRegistrationEditReasonCode] =
    useState<UpdateReasonCode>('OTHER');
  const [registrationEditReasonText, setRegistrationEditReasonText] = useState('');
  // Erros de validacao por campo do modal de edicao — mostrados dentro do
  // proprio campo (placeholder vermelho + borda), limpos ao focar.
  const [registrationFieldErrors, setRegistrationFieldErrors] = useState<
    Partial<Record<'owner' | 'sacks' | 'harvest' | 'originLot' | 'location' | 'reasonText', string>>
  >({});
  // Efeito de check ao salvar com sucesso (substitui a mensagem verde).
  const [registrationSaveSuccess, setRegistrationSaveSuccess] = useState(false);
  const [classificationDetailOpen, setClassificationDetailOpen] = useState(false);
  const [classificationSaveConfirmOpen, setClassificationSaveConfirmOpen] = useState(false);
  const [classificationDetailEditing, setClassificationDetailEditing] = useState(false);
  const [classificationDetailSaving, setClassificationDetailSaving] = useState(false);
  const [classificationDetailSaved, setClassificationDetailSaved] = useState(false);
  const [classificationDetailError, setClassificationDetailError] = useState<string | null>(null);
  const [classificationDetailForm, setClassificationDetailForm] =
    useState<ClassificationFormState>(EMPTY_CLASSIFICATION_FORM);
  const [classificationDetailClassifiers, setClassificationDetailClassifiers] = useState<
    ClassifierSnapshot[]
  >([]);
  const [classificationDetailClassifiersOriginal, setClassificationDetailClassifiersOriginal] =
    useState<ClassifierSnapshot[]>([]);
  const [classificationDetailPickerOpen, setClassificationDetailPickerOpen] = useState(false);
  const [classificationDetailAvailableUsers, setClassificationDetailAvailableUsers] = useState<
    UserLookupItem[]
  >([]);
  const [classificationDetailLoadingUsers, setClassificationDetailLoadingUsers] = useState(false);
  const [classificationDetailUserError, setClassificationDetailUserError] = useState<string | null>(
    null
  );
  // Q.cls.2 audit do tipo: classificationDetailType e editavel no modo
  // edit do modal de detalhe da classificacao. Original guardado pra
  // detect typeChanged ao salvar (gera reasonText automatico).
  const [classificationDetailType, setClassificationDetailType] =
    useState<ClassificationType | null>(null);
  const [classificationDetailTypeOriginal, setClassificationDetailTypeOriginal] =
    useState<ClassificationType | null>(null);
  const classificationDetailTrapRef = useFocusTrap(classificationDetailOpen);
  const classificationSaveConfirmTrapRef = useFocusTrap(classificationSaveConfirmOpen);
  const classificationPhotoSectionRef = useRef<HTMLDivElement | null>(null);
  const invalidateTrapRef = useFocusTrap(invalidateModalOpen);
  const labelTrapRef = useFocusTrap(labelModalOpen);
  const registrationEditTrapRef = useFocusTrap(registrationEditMode);
  // LDT-A4: os 2 modais que estavam sem foco preso (edicao de data + reclassificar).
  const dateEditTrapRef = useFocusTrap(dateEditOpen);
  const reclassifyTrapRef = useFocusTrap(reclassifyModalOpen);
  const labelModalCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const labelModalPrimaryActionRef = useRef<HTMLButtonElement | null>(null);
  const lastQuickPrintButtonRef = useRef<HTMLButtonElement | null>(null);
  const invalidateModalCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastInvalidateTriggerRef = useRef<HTMLButtonElement | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const canInvalidateSample = Boolean(session);
  const hasActiveMovements = Boolean(
    detail && ((detail.sample.soldSacks ?? 0) > 0 || (detail.sample.lostSacks ?? 0) > 0)
  );
  // Liga B3.4: numa liga (isBlend), "Reverter liga" substitui o "Invalidar"
  // genérico — caminho terminal único, via revertBlend (emite BLEND_REVERTED).
  // Liga com venda/perda não pode ser revertida (F8.4): nenhum botão aparece.
  const isBlendSample = Boolean(detail?.sample.isBlend);
  const canRevertBlend = Boolean(
    detail &&
    canInvalidateSample &&
    isBlendSample &&
    detail.sample.status !== 'INVALIDATED' &&
    !hasActiveMovements
  );
  const canInvalidateNormal = Boolean(
    detail &&
    canInvalidateSample &&
    !isBlendSample &&
    detail.sample.status !== 'INVALIDATED' &&
    // "Deletar lote": lote vendido tem contrato (EMITIDO) e NAO e deletavel —
    // desfaca a venda pelo Washout do contrato (/contratos). Perdas ainda podem
    // ser canceladas e o lote deletado por este modal.
    (detail.sample.soldSacks ?? 0) === 0
  );

  const fetchDetail = useCallback(
    async ({ showLoading = false, eventLimit = DETAIL_EVENT_PREVIEW_LIMIT } = {}) => {
      if (!session || !sampleId) {
        return undefined;
      }

      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;

      const shouldShowLoading = showLoading;
      if (shouldShowLoading) {
        setLoadingDetail(true);
      }

      try {
        const response = await getSampleDetail(session, sampleId, {
          eventLimit,
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return undefined;
        }

        setDetail(response);
        detailRef.current = response;

        if (!registrationEditModeRef.current) {
          setOwner(response.sample.declared.owner ?? '');
          setSelectedOwnerClient(
            mapSampleOwnerClientToSummary(response.sample.ownerClient ?? null)
          );
          setSacks(response.sample.declared.sacks ? String(response.sample.declared.sacks) : '');
          setHarvest(response.sample.declared.harvest ?? '');
          setOriginLot(response.sample.declared.originLot ?? '');
          setLocation(response.sample.declared.location ?? '');
        }

        return response;
      } catch (cause) {
        if (controller.signal.aborted) {
          return undefined;
        }

        if (cause instanceof ApiError) {
          setPageNotice({ kind: 'error', text: cause.message });
        } else {
          setPageNotice({ kind: 'error', text: 'Falha ao carregar lote' });
        }
        return undefined;
      } finally {
        if (!controller.signal.aborted && shouldShowLoading) {
          setLoadingDetail(false);
        }
      }
    },
    [sampleId, session]
  );

  const loadDetail = useCallback(async () => {
    return fetchDetail({ showLoading: true });
  }, [fetchDetail]);

  const refreshDetail = useCallback(async () => {
    return fetchDetail({ showLoading: false });
  }, [fetchDetail]);

  // Sincroniza o nome do proprietario com o cliente selecionado no modal de
  // edicao. O lote nao vincula mais fazenda/unit, entao nao ha carregamento de
  // filiais aqui.
  useEffect(() => {
    setOwner(selectedOwnerClient?.displayName ?? detailRef.current?.sample.declared.owner ?? '');
  }, [selectedOwnerClient]);

  const syncDetailState = useCallback(
    async (_options: { refreshHistory?: boolean } = {}) => {
      await refreshDetail();
    },
    [refreshDetail]
  );

  // Revalidacao silenciosa (LDT-D3, mesmo padrao da lista): o detalhe rebusca ao
  // trazer o app de volta ao primeiro plano (throttle 30s) e a cada 60s com a
  // pagina visivel — cobre o caso "deixei o detalhe aberto e outro usuario
  // classificou/vendeu/enviou". Pula enquanto o usuario esta no meio de uma acao
  // (modal aberto / mutacao submetendo) pra nao trocar os dados sob os pes dele,
  // e nao roda em lote deletado (INVALIDATED e terminal).
  const detailBusy =
    invalidateModalOpen ||
    labelModalOpen ||
    dateEditOpen ||
    reclassifyModalOpen ||
    classificationDetailOpen ||
    revertModalOpen ||
    registrationEditMode ||
    ownerQuickCreateOpen ||
    invalidateBlockedOpen ||
    classificationImageModalOpen ||
    editSendItem !== null ||
    cancelSendId !== null;
  const detailBusyRef = useRef(detailBusy);
  detailBusyRef.current = detailBusy;
  const revalidateDetail = useCallback(() => {
    if (detailBusyRef.current) return;
    void refreshDetail();
  }, [refreshDetail]);
  const detailStatus = detail?.sample.status;
  useListRevalidation({
    enabled:
      Boolean(session) &&
      Boolean(sampleId) &&
      detailStatus !== undefined &&
      detailStatus !== 'INVALIDATED',
    onRevalidate: revalidateDetail,
  });

  useEffect(() => {
    if (!sampleId) {
      return;
    }
    void loadDetail();
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [loadDetail, sampleId]);

  // Liga B4 Fase 7: busca a viabilidade da liga pra sinalizar "liga
  // inviavel" no detalhe. So pra liga ainda vendavel (nao SOLD/LOST nem
  // INVALIDATED). Re-dispara quando o status comercial muda — vender ou
  // cancelar a liga reflete no flag. Best-effort: em erro some o aviso
  // (feature secundaria — nao polui a tela com erro).
  useEffect(() => {
    const sellable =
      detail?.sample.isBlend === true &&
      detail?.sample.status !== 'INVALIDATED' &&
      detail?.sample.commercialStatus !== 'SOLD' &&
      detail?.sample.commercialStatus !== 'LOST';
    if (!session || !sampleId || !sellable) {
      setBlendFeasibility(null);
      return;
    }

    const controller = new AbortController();
    getBlendFeasibility(session, sampleId, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setBlendFeasibility(result);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setBlendFeasibility(null);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    session,
    sampleId,
    detail?.sample.isBlend,
    detail?.sample.status,
    detail?.sample.commercialStatus,
  ]);

  // Q.print P3: polling do PrintJob enquanto PENDING. O backend tem lazy
  // timeout de 60s — apos isso o job vira EXPIRED na proxima request, entao
  // tres segundos de cadencia e suficiente pra refletir o final do ciclo
  // sem bombardear a API.
  useEffect(() => {
    if (detail?.latestPrintJob?.status !== 'PENDING') {
      return;
    }
    const intervalId = window.setInterval(() => {
      void refreshDetail();
    }, 3000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [detail?.latestPrintJob?.status, refreshDetail]);

  useEffect(() => {
    setLabelModalOpen(false);
    setLabelModalSubmitting(false);
    setLabelModalError(null);
    setLabelPrintSuccess(false);
    registrationEditModeRef.current = false;
    setRegistrationEditMode(false);
    setRegistrationEditReasonCode('OTHER');
    setRegistrationEditReasonText('');
    setInvalidateModalOpen(false);
    setInvalidateReasonCode('OTHER');
    setInvalidateReasonText('');
    setActiveMovements(null);
    setActiveMovementsError(null);
    setSelectedOwnerClient(null);
    setOwnerQuickCreateOpen(false);
    setOwnerQuickCreateSeed('');
  }, [sampleId]);

  const classificationAttachment = useMemo(
    () =>
      detail?.attachments.find((attachment) => attachment.kind === 'CLASSIFICATION_PHOTO') ?? null,
    [detail]
  );
  const qrValue = useMemo(
    () => detail?.sample.internalLotNumber ?? detail?.sample.id ?? '',
    [detail?.sample.internalLotNumber, detail?.sample.id]
  );
  const canQuickPrint = detail
    ? (detail.sample.status === 'REGISTRATION_CONFIRMED' ||
        canRequestReprintStatus(detail.sample.status)) &&
      detail.sample.commercialStatus !== 'LOST'
    : false;
  const canPhysicalSend = detail ? PHYSICAL_SEND_ALLOWED_STATUSES.has(detail.sample.status) : false;
  const classificationServerPhotoUrl = classificationAttachment
    ? `/api/v1/samples/${sampleId}/photos/${classificationAttachment.id}`
    : null;

  useEffect(() => {
    if (!labelModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      setLabelModalOpen(false);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => {
      labelModalCloseButtonRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => {
        lastQuickPrintButtonRef.current?.focus();
      }, 0);
    };
  }, [labelModalOpen]);

  // Erros dos modais de acao somem sozinhos depois de 5s.
  useEffect(() => {
    if (!labelModalError) return;
    const timer = window.setTimeout(() => setLabelModalError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [labelModalError]);

  useEffect(() => {
    if (!invalidateModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || invalidating) {
        return;
      }

      event.preventDefault();
      setInvalidateModalOpen(false);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => {
      invalidateModalCloseButtonRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => {
        lastInvalidateTriggerRef.current?.focus();
      }, 0);
    };
  }, [invalidateModalOpen, invalidating]);

  useEffect(() => {
    if (!invalidateModalOpen || !hasActiveMovements || !session) {
      return;
    }

    let cancelled = false;
    setActiveMovements(null);
    setActiveMovementsError(null);

    (async () => {
      try {
        const res = await listSampleMovements(session, sampleId, { status: 'ACTIVE' });
        if (!cancelled) {
          setActiveMovements(res.movements ?? []);
        }
      } catch (cause) {
        if (!cancelled) {
          setActiveMovementsError(
            cause instanceof ApiError ? cause.message : 'Falha ao carregar movimentações'
          );
          setActiveMovements([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [invalidateModalOpen, hasActiveMovements, sampleId, session]);

  useEffect(() => {
    if (!highlightPrint || !detail) {
      return;
    }

    setPrintHighlighted(true);

    const timer = setTimeout(() => setPrintHighlighted(false), 10000);
    return () => clearTimeout(timer);
  }, [highlightPrint, detail]);

  const fetchSendHistory = useCallback(async () => {
    if (!session || !sampleId) return;
    setLoadingSendHistory(true);
    try {
      const response = await listSampleEvents(session, sampleId, { limit: 200 });
      const sends = response.events.filter(
        (e: SampleEvent) =>
          e.eventType === 'REPORT_EXPORTED' ||
          e.eventType === 'PHYSICAL_SAMPLE_SENT' ||
          e.eventType === 'PHYSICAL_SAMPLE_SEND_UPDATED' ||
          e.eventType === 'PHYSICAL_SAMPLE_SEND_CANCELLED'
      );
      setSendHistory(sends);
    } catch {
      /* silent — history is supplementary */
    } finally {
      setLoadingSendHistory(false);
    }
  }, [session, sampleId]);

  useEffect(() => {
    fetchSendHistory();
  }, [fetchSendHistory]);

  const sendHistoryItems = useMemo(() => projectSendHistoryItems(sendHistory), [sendHistory]);

  if (loading || !session) {
    return null;
  }

  // Evita o "shell vazio" no 1o load (topo verde + corpo creme antes do
  // conteudo chegar): enquanto o detalhe nao carregou, fica em branco em vez
  // de renderizar o AppShell/.sdv-page sem conteudo. So no 1o load (detail
  // ainda null) — refetch mantem o detail e nao pisca.
  if (loadingDetail && !detail) {
    return null;
  }

  if (!sampleId) {
    return (
      <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
        <p className="error">sampleId invalido na rota.</p>
      </AppShell>
    );
  }

  function resetLabelModal() {
    setLabelModalOpen(false);
    setLabelModalSubmitting(false);
    setLabelModalError(null);
    setLabelPrintSuccess(false);
  }

  function closeLabelModal() {
    resetLabelModal();
  }

  function openLabelReviewModal(trigger?: HTMLButtonElement) {
    if (!detail) {
      return;
    }

    if (trigger) {
      lastQuickPrintButtonRef.current = trigger;
    }

    setGeneralNotice(null);
    setLabelModalError(null);
    setLabelPrintSuccess(false);
    setLabelModalOpen(true);
  }

  async function handleSubmitLabelReview() {
    if (!session || !detail) {
      return;
    }

    setLabelModalSubmitting(true);
    setLabelModalError(null);
    setLabelPrintSuccess(false);
    setGeneralNotice(null);

    try {
      const normalizedPrinterId = printerId.trim() || null;

      // Q.print: impressao virou acao pura — uma rota so, sem distinguir
      // PRINT/REPRINT (attemptNumber e gerado no backend).
      await requestQrPrint(session, sampleId, {
        printerId: normalizedPrinterId,
      });

      void refreshDetail();
      // Sucesso: efeito de check verde por ~900ms e fecha o modal (sem mensagem).
      setLabelPrintSuccess(true);
      window.setTimeout(() => {
        setLabelPrintSuccess(false);
        resetLabelModal();
      }, 900);
    } catch (cause) {
      if (cause instanceof ApiError) {
        setLabelModalError(cause.message);
      } else {
        setLabelModalError(cause instanceof Error ? cause.message : 'Falha ao solicitar impressao');
      }
    } finally {
      setLabelModalSubmitting(false);
    }
  }

  // Mostra o efeito de X vermelho (~1.3s) e, se pedido, volta pra /samples.
  // Substitui as mensagens verdes de sucesso de invalidacao/cancelamento.
  function showXEffect(label: string, redirectToList: boolean) {
    setXEffect(label);
    window.setTimeout(() => {
      if (redirectToList) {
        router.push('/samples');
      } else {
        setXEffect(null);
      }
    }, 1300);
  }

  async function handleInvalidateSample() {
    if (!session || !detail) {
      return;
    }

    if (!canInvalidateSample) {
      setInvalidateModalNotice({
        kind: 'error',
        text: 'Sua sessao atual nao permite deletar este lote.',
      });
      return;
    }

    const parsed = invalidateSampleSchema.safeParse({
      reasonCode: invalidateReasonCode,
      reasonText: invalidateReasonText,
    });

    if (!parsed.success) {
      setInvalidateModalNotice({
        kind: 'error',
        text: parsed.error.issues[0]?.message ?? 'Dados de exclusão inválidos',
      });
      return;
    }

    setInvalidating(true);
    setInvalidateModalNotice(null);

    try {
      await invalidateSample(session, sampleId, {
        expectedVersion: detail.sample.version,
        reasonCode: parsed.data.reasonCode,
        reasonText: parsed.data.reasonText,
      });
      setInvalidateModalOpen(false);
      setInvalidateReasonCode('OTHER');
      setInvalidateReasonText('');
      // Efeito de X (sem mensagem verde) e volta pra lista de amostras.
      showXEffect('Lote deletado', true);
    } catch (cause) {
      // Liga B3.5 (rede de segurança): 409 SAMPLE_HAS_ACTIVE_BLENDS → fecha
      // o modal de invalidação e abre o modal de bloqueio com as ligas.
      const blocked = extractActiveBlendsBlock(cause);
      if (blocked) {
        setInvalidateModalOpen(false);
        setBlockedBlends(blocked);
        setInvalidateBlockedOpen(true);
      } else if (cause instanceof ApiError) {
        setInvalidateModalNotice({ kind: 'error', text: cause.message });
      } else {
        setInvalidateModalNotice({ kind: 'error', text: 'Falha ao deletar lote' });
      }
    } finally {
      setInvalidating(false);
    }
  }

  // Liga B3.4: reverte a liga (revertBlend → BLEND_REVERTED + SAMPLE_INVALIDATED).
  // Espelha handleInvalidateSample: success notice + syncDetailState recarrega
  // o detalhe já como INVALIDATED (a composição segue visível — F8.3).
  async function handleRevertBlend(reasonText: string) {
    if (!session || !detail) {
      return;
    }

    setReverting(true);
    setRevertError(null);

    try {
      await revertBlend(session, sampleId, {
        expectedVersion: detail.sample.version,
        reasonText,
      });
      setRevertModalOpen(false);
      // Reverter a liga invalida a amostra — mesmo efeito de X + volta pra lista.
      showXEffect('Liga revertida', true);
    } catch (cause) {
      if (cause instanceof ApiError) {
        setRevertError(cause.message);
      } else {
        setRevertError('Falha ao reverter liga');
      }
    } finally {
      setReverting(false);
    }
  }

  async function refetchActiveMovements() {
    if (!session) {
      return;
    }

    try {
      const res = await listSampleMovements(session, sampleId, { status: 'ACTIVE' });
      setActiveMovements(res.movements ?? []);
    } catch {
      // ignore — usuario ja viu erro da operacao que falhou
    }
  }

  async function handleCancelMovementsOnly() {
    if (!session || !detail || !activeMovements || activeMovements.length === 0) {
      return;
    }

    const trimmedReason = invalidateReasonText.trim();
    if (trimmedReason.length === 0) {
      setInvalidateModalNotice({
        kind: 'error',
        text: 'Informe o motivo para cancelar as movimentações.',
      });
      return;
    }

    setInvalidating(true);
    setInvalidateModalNotice(null);

    try {
      let currentVersion = detail.sample.version;
      for (const mv of activeMovements) {
        await cancelSampleMovement(session, sampleId, mv.id, {
          expectedVersion: currentVersion,
          reasonText: trimmedReason,
        });
        const refreshed = await refreshDetail();
        if (!refreshed) {
          throw new Error('Falha ao recarregar o lote após cancelar a movimentação');
        }
        currentVersion = refreshed.sample.version;
      }

      setInvalidateModalOpen(false);
      setInvalidateReasonCode('OTHER');
      setInvalidateReasonText('');
      // Efeito de X (sem mensagem verde), permanecendo na pagina.
      showXEffect('Movimentações canceladas', false);
      void syncDetailState();
    } catch (cause) {
      setInvalidateModalNotice({
        kind: 'error',
        text:
          cause instanceof ApiError
            ? cause.message
            : cause instanceof Error
              ? cause.message
              : 'Falha ao cancelar movimentações',
      });
      await refetchActiveMovements();
    } finally {
      setInvalidating(false);
    }
  }

  async function handleCancelMovementsAndInvalidate() {
    if (!session || !detail || !activeMovements || activeMovements.length === 0) {
      return;
    }

    const parsed = invalidateSampleSchema.safeParse({
      reasonCode: invalidateReasonCode,
      reasonText: invalidateReasonText,
    });

    if (!parsed.success) {
      setInvalidateModalNotice({
        kind: 'error',
        text: parsed.error.issues[0]?.message ?? 'Dados de exclusão inválidos',
      });
      return;
    }

    setInvalidating(true);
    setInvalidateModalNotice(null);

    try {
      let currentVersion = detail.sample.version;
      for (const mv of activeMovements) {
        await cancelSampleMovement(session, sampleId, mv.id, {
          expectedVersion: currentVersion,
          reasonText: parsed.data.reasonText,
        });
        const refreshed = await refreshDetail();
        if (!refreshed) {
          throw new Error('Falha ao recarregar o lote após cancelar a movimentação');
        }
        currentVersion = refreshed.sample.version;
      }

      await invalidateSample(session, sampleId, {
        expectedVersion: currentVersion,
        reasonCode: parsed.data.reasonCode,
        reasonText: parsed.data.reasonText,
      });

      setInvalidateModalOpen(false);
      setInvalidateReasonCode('OTHER');
      setInvalidateReasonText('');
      // Invalidou — efeito de X + volta pra lista de amostras.
      showXEffect('Lote deletado', true);
    } catch (cause) {
      // Liga B3.5 (rede de segurança): 409 SAMPLE_HAS_ACTIVE_BLENDS → fecha
      // o modal de invalidação e abre o modal de bloqueio com as ligas.
      const blocked = extractActiveBlendsBlock(cause);
      if (blocked) {
        setInvalidateModalOpen(false);
        setBlockedBlends(blocked);
        setInvalidateBlockedOpen(true);
      } else {
        setInvalidateModalNotice({
          kind: 'error',
          text:
            cause instanceof ApiError
              ? cause.message
              : cause instanceof Error
                ? cause.message
                : 'Falha ao cancelar movimentações e deletar lote',
        });
        await refetchActiveMovements();
      }
    } finally {
      setInvalidating(false);
    }
  }

  function startRegistrationEdit() {
    if (!detail || !canEditRegistrationStatus(detail.sample.status)) {
      return;
    }

    setOwner(detail.sample.declared.owner ?? '');
    setSelectedOwnerClient(mapSampleOwnerClientToSummary(detail.sample.ownerClient ?? null));
    setSacks(detail.sample.declared.sacks ? String(detail.sample.declared.sacks) : '');
    setHarvest(detail.sample.declared.harvest ?? '');
    setOriginLot(detail.sample.declared.originLot ?? '');
    setLocation(detail.sample.declared.location ?? '');
    registrationEditModeRef.current = true;
    setRegistrationEditMode(true);
    setRegistrationFieldErrors({});
    setRegistrationSaveSuccess(false);
    setRegistrationModalNotice(null);
    setGeneralNotice(null);
  }

  function clearRegField(
    key: 'owner' | 'sacks' | 'harvest' | 'originLot' | 'location' | 'reasonText'
  ) {
    setRegistrationFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function cancelRegistrationEdit() {
    if (!detail) {
      registrationEditModeRef.current = false;
      setRegistrationEditMode(false);
      return;
    }

    setOwner(detail.sample.declared.owner ?? '');
    setSelectedOwnerClient(mapSampleOwnerClientToSummary(detail.sample.ownerClient ?? null));
    setSacks(detail.sample.declared.sacks ? String(detail.sample.declared.sacks) : '');
    setHarvest(detail.sample.declared.harvest ?? '');
    setOriginLot(detail.sample.declared.originLot ?? '');
    setLocation(detail.sample.declared.location ?? '');
    registrationEditModeRef.current = false;
    setRegistrationEditMode(false);
    setRegistrationEditReasonCode('OTHER');
    setRegistrationEditReasonText('');
    setRegistrationFieldErrors({});
    setRegistrationSaveSuccess(false);
  }

  async function handleConfirmRegistrationUpdate(confirmHarvestPropagation = false) {
    if (!session || !detail) {
      return;
    }

    if (!selectedOwnerClient) {
      setRegistrationFieldErrors({ owner: 'Selecione o proprietário' });
      return;
    }

    const fieldErrors: Partial<
      Record<'owner' | 'sacks' | 'harvest' | 'originLot' | 'location' | 'reasonText', string>
    > = {};
    const SHORT_FIELD_ERROR = {
      owner: 'Obrigatório',
      sacks: 'Mín. 1 saca',
      harvest: 'Obrigatória',
      originLot: 'Muito longo',
      location: 'Máx. 30 caract.',
    } as const;

    const parsedForm = registrationFormSchema.safeParse({
      owner: selectedOwnerClient.displayName ?? owner,
      sacks,
      harvest,
      originLot,
      location: location.trim() ? location : null,
    });
    if (!parsedForm.success) {
      for (const issue of parsedForm.error.issues) {
        const key = issue.path[0];
        if (
          key === 'owner' ||
          key === 'sacks' ||
          key === 'harvest' ||
          key === 'originLot' ||
          key === 'location'
        ) {
          fieldErrors[key] = SHORT_FIELD_ERROR[key];
        }
      }
    }

    const parsedReason = updateReasonSchema.safeParse({
      reasonCode: registrationEditReasonCode,
      reasonText: registrationEditReasonText,
    });
    if (!parsedReason.success) {
      fieldErrors.reasonText =
        registrationEditReasonText.trim().length === 0 ? 'Obrigatória' : 'Máx. 10 palavras';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setRegistrationFieldErrors(fieldErrors);
      return;
    }
    if (!parsedForm.success || !parsedReason.success) {
      return;
    }

    setRegistrationUpdating(true);
    setRegistrationFieldErrors({});
    setRegistrationModalNotice(null);

    try {
      const afterPayload: {
        [key: string]:
          | string
          | number
          | boolean
          | null
          | { [key: string]: string | number | boolean | null };
      } = {
        declared: parsedForm.data,
        ownerClientId: selectedOwnerClient.id,
      };

      await updateRegistration(session, sampleId, {
        expectedVersion: detail.sample.version,
        after: afterPayload,
        reasonCode: parsedReason.data.reasonCode,
        reasonText: parsedReason.data.reasonText,
        confirmHarvestPropagation,
      });

      // Sucesso: efeito de check por ~900ms e fecha o modal (sem mensagem verde).
      setHarvestPropagationBlends(null);
      setRegistrationSaveSuccess(true);
      window.setTimeout(() => {
        setRegistrationSaveSuccess(false);
        registrationEditModeRef.current = false;
        setRegistrationEditMode(false);
        setRegistrationEditReasonCode('OTHER');
        setRegistrationEditReasonText('');
      }, 900);
      await syncDetailState();
    } catch (cause) {
      // Liga: 409 BLEND_HARVEST_PROPAGATION_REQUIRED abre o modal de confirmacao
      // (avisar-e-confirmar) em vez do aviso de erro generico.
      const propagation = extractHarvestPropagationBlock(cause);
      if (propagation && propagation.length > 0) {
        setHarvestPropagationBlends(propagation);
      } else if (cause instanceof ApiError) {
        setRegistrationModalNotice({ kind: 'error', text: cause.message });
      } else {
        setRegistrationModalNotice({ kind: 'error', text: 'Falha ao salvar edicao de registro' });
      }
    } finally {
      setRegistrationUpdating(false);
    }
  }

  // Lote editavel: abre o modal de edicao da data de chegada com a data atual do
  // lote (createdAt) pre-preenchida — usa os 10 primeiros chars do ISO pra bater
  // com o que a timeline exibe via formatMovementDate.
  function openDateEdit() {
    if (!detail || !canEditRegistrationStatus(detail.sample.status)) {
      return;
    }
    setDateEditValue((detail.sample.createdAt ?? '').slice(0, 10));
    setDateEditError(null);
    setDateEditOpen(true);
  }

  async function submitDateEdit() {
    if (!session || !detail || dateEditSaving) {
      return;
    }
    if (!dateEditValue) {
      setDateEditError('Informe a data de chegada');
      return;
    }
    setDateEditSaving(true);
    setDateEditError(null);
    try {
      // Edicao rapida: motivo fixo DATA_FIX (nao exige justificativa do usuario).
      await updateRegistration(session, sampleId, {
        expectedVersion: detail.sample.version,
        after: { receivedDate: dateEditValue },
        reasonCode: 'DATA_FIX',
        reasonText: 'Ajuste da data de chegada',
      });
      setDateEditOpen(false);
      await syncDetailState();
    } catch (cause) {
      // 409 "No registration changes detected" = mesma data -> fecha silencioso.
      if (
        cause instanceof ApiError &&
        cause.status === 409 &&
        /no registration changes/i.test(cause.message)
      ) {
        setDateEditOpen(false);
      } else if (cause instanceof ApiError) {
        setDateEditError(cause.message);
      } else {
        setDateEditError('Falha ao salvar a data de chegada');
      }
    } finally {
      setDateEditSaving(false);
    }
  }

  function readClassifiersFromDetail(data: unknown): ClassifierSnapshot[] {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
    const rec = data as Record<string, unknown>;
    // Preferencia: novo campo `classificadores`. Fallback: `conferidoPor`
    // (eventos antigos pre-migration). Migration script backfills nao-lidos.
    const raw = Array.isArray(rec.classificadores)
      ? rec.classificadores
      : Array.isArray(rec.conferidoPor)
        ? rec.conferidoPor
        : null;
    if (!Array.isArray(raw)) return [];
    const out: ClassifierSnapshot[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      if (
        typeof e.id === 'string' &&
        typeof e.fullName === 'string' &&
        typeof e.username === 'string'
      ) {
        out.push({ id: e.id, fullName: e.fullName, username: e.username });
      }
    }
    return out;
  }

  function openClassificationDetail() {
    if (!detail || !session) return;
    setClassificationDetailForm(buildClassificationFormState(detail));
    const initialClassifiers = readClassifiersFromDetail(detail.sample.latestClassification?.data);
    setClassificationDetailClassifiers(initialClassifiers);
    setClassificationDetailClassifiersOriginal(initialClassifiers);
    // Q.cls.2 audit do tipo: inicializa tanto o state editavel quanto o
    // original (pra detect typeChanged ao salvar).
    const initialType = detail.sample.classificationType ?? null;
    setClassificationDetailType(initialType);
    setClassificationDetailTypeOriginal(initialType);
    setClassificationDetailPickerOpen(false);
    setClassificationDetailUserError(null);
    setClassificationDetailError(null);
    setClassificationDetailEditing(false);
    setClassificationDetailSaved(false);
    setClassificationDetailOpen(true);
  }

  // Abre o modal de detalhe JA em modo edicao (botao "Editar" do header do card
  // no desktop). openClassificationDetail prepara o form e zera editing; setar
  // editing=true logo depois vence no mesmo batch de render.
  function openClassificationEdit() {
    openClassificationDetail();
    setClassificationDetailEditing(true);
  }

  function closeClassificationDetail() {
    setClassificationDetailOpen(false);
    setClassificationDetailEditing(false);
    setClassificationDetailSaving(false);
    setClassificationDetailSaved(false);
    setClassificationDetailError(null);
    setClassificationDetailPickerOpen(false);
  }

  function updateClassificationDetailField(key: keyof ClassificationFormState, value: string) {
    setClassificationDetailError(null);
    setClassificationDetailForm((prev) => ({ ...prev, [key]: value }));
  }

  async function loadClassificationDetailUsers() {
    if (!session) return;
    if (classificationDetailAvailableUsers.length > 0) return;
    setClassificationDetailLoadingUsers(true);
    setClassificationDetailUserError(null);
    try {
      const response = await lookupUsersForReference(session, {
        excludeUserId: session.user.id,
        limit: 300,
      });
      setClassificationDetailAvailableUsers(response.items);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Nao foi possivel carregar a lista de classificadores.';
      setClassificationDetailUserError(message);
    } finally {
      setClassificationDetailLoadingUsers(false);
    }
  }

  function toggleClassificationDetailClassifier(user: UserLookupItem) {
    setClassificationDetailClassifiers((prev) => {
      const exists = prev.find((entry) => entry.id === user.id);
      if (exists) {
        return prev.filter((entry) => entry.id !== user.id);
      }
      return [...prev, { id: user.id, fullName: user.fullName, username: user.username }];
    });
  }

  function classifiersChanged(
    current: ClassifierSnapshot[],
    original: ClassifierSnapshot[]
  ): boolean {
    if (current.length !== original.length) return true;
    const currentIds = new Set(current.map((c) => c.id));
    return original.some((o) => !currentIds.has(o.id));
  }

  // Cancelar a edicao: descarta as alteracoes (restaura valores originais) e
  // sai do modo edicao, voltando o modal expandido pro modo leitura.
  function cancelClassificationDetailEdit() {
    if (detail && session) {
      setClassificationDetailForm(buildClassificationFormState(detail));
    }
    setClassificationDetailClassifiers(classificationDetailClassifiersOriginal);
    setClassificationDetailType(classificationDetailTypeOriginal);
    setClassificationDetailPickerOpen(false);
    setClassificationDetailError(null);
    setClassificationDetailEditing(false);
  }

  // Valida ANTES de abrir a confirmacao de save: erro aparece inline no
  // modal (sdv-modal-error) em vez de sumir silenciosamente no confirm.
  function requestClassificationDetailSave() {
    const validationError = validateClassificationForm(classificationDetailForm);
    if (validationError) {
      setClassificationDetailError(validationError);
      return;
    }
    if (
      classifiersChanged(
        classificationDetailClassifiers,
        classificationDetailClassifiersOriginal
      ) &&
      classificationDetailClassifiers.length === 0
    ) {
      setClassificationDetailError('Adicione pelo menos um classificador.');
      return;
    }
    setClassificationDetailError(null);
    setClassificationSaveConfirmOpen(true);
  }

  async function saveClassificationDetail() {
    if (!session || !detail || detail.sample.status === 'INVALIDATED') return;

    const validationError = validateClassificationForm(classificationDetailForm);
    if (validationError) {
      setClassificationDetailError(validationError);
      return;
    }

    setClassificationDetailSaving(true);
    try {
      const classificationData = buildClassificationDataPayload(classificationDetailForm);

      const classifiersChangedNow = classifiersChanged(
        classificationDetailClassifiers,
        classificationDetailClassifiersOriginal
      );
      // Min 1 classificador e obrigatorio. Se o usuario limpou a lista,
      // bloqueamos o save aqui mesmo (backend tambem valida como defesa).
      if (classifiersChangedNow && classificationDetailClassifiers.length === 0) {
        setClassificationDetailError('Adicione pelo menos um classificador.');
        setClassificationDetailSaving(false);
        return;
      }
      const afterPayload: { [key: string]: unknown } = {
        classificationData,
      };
      if (classifiersChangedNow) {
        afterPayload.classifiers = classificationDetailClassifiers.map((entry) => ({
          userId: entry.id,
        }));
      }

      // Q.cls.2 audit do tipo: detect mudanca + reasonText automatico.
      // Tipo passa top-level pro updateClassification (backend aceita
      // tipo-only update ou combinado com mudanca em campos).
      const typeChanged = classificationDetailType !== classificationDetailTypeOriginal;
      const reasonText = typeChanged
        ? `Tipo alterado de ${
            classificationDetailTypeOriginal
              ? CLASSIFICATION_TYPE_LABEL[classificationDetailTypeOriginal]
              : '—'
          } pra ${
            classificationDetailType ? CLASSIFICATION_TYPE_LABEL[classificationDetailType] : '—'
          }`
        : 'Edicao rapida';

      // Sequencia continua: o check ja aparece no modal expandido na MESMA render
      // do fechamento da confirmacao (sem esperar a API). O save roda em seguida;
      // em caso de falha, reverte (tira o check e volta pro modo edicao).
      setClassificationDetailSaved(true);
      setClassificationDetailEditing(false);
      setClassificationDetailPickerOpen(false);

      await updateClassification(session, sampleId, {
        expectedVersion: detail.sample.version,
        after: afterPayload as { [key: string]: import('../../../lib/api-client').JsonValue },
        reasonCode: 'DATA_FIX',
        reasonText,
        classificationType: classificationDetailType,
      });

      // Refresh em background pra nao segurar a animacao; fecha logo apos o check.
      void syncDetailState({ refreshHistory: true });
      window.setTimeout(() => {
        closeClassificationDetail();
      }, 800);
    } catch {
      // Falha: reverte o check e volta pro modo edicao pra tentar de novo.
      setClassificationDetailSaved(false);
      setClassificationDetailEditing(true);
    } finally {
      setClassificationDetailSaving(false);
    }
  }

  const userFullName = session.user.fullName ?? session.user.username;
  const userAvatarInitials = userFullName
    .split(' ')
    .map((w: string) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Badge do cabecalho: status COMERCIAL (Em aberto / Vendido / Perdido), com
  // "Invalidada" quando a amostra foi invalidada. Cores espelham as dos cards
  // (.is-card-*). PARTIALLY_SOLD cai em "Em aberto" (igual ao SampleCard).
  function getSdvCommercialStatus(sample: { status: string; commercialStatus: string | null }) {
    if (sample.status === 'INVALIDATED') {
      return { color: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb', label: 'Deletado' };
    }
    if (sample.commercialStatus === 'SOLD') {
      return { color: '#2a6539', bg: '#e4f3e8', border: '#bcdcc6', label: 'Vendido' };
    }
    if (sample.commercialStatus === 'LOST') {
      return { color: '#b44646', bg: '#f6e1e1', border: '#ecc6c6', label: 'Perdido' };
    }
    return { color: '#2563eb', bg: '#dbeafe', border: '#bfdbfe', label: 'Em aberto' };
  }

  const sdvCommercialStatus = detail ? getSdvCommercialStatus(detail.sample) : null;

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="sdv-page sdv-page--sample">
        {!loadingDetail && detail ? (
          <>
            {/* Header verde */}
            <header className="sdv-header">
              <div className="sdv-header-top">
                <Link
                  href="/samples"
                  scroll={false}
                  className="nsv2-back"
                  aria-label="Voltar aos registros"
                >
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </Link>
                <span className="sdv-header-title">Detalhes</span>
                <HeaderAvatarMenu session={session} onLogout={logout} />
                <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
                  <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
                </Link>
              </div>

              <div className="sdv-identity-card">
                <div className="sdv-identity-left">
                  <div className="sdv-identity-code-row">
                    <h1 className="sdv-identity-code">
                      {detail.sample.internalLotNumber ?? detail.sample.id}
                    </h1>
                    {detail.sample.isBlend ? <BlendBadge size="md" /> : null}
                    {sdvCommercialStatus ? (
                      <span
                        className="sdv-identity-badge"
                        style={{
                          color: sdvCommercialStatus.color,
                          background: sdvCommercialStatus.bg,
                          borderColor: sdvCommercialStatus.border,
                        }}
                      >
                        {sdvCommercialStatus.label}
                      </span>
                    ) : null}
                  </div>
                  <span className="sdv-identity-owner">{ownerDisplayValue(detail.sample)}</span>
                </div>
                <div className="sdv-identity-actions">
                  {canRevertBlend ? (
                    <button
                      type="button"
                      className="sdv-identity-btn is-danger"
                      onClick={() => {
                        setRevertModalOpen(true);
                        setRevertError(null);
                        setGeneralNotice(null);
                      }}
                      aria-label="Reverter liga"
                    >
                      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                        <path d="M9 14 4 9l5-5" />
                        <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
                      </svg>
                    </button>
                  ) : null}
                  {/* Imprimir (migrou do rodape de Informacoes): botao de acao
                      do header, mesmo lugar onde ficava o antigo botao de
                      invalidar. Preserva o gating/highlight/fluxo de etiqueta. */}
                  <button
                    type="button"
                    className={`sdv-identity-btn is-print${printHighlighted ? ' is-highlight-pulse' : ''}`}
                    disabled={
                      !canQuickPrint ||
                      labelModalSubmitting ||
                      detail.latestPrintJob?.status === 'PENDING'
                    }
                    onClick={(event) => {
                      setPrintHighlighted(false);
                      openLabelReviewModal(event.currentTarget);
                    }}
                    aria-label="Imprimir"
                  >
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M6 9V2h12v7" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" rx="1" />
                    </svg>
                  </button>
                </div>
              </div>
            </header>

            <NoticeSlot notice={pageNotice} />

            {/* Conteúdo unificado — sem abas (Geral + Comercial juntos). */}
            <section className="sdv-content">
              <div className="sdv-content-inner">
                <section className="sdv-general">
                  {/* Container 1: Informacoes principais — cabecalho (titulo +
                      Editar) separado dos campos por uma divisoria discreta. O
                      Imprimir migrou para o header; este card fica so com as
                      informacoes. */}
                  <div id="sdv-informacoes" className="sdv-card sdv-info-compact">
                    <div className="sdv-card-header">
                      <span className="sdv-card-title">Informações</span>
                      {canEditRegistrationStatus(detail.sample.status) ? (
                        <button
                          type="button"
                          className="sdv-edit-btn"
                          onClick={startRegistrationEdit}
                          aria-label="Editar informações"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                          </svg>
                          <span>Editar</span>
                        </button>
                      ) : null}
                    </div>
                    <div className="sdv-info-grid">
                      <div className="sdv-info-item is-full">
                        <span className="sdv-info-label">Proprietario</span>
                        <span className="sdv-info-value">{ownerDisplayValue(detail.sample)}</span>
                      </div>
                      <div className="sdv-info-item">
                        <span className="sdv-info-label">Sacas</span>
                        <span className="sdv-info-value">
                          {buildReadableValue(detail.sample.declared.sacks)}
                        </span>
                      </div>
                      <div className="sdv-info-item">
                        <span className="sdv-info-label">Safra</span>
                        <span className="sdv-info-value">
                          <HarvestDisplay harvest={detail.sample.declared.harvest} fallback="" />
                        </span>
                      </div>
                      <div className="sdv-info-item">
                        <span className="sdv-info-label">Lote de origem</span>
                        <span className="sdv-info-value">
                          {buildReadableValue(detail.sample.declared.originLot)}
                        </span>
                      </div>
                      <div className="sdv-info-item">
                        <span className="sdv-info-label">Local</span>
                        <span className="sdv-info-value">
                          {buildReadableValue(detail.sample.declared.location)}
                        </span>
                      </div>
                    </div>

                    {/* Imprimir migrou para o header (botao de acao ao lado do
                        codigo do lote); este card fica so com as informacoes. */}
                    <NoticeSlot notice={generalNotice} />
                  </div>

                  {/* Container 2: Classificacao — mesmo padrao do container de
                      Informacoes. Acao no rodape: Classificar/Reclassificar. A
                      area de resumo (foto + campos) continua clicavel pra abrir
                      a classificacao completa. */}
                  {(() => {
                    const classData = detail.sample.latestClassification?.data;
                    const classPhotoUrl = classificationAttachment
                      ? `/api/v1/samples/${sampleId}/photos/${classificationAttachment.id}`
                      : null;
                    const cd = (classData ?? null) as Record<string, unknown> | null;
                    const aspecto = cd ? String(cd.aspecto ?? '—') : '—';
                    // Catação é percentual: sufixa "%" igual ao laudo (CL19).
                    const catacao = cd ? (formatPercentDisplay(cd.catacao) ?? '—') : '—';
                    // Classificadores: campo canonico `classificadores` (array de
                    // snapshots). Fallback para `conferidoPor` (eventos antigos) ou
                    // string legacy `classificador`.
                    const classifiersArr = cd
                      ? Array.isArray(cd.classificadores)
                        ? cd.classificadores
                        : Array.isArray(cd.conferidoPor)
                          ? cd.conferidoPor
                          : null
                      : null;
                    const classificador = classifiersArr
                      ? classifiersArr
                          .map((c) =>
                            c && typeof c === 'object' && 'fullName' in c
                              ? String((c as { fullName: unknown }).fullName)
                              : ''
                          )
                          .filter(Boolean)
                          .join(', ') || '—'
                      : cd && typeof cd.classificador === 'string' && cd.classificador.trim()
                        ? cd.classificador
                        : '—';
                    const classificadorLabel =
                      classifiersArr && classifiersArr.length > 1
                        ? 'Classificadores'
                        : 'Classificador';
                    // Versao "primeiro nome" pro card desktop (bloco mini, estreito):
                    // so o 1o nome de cada classificador, evitando corte de nomes
                    // longos. Resumo mobile e modal de edicao seguem com nome completo.
                    const firstNameOf = (full: string) => full.trim().split(/\s+/)[0] ?? '';
                    const classificadorShort = classifiersArr
                      ? classifiersArr
                          .map((c) =>
                            c && typeof c === 'object' && 'fullName' in c
                              ? firstNameOf(String((c as { fullName: unknown }).fullName))
                              : ''
                          )
                          .filter(Boolean)
                          .join(', ') || '—'
                      : cd && typeof cd.classificador === 'string' && cd.classificador.trim()
                        ? firstNameOf(cd.classificador)
                        : '—';

                    const isClassified = detail.sample.status === 'CLASSIFIED';
                    const canClassifyNow = detail.sample.status === 'REGISTRATION_CONFIRMED';

                    // Conteiner sempre com o mesmo layout: area da foto + os 3 campos
                    // sempre visiveis. Sem classificacao => placeholder "Sem foto" e
                    // valores "—" (labels mais opacos via .sdv-cls-block-summary.is-empty).
                    const clsPhotoNode = classPhotoUrl ? (
                      <div
                        className="sdv-cls-block-thumb"
                        role={isDesktop ? 'button' : undefined}
                        tabIndex={isDesktop ? 0 : undefined}
                        aria-label={isDesktop ? 'Ampliar foto da classificação' : undefined}
                        onClick={
                          isDesktop
                            ? (event) => {
                                event.stopPropagation();
                                setClassificationImageModalOpen(true);
                              }
                            : undefined
                        }
                        onKeyDown={
                          isDesktop
                            ? (event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setClassificationImageModalOpen(true);
                                }
                              }
                            : undefined
                        }
                      >
                        {/* next/image nao se aplica: src vem do upload local; dimensoes via CSS */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={classPhotoUrl}
                          alt="Foto da classificação"
                          className="sdv-cls-block-thumb-img"
                        />
                      </div>
                    ) : (
                      <div
                        className="sdv-cls-block-thumb sdv-cls-block-thumb-empty"
                        aria-hidden="true"
                      >
                        Sem foto
                      </div>
                    );
                    const clsFieldsNode = (
                      <div className="sdv-cls-block-fields">
                        {/* Classificador sozinho na 1a linha (alinhado a esquerda);
                            Aspecto/Catação na linha de baixo. Padrão fica so no
                            expandido, pra enxugar o resumo. */}
                        <div className="sdv-info-item sdv-cls-fields-classifier">
                          <span className="sdv-info-label">{classificadorLabel}</span>
                          <span className="sdv-info-value">{classificador}</span>
                        </div>
                        <div className="sdv-info-item">
                          <span className="sdv-info-label">Aspecto</span>
                          <span className="sdv-info-value">{aspecto}</span>
                        </div>
                        <div className="sdv-info-item">
                          <span className="sdv-info-label">Catação</span>
                          <span className="sdv-info-value">{catacao}</span>
                        </div>
                      </div>
                    );

                    // Desktop: ficha completa read-only abaixo do resumo, reusando
                    // as classes globais cld-* do modal de detalhe. Escondida no
                    // mobile via CSS (.sdv-cls-extra). So renderiza quando ha cd.
                    const peneiras: Record<string, unknown> =
                      cd && isRecord(cd.peneiras) ? cd.peneiras : {};
                    const defeitos: Record<string, unknown> =
                      cd && isRecord(cd.defeitos) ? cd.defeitos : {};
                    const fundosArr = cd && Array.isArray(cd.fundos) ? cd.fundos : [];
                    const fundoA: Record<string, unknown> = isRecord(fundosArr[0])
                      ? fundosArr[0]
                      : {};
                    const fundoB: Record<string, unknown> = isRecord(fundosArr[1])
                      ? fundosArr[1]
                      : {};
                    const fmtClsDate = (iso: string) => {
                      if (!iso) return '';
                      const [y, m, d] = iso.split('-');
                      return d && m && y ? `${d}/${m}/${y}` : iso;
                    };
                    // Campo dos blocos desktop: label (cinza) + valor (escuro).
                    // Trata '—'/vazio como ausente -> valor cinza claro (.is-empty).
                    // keyId distingue campos com o MESMO label (ex.: dois "Fundo")
                    // pra nao colidir a key do React; default = o proprio label.
                    const clsField = (label: string, raw: unknown, keyId?: string) => {
                      const s = raw === null || raw === undefined ? '' : String(raw).trim();
                      const filled = s !== '' && s !== '—';
                      return (
                        <div className="sdv-info-item" key={keyId ?? label}>
                          <span className="sdv-info-label">{label}</span>
                          <span className={`sdv-info-value${filled ? '' : ' is-empty'}`}>
                            {filled ? s : '—'}
                          </span>
                        </div>
                      );
                    };
                    // Separador "=" unificado com o modal e o laudo (CL20).
                    const fundoText = (fundo: Record<string, unknown>) => {
                      const pen = toText(fundo.peneira);
                      const pct = toText(fundo.percentual);
                      if (!pen && !pct) return '';
                      return `${pen || '—'}${pct ? ` = ${pct}%` : ''}`;
                    };
                    const observacoes = cd ? toText(cd.observacoes) : '';
                    // Layout DESKTOP em blocos (mockup 2026-06-24): foto + bloco de
                    // stats (Aspecto/Catacao/Padrao · Classificador/Certificacao ·
                    // Data/Bebida) no topo; Peneiras e Fundos&Defeitos no meio;
                    // Observacoes embaixo. Escondido no mobile (la usa resumo + modal).
                    const clsDesktopNode = (
                      <div className="sdv-cls-desktop">
                        {clsPhotoNode}
                        <div className="sdv-cls-statwrap">
                          <div className="sdv-cls-statbox sdv-cls-statbox--mini">
                            <div className="sdv-cls-statbox-row sdv-cls-statbox-row--1">
                              {clsField(
                                'Data',
                                cd ? fmtClsDate(toDateInput(cd.dataClassificacao)) : ''
                              )}
                            </div>
                            <div className="sdv-cls-statbox-row sdv-cls-statbox-row--1">
                              {clsField(classificadorLabel, classificadorShort)}
                            </div>
                          </div>
                          <div className="sdv-cls-statbox sdv-cls-statbox--main">
                            <div className="sdv-cls-statbox-row sdv-cls-statbox-row--3">
                              {clsField('Aspecto', cd ? toText(cd.aspecto) : '')}
                              {clsField('Catação', cd ? formatPercentDisplay(cd.catacao) : '')}
                              {clsField('Padrão', cd ? toText(cd.padrao) : '')}
                            </div>
                            <div className="sdv-cls-statbox-row sdv-cls-statbox-row--2">
                              {clsField('Certificado', cd ? toText(cd.certif) : '')}
                              {clsField('Bebida', cd ? toText(cd.bebida) : '')}
                            </div>
                          </div>
                        </div>
                        <div className="sdv-cls-blk sdv-cls-blk--peneiras">
                          <span className="sdv-cls-blk-title">Peneiras</span>
                          <div className="sdv-cls-blk-grid">
                            {clsField('P18', formatPercentDisplay(peneiras.p18))}
                            {clsField('P17', formatPercentDisplay(peneiras.p17))}
                            {clsField('P16', formatPercentDisplay(peneiras.p16))}
                            {clsField('P15', formatPercentDisplay(peneiras.p15))}
                            {clsField('P14', formatPercentDisplay(peneiras.p14))}
                            {clsField('P13', formatPercentDisplay(peneiras.p13))}
                            {clsField('P12', formatPercentDisplay(peneiras.p12))}
                            {clsField('P11', formatPercentDisplay(peneiras.p11))}
                            {clsField('P10', formatPercentDisplay(peneiras.p10))}
                            {clsField('MK', formatPercentDisplay(peneiras.mk))}
                            {clsField('Fundo', fundoText(fundoA), 'fundo1')}
                            {clsField('Fundo', fundoText(fundoB), 'fundo2')}
                          </div>
                        </div>
                        <div className="sdv-cls-blk sdv-cls-blk--defeitos">
                          <span className="sdv-cls-blk-title">Defeitos</span>
                          <div className="sdv-cls-blk-grid">
                            {clsField('Impureza', formatPercentDisplay(defeitos.imp))}
                            {clsField('PVA', formatPercentDisplay(defeitos.pva))}
                            {clsField('Broca', formatPercentDisplay(defeitos.broca))}
                            {clsField('GPI', formatPercentDisplay(defeitos.gpi))}
                            {clsField('AP', formatPercentDisplay(defeitos.ap))}
                            {clsField('Defeito', toText(defeitos.defeito))}
                          </div>
                        </div>
                        <div className="sdv-cls-blk sdv-cls-blk--obs">
                          <span className="sdv-cls-blk-title">Observações</span>
                          <span
                            className={`sdv-info-value sdv-cls-obs-value${observacoes ? '' : ' is-empty'}`}
                          >
                            {observacoes || '—'}
                          </span>
                        </div>
                      </div>
                    );

                    return (
                      <div className="sdv-card sdv-cls-block">
                        <div className="sdv-card-header">
                          <div className="sdv-cls-header-title">
                            <span className="sdv-card-title">Classificação</span>
                          </div>
                          {isDesktop ? (
                            // CAM-D2: desktop NAO classifica por foto — os
                            // botoes Classificar/Reclassificar (camera) sairam;
                            // corrigir uma classificacao existente segue
                            // possivel pelo Editar (caminho 3, sem camera).
                            isClassified ? (
                              <div className="sdv-cls-header-actions">
                                <button
                                  type="button"
                                  className="sdv-edit-btn"
                                  onClick={openClassificationEdit}
                                  aria-label="Editar classificação"
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                                  </svg>
                                  <span>Editar</span>
                                </button>
                              </div>
                            ) : null
                          ) : cd ? (
                            // Mobile, classificado: "Expandir" abre a
                            // classificacao completa.
                            <button
                              type="button"
                              className="sdv-edit-btn"
                              onClick={openClassificationDetail}
                              aria-label="Expandir classificação"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M15 3h6v6" />
                                <path d="M9 21H3v-6" />
                                <path d="M21 3l-7 7" />
                                <path d="M3 21l7-7" />
                              </svg>
                              <span>Expandir</span>
                            </button>
                          ) : (
                            // Mobile, ainda nao classificado: "Classificar" ocupa
                            // o lugar do "Expandir" — botao pequeno/discreto no
                            // header (sem o action-card grande no rodape).
                            // CAM-P3: abre o sheet global da camera em Flow B.
                            <button
                              type="button"
                              className="sdv-edit-btn"
                              onClick={() => cameraSheet.open({ sampleId })}
                              disabled={!canClassifyNow}
                              aria-label="Classificar"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <circle cx="11" cy="11" r="8" />
                                <path d="m21 21-4.35-4.35" />
                              </svg>
                              <span>Classificar</span>
                            </button>
                          )}
                        </div>
                        {isDesktop ? (
                          clsDesktopNode
                        ) : cd ? (
                          <div
                            className="sdv-cls-block-summary sdv-cls-block-clickable"
                            role="button"
                            tabIndex={0}
                            onClick={openClassificationDetail}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openClassificationDetail();
                              }
                            }}
                            aria-label="Ver classificação completa"
                          >
                            {clsPhotoNode}
                            {clsFieldsNode}
                          </div>
                        ) : (
                          <div className="sdv-cls-block-summary is-empty">
                            {clsPhotoNode}
                            {clsFieldsNode}
                          </div>
                        )}
                        {/* "Classificar" agora vive no header do card (mobile,
                            no lugar do "Expandir"; desktop, ao lado do titulo) —
                            sem mais o action-card grande no rodape. */}
                      </div>
                    );
                  })()}

                  {/* Liga B4 Fase 7: flag de viabilidade — aviso derivado
                        (getBlendFeasibility) quando uma origem da liga nao tem
                        saldo pra cobrir a contribuicao. A liga nao muda de
                        status; so e sinalizada. */}
                  {detail.sample.isBlend &&
                  detail.sample.status !== 'INVALIDATED' &&
                  detail.sample.commercialStatus !== 'SOLD' &&
                  detail.sample.commercialStatus !== 'LOST' &&
                  blendFeasibility &&
                  !blendFeasibility.feasible &&
                  blendFeasibility.blockingOrigins.length > 0 ? (
                    <div className="sdv-card sdv-card-infeasible">
                      <span className="sdv-card-title sdv-card-title-danger">Liga inviável</span>
                      <p className="sdv-empty-text">
                        {blendFeasibility.blockingOrigins.length === 1
                          ? 'Uma origem desta liga não tem saldo suficiente para a venda.'
                          : 'Origens desta liga não têm saldo suficiente para a venda.'}
                      </p>
                      <ul className="sdv-infeasible-list">
                        {blendFeasibility.blockingOrigins.map((origin) => (
                          <li key={origin.sampleId}>
                            <Link
                              href={`/samples/${origin.sampleId}`}
                              className="sdv-infeasible-origin"
                            >
                              Lote {origin.lotNumber ?? origin.sampleId.slice(0, 8)}
                            </Link>{' '}
                            — precisa {origin.contributedSacks} sc, tem {origin.availableSacks} sc
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* Liga B3.2: Composicao da liga (origens + contribuicoes).
                        Backend mantem `components` em liga revertida (F8.3) —
                        a secao continua visivel como historico. */}
                  {detail.sample.isBlend && detail.components && detail.components.length > 0 ? (
                    <div className="sdv-card sdv-blend-composition">
                      <div className="sdv-card-header">
                        <span className="sdv-card-title">Composição da liga</span>
                        <span className="sdv-blend-composition-count">
                          {detail.components.length}{' '}
                          {detail.components.length === 1 ? 'registro' : 'registros'}
                        </span>
                      </div>
                      <ul className="sdv-related-list sdv-blend-composition-list">
                        {detail.components.map((component, idx) => {
                          const origin = component.originSample;
                          if (!origin) {
                            return (
                              <li key={component.id} className="sdv-empty-text">
                                Origem removida ou inacessível
                              </li>
                            );
                          }
                          return (
                            <li key={component.id}>
                              <RelatedSampleRow
                                href={`/samples/${origin.id}`}
                                lot={origin.internalLotNumber ?? origin.id.slice(0, 8)}
                                isBlend={origin.isBlend}
                                harvest={origin.declaredHarvest}
                                contribution={component.contributedSacks}
                                status={origin.status}
                                animationDelay={`${Math.min(idx, 10) * 0.025}s`}
                              />
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}

                  {/* Liga B3.3: amostra normal comprometida em liga(s) ativa(s).
                        Backend filtra INVALIDATED em activeBlends (Wave A2.5),
                        entao quando liga e revertida a secao desaparece aqui. */}
                  {!detail.sample.isBlend &&
                  detail.activeBlends &&
                  detail.activeBlends.length > 0 ? (
                    <div className="sdv-card sdv-blend-compromised">
                      <span className="sdv-card-title">
                        Comprometida em {detail.activeBlends.length}{' '}
                        {detail.activeBlends.length === 1 ? 'liga ativa' : 'ligas ativas'}
                      </span>
                      <ul className="sdv-related-list">
                        {detail.activeBlends.map((blend, idx) => (
                          <li key={blend.sampleId}>
                            <RelatedSampleRow
                              href={`/samples/${blend.sampleId}`}
                              lot={blend.lotNumber ?? blend.sampleId.slice(0, 8)}
                              isBlend={true}
                              harvest={blend.declaredHarvest}
                              contribution={blend.contributedSacks}
                              status={blend.status}
                              animationDelay={`${Math.min(idx, 10) * 0.025}s`}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {detail.sample.status === 'INVALIDATED' ? (
                    <div className="sdv-card sdv-card-invalidated">
                      <span className="sdv-card-title sdv-card-title-danger">Lote deletado</span>
                      <p className="sdv-empty-text">
                        Este lote foi deletado e nao aparece mais nas listagens. O numero foi
                        liberado para reuso.
                      </p>
                    </div>
                  ) : null}
                </section>

                {/* Bloco comercial unificado — sempre visivel apos a secao geral.
                    Resumo comercial (com botoes Venda/Perda) + Movimentacoes,
                    que agora unifica venda/perda + envio de amostra + criacao de
                    laudo (sendItems vem da projecao de eventos da detail page). */}
                <section className="stack sample-detail-info-pane sample-detail-commercial-pane">
                  <SampleMovementsPanel
                    sample={detail.sample}
                    movements={detail.movements ?? []}
                    sendItems={sendHistoryItems}
                    canEditSend={canPhysicalSend}
                    onEditSend={(item) => setEditSendItem(item)}
                    onCancelSend={(sendEventId) => setCancelSendId(sendEventId)}
                    canEditRegistrationDate={canEditRegistrationStatus(detail.sample.status)}
                    onEditRegistrationDate={openDateEdit}
                  />
                </section>

                {/* Invalidar (migrou do header): acao terminal/destrutiva no fim
                    da pagina, como botao rotulado. Mesmo fluxo de antes (checa
                    ligas ativas antes de abrir o modal de motivo). */}
                {canInvalidateNormal ? (
                  <div className="sdv-invalidate-footer">
                    <button
                      type="button"
                      className="sdv-invalidate-btn"
                      onClick={(event) => {
                        lastInvalidateTriggerRef.current = event.currentTarget;
                        setGeneralNotice(null);
                        // Liga B3.5 proativo: a amostra já consta como origem de
                        // liga(s) ativa(s) → abre o modal de bloqueio direto, sem
                        // abrir o formulário de motivo.
                        const active = detail.activeBlends ?? [];
                        if (active.length > 0) {
                          setBlockedBlends(active);
                          setInvalidateBlockedOpen(true);
                          return;
                        }
                        setInvalidateModalOpen(true);
                        setInvalidateReasonCode('OTHER');
                        setInvalidateReasonText('');
                        setInvalidateModalNotice(null);
                      }}
                    >
                      {/* Lixeira identica a da pagina de detalhes do cliente:
                          trash-2 com alca curva + 2 tracos. */}
                      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                      <span>Deletar</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </section>

      {detail ? (
        <BlendRevertModal
          open={revertModalOpen}
          lotNumber={detail.sample.internalLotNumber ?? detail.sample.id}
          reverting={reverting}
          errorMessage={revertError}
          onClose={() => {
            if (!reverting) {
              setRevertModalOpen(false);
            }
          }}
          onConfirm={(reasonText) => {
            void handleRevertBlend(reasonText);
          }}
        />
      ) : null}

      <SampleInvalidateBlockedModal
        open={invalidateBlockedOpen}
        activeBlends={blockedBlends}
        onClose={() => setInvalidateBlockedOpen(false)}
      />

      <BlendHarvestPropagationModal
        open={harvestPropagationBlends !== null}
        blends={harvestPropagationBlends ?? []}
        submitting={registrationUpdating}
        onConfirm={() => {
          setHarvestPropagationBlends(null);
          void handleConfirmRegistrationUpdate(true);
        }}
        onClose={() => setHarvestPropagationBlends(null)}
      />

      {xEffect
        ? createPortal(
            <div className="sdv-x-effect" role="alert" aria-live="assertive">
              <div className="sdv-x-effect-card">
                <svg className="sdv-x-effect-mark" viewBox="0 0 52 52" aria-hidden="true">
                  <circle cx="26" cy="26" r="24" fill="none" stroke="#c0392b" strokeWidth="2.5" />
                  <path
                    fill="none"
                    stroke="#c0392b"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18 18 34 34M34 18 18 34"
                  />
                </svg>
                <p className="sdv-x-effect-label">{xEffect}</p>
              </div>
            </div>,
            document.body
          )
        : null}

      {detail && invalidateModalOpen ? (
        <div className="app-modal-backdrop">
          <section
            ref={invalidateTrapRef}
            className="app-modal is-themed is-action sample-detail-invalidate-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-detail-invalidate-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="sample-detail-invalidate-modal-title" className="app-modal-title">
                  Deletar lote
                </h3>
                <p className="app-modal-description">
                  Use apenas quando a operação realmente exigir.
                </p>
              </div>
              <button
                ref={invalidateModalCloseButtonRef}
                type="button"
                className="app-modal-close"
                onClick={() => {
                  if (!invalidating) {
                    setInvalidateModalOpen(false);
                  }
                }}
                aria-label="Fechar modal de exclusão"
                disabled={invalidating}
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <form
              className="app-modal-content"
              onSubmit={(event) => {
                event.preventDefault();
                if (hasActiveMovements) {
                  void handleCancelMovementsAndInvalidate();
                } else {
                  void handleInvalidateSample();
                }
              }}
            >
              {hasActiveMovements ? (
                <>
                  <div className="sdv-warn-box">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                    </svg>
                    <div className="sdv-warn-text">
                      <strong>
                        Este lote possui{' '}
                        {activeMovements && activeMovements.length > 0
                          ? `${activeMovements.length} ${activeMovements.length > 1 ? 'movimentações ativas' : 'movimentação ativa'}`
                          : 'movimentações ativas'}
                      </strong>
                      Para deletar o lote, as perdas serão canceladas. Você também pode só cancelar
                      as movimentações.
                    </div>
                  </div>

                  <div className="sample-detail-invalidate-movements">
                    {activeMovements === null ? (
                      <p className="sample-detail-invalidate-movements-hint">
                        Carregando movimentações...
                      </p>
                    ) : activeMovementsError ? (
                      <p className="sdv-modal-error">{activeMovementsError}</p>
                    ) : activeMovements.length === 0 ? (
                      <p className="sample-detail-invalidate-movements-hint">
                        Nenhuma movimentação ativa encontrada.
                      </p>
                    ) : (
                      <div className="sdv-com-movements">
                        {activeMovements.map((movement, i) => {
                          const isSale = movement.movementType === 'SALE';
                          const buyerLabel = getMovementBuyerLabel(movement);
                          return (
                            <div
                              key={movement.id}
                              className="sdv-com-mov"
                              style={{ animationDelay: `${i * 0.05}s` }}
                            >
                              <div className={`sdv-com-mov-icon ${isSale ? 'is-sale' : 'is-loss'}`}>
                                {isSale ? (
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M12 19V5" />
                                    <path d="m5 12 7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M12 5v14" />
                                    <path d="m5 12 7 7 7-7" />
                                  </svg>
                                )}
                              </div>
                              <div className="sdv-com-mov-content">
                                <div className="sdv-com-mov-top">
                                  <span className="sdv-com-mov-qty">
                                    {movement.quantitySacks} sacas
                                  </span>
                                  <span
                                    className={`sdv-com-mov-badge ${isSale ? 'is-sale' : 'is-loss'}`}
                                  >
                                    {isSale ? 'Venda' : 'Perda'}
                                  </span>
                                </div>
                                <div className="sdv-com-mov-bottom">
                                  <span>{formatMovementDate(movement.movementDate)}</span>
                                  {buyerLabel ? (
                                    <>
                                      <span className="sdv-com-mov-sep" />
                                      <span>→ {buyerLabel}</span>
                                    </>
                                  ) : null}
                                  {!isSale && movement.lossReasonText ? (
                                    <>
                                      <span className="sdv-com-mov-sep" />
                                      <span className="sdv-com-mov-reason">
                                        {movement.lossReasonText}
                                      </span>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : null}

              <label className="app-modal-field">
                <span className="app-modal-label">Motivo da exclusão</span>
                <select
                  className="app-modal-input"
                  value={invalidateReasonCode}
                  disabled={invalidating}
                  onChange={(event) =>
                    setInvalidateReasonCode(event.target.value as InvalidateReasonCode)
                  }
                >
                  {INVALIDATE_REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="app-modal-field">
                <span className="app-modal-label">Detalhes</span>
                <textarea
                  className="app-modal-input sample-detail-invalidate-textarea"
                  rows={4}
                  value={invalidateReasonText}
                  onChange={(event) => setInvalidateReasonText(event.target.value.toUpperCase())}
                  placeholder="Descreva o motivo"
                  disabled={invalidating}
                />
              </label>

              <NoticeSlot notice={invalidateModalNotice} />

              {hasActiveMovements ? (
                <div className="app-modal-actions sample-detail-invalidate-actions">
                  <button
                    type="button"
                    className="app-modal-secondary"
                    onClick={() => {
                      void handleCancelMovementsOnly();
                    }}
                    disabled={
                      invalidating ||
                      invalidateReasonText.trim().length === 0 ||
                      activeMovements === null ||
                      activeMovements.length === 0
                    }
                  >
                    {invalidating ? 'Cancelando...' : 'Cancelar movimentações'}
                  </button>
                  <button
                    type="submit"
                    className="app-modal-submit is-danger sample-detail-invalidate-submit"
                    disabled={
                      invalidating ||
                      invalidateReasonText.trim().length === 0 ||
                      activeMovements === null ||
                      activeMovements.length === 0
                    }
                  >
                    {invalidating ? 'Deletando...' : 'Deletar'}
                  </button>
                </div>
              ) : (
                <div className="app-modal-actions sample-detail-invalidate-actions">
                  <button
                    type="button"
                    className="app-modal-secondary"
                    onClick={() => {
                      if (!invalidating) {
                        setInvalidateModalOpen(false);
                      }
                    }}
                    disabled={invalidating}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="app-modal-submit is-danger sample-detail-invalidate-submit"
                    disabled={invalidating}
                  >
                    {invalidating ? 'Deletando...' : 'Deletar'}
                  </button>
                </div>
              )}
            </form>
          </section>
        </div>
      ) : null}

      {detail ? (
        <section className="sample-detail-print-root" aria-hidden="true">
          <article
            id="sample-detail-label-print"
            className="label-print-card sample-detail-label-print-card"
          >
            <div className="label-qr">
              <QRCodeCanvas value={qrValue} size={120} />
            </div>

            <div className="label-meta">
              <p>
                <strong>Lote interno:</strong> {detail.sample.internalLotNumber ?? detail.sample.id}
              </p>
              <p>
                <strong>Proprietario:</strong> {ownerDisplayValue(detail.sample)}
              </p>
              <p>
                <strong>Sacas:</strong> {buildReadableValue(detail.sample.declared.sacks)}
              </p>
              <p>
                <strong>Safra:</strong>{' '}
                <HarvestDisplay harvest={detail.sample.declared.harvest} fallback="" />
              </p>
              <p>
                <strong>Lote origem:</strong> {buildReadableValue(detail.sample.declared.originLot)}
              </p>
            </div>
          </article>
        </section>
      ) : null}

      {detail && labelModalOpen ? (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            closeLabelModal();
          }}
        >
          <section
            ref={labelTrapRef}
            className="app-modal is-themed is-action sample-detail-compact-modal sample-detail-print-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-detail-label-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            {labelPrintSuccess ? (
              <div className="client-create-success-overlay" aria-live="polite">
                <svg className="client-create-success-check" viewBox="0 0 52 52" aria-hidden="true">
                  <circle cx="26" cy="26" r="24" fill="none" stroke="#2f8a3e" strokeWidth="2.5" />
                  <path
                    fill="none"
                    stroke="#2f8a3e"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 27l7 7 15-15"
                  />
                </svg>
              </div>
            ) : null}
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="sample-detail-label-modal-title" className="app-modal-title">
                  Confirme os dados
                </h3>
              </div>
              <button
                ref={labelModalCloseButtonRef}
                type="button"
                className="app-modal-close"
                onClick={closeLabelModal}
                aria-label="Fechar"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            <div className="app-modal-content">
              <article className="label-print-card new-sample-label-print-card">
                <div className="label-qr">
                  <QRCodeCanvas value={qrValue} size={120} />
                </div>
                <div className="label-meta">
                  <p>
                    <strong>Lote interno:</strong>{' '}
                    {detail.sample.internalLotNumber ?? detail.sample.id}
                  </p>
                  <p>
                    <strong>Proprietario:</strong> {ownerDisplayValue(detail.sample)}
                  </p>
                  <p>
                    <strong>Sacas:</strong> {buildReadableValue(detail.sample.declared.sacks)}
                  </p>
                  <p>
                    <strong>Safra:</strong>{' '}
                    <HarvestDisplay harvest={detail.sample.declared.harvest} fallback="" />
                  </p>
                  <p>
                    <strong>Lote origem:</strong>{' '}
                    {buildReadableValue(detail.sample.declared.originLot)}
                  </p>
                </div>
              </article>

              {labelModalError ? <p className="sdv-modal-error">{labelModalError}</p> : null}

              <div className="app-modal-actions">
                <button
                  type="button"
                  className="app-modal-secondary"
                  disabled={labelModalSubmitting}
                  onClick={closeLabelModal}
                >
                  Fechar
                </button>
                <button
                  ref={labelModalPrimaryActionRef}
                  type="button"
                  className="app-modal-submit"
                  disabled={labelModalSubmitting}
                  onClick={() => void handleSubmitLabelReview()}
                >
                  {labelModalSubmitting ? 'Enviando...' : 'Imprimir'}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <ClientQuickCreateModal
        session={session}
        open={ownerQuickCreateOpen}
        title="Novo cliente"
        initialSearch={ownerQuickCreateSeed}
        initialPersonType="PJ"
        initialIsBuyer={false}
        onClose={() => setOwnerQuickCreateOpen(false)}
        onCreated={(client) => {
          setOwnerQuickCreateOpen(false);
          setSelectedOwnerClient(client);
          setOwner(client.displayName ?? '');
        }}
      />

      {/* Lote editavel: modal de edicao rapida da data de chegada (createdAt),
          acionado pelo botao no item "Registro" da timeline. Sem justificativa. */}
      {dateEditOpen ? (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            if (!dateEditSaving) setDateEditOpen(false);
          }}
        >
          <section
            ref={dateEditTrapRef}
            className="app-modal is-themed is-action"
            role="dialog"
            aria-modal="true"
            aria-labelledby="date-edit-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="date-edit-modal-title" className="app-modal-title">
                  Editar data de chegada
                </h3>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={() => setDateEditOpen(false)}
                disabled={dateEditSaving}
                aria-label="Fechar"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            <form
              className="app-modal-content"
              onSubmit={(event) => {
                event.preventDefault();
                void submitDateEdit();
              }}
            >
              <label className="app-modal-field">
                <span className="app-modal-label">Data de chegada</span>
                <input
                  type="date"
                  className="app-modal-input"
                  value={dateEditValue}
                  max={new Date().toLocaleDateString('en-CA')}
                  onChange={(event) => {
                    setDateEditValue(event.target.value);
                    setDateEditError(null);
                  }}
                  disabled={dateEditSaving}
                  autoFocus
                />
              </label>

              {/* NoticeSlot so quando ha erro: o slot vazio tem min-height 1.25rem
                  + gaps, criando espaco morto entre a data e os botoes. */}
              {dateEditError ? (
                <NoticeSlot notice={{ kind: 'error', text: dateEditError }} />
              ) : null}

              <div className="app-modal-actions">
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={() => setDateEditOpen(false)}
                  disabled={dateEditSaving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="app-modal-submit"
                  disabled={dateEditSaving || !dateEditValue}
                >
                  {dateEditSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {registrationEditMode ? (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            if (!registrationUpdating) cancelRegistrationEdit();
          }}
        >
          <section
            ref={registrationEditTrapRef}
            className="app-modal is-themed is-action sample-detail-reg-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="registration-edit-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            {registrationSaveSuccess ? (
              <div className="client-create-success-overlay" aria-live="polite">
                <svg className="client-create-success-check" viewBox="0 0 52 52" aria-hidden="true">
                  <circle cx="26" cy="26" r="24" fill="none" stroke="#2f8a3e" strokeWidth="2.5" />
                  <path
                    fill="none"
                    stroke="#2f8a3e"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 27l7 7 15-15"
                  />
                </svg>
              </div>
            ) : null}
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="registration-edit-modal-title" className="app-modal-title">
                  Editar informações
                </h3>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={cancelRegistrationEdit}
                disabled={registrationUpdating}
                aria-label="Fechar"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            <form
              className="sample-detail-reg-edit-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (registrationUpdating) {
                  return;
                }
                // Nao bloqueia por justificativa vazia: deixa a validacao rodar
                // e exibir o erro no proprio campo.
                void handleConfirmRegistrationUpdate();
              }}
            >
              <div className="sample-detail-reg-edit-body">
                <div className="app-modal-field">
                  <ClientLookupField
                    session={session}
                    label="Proprietario"
                    kind="owner"
                    selectedClient={selectedOwnerClient}
                    disabled={registrationUpdating}
                    compact
                    invalid={Boolean(registrationFieldErrors.owner)}
                    invalidText={registrationFieldErrors.owner ?? ''}
                    onSelectClient={(client) => {
                      setSelectedOwnerClient(client);
                      setOwner(client?.displayName ?? '');
                      clearRegField('owner');
                      setGeneralNotice(null);
                    }}
                    onRequestCreate={(searchTerm) => {
                      setOwnerQuickCreateSeed(searchTerm);
                      setOwnerQuickCreateOpen(true);
                    }}
                    createLabel="Cadastrar proprietario"
                  />
                </div>

                <div className="sdv-edit-row">
                  <label className="app-modal-field">
                    <span className="app-modal-label">Sacas</span>
                    {detail?.sample.isBlend ? (
                      // Liga: as sacas derivam da soma das origens — read-only
                      // (o backend tambem rejeita mudanca de sacas numa liga).
                      <>
                        <input
                          className="app-modal-input"
                          value={sacks}
                          disabled
                          aria-readonly="true"
                        />
                        <span className="sdv-edit-hint">Deriva dos lotes que compõem a liga</span>
                      </>
                    ) : (
                      <input
                        className={`app-modal-input${registrationFieldErrors.sacks ? ' has-error' : ''}`}
                        value={sacks}
                        onChange={(event) => setSacks(event.target.value)}
                        onFocus={() => clearRegField('sacks')}
                        placeholder={registrationFieldErrors.sacks ?? ''}
                        inputMode="numeric"
                        disabled={registrationUpdating}
                      />
                    )}
                  </label>
                  <label className="app-modal-field">
                    <span className="app-modal-label">Safra</span>
                    {detail?.sample.isBlend ? (
                      // Liga: a safra deriva dos lotes que a compoem — read-only
                      // (o backend tambem rejeita mudanca de safra numa liga).
                      <>
                        <input
                          className="app-modal-input"
                          value={harvest}
                          disabled
                          aria-readonly="true"
                        />
                        <span className="sdv-edit-hint">Deriva dos lotes que compõem a liga</span>
                      </>
                    ) : (
                      <input
                        className={`app-modal-input${registrationFieldErrors.harvest ? ' has-error' : ''}`}
                        value={harvest}
                        onChange={(event) => setHarvest(event.target.value.toUpperCase())}
                        onFocus={() => clearRegField('harvest')}
                        placeholder={registrationFieldErrors.harvest ?? ''}
                        disabled={registrationUpdating}
                      />
                    )}
                  </label>
                </div>

                <div className="sdv-edit-row">
                  <label className="app-modal-field">
                    <span className="app-modal-label">Lote de origem</span>
                    <OriginLotChips
                      value={originLot}
                      onChange={setOriginLot}
                      onFocus={() => clearRegField('originLot')}
                      hasError={Boolean(registrationFieldErrors.originLot)}
                      disabled={registrationUpdating}
                    />
                    {detail?.sample.isBlend ? (
                      // Liga: origem DERIVADA da somatoria dos componentes, mas
                      // editavel — editar a mao FIXA (pin) e a propagacao para de
                      // re-derivar (nao toca os componentes; o backend seta o pin).
                      <span className="sdv-edit-hint">
                        Deriva dos lotes que a compõem; editar aqui fixa a origem da liga.
                      </span>
                    ) : registrationFieldErrors.originLot ? (
                      <span className="sdv-edit-hint">{registrationFieldErrors.originLot}</span>
                    ) : null}
                  </label>
                  <label className="app-modal-field">
                    <span className="app-modal-label">Local</span>
                    <input
                      className={`app-modal-input${registrationFieldErrors.location ? ' has-error' : ''}`}
                      value={location}
                      onChange={(event) => setLocation(event.target.value.toUpperCase())}
                      onFocus={() => clearRegField('location')}
                      maxLength={30}
                      placeholder={registrationFieldErrors.location ?? 'Ex: BM, Patos'}
                      disabled={registrationUpdating}
                    />
                  </label>
                </div>

                <div className="sdv-edit-sep" />

                <label className="app-modal-field">
                  <span className="app-modal-label">Motivo da edição</span>
                  <select
                    className="app-modal-input"
                    value={registrationEditReasonCode}
                    onChange={(event) =>
                      setRegistrationEditReasonCode(event.target.value as UpdateReasonCode)
                    }
                    disabled={registrationUpdating}
                  >
                    {UPDATE_REASON_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="app-modal-field">
                  <span className="app-modal-label">
                    Justificativa{registrationEditReasonCode === 'OTHER' ? ' (obrigatória)' : ''}
                  </span>
                  <input
                    className={`app-modal-input${registrationFieldErrors.reasonText ? ' has-error' : ''}`}
                    value={registrationEditReasonText}
                    onChange={(event) =>
                      setRegistrationEditReasonText(event.target.value.toUpperCase())
                    }
                    onFocus={() => clearRegField('reasonText')}
                    placeholder={
                      registrationFieldErrors.reasonText ??
                      (registrationEditReasonCode === 'OTHER' ? 'Explique a alteração' : 'Opcional')
                    }
                    disabled={registrationUpdating}
                  />
                </label>

                <NoticeSlot notice={registrationModalNotice} />
                <NoticeSlot notice={generalNotice} />
              </div>

              <div className="app-modal-actions sample-detail-reg-edit-actions">
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={cancelRegistrationEdit}
                  disabled={registrationUpdating}
                >
                  Cancelar
                </button>
                <button type="submit" className="app-modal-submit" disabled={registrationUpdating}>
                  {registrationUpdating ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {/* Classification detail modal */}
      {classificationDetailOpen && detail?.sample.latestClassification?.data
        ? (() => {
            const f = classificationDetailForm;
            const editing = classificationDetailEditing;
            const saving = classificationDetailSaving;
            const saved = classificationDetailSaved;
            const canEdit = detail.sample.status === 'CLASSIFIED';
            // Campos em porcentagem: "%" decorativo no canto superior direito do
            // campo (mesma linha do label). Visual apenas — nao entra no valor.
            // Fundos mantem seu proprio "%" no label (FD1 %, FD2 %).
            const percentKeys: ReadonlySet<keyof ClassificationFormState> = new Set([
              'peneiraP18',
              'peneiraP17',
              'peneiraP16',
              'peneiraMk',
              'peneiraP15',
              'peneiraP14',
              'peneiraP13',
              'peneiraP12',
              'peneiraP11',
              'peneiraP10',
              'catacao',
              'imp',
              'pva',
              'broca',
              'gpi',
              'ap',
            ]);
            const renderVal = (
              key: keyof ClassificationFormState,
              label: string,
              inputMode: 'text' | 'decimal' | 'numeric' = 'text'
            ) => {
              const isEmpty = !editing && !f[key];
              const showPercent = percentKeys.has(key);
              return (
                <div className={`cld-field${isEmpty ? ' is-empty' : ''}`} key={key}>
                  {showPercent ? (
                    <span className="cld-field-head">
                      <span className="cld-field-label">{label}</span>
                      <span className="cld-field-unit" aria-hidden="true">
                        %
                      </span>
                    </span>
                  ) : (
                    <span className="cld-field-label">{label}</span>
                  )}
                  {editing ? (
                    <input
                      type="text"
                      inputMode={inputMode}
                      className="cld-field-input"
                      value={f[key]}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const next =
                          inputMode === 'numeric'
                            ? raw.replace(/\D/g, '')
                            : inputMode === 'decimal'
                              ? raw
                              : raw.toUpperCase();
                        updateClassificationDetailField(key, next);
                      }}
                      disabled={saving}
                    />
                  ) : (
                    <span className="cld-field-value">{f[key] || '\u2014'}</span>
                  )}
                </div>
              );
            };
            // Fundo: peneira + percentual num campo so ("13=4%"). Sem numeracao
            // FD1/FD2 (rotulo "FD" nos dois slots). View mostra o valor junto; em
            // edicao, dois inputs com "=" no meio. Escreve nos mesmos 4 campos do
            // form (fundo1/fundo2 Peneira/Percent) \u2014 o payload nao muda.
            const renderFundo = (
              peneiraKey: keyof ClassificationFormState,
              percentKey: keyof ClassificationFormState
            ) => {
              const peneira = f[peneiraKey];
              const percent = f[percentKey];
              const combined =
                peneira && percent
                  ? `${peneira} = ${percent}%`
                  : peneira
                    ? peneira
                    : percent
                      ? `${percent}%`
                      : '';
              const isEmpty = !editing && !combined;
              return (
                <div className={`cld-field${isEmpty ? ' is-empty' : ''}`} key={peneiraKey}>
                  <span className="cld-field-label">FD</span>
                  {editing ? (
                    <div className="cld-fundo-edit">
                      <input
                        type="text"
                        inputMode="text"
                        className="cld-field-input"
                        value={peneira}
                        onChange={(e) =>
                          updateClassificationDetailField(peneiraKey, e.target.value.toUpperCase())
                        }
                        disabled={saving}
                      />
                      <span className="cld-fundo-eq" aria-hidden="true">
                        =
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="cld-field-input"
                        value={percent}
                        onChange={(e) =>
                          updateClassificationDetailField(percentKey, e.target.value)
                        }
                        disabled={saving}
                      />
                    </div>
                  ) : (
                    <span className="cld-field-value">{combined || '\u2014'}</span>
                  )}
                </div>
              );
            };
            const renderStatic = (label: string, value: string | number | null | undefined) => {
              const isEmpty = value === null || value === undefined || value === '';
              return (
                <div className={`cld-field${isEmpty ? ' is-empty' : ''}`}>
                  <span className="cld-field-label">{label}</span>
                  <span className="cld-field-value">{isEmpty ? '\u2014' : String(value)}</span>
                </div>
              );
            };
            return (
              <div className="app-modal-backdrop" onClick={closeClassificationDetail}>
                <section
                  ref={classificationDetailTrapRef}
                  className="app-modal is-themed is-wide is-action cld-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="cld-modal-title"
                  onClick={(e) => e.stopPropagation()}
                >
                  <header className="app-modal-header">
                    <div className="app-modal-title-wrap">
                      <h3 id="cld-modal-title" className="app-modal-title">
                        Classificação
                      </h3>
                    </div>
                    <div className="cld-header-actions">
                      <button
                        type="button"
                        className="app-modal-close"
                        onClick={closeClassificationDetail}
                        aria-label="Fechar"
                      >
                        <span aria-hidden="true">&times;</span>
                      </button>
                    </div>
                  </header>

                  {(() => {
                    return (
                      <div className="app-modal-content cld-body">
                        <div className="cld-photo-section" ref={classificationPhotoSectionRef}>
                          {classificationServerPhotoUrl ? (
                            <button
                              type="button"
                              className="cld-photo-btn"
                              onClick={() => setClassificationImageModalOpen(true)}
                              aria-label="Ampliar foto da classificacao"
                            >
                              {/* next/image nao se aplica: foto local, dimensoes via CSS */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={classificationServerPhotoUrl}
                                alt="Foto da classificação"
                                className="cld-photo"
                              />
                            </button>
                          ) : (
                            <div className="cld-photo-empty">Sem foto</div>
                          )}
                        </div>

                        {canEdit ? (
                          <div className="cld-edit-row">
                            <button
                              type="button"
                              className="cld-edit-action"
                              onClick={() => setReclassifyModalOpen(true)}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <circle cx="11" cy="11" r="8" />
                                <path d="m21 21-4.35-4.35" />
                              </svg>
                              Reclassificar
                            </button>
                            <button
                              type="button"
                              className="cld-edit-action"
                              onClick={() => {
                                setClassificationDetailEditing(true);
                                // Scroll natural ate a borda inferior da foto, revelando
                                // os campos pra edicao. requestAnimationFrame garante medir
                                // apos o DOM refletir o modo edicao.
                                requestAnimationFrame(() => {
                                  const photoEl = classificationPhotoSectionRef.current;
                                  const bodyEl = photoEl?.closest('.cld-body') as
                                    | HTMLElement
                                    | null
                                    | undefined;
                                  if (photoEl && bodyEl) {
                                    const delta =
                                      photoEl.getBoundingClientRect().bottom -
                                      bodyEl.getBoundingClientRect().top;
                                    bodyEl.scrollBy({ top: delta, behavior: 'smooth' });
                                  }
                                });
                              }}
                              disabled={editing}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                              </svg>
                              Editar
                            </button>
                          </div>
                        ) : null}

                        {/* Q.cls.2.7 cleanup: ficha unificada — sem ramificacao
                            por classificationType. Layout espelha o review da
                            camera (tipo → identificacao → visual → peneiras
                            2x5 → fundos → catacao+defeitos → obs+beb). */}
                        <div className="cld-pair">
                          <div className="cld-section">
                            <div
                              className={`cld-field${
                                !editing && !classificationDetailType ? ' is-empty' : ''
                              }`}
                            >
                              <span className="cld-field-label">Tipo</span>
                              {editing ? (
                                <select
                                  className="cld-field-input cld-type-select"
                                  value={classificationDetailType ?? ''}
                                  onChange={(e) =>
                                    setClassificationDetailType(
                                      e.target.value === ''
                                        ? null
                                        : (e.target.value as ClassificationType)
                                    )
                                  }
                                  disabled={saving}
                                >
                                  <option value="">— Sem tipo —</option>
                                  <option value="BICA">BICA</option>
                                  <option value="PREPARADO">PREPARADO</option>
                                  <option value="BAIXO">BAIXO</option>
                                  <option value="ESCOLHA">ESCOLHA</option>
                                  <option value="CONILON">CONILON</option>
                                </select>
                              ) : (
                                <span className="cld-field-value">
                                  {classificationDetailType
                                    ? CLASSIFICATION_TYPE_LABEL[classificationDetailType]
                                    : '—'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="cld-section">
                            <div className={`cld-field${!editing && !f.bebida ? ' is-empty' : ''}`}>
                              <span className="cld-field-label">Bebida</span>
                              {editing ? (
                                <input
                                  type="text"
                                  className="cld-field-input"
                                  value={f.bebida}
                                  onChange={(e) =>
                                    updateClassificationDetailField(
                                      'bebida',
                                      e.target.value.toUpperCase()
                                    )
                                  }
                                  disabled={saving}
                                />
                              ) : (
                                <span className="cld-field-value">{f.bebida || '—'}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="cld-section is-general">
                          <div className="cld-section-title">Identificação</div>
                          <div className="cld-grid cld-grid-3">
                            {renderStatic('Lote', detail.sample.internalLotNumber)}
                            {renderStatic('Sacas', detail.sample.declared.sacks)}
                            {renderStatic('Safra', detail.sample.declared.harvest)}
                          </div>
                          <div className="cld-grid cld-grid-3">
                            {renderVal('padrao', 'Padrão')}
                            {renderVal('aspecto', 'Aspecto')}
                            {renderVal('certif', 'Certif.')}
                          </div>
                        </div>

                        <div className="cld-section is-sieves">
                          <div className="cld-section-title">Peneiras</div>
                          <div className="cld-grid cld-grid-5">
                            {renderVal('peneiraP18', 'P18', 'decimal')}
                            {renderVal('peneiraP17', 'P17', 'decimal')}
                            {renderVal('peneiraP16', 'P16', 'decimal')}
                            {renderVal('peneiraMk', 'MK', 'decimal')}
                            {renderVal('peneiraP15', 'P15', 'decimal')}
                          </div>
                          <div className="cld-grid cld-grid-5">
                            {renderVal('peneiraP14', 'P14', 'decimal')}
                            {renderVal('peneiraP13', 'P13', 'decimal')}
                            {renderVal('peneiraP12', 'P12', 'decimal')}
                            {renderVal('peneiraP11', 'P11', 'decimal')}
                            {renderVal('peneiraP10', 'P10', 'decimal')}
                          </div>
                        </div>

                        <div className="cld-section is-funds">
                          <div className="cld-section-title">Fundos</div>
                          <div className="cld-grid cld-grid-2">
                            {renderFundo('fundo1Peneira', 'fundo1Percent')}
                            {renderFundo('fundo2Peneira', 'fundo2Percent')}
                          </div>
                        </div>

                        <div className="cld-section is-defects">
                          <div className="cld-section-title">Catação e defeitos</div>
                          <div className="cld-grid cld-grid-3">
                            {renderVal('catacao', 'Cat.', 'decimal')}
                            {renderVal('imp', 'Imp.', 'decimal')}
                            {renderVal('pva', 'PVA', 'decimal')}
                          </div>
                          <div className="cld-grid cld-grid-3">
                            {renderVal('broca', 'Broca', 'decimal')}
                            {renderVal('gpi', 'GPI', 'decimal')}
                            {renderVal('ap', 'AP', 'decimal')}
                          </div>
                          <div className="cld-grid cld-grid-1">{renderVal('defeito', 'Def.')}</div>
                        </div>

                        <div className="cld-section is-classifier">
                          <div className="cld-section-title">Classificadores</div>
                          {classificationDetailClassifiers.length === 0 ? (
                            <span className="cld-field-value">
                              {editing
                                ? 'Adicione pelo menos um classificador'
                                : 'Sem classificadores'}
                            </span>
                          ) : (
                            <div className="cld-classifier-chips">
                              {classificationDetailClassifiers.map((entry) => (
                                <span key={entry.id} className="cld-classifier-chip">
                                  {editing ? null : (
                                    <span className="cld-classifier-chip-name">
                                      {entry.fullName}
                                    </span>
                                  )}
                                  <span className="cld-classifier-chip-user">
                                    @{entry.username}
                                  </span>
                                  {editing ? (
                                    <button
                                      type="button"
                                      className="cld-classifier-chip-x"
                                      onClick={() =>
                                        setClassificationDetailClassifiers((prev) =>
                                          prev.filter((c) => c.id !== entry.id)
                                        )
                                      }
                                      aria-label={`Remover ${entry.fullName}`}
                                    >
                                      &times;
                                    </button>
                                  ) : null}
                                </span>
                              ))}
                            </div>
                          )}
                          {editing && !classificationDetailPickerOpen ? (
                            <button
                              type="button"
                              className="cld-classifier-add-btn"
                              onClick={() => {
                                setClassificationDetailPickerOpen(true);
                                void loadClassificationDetailUsers();
                              }}
                            >
                              + Adicionar classificador
                            </button>
                          ) : null}
                          {editing && classificationDetailPickerOpen ? (
                            <div className="cld-classifier-picker">
                              {classificationDetailLoadingUsers ? (
                                <div className="cld-classifier-loading">Carregando...</div>
                              ) : classificationDetailUserError ? (
                                <div className="cld-classifier-error">
                                  {classificationDetailUserError}
                                </div>
                              ) : (
                                <>
                                  <div className="cld-classifier-list">
                                    {classificationDetailAvailableUsers.length === 0 ? (
                                      <div className="cld-classifier-empty">
                                        Nenhum usuario disponivel.
                                      </div>
                                    ) : (
                                      classificationDetailAvailableUsers.map((user) => {
                                        const selected = classificationDetailClassifiers.some(
                                          (c) => c.id === user.id
                                        );
                                        return (
                                          <button
                                            key={user.id}
                                            type="button"
                                            className={`cld-classifier-row${selected ? ' is-selected' : ''}`}
                                            onClick={() =>
                                              toggleClassificationDetailClassifier(user)
                                            }
                                          >
                                            <span className="cld-classifier-row-check">
                                              {selected ? (
                                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                                  <path d="M5 13l4 4L19 7" />
                                                </svg>
                                              ) : null}
                                            </span>
                                            <span className="cld-classifier-row-body">
                                              <span className="cld-classifier-row-name">
                                                {user.fullName}
                                              </span>
                                              <span className="cld-classifier-row-user">
                                                @{user.username}
                                              </span>
                                            </span>
                                          </button>
                                        );
                                      })
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    className="cld-classifier-close"
                                    onClick={() => setClassificationDetailPickerOpen(false)}
                                  >
                                    Fechar lista
                                  </button>
                                </>
                              )}
                            </div>
                          ) : null}
                        </div>

                        <div className="cld-section is-notes">
                          <div className="cld-section-title">Observações</div>
                          {editing ? (
                            <textarea
                              className="cld-field-input cld-textarea"
                              value={f.observacoes}
                              onChange={(e) =>
                                updateClassificationDetailField(
                                  'observacoes',
                                  e.target.value.toUpperCase()
                                )
                              }
                              disabled={saving}
                              rows={3}
                            />
                          ) : (
                            <span className="cld-field-value cld-obs-value">
                              {f.observacoes || '\u2014'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {editing && classificationDetailError ? (
                    <p className="sdv-modal-error" role="alert">
                      {classificationDetailError}
                    </p>
                  ) : null}

                  {editing ? (
                    <div className="app-modal-actions cld-edit-actions">
                      <button
                        type="button"
                        className="app-modal-secondary"
                        onClick={cancelClassificationDetailEdit}
                        disabled={saving}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="app-modal-submit"
                        onClick={requestClassificationDetailSave}
                        disabled={saving}
                      >
                        {saving ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  ) : null}

                  {saved ? (
                    <div className="cld-saved-overlay" aria-live="polite">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#27AE60"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : null}
                </section>
              </div>
            );
          })()
        : null}

      {classificationSaveConfirmOpen ? (
        <div className="app-modal-backdrop" onClick={() => setClassificationSaveConfirmOpen(false)}>
          <section
            ref={classificationSaveConfirmTrapRef}
            className="app-modal is-themed is-action sample-detail-compact-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cls-save-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="cls-save-confirm-title" className="app-modal-title">
                  Salvar sem reclassificar
                </h3>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={() => setClassificationSaveConfirmOpen(false)}
                aria-label="Fechar"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </header>
            <div className="app-modal-content">
              <p className="sdv-modal-hint">
                As informações serão atualizadas sem trocar a foto de classificação.
              </p>
              <div className="app-modal-actions">
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={() => {
                    setClassificationSaveConfirmOpen(false);
                    // Volta pro modal expandido em modo leitura, com os valores
                    // antigos (descarta a edicao). Pra editar de novo, clica Editar.
                    cancelClassificationDetailEdit();
                  }}
                  disabled={classificationDetailSaving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="app-modal-submit"
                  onClick={() => {
                    setClassificationSaveConfirmOpen(false);
                    void saveClassificationDetail();
                  }}
                  disabled={classificationDetailSaving}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {classificationImageModalOpen && classificationServerPhotoUrl ? (
        <PhotoZoomViewer
          src={classificationServerPhotoUrl}
          alt="Foto da classificação"
          exportFilename={buildClassificationPhotoFilename(detail)}
          onClose={() => setClassificationImageModalOpen(false)}
        />
      ) : null}

      {/* Envio: editar/cancelar envios EXISTENTES (disparados pela timeline). O
          envio NOVO migrou p/ o card da lista (/samples). */}
      {session && (editSendItem || cancelSendId) ? (
        <SampleSendFlow
          session={session}
          sampleId={sampleId}
          editItem={editSendItem}
          cancelEventId={cancelSendId}
          onChanged={fetchSendHistory}
          onClose={() => {
            setEditSendItem(null);
            setCancelSendId(null);
          }}
        />
      ) : null}

      {/* Modal de confirmacao de reclassificacao — empilhado sobre o modal
          full-view de classificacao. Usa o padrao oficial .app-modal. */}
      {reclassifyModalOpen ? (
        <div className="app-modal-backdrop sample-detail-reclassify-backdrop">
          <section
            ref={reclassifyTrapRef}
            className="app-modal is-themed is-action sample-detail-reclassify-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-detail-reclassify-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="sample-detail-reclassify-modal-title" className="app-modal-title">
                  Reclassificar lote
                </h3>
                <p className="app-modal-description">A nova classificação substitui a atual.</p>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={() => setReclassifyModalOpen(false)}
                aria-label="Fechar modal de reclassificação"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="app-modal-content">
              <div className="app-modal-actions sample-detail-reclassify-actions">
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={() => setReclassifyModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="app-modal-submit"
                  onClick={() => {
                    // CAM-P3: reclassificacao abre o sheet global em Flow B
                    // (sem sair do detalhe).
                    setReclassifyModalOpen(false);
                    closeClassificationDetail();
                    cameraSheet.open({ sampleId });
                  }}
                >
                  Reclassificar
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
