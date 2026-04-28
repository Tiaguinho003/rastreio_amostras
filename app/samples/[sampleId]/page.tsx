'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { AppShell } from '../../../components/AppShell';
import { PhotoZoomViewer } from '../../../components/PhotoZoomViewer';
import { ClientLookupField } from '../../../components/clients/ClientLookupField';
import { ClientQuickCreateModal } from '../../../components/clients/ClientQuickCreateModal';
import { ClientRegistrationSelect } from '../../../components/clients/ClientRegistrationSelect';
import { SampleMovementsPanel } from '../../../components/samples/SampleMovementsPanel';
import {
  ApiError,
  cancelPhysicalSampleSend,
  cancelSampleMovement,
  completeClassification,
  confirmRegistration,
  exportSamplePdf,
  getClient,
  getSampleDetail,
  invalidateSample,
  listSampleEvents,
  listSampleMovements,
  lookupUsersForReference,
  recordPhysicalSampleSent,
  requestQrReprint,
  requestQrPrint,
  saveClassificationPartial,
  startClassification,
  updateClassification,
  updatePhysicalSampleSend,
  updateRegistration,
  uploadClassificationPhoto,
} from '../../../lib/api-client';
import { compressImage } from '../../../lib/compress-image';
import { shareOrDownloadFile } from '../../../lib/share-blob';
import {
  invalidateSampleSchema,
  registrationFormSchema,
  updateReasonSchema,
} from '../../../lib/form-schemas';
import { useFocusTrap } from '../../../lib/use-focus-trap';
import { useRequireAuth } from '../../../lib/use-auth';
import type {
  ClassifierSnapshot,
  ClientRegistrationSummary,
  ClientSummary,
  CommercialStatus,
  ExtractionResult,
  InvalidateReasonCode,
  PrintAction,
  SampleDetailResponse,
  SampleEvent,
  SampleExportType,
  SampleMovement,
  UpdateReasonCode,
  UserLookupItem,
  SampleStatus,
  SessionUser,
} from '../../../lib/types';
import {
  type ClassificationFormState,
  type ClassificationDataPayload,
  type ClassificationSievePayload,
  type ClassificationTechnicalPayload,
  type NumericField,
  CLASSIFICATION_TYPE_LABEL,
  EMPTY_CLASSIFICATION_FORM,
  SIEVE_FIELDS,
  NUMERIC_FIELDS,
  ALL_SIEVE_FIELDS,
  parseNumberInput,
  getTodayDateInput,
  validateClassificationForm,
  buildClassificationDataPayload,
  buildTechnicalFromClassificationData,
  mapExtractionToForm,
  getTypeConfig,
} from '../../../lib/classification-form';

type LabelModalStep = 'review' | 'completed';
type SampleDetailSection = 'GENERAL' | 'COMMERCIAL';

const CLASSIFICATION_STATUSES: SampleStatus[] = [
  'QR_PRINTED',
  'CLASSIFICATION_IN_PROGRESS',
  'CLASSIFIED',
];
const REGISTRATION_EDITABLE_STATUSES: SampleStatus[] = [
  'REGISTRATION_IN_PROGRESS',
  'REGISTRATION_CONFIRMED',
  'QR_PENDING_PRINT',
  'QR_PRINTED',
  'CLASSIFICATION_IN_PROGRESS',
  'CLASSIFIED',
];

const INVALIDATE_REASON_OPTIONS: Array<{ value: InvalidateReasonCode; label: string }> = [
  { value: 'DUPLICATE', label: 'Duplicada' },
  { value: 'WRONG_SAMPLE', label: 'Amostra incorreta' },
  { value: 'DAMAGED', label: 'Danificada' },
  { value: 'CANCELLED', label: 'Cancelada' },
  { value: 'OTHER', label: 'Outro motivo' },
];

const UPDATE_REASON_OPTIONS: Array<{ value: UpdateReasonCode; label: string }> = [
  { value: 'DATA_FIX', label: 'Correcao de dados' },
  { value: 'TYPO', label: 'Erro de digitacao' },
  { value: 'MISSING_INFO', label: 'Informacao faltante' },
  { value: 'OTHER', label: 'Outro motivo' },
];

type Notice = { kind: 'error' | 'success'; text: string } | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function formatDateInputLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const directMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (directMatch) {
    return `${directMatch[3]}/${directMatch[2]}/${directMatch[1]}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }

  return parsed.toLocaleDateString('pt-BR');
}

function buildClassificationFormState(
  detail: SampleDetailResponse,
  user: SessionUser
): ClassificationFormState {
  const latestData = isRecord(detail.sample.latestClassification.data)
    ? detail.sample.latestClassification.data
    : {};
  const draftData =
    (detail.sample.status === 'QR_PRINTED' ||
      detail.sample.status === 'CLASSIFICATION_IN_PROGRESS') &&
    isRecord(detail.sample.classificationDraft.snapshot)
      ? detail.sample.classificationDraft.snapshot
      : {};
  const mergedData = { ...latestData, ...draftData };

  const latestSieve = isRecord(latestData.peneirasPercentuais)
    ? latestData.peneirasPercentuais
    : {};
  const draftSieve = isRecord(draftData.peneirasPercentuais) ? draftData.peneirasPercentuais : {};
  const mergedSieve = { ...latestSieve, ...draftSieve };

  return {
    ...EMPTY_CLASSIFICATION_FORM,
    dataClassificacao: toDateInput(latestData.dataClassificacao),
    padrao: toText(mergedData.padrao),
    catacao: toText(mergedData.catacao),
    aspecto: toText(mergedData.aspecto),
    bebida: toText(mergedData.bebida),
    broca: toText(mergedData.broca),
    pva: toText(mergedData.pva),
    imp: toText(mergedData.imp),
    defeito: toText(mergedData.defeito),
    certif: toText(mergedData.certif),
    observacoes: toText(mergedData.observacoes),
    safra: toText(mergedData.safra),
    peneiraP19: toText(mergedSieve.p19),
    peneiraP18: toText(mergedSieve.p18),
    peneiraP17: toText(mergedSieve.p17),
    peneiraP16: toText(mergedSieve.p16),
    peneiraMk: toText(mergedSieve.mk),
    peneiraP15: toText(mergedSieve.p15),
    peneiraP14: toText(mergedSieve.p14),
    peneiraP13: toText(mergedSieve.p13),
    peneiraP12: toText(mergedSieve.p12),
    peneiraP11: toText(mergedSieve.p11),
    peneiraP10: toText(mergedSieve.p10),
    fundo1Peneira: (() => {
      const f = Array.isArray(mergedSieve.fundos) ? mergedSieve.fundos : [];
      return f[0]?.peneira ?? '';
    })(),
    fundo1Percent: (() => {
      const f = Array.isArray(mergedSieve.fundos) ? mergedSieve.fundos : [];
      return f[0]?.percentual != null ? String(f[0].percentual) : '';
    })(),
    fundo2Peneira: (() => {
      const f = Array.isArray(mergedSieve.fundos) ? mergedSieve.fundos : [];
      return f[1]?.peneira ?? '';
    })(),
    fundo2Percent: (() => {
      const f = Array.isArray(mergedSieve.fundos) ? mergedSieve.fundos : [];
      return f[1]?.percentual != null ? String(f[1].percentual) : '';
    })(),
    ap: toText(mergedData.ap),
    gpi: toText(mergedData.gpi),
  };
}

function buildMismatchMessage(crossValidation: ExtractionResult['crossValidation']): string {
  const fieldLabels: Record<string, string> = {
    lote: 'Lote',
    sacas: 'Sacas',
    safra: 'Safra',
    data: 'Data',
  };

  const mismatches = crossValidation.details
    .filter((d) => !d.match)
    .map((d) => {
      const label = fieldLabels[d.field] ?? d.field;
      return `${label}: ficha "${d.extracted ?? '?'}", registro "${d.registered ?? '?'}"`;
    });

  return `Atenção: dados divergentes — ${mismatches.join('. ')}`;
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

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('pt-BR');
}

function canEditRegistrationStatus(status: SampleStatus): boolean {
  return REGISTRATION_EDITABLE_STATUSES.includes(status);
}

function canRequestReprintStatus(status: SampleStatus): boolean {
  return (
    status === 'QR_PENDING_PRINT' ||
    status === 'QR_PRINTED' ||
    status === 'CLASSIFICATION_IN_PROGRESS' ||
    status === 'CLASSIFIED'
  );
}

const PHYSICAL_SEND_ALLOWED_STATUSES = new Set<SampleStatus>([
  'REGISTRATION_CONFIRMED',
  'QR_PENDING_PRINT',
  'QR_PRINTED',
  'CLASSIFICATION_IN_PROGRESS',
  'CLASSIFIED',
]);

type SendHistoryItem =
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

function isClassificationStatus(status: SampleStatus): boolean {
  return CLASSIFICATION_STATUSES.includes(status);
}

function getExportTypeLabel(exportType: SampleExportType): string {
  return exportType === 'COMPLETO' ? 'Completo' : 'Comprador Parcial';
}

const DETAIL_EVENT_PREVIEW_LIMIT = 1;
const MAX_PHOTO_SIZE_BYTES = 12 * 1024 * 1024; // 12 MB — same as backend DEFAULT_MAX_UPLOAD_SIZE_BYTES

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

function getOperationalStatusDotTone(status: SampleStatus) {
  if (status === 'PHYSICAL_RECEIVED' || status === 'REGISTRATION_IN_PROGRESS') {
    return 'neutral';
  }

  if (status === 'REGISTRATION_CONFIRMED' || status === 'QR_PENDING_PRINT') {
    return 'warning';
  }

  if (status === 'QR_PRINTED') {
    return 'pending';
  }

  if (status === 'CLASSIFICATION_IN_PROGRESS') {
    return 'progress';
  }

  if (status === 'CLASSIFIED') {
    return 'success';
  }

  return 'danger';
}

function getOperationalStatusDotLabel(status: SampleStatus) {
  if (status === 'PHYSICAL_RECEIVED') {
    return 'Recebida fisicamente';
  }

  if (status === 'REGISTRATION_IN_PROGRESS') {
    return 'Registro em andamento';
  }

  if (status === 'REGISTRATION_CONFIRMED' || status === 'QR_PENDING_PRINT') {
    return 'Impressao pendente';
  }

  if (status === 'QR_PRINTED') {
    return 'Classificacao pendente';
  }

  if (status === 'CLASSIFICATION_IN_PROGRESS') {
    return 'Classificacao em andamento';
  }

  if (status === 'CLASSIFIED') {
    return 'Classificada';
  }

  return 'Invalidada';
}

function getCommercialStatusDotTone(status: CommercialStatus) {
  if (status === 'OPEN') {
    return 'open';
  }

  if (status === 'PARTIALLY_SOLD') {
    return 'partial';
  }

  if (status === 'SOLD') {
    return 'sold';
  }

  return 'lost';
}

function getCommercialStatusDotLabel(status: CommercialStatus) {
  if (status === 'OPEN') {
    return 'Em aberto';
  }

  if (status === 'PARTIALLY_SOLD') {
    return 'Venda parcial';
  }

  if (status === 'SOLD') {
    return 'Vendido';
  }

  return 'Perdido';
}

function buildLabelModalTitle(step: LabelModalStep, action: PrintAction | null) {
  if (step === 'review') {
    return 'Confirme os dados da etiqueta';
  }

  return action === 'REPRINT' ? 'Reimpressao enviada' : 'Impressao enviada';
}

function getLabelPrintActionForStatus(status: SampleStatus): PrintAction | null {
  if (status === 'REGISTRATION_CONFIRMED') {
    return 'PRINT';
  }

  if (canRequestReprintStatus(status)) {
    return 'REPRINT';
  }

  return null;
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
    isBuyer: client.isBuyer,
    isSeller: client.isSeller,
    status: client.status,
    commercialUser: null,
    commercialUsers: [],
    registrationCount: 0,
    activeRegistrationCount: 0,
    branches: [],
    branchCount: 0,
    activeBranchCount: 0,
    primaryCity: null,
    primaryState: null,
    createdAt: null,
    updatedAt: null,
  };
}

export default function SampleDetailPage() {
  const { session, loading, logout, setSession } = useRequireAuth();
  const router = useRouter();
  const params = useParams<{ sampleId: string }>();
  const searchParams = useSearchParams();
  const sampleId = typeof params.sampleId === 'string' ? params.sampleId : '';
  const fromQrSource = searchParams.get('source') === 'qr';
  const highlightPrint = searchParams.get('highlight') === 'print';
  const [reclassifyModalOpen, setReclassifyModalOpen] = useState(false);

  const [detail, setDetail] = useState<SampleDetailResponse | null>(null);
  const detailRef = useRef<SampleDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [pageNotice, setPageNotice] = useState<Notice>(null);
  const [generalNotice, setGeneralNotice] = useState<Notice>(null);
  const [classificationNotice, setClassificationNotice] = useState<Notice>(null);
  const [registrationModalNotice, setRegistrationModalNotice] = useState<Notice>(null);
  const [classificationModalNotice, setClassificationModalNotice] = useState<Notice>(null);
  const [invalidateModalNotice, setInvalidateModalNotice] = useState<Notice>(null);

  const [classificationImageModalOpen, setClassificationImageModalOpen] = useState(false);
  const [classificationSelectedPhoto, setClassificationSelectedPhoto] = useState<File | null>(null);
  const [classificationSavedPhotoFile, setClassificationSavedPhotoFile] = useState<File | null>(
    null
  );
  const [classificationPhotoUploading, setClassificationPhotoUploading] = useState(false);
  const [_showClassificationPhotoConfirmEffect, setShowClassificationPhotoConfirmEffect] =
    useState(false);
  const [_classificationPhotoConfirmEffectKey, setClassificationPhotoConfirmEffectKey] =
    useState(0);
  const [printHighlighted, setPrintHighlighted] = useState(false);
  const [exportingPdfType, setExportingPdfType] = useState<SampleExportType | null>(null);
  const [exportTypeSelectorOpen, setExportTypeSelectorOpen] = useState(false);
  const [exportConfirmationOpen, setExportConfirmationOpen] = useState(false);
  const [pendingExportType, setPendingExportType] = useState<SampleExportType | null>(null);
  const [exportRecipientClient, setExportRecipientClient] = useState<ClientSummary | null>(null);

  const [physicalSendModalOpen, setPhysicalSendModalOpen] = useState(false);
  const [physicalSendClient, setPhysicalSendClient] = useState<ClientSummary | null>(null);
  const [physicalSendDate, setPhysicalSendDate] = useState('');
  const [physicalSending, setPhysicalSending] = useState(false);
  const [editingSendEventId, setEditingSendEventId] = useState<string | null>(null);
  const [physicalSendError, setPhysicalSendError] = useState<string | null>(null);
  const [cancelConfirmSendEventId, setCancelConfirmSendEventId] = useState<string | null>(null);
  const [cancellingSend, setCancellingSend] = useState(false);
  const [cancelSendError, setCancelSendError] = useState<string | null>(null);
  const [activeSendMenuId, setActiveSendMenuId] = useState<string | null>(null);

  const [sendHistory, setSendHistory] = useState<SampleEvent[]>([]);
  const [loadingSendHistory, setLoadingSendHistory] = useState(false);

  const [owner, setOwner] = useState('');
  const [selectedOwnerClient, setSelectedOwnerClient] = useState<ClientSummary | null>(null);
  const [ownerRegistrations, setOwnerRegistrations] = useState<ClientRegistrationSummary[]>([]);
  const [selectedOwnerRegistrationId, setSelectedOwnerRegistrationId] = useState<string | null>(
    null
  );
  const [ownerRegistrationLoading, setOwnerRegistrationLoading] = useState(false);
  const [ownerQuickCreateOpen, setOwnerQuickCreateOpen] = useState(false);
  const [ownerQuickCreateSeed, setOwnerQuickCreateSeed] = useState('');
  const [sacks, setSacks] = useState('');
  const [harvest, setHarvest] = useState('');
  const [originLot, setOriginLot] = useState('');
  const [location, setLocation] = useState('');
  const [confirming, setConfirming] = useState(false);

  const [printerId, setPrinterId] = useState('printer-main');
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [labelModalStep, setLabelModalStep] = useState<LabelModalStep>('review');
  const [labelModalSubmitting, setLabelModalSubmitting] = useState(false);
  const [labelModalError, setLabelModalError] = useState<string | null>(null);
  const [labelModalMessage, setLabelModalMessage] = useState<string | null>(null);
  const [invalidateReasonCode, setInvalidateReasonCode] = useState<InvalidateReasonCode>('OTHER');
  const [invalidateReasonText, setInvalidateReasonText] = useState('');
  const [invalidating, setInvalidating] = useState(false);
  const [invalidateModalOpen, setInvalidateModalOpen] = useState(false);
  const [activeMovements, setActiveMovements] = useState<SampleMovement[] | null>(null);
  const [activeMovementsError, setActiveMovementsError] = useState<string | null>(null);

  const [classificationForm, setClassificationForm] =
    useState<ClassificationFormState>(EMPTY_CLASSIFICATION_FORM);
  const [classificationStarting, setClassificationStarting] = useState(false);
  const [classificationSaving, setClassificationSaving] = useState(false);
  const [classificationCompleting, setClassificationCompleting] = useState(false);
  const [classificationStep, setClassificationStep] = useState<'PHOTO' | 'GENERAL' | 'MEASURES'>(
    'PHOTO'
  );
  const [detailSection, setDetailSection] = useState<SampleDetailSection>('GENERAL');
  const [registrationEditMode, setRegistrationEditMode] = useState(false);
  const registrationEditModeRef = useRef(false);
  const [registrationUpdating, setRegistrationUpdating] = useState(false);
  const [registrationEditReasonCode, setRegistrationEditReasonCode] =
    useState<UpdateReasonCode>('OTHER');
  const [registrationEditReasonText, setRegistrationEditReasonText] = useState('');
  const [registrationEditReasonModalOpen, setRegistrationEditReasonModalOpen] = useState(false);
  const [classificationDetailOpen, setClassificationDetailOpen] = useState(false);
  const [classificationDetailEditing, setClassificationDetailEditing] = useState(false);
  const [classificationDetailSaving, setClassificationDetailSaving] = useState(false);
  const [classificationDetailSaved, setClassificationDetailSaved] = useState(false);
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
  const [classificationDetailUserSearch, setClassificationDetailUserSearch] = useState('');
  const [classificationDetailUserError, setClassificationDetailUserError] = useState<string | null>(
    null
  );
  const classificationDetailTrapRef = useFocusTrap(classificationDetailOpen);
  const [classificationEditMode, setClassificationEditMode] = useState(false);
  const classificationEditModeRef = useRef(false);
  const [classificationEditReasonCode, setClassificationEditReasonCode] =
    useState<UpdateReasonCode>('OTHER');
  const [classificationEditReasonText, setClassificationEditReasonText] = useState('');
  const [classificationEditReasonModalOpen, setClassificationEditReasonModalOpen] = useState(false);
  const [classificationUpdating, setClassificationUpdating] = useState(false);
  const invalidateTrapRef = useFocusTrap(invalidateModalOpen);
  const labelTrapRef = useFocusTrap(labelModalOpen);
  const registrationEditTrapRef = useFocusTrap(registrationEditReasonModalOpen);
  const classificationEditTrapRef = useFocusTrap(classificationEditReasonModalOpen);
  const exportTypeTrapRef = useFocusTrap(exportTypeSelectorOpen);
  const exportConfirmTrapRef = useFocusTrap(exportConfirmationOpen);
  const physicalSendTrapRef = useFocusTrap(physicalSendModalOpen);
  const labelModalCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const labelModalPrimaryActionRef = useRef<HTMLButtonElement | null>(null);
  const lastQuickPrintButtonRef = useRef<HTMLButtonElement | null>(null);
  const invalidateModalCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastInvalidateTriggerRef = useRef<HTMLButtonElement | null>(null);
  const classificationPhotoPostUploadTimeoutRef = useRef<number | null>(null);
  const classificationPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const classificationSectionRef = useRef<HTMLElement | null>(null);
  const classificationStepBodyRef = useRef<HTMLDivElement | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const canInvalidateSample = Boolean(session);
  const hasActiveMovements = Boolean(
    detail && ((detail.sample.soldSacks ?? 0) > 0 || (detail.sample.lostSacks ?? 0) > 0)
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
          setSelectedOwnerRegistrationId(response.sample.ownerRegistrationId ?? null);
          setSacks(response.sample.declared.sacks ? String(response.sample.declared.sacks) : '');
          setHarvest(response.sample.declared.harvest ?? '');
          setOriginLot(response.sample.declared.originLot ?? '');
          setLocation(response.sample.declared.location ?? '');
        }

        if (!classificationEditModeRef.current) {
          setClassificationForm(buildClassificationFormState(response, session.user));
        }

        return response;
      } catch (cause) {
        if (controller.signal.aborted) {
          return undefined;
        }

        if (cause instanceof ApiError) {
          setPageNotice({ kind: 'error', text: cause.message });
        } else {
          setPageNotice({ kind: 'error', text: 'Falha ao carregar amostra' });
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

  useEffect(() => {
    if (!session || !selectedOwnerClient) {
      setOwnerRegistrations([]);
      setOwnerRegistrationLoading(false);
      setSelectedOwnerRegistrationId(null);
      setOwner(selectedOwnerClient?.displayName ?? detailRef.current?.sample.declared.owner ?? '');
      return;
    }

    let active = true;
    setOwnerRegistrationLoading(true);
    setOwner(selectedOwnerClient.displayName ?? '');

    getClient(session, selectedOwnerClient.id)
      .then((response) => {
        if (!active) {
          return;
        }

        const activeRegistrations = response.registrations.filter(
          (registration) => registration.status === 'ACTIVE'
        );
        setOwnerRegistrations(activeRegistrations);
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        setOwnerRegistrations([]);
        setSelectedOwnerRegistrationId(null);
        setGeneralNotice({
          kind: 'error',
          text:
            cause instanceof ApiError
              ? cause.message
              : 'Falha ao carregar inscricoes do proprietario',
        });
      })
      .finally(() => {
        if (active) {
          setOwnerRegistrationLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedOwnerClient, session]);

  const syncDetailState = useCallback(
    async (_options: { refreshHistory?: boolean } = {}) => {
      await refreshDetail();
    },
    [refreshDetail]
  );

  useEffect(() => {
    if (!sampleId) {
      return;
    }
    void loadDetail();
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [loadDetail, sampleId]);

  useEffect(() => {
    setExportTypeSelectorOpen(false);
    setExportConfirmationOpen(false);
    setPendingExportType(null);
    setExportRecipientClient(null);
    setLabelModalOpen(false);
    setLabelModalStep('review');
    setLabelModalSubmitting(false);
    setLabelModalError(null);
    setLabelModalMessage(null);
    registrationEditModeRef.current = false;
    setRegistrationEditMode(false);
    setRegistrationEditReasonCode('OTHER');
    setRegistrationEditReasonText('');
    setRegistrationEditReasonModalOpen(false);
    setClassificationStep('PHOTO');
    setDetailSection('GENERAL');
    classificationEditModeRef.current = false;
    setClassificationEditMode(false);
    setClassificationEditReasonCode('OTHER');
    setClassificationEditReasonText('');
    setClassificationEditReasonModalOpen(false);
    setInvalidateModalOpen(false);
    setInvalidateReasonCode('OTHER');
    setInvalidateReasonText('');
    setActiveMovements(null);
    setActiveMovementsError(null);
    setSelectedOwnerClient(null);
    setOwnerRegistrations([]);
    setSelectedOwnerRegistrationId(null);
    setOwnerRegistrationLoading(false);
    setOwnerQuickCreateOpen(false);
    setOwnerQuickCreateSeed('');
    setClassificationSelectedPhoto(null);
    setClassificationSavedPhotoFile(null);
    setShowClassificationPhotoConfirmEffect(false);
    setClassificationPhotoConfirmEffectKey(0);
    if (classificationPhotoInputRef.current) {
      classificationPhotoInputRef.current.value = '';
    }
  }, [sampleId]);

  const classificationSelectedPhotoPreviewUrl = useMemo(() => {
    if (!classificationSelectedPhoto) {
      return null;
    }

    return URL.createObjectURL(classificationSelectedPhoto);
  }, [classificationSelectedPhoto]);

  const classificationSavedPhotoPreviewUrl = useMemo(() => {
    if (!classificationSavedPhotoFile) {
      return null;
    }

    return URL.createObjectURL(classificationSavedPhotoFile);
  }, [classificationSavedPhotoFile]);

  const classificationAttachment = useMemo(
    () =>
      detail?.attachments.find((attachment) => attachment.kind === 'CLASSIFICATION_PHOTO') ?? null,
    [detail]
  );
  const qrValue = useMemo(
    () => detail?.sample.internalLotNumber ?? detail?.sample.id ?? '',
    [detail?.sample.internalLotNumber, detail?.sample.id]
  );
  const printFailed = detail
    ? detail.sample.status === 'QR_PENDING_PRINT' && detail.latestPrintJob?.status === 'FAILED'
    : false;
  const canQuickPrint = detail
    ? detail.sample.status === 'REGISTRATION_CONFIRMED' ||
      canRequestReprintStatus(detail.sample.status)
    : false;
  const canQuickReport = Boolean(
    detail && detail.sample.status === 'CLASSIFIED' && classificationAttachment
  );
  const canPhysicalSend = detail ? PHYSICAL_SEND_ALLOWED_STATUSES.has(detail.sample.status) : false;
  const labelModalPrintAction = detail ? getLabelPrintActionForStatus(detail.sample.status) : null;
  const canCloseLabelModal = labelModalStep === 'review' || labelModalStep === 'completed';
  const classificationShowsWorkspace = Boolean(
    detail &&
    (detail.sample.status === 'QR_PRINTED' ||
      detail.sample.status === 'CLASSIFICATION_IN_PROGRESS' ||
      detail.sample.status === 'CLASSIFIED')
  );
  const classificationPhotoEditingAllowed =
    detail?.sample.status === 'QR_PRINTED' ||
    detail?.sample.status === 'CLASSIFICATION_IN_PROGRESS' ||
    (detail?.sample.status === 'CLASSIFIED' && classificationEditMode);
  const classificationFieldsReadOnly =
    detail?.sample.status === 'CLASSIFIED' && !classificationEditMode;
  const classificationServerPhotoUrl = classificationAttachment
    ? `/api/v1/samples/${sampleId}/photos/${classificationAttachment.id}`
    : null;
  const classificationVisiblePhotoPreviewUrl =
    classificationSelectedPhotoPreviewUrl ??
    classificationSavedPhotoPreviewUrl ??
    classificationServerPhotoUrl;
  const classificationCanComplete =
    !classificationPhotoUploading &&
    !classificationSelectedPhoto &&
    Boolean(classificationAttachment);
  const classificationCanAccessDataSteps =
    Boolean(classificationAttachment) || detail?.sample.status === 'CLASSIFIED';
  const classificationTabDotTone = detail
    ? getOperationalStatusDotTone(detail.sample.status)
    : null;

  useEffect(() => {
    return () => {
      if (classificationPhotoPostUploadTimeoutRef.current !== null) {
        window.clearTimeout(classificationPhotoPostUploadTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!labelModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !canCloseLabelModal) {
        return;
      }

      event.preventDefault();
      setLabelModalOpen(false);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => {
      if (canCloseLabelModal) {
        labelModalCloseButtonRef.current?.focus();
        return;
      }

      labelModalPrimaryActionRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => {
        lastQuickPrintButtonRef.current?.focus();
      }, 0);
    };
  }, [canCloseLabelModal, labelModalOpen]);

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
            cause instanceof ApiError ? cause.message : 'Falha ao carregar movimentacoes'
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

  useEffect(() => {
    if (!classificationCanAccessDataSteps && classificationStep !== 'PHOTO') {
      setClassificationStep('PHOTO');
    }
  }, [classificationCanAccessDataSteps, classificationStep]);

  useEffect(() => {
    if (!classificationSelectedPhotoPreviewUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(classificationSelectedPhotoPreviewUrl);
    };
  }, [classificationSelectedPhotoPreviewUrl]);

  useEffect(() => {
    if (!classificationSavedPhotoPreviewUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(classificationSavedPhotoPreviewUrl);
    };
  }, [classificationSavedPhotoPreviewUrl]);

  useEffect(() => {
    classificationStepBodyRef.current?.scrollTo({ top: 0 });
  }, [classificationStep]);

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

  if (!sampleId) {
    return (
      <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
        <p className="error">sampleId invalido na rota.</p>
      </AppShell>
    );
  }

  async function handleUploadClassificationPhoto() {
    if (!session || !classificationSelectedPhoto || !detail) {
      setClassificationNotice({
        kind: 'error',
        text: 'Selecione uma foto de classificacao antes de usar.',
      });
      return;
    }

    setClassificationPhotoUploading(true);
    setClassificationNotice(null);

    try {
      const compressed = await compressImage(classificationSelectedPhoto);
      const uploadResult = await uploadClassificationPhoto(session, sampleId, compressed, true);
      setClassificationSavedPhotoFile(compressed);
      setClassificationSelectedPhoto(null);
      if (classificationPhotoInputRef.current) {
        classificationPhotoInputRef.current.value = '';
      }

      if (uploadResult?.extraction?.extractedFields) {
        const extracted = mapExtractionToForm(uploadResult.extraction.extractedFields);
        setClassificationForm((prev) => ({ ...prev, ...extracted }));
      }

      // Cross-validation alerts disabled — extraction pre-fill is sufficient
      // if (uploadResult?.extraction?.crossValidation?.hasMismatches) {
      //   setClassificationNotice({ kind: 'error', text: buildMismatchMessage(uploadResult.extraction.crossValidation) });
      // }

      await syncDetailState();
      setClassificationPhotoConfirmEffectKey((current) => current + 1);
      setShowClassificationPhotoConfirmEffect(true);

      if (classificationPhotoPostUploadTimeoutRef.current !== null) {
        window.clearTimeout(classificationPhotoPostUploadTimeoutRef.current);
      }
      classificationPhotoPostUploadTimeoutRef.current = window.setTimeout(() => {
        setShowClassificationPhotoConfirmEffect(false);
        setClassificationStep('GENERAL');
        classificationPhotoPostUploadTimeoutRef.current = null;
      }, 820);
    } catch (cause) {
      if (classificationPhotoInputRef.current) {
        classificationPhotoInputRef.current.value = '';
      }
      if (cause instanceof ApiError) {
        setClassificationNotice({ kind: 'error', text: cause.message });
      } else {
        setClassificationNotice({ kind: 'error', text: 'Falha ao enviar foto da classificacao' });
      }
    } finally {
      setClassificationPhotoUploading(false);
    }
  }

  function handleOpenExportConfirmation(exportType: SampleExportType) {
    if (!detail) {
      return;
    }

    if (detail.sample.status !== 'CLASSIFIED') {
      setGeneralNotice({
        kind: 'error',
        text: 'A exportacao de laudo so e permitida para amostras classificadas.',
      });
      return;
    }

    setGeneralNotice(null);
    setPendingExportType(exportType);
    setExportRecipientClient(null);
    setExportConfirmationOpen(true);
  }

  function handleOpenExportTypeSelector() {
    if (!detail) {
      return;
    }

    if (detail.sample.status !== 'CLASSIFIED') {
      setGeneralNotice({
        kind: 'error',
        text: 'A exportacao de laudo so e permitida para amostras classificadas.',
      });
      return;
    }

    setGeneralNotice(null);
    setExportTypeSelectorOpen(true);
  }

  function handleCloseExportTypeSelector() {
    setExportTypeSelectorOpen(false);
  }

  function handleSelectExportTypeFromModal(exportType: SampleExportType) {
    setExportTypeSelectorOpen(false);
    handleOpenExportConfirmation(exportType);
  }

  function handleCloseExportConfirmation() {
    if (Boolean(exportingPdfType)) {
      return;
    }

    setExportConfirmationOpen(false);
    setPendingExportType(null);
    setExportRecipientClient(null);
  }

  async function handleExportPdf(
    exportType: SampleExportType,
    recipientClient: ClientSummary | null
  ) {
    if (!session || !detail) {
      return;
    }

    if (detail.sample.status !== 'CLASSIFIED') {
      setGeneralNotice({
        kind: 'error',
        text: 'A exportacao de laudo so e permitida para amostras classificadas.',
      });
      return;
    }

    setGeneralNotice(null);
    setExportingPdfType(exportType);

    try {
      const exported = await exportSamplePdf(session, sampleId, {
        exportType,
        destination: recipientClient?.displayName ?? null,
        recipientClientId: recipientClient?.id ?? null,
      });

      const typeLabel = getExportTypeLabel(exportType);
      const result = await shareOrDownloadFile(exported.blob, exported.fileName, {
        mimeType: 'application/pdf',
        shareTitle: `Laudo ${typeLabel}`,
      });

      if (result === 'cancelled') {
        setGeneralNotice({
          kind: 'success',
          text: `Laudo PDF (${typeLabel}) cancelado.`,
        });
      } else if (result === 'shared') {
        setGeneralNotice({
          kind: 'success',
          text: `Laudo PDF (${typeLabel}) compartilhado.`,
        });
      } else {
        setGeneralNotice({
          kind: 'success',
          text: `Laudo PDF (${typeLabel}) baixado.`,
        });
      }

      setExportConfirmationOpen(false);
      setPendingExportType(null);
      setExportRecipientClient(null);
      fetchSendHistory();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setGeneralNotice({ kind: 'error', text: cause.message });
      } else {
        setGeneralNotice({ kind: 'error', text: 'Falha ao exportar laudo PDF' });
      }
    } finally {
      setExportingPdfType(null);
    }
  }

  async function handleConfirmExportFromModal() {
    if (!pendingExportType) {
      return;
    }

    await handleExportPdf(pendingExportType, exportRecipientClient);
  }

  async function handlePhysicalSend() {
    if (!session || !detail) {
      return;
    }

    setPhysicalSending(true);
    setPhysicalSendError(null);

    const isEditing = Boolean(editingSendEventId);

    try {
      if (isEditing && editingSendEventId) {
        await updatePhysicalSampleSend(session, sampleId, editingSendEventId, {
          recipientClientId: physicalSendClient?.id ?? null,
          sentDate: physicalSendDate,
        });
        setGeneralNotice({ kind: 'success', text: 'Envio atualizado com sucesso.' });
      } else {
        await recordPhysicalSampleSent(session, sampleId, {
          recipientClientId: physicalSendClient?.id ?? null,
          sentDate: physicalSendDate,
        });
        setGeneralNotice({
          kind: 'success',
          text: 'Envio de amostra fisica registrado com sucesso.',
        });
      }

      setPhysicalSendModalOpen(false);
      setEditingSendEventId(null);
      fetchSendHistory();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setPhysicalSendError(cause.message);
      } else {
        setPhysicalSendError(
          isEditing
            ? 'Falha ao atualizar envio. Tente novamente.'
            : 'Falha ao registrar envio. Tente novamente.'
        );
      }
    } finally {
      setPhysicalSending(false);
    }
  }

  async function handleOpenEditSend(item: Extract<SendHistoryItem, { kind: 'PHYSICAL' }>) {
    setActiveSendMenuId(null);
    setEditingSendEventId(item.sendEventId);
    setPhysicalSendDate(item.sentDate);
    setPhysicalSendError(null);
    setGeneralNotice(null);

    if (item.recipientClientId && session) {
      try {
        const response = await getClient(session, item.recipientClientId);
        setPhysicalSendClient(response.client);
      } catch {
        setPhysicalSendClient(null);
      }
    } else {
      setPhysicalSendClient(null);
    }

    setPhysicalSendModalOpen(true);
  }

  async function handleConfirmCancelSend() {
    if (!session || !cancelConfirmSendEventId) {
      return;
    }

    setCancellingSend(true);
    setCancelSendError(null);

    try {
      await cancelPhysicalSampleSend(session, sampleId, cancelConfirmSendEventId);
      setGeneralNotice({ kind: 'success', text: 'Envio cancelado com sucesso.' });
      setCancelConfirmSendEventId(null);
      fetchSendHistory();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setCancelSendError(cause.message);
      } else {
        setCancelSendError('Falha ao cancelar envio. Tente novamente.');
      }
    } finally {
      setCancellingSend(false);
    }
  }

  async function handleConfirmRegistration() {
    if (!session || !detail) {
      return;
    }

    setRegistrationModalNotice(null);

    if (!selectedOwnerClient) {
      setRegistrationModalNotice({
        kind: 'error',
        text: 'Selecione um cliente proprietario antes de confirmar o registro.',
      });
      return;
    }

    const parsed = registrationFormSchema.safeParse({
      owner: selectedOwnerClient.displayName ?? owner,
      sacks,
      harvest,
      originLot,
      location: location.trim() ? location : null,
    });

    if (!parsed.success) {
      setRegistrationModalNotice({
        kind: 'error',
        text: parsed.error.issues[0]?.message ?? 'Dados de registro invalidos',
      });
      return;
    }

    setConfirming(true);
    try {
      await confirmRegistration(session, sampleId, {
        expectedVersion: detail.sample.version,
        ownerClientId: selectedOwnerClient.id,
        ownerRegistrationId: selectedOwnerRegistrationId,
        declared: parsed.data,
      });
      registrationEditModeRef.current = false;
      setRegistrationEditMode(false);
      setGeneralNotice({ kind: 'success', text: 'Registro confirmado com sucesso.' });
      await syncDetailState();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setRegistrationModalNotice({ kind: 'error', text: cause.message });
      } else {
        setRegistrationModalNotice({ kind: 'error', text: 'Falha ao confirmar registro' });
      }
    } finally {
      setConfirming(false);
    }
  }

  function resetLabelModal() {
    setLabelModalOpen(false);
    setLabelModalStep('review');
    setLabelModalSubmitting(false);
    setLabelModalError(null);
    setLabelModalMessage(null);
  }

  function closeLabelModal() {
    if (!canCloseLabelModal) {
      return;
    }

    resetLabelModal();
  }

  function openLabelReviewModal(trigger?: HTMLButtonElement) {
    if (!detail) {
      return;
    }

    const printAction = getLabelPrintActionForStatus(detail.sample.status);
    if (!printAction) {
      setGeneralNotice({
        kind: 'error',
        text: 'A impressao ainda nao esta disponivel para este status.',
      });
      return;
    }

    if (trigger) {
      lastQuickPrintButtonRef.current = trigger;
    }

    setGeneralNotice(null);
    setLabelModalError(null);
    setLabelModalMessage(null);
    setLabelModalStep('review');
    setLabelModalOpen(true);
  }

  async function handleSubmitLabelReview() {
    if (!session || !detail) {
      return;
    }

    const printAction = getLabelPrintActionForStatus(detail.sample.status);
    if (!printAction) {
      setLabelModalError('A impressao ainda nao esta disponivel para este status.');
      return;
    }

    setLabelModalSubmitting(true);
    setLabelModalError(null);
    setLabelModalMessage(null);
    setGeneralNotice(null);

    try {
      const normalizedPrinterId = printerId.trim() || null;

      if (printAction === 'PRINT') {
        await requestQrPrint(session, sampleId, {
          expectedVersion: detail.sample.version,
          printerId: normalizedPrinterId,
        });
      } else {
        await requestQrReprint(session, sampleId, {
          printerId: normalizedPrinterId,
          reasonText: null,
        });
      }

      void refreshDetail();
      setLabelModalStep('completed');
      setLabelModalMessage(
        printAction === 'PRINT'
          ? 'Etiqueta enviada para a fila de impressao.'
          : 'Reimpressao enviada para a fila de impressao.'
      );
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

  async function handleInvalidateSample() {
    if (!session || !detail) {
      return;
    }

    if (!canInvalidateSample) {
      setInvalidateModalNotice({
        kind: 'error',
        text: 'Sua sessao atual nao permite invalidar esta amostra.',
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
        text: parsed.error.issues[0]?.message ?? 'Dados de invalidacao invalidos',
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
      setGeneralNotice({ kind: 'success', text: 'Amostra invalidada com sucesso.' });
      setInvalidateReasonCode('OTHER');
      setInvalidateReasonText('');
      await syncDetailState();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setInvalidateModalNotice({ kind: 'error', text: cause.message });
      } else {
        setInvalidateModalNotice({ kind: 'error', text: 'Falha ao invalidar amostra' });
      }
    } finally {
      setInvalidating(false);
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
        text: 'Informe o motivo para cancelar as movimentacoes.',
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
          throw new Error('Falha ao recarregar amostra apos cancelar movimentacao');
        }
        currentVersion = refreshed.sample.version;
      }

      setInvalidateModalOpen(false);
      setInvalidateReasonCode('OTHER');
      setInvalidateReasonText('');
      setGeneralNotice({
        kind: 'success',
        text:
          activeMovements.length === 1
            ? 'Movimentacao cancelada com sucesso.'
            : 'Movimentacoes canceladas com sucesso.',
      });
      await syncDetailState();
    } catch (cause) {
      setInvalidateModalNotice({
        kind: 'error',
        text:
          cause instanceof ApiError
            ? cause.message
            : cause instanceof Error
              ? cause.message
              : 'Falha ao cancelar movimentacoes',
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
        text: parsed.error.issues[0]?.message ?? 'Dados de invalidacao invalidos',
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
          throw new Error('Falha ao recarregar amostra apos cancelar movimentacao');
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
      setGeneralNotice({
        kind: 'success',
        text: 'Movimentacoes canceladas e amostra invalidada.',
      });
      await syncDetailState();
    } catch (cause) {
      setInvalidateModalNotice({
        kind: 'error',
        text:
          cause instanceof ApiError
            ? cause.message
            : cause instanceof Error
              ? cause.message
              : 'Falha ao cancelar movimentacoes e invalidar amostra',
      });
      await refetchActiveMovements();
    } finally {
      setInvalidating(false);
    }
  }

  async function handleStartClassification() {
    if (
      !session ||
      !detail ||
      !isClassificationStatus(detail.sample.status) ||
      detail.sample.status === 'CLASSIFICATION_IN_PROGRESS' ||
      detail.sample.status === 'CLASSIFIED'
    ) {
      return;
    }

    setClassificationStarting(true);
    setClassificationNotice(null);

    try {
      await startClassification(session, sampleId, {
        expectedVersion: detail.sample.version,
        classificationId: null,
        notes: null,
      });
      setClassificationStep('PHOTO');
      setClassificationNotice({ kind: 'success', text: 'Classificacao iniciada com sucesso.' });
      await syncDetailState();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setClassificationNotice({ kind: 'error', text: cause.message });
      } else {
        setClassificationNotice({ kind: 'error', text: 'Falha ao iniciar classificacao' });
      }
    } finally {
      setClassificationStarting(false);
    }
  }

  async function handleSaveClassificationPartial() {
    if (
      !session ||
      !detail ||
      (detail.sample.status !== 'QR_PRINTED' &&
        detail.sample.status !== 'CLASSIFICATION_IN_PROGRESS')
    ) {
      return;
    }

    const validationError = validateClassificationForm(
      classificationForm,
      detail?.sample.classificationType
    );
    if (validationError) {
      setClassificationNotice({ kind: 'error', text: validationError });
      return;
    }

    const classificationData = buildClassificationDataPayload(classificationForm, {
      classificationType: detail?.sample.classificationType,
    });

    setClassificationSaving(true);
    setClassificationNotice(null);

    try {
      const partialPayload: {
        expectedVersion: number;
        snapshotPartial: ClassificationDataPayload;
      } = {
        expectedVersion: detail.sample.version,
        snapshotPartial: { ...classificationData },
      };

      await saveClassificationPartial(session, sampleId, partialPayload);
      setClassificationNotice({ kind: 'success', text: 'Rascunho de classificacao salvo.' });
      await syncDetailState();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setClassificationNotice({ kind: 'error', text: cause.message });
      } else {
        setClassificationNotice({ kind: 'error', text: 'Falha ao salvar classificacao parcial' });
      }
    } finally {
      setClassificationSaving(false);
    }
  }

  async function handleCompleteClassification() {
    if (
      !session ||
      !detail ||
      (detail.sample.status !== 'QR_PRINTED' &&
        detail.sample.status !== 'CLASSIFICATION_IN_PROGRESS')
    ) {
      return;
    }

    if (!classificationAttachment) {
      setClassificationNotice({
        kind: 'error',
        text: 'A foto da classificacao e obrigatoria para concluir.',
      });
      return;
    }

    if (classificationSelectedPhoto) {
      setClassificationNotice({
        kind: 'error',
        text: 'Confirme a foto selecionada antes de concluir.',
      });
      return;
    }

    const validationError = validateClassificationForm(
      classificationForm,
      detail?.sample.classificationType
    );
    if (validationError) {
      setClassificationNotice({ kind: 'error', text: validationError });
      return;
    }

    const classificationData = buildClassificationDataPayload(classificationForm, {
      includeAutomaticDate: true,
      classificationType: detail?.sample.classificationType,
    });
    const technical = buildTechnicalFromClassificationData(classificationData);

    setClassificationCompleting(true);
    setClassificationNotice(null);

    try {
      // Classificador = usuario atual (finalizando proprio draft).
      await completeClassification(session, sampleId, {
        expectedVersion: detail.sample.version,
        classificationData,
        technical,
        classifiers: [{ userId: session.user.id }],
      });
      setClassificationNotice({ kind: 'success', text: 'Classificacao concluida com sucesso.' });
      await syncDetailState();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setClassificationNotice({ kind: 'error', text: cause.message });
      } else {
        setClassificationNotice({ kind: 'error', text: 'Falha ao concluir classificacao' });
      }
    } finally {
      setClassificationCompleting(false);
    }
  }

  function startRegistrationEdit() {
    if (!detail || !canEditRegistrationStatus(detail.sample.status)) {
      return;
    }

    setOwner(detail.sample.declared.owner ?? '');
    setSelectedOwnerClient(mapSampleOwnerClientToSummary(detail.sample.ownerClient ?? null));
    setSelectedOwnerRegistrationId(detail.sample.ownerRegistrationId ?? null);
    setSacks(detail.sample.declared.sacks ? String(detail.sample.declared.sacks) : '');
    setHarvest(detail.sample.declared.harvest ?? '');
    setOriginLot(detail.sample.declared.originLot ?? '');
    setLocation(detail.sample.declared.location ?? '');
    registrationEditModeRef.current = true;
    setRegistrationEditMode(true);
    setGeneralNotice(null);
  }

  function cancelRegistrationEdit() {
    if (!detail) {
      registrationEditModeRef.current = false;
      setRegistrationEditMode(false);
      return;
    }

    setOwner(detail.sample.declared.owner ?? '');
    setSelectedOwnerClient(mapSampleOwnerClientToSummary(detail.sample.ownerClient ?? null));
    setSelectedOwnerRegistrationId(detail.sample.ownerRegistrationId ?? null);
    setSacks(detail.sample.declared.sacks ? String(detail.sample.declared.sacks) : '');
    setHarvest(detail.sample.declared.harvest ?? '');
    setOriginLot(detail.sample.declared.originLot ?? '');
    setLocation(detail.sample.declared.location ?? '');
    registrationEditModeRef.current = false;
    setRegistrationEditMode(false);
    setRegistrationEditReasonCode('OTHER');
    setRegistrationEditReasonText('');
    setRegistrationEditReasonModalOpen(false);
  }

  async function handleConfirmRegistrationUpdate() {
    if (!session || !detail) {
      return;
    }

    if (!selectedOwnerClient) {
      return;
    }

    const parsedForm = registrationFormSchema.safeParse({
      owner: selectedOwnerClient.displayName ?? owner,
      sacks,
      harvest,
      originLot,
      location: location.trim() ? location : null,
    });
    if (!parsedForm.success) {
      setRegistrationModalNotice({
        kind: 'error',
        text: parsedForm.error.issues[0]?.message ?? 'Dados de registro invalidos',
      });
      return;
    }

    const parsedReason = updateReasonSchema.safeParse({
      reasonCode: registrationEditReasonCode,
      reasonText: registrationEditReasonText,
    });
    if (!parsedReason.success) {
      setRegistrationModalNotice({
        kind: 'error',
        text: parsedReason.error.issues[0]?.message ?? 'Justificativa invalida',
      });
      return;
    }

    setRegistrationUpdating(true);
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
        ownerRegistrationId: selectedOwnerRegistrationId,
      };

      await updateRegistration(session, sampleId, {
        expectedVersion: detail.sample.version,
        after: afterPayload,
        reasonCode: parsedReason.data.reasonCode,
        reasonText: parsedReason.data.reasonText,
      });

      setRegistrationEditReasonModalOpen(false);
      registrationEditModeRef.current = false;
      setRegistrationEditMode(false);
      setRegistrationEditReasonCode('OTHER');
      setRegistrationEditReasonText('');
      setGeneralNotice({ kind: 'success', text: 'Edicao de registro salva com sucesso.' });
      await syncDetailState();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setRegistrationModalNotice({ kind: 'error', text: cause.message });
      } else {
        setRegistrationModalNotice({ kind: 'error', text: 'Falha ao salvar edicao de registro' });
      }
    } finally {
      setRegistrationUpdating(false);
    }
  }

  function startClassificationEdit() {
    if (!detail || !session || detail.sample.status !== 'CLASSIFIED') {
      return;
    }

    setClassificationForm(buildClassificationFormState(detail, session.user));
    setClassificationEditReasonCode('OTHER');
    setClassificationEditReasonText('');
    setClassificationEditReasonModalOpen(false);
    classificationEditModeRef.current = true;
    setClassificationEditMode(true);
    setClassificationNotice(null);
  }

  function cancelClassificationEdit() {
    if (detail && session) {
      setClassificationForm(buildClassificationFormState(detail, session.user));
    }
    setClassificationEditReasonCode('OTHER');
    setClassificationEditReasonText('');
    setClassificationEditReasonModalOpen(false);
    classificationEditModeRef.current = false;
    setClassificationEditMode(false);
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
    setClassificationDetailForm(buildClassificationFormState(detail, session.user));
    const initialClassifiers = readClassifiersFromDetail(detail.sample.latestClassification?.data);
    setClassificationDetailClassifiers(initialClassifiers);
    setClassificationDetailClassifiersOriginal(initialClassifiers);
    setClassificationDetailPickerOpen(false);
    setClassificationDetailUserSearch('');
    setClassificationDetailUserError(null);
    setClassificationDetailEditing(false);
    setClassificationDetailSaved(false);
    setClassificationDetailOpen(true);
  }

  function closeClassificationDetail() {
    setClassificationDetailOpen(false);
    setClassificationDetailEditing(false);
    setClassificationDetailSaving(false);
    setClassificationDetailSaved(false);
    setClassificationDetailPickerOpen(false);
    setClassificationDetailUserSearch('');
  }

  function updateClassificationDetailField(key: keyof ClassificationFormState, value: string) {
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

  async function saveClassificationDetail() {
    if (!session || !detail || detail.sample.status === 'INVALIDATED') return;

    const validationError = validateClassificationForm(
      classificationDetailForm,
      detail?.sample.classificationType
    );
    if (validationError) return;

    setClassificationDetailSaving(true);
    try {
      const classificationData = buildClassificationDataPayload(classificationDetailForm, {
        classificationType: detail?.sample.classificationType,
      });
      const technical = buildTechnicalFromClassificationData(classificationData);

      const classifiersChangedNow = classifiersChanged(
        classificationDetailClassifiers,
        classificationDetailClassifiersOriginal
      );
      // Min 1 classificador e obrigatorio. Se o usuario limpou a lista,
      // bloqueamos o save aqui mesmo (backend tambem valida como defesa).
      if (classifiersChangedNow && classificationDetailClassifiers.length === 0) {
        setClassificationDetailSaving(false);
        return;
      }
      const afterPayload: { [key: string]: unknown } = {
        classificationData,
        ...(technical ? { technical } : {}),
      };
      if (classifiersChangedNow) {
        afterPayload.classifiers = classificationDetailClassifiers.map((entry) => ({
          userId: entry.id,
        }));
      }

      await updateClassification(session, sampleId, {
        expectedVersion: detail.sample.version,
        after: afterPayload as { [key: string]: import('../../../lib/api-client').JsonValue },
        reasonCode: 'DATA_FIX',
        reasonText: 'Edicao rapida',
      });

      setClassificationDetailSaved(true);
      setClassificationDetailEditing(false);
      setClassificationDetailPickerOpen(false);
      await syncDetailState({ refreshHistory: true });

      setTimeout(() => {
        setClassificationDetailSaved(false);
      }, 2000);
    } catch {
      // Silently fail — user can retry
    } finally {
      setClassificationDetailSaving(false);
    }
  }

  function handleRequestClassificationUpdate() {
    if (!detail || detail.sample.status === 'INVALIDATED') {
      return;
    }

    const validationError = validateClassificationForm(
      classificationForm,
      detail?.sample.classificationType
    );
    if (validationError) {
      setClassificationNotice({ kind: 'error', text: validationError });
      return;
    }

    setClassificationEditReasonModalOpen(true);
    setClassificationNotice(null);
  }

  async function handleConfirmClassificationUpdate() {
    if (!session || !detail || detail.sample.status === 'INVALIDATED') {
      return;
    }

    const validationError = validateClassificationForm(
      classificationForm,
      detail?.sample.classificationType
    );
    if (validationError) {
      setClassificationModalNotice({ kind: 'error', text: validationError });
      return;
    }

    const parsedReason = updateReasonSchema.safeParse({
      reasonCode: classificationEditReasonCode,
      reasonText: classificationEditReasonText,
    });
    if (!parsedReason.success) {
      setClassificationModalNotice({
        kind: 'error',
        text: parsedReason.error.issues[0]?.message ?? 'Justificativa invalida',
      });
      return;
    }

    const classificationData = buildClassificationDataPayload(classificationForm, {
      classificationType: detail?.sample.classificationType,
    });
    const technical = buildTechnicalFromClassificationData(classificationData);

    setClassificationUpdating(true);
    setClassificationModalNotice(null);

    try {
      await updateClassification(session, sampleId, {
        expectedVersion: detail.sample.version,
        after: {
          classificationData,
          ...(technical ? { technical } : {}),
        },
        reasonCode: parsedReason.data.reasonCode,
        reasonText: parsedReason.data.reasonText,
      });

      setClassificationEditReasonModalOpen(false);
      classificationEditModeRef.current = false;
      setClassificationEditMode(false);
      setClassificationEditReasonCode('OTHER');
      setClassificationEditReasonText('');
      setClassificationNotice({
        kind: 'success',
        text: 'Edicao de classificacao salva com sucesso.',
      });
      await syncDetailState({ refreshHistory: true });
    } catch (cause) {
      if (cause instanceof ApiError) {
        setClassificationModalNotice({ kind: 'error', text: cause.message });
      } else {
        setClassificationModalNotice({
          kind: 'error',
          text: 'Falha ao salvar edicao de classificacao',
        });
      }
    } finally {
      setClassificationUpdating(false);
    }
  }

  function closeClassificationEditReasonModal() {
    if (classificationUpdating) {
      return;
    }

    setClassificationEditReasonModalOpen(false);
    setClassificationModalNotice(null);
  }

  function updateClassificationField(key: keyof ClassificationFormState, value: string) {
    setClassificationForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function getClassificationFieldState(value: string, className?: string) {
    const isEmpty = classificationFieldsReadOnly && !value.trim();
    const stateClass = classificationFieldsReadOnly ? (isEmpty ? 'is-empty' : 'is-filled') : '';
    return {
      fieldClassName: ['sample-classification-field', className, stateClass]
        .filter(Boolean)
        .join(' '),
      controlClassName: ['sample-classification-control', stateClass].filter(Boolean).join(' '),
      placeholder: classificationFieldsReadOnly ? '-' : undefined,
    };
  }

  function renderClassificationInputField(
    key: keyof ClassificationFormState,
    label: string,
    options: {
      className?: string;
      inputMode?: 'decimal' | 'numeric' | 'text';
      type?: 'text';
    } = {}
  ) {
    const fieldState = getClassificationFieldState(classificationForm[key], options.className);
    const isNumeric = options.inputMode === 'decimal' || options.inputMode === 'numeric';

    return (
      <label key={String(key)} className={fieldState.fieldClassName}>
        {label}
        <input
          type={options.type ?? 'text'}
          inputMode={options.inputMode}
          value={classificationForm[key]}
          onChange={(event) => {
            const raw = event.target.value;
            updateClassificationField(key, isNumeric ? raw : raw.toUpperCase());
          }}
          readOnly={classificationFieldsReadOnly}
          placeholder={fieldState.placeholder}
          className={fieldState.controlClassName}
        />
      </label>
    );
  }

  function renderClassificationTextareaField(
    key: keyof ClassificationFormState,
    label: string,
    options: {
      className?: string;
      rows?: number;
    } = {}
  ) {
    const fieldState = getClassificationFieldState(classificationForm[key], options.className);

    return (
      <label className={fieldState.fieldClassName}>
        {label}
        <textarea
          rows={options.rows ?? 2}
          value={classificationForm[key]}
          onChange={(event) => updateClassificationField(key, event.target.value.toUpperCase())}
          readOnly={classificationFieldsReadOnly}
          placeholder={fieldState.placeholder}
          className={fieldState.controlClassName}
        />
      </label>
    );
  }

  function handleClassificationPhotoSelected(file: File | null) {
    if (!file) {
      setClassificationSelectedPhoto(null);
      return;
    }

    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      const limitMb = Math.round(MAX_PHOTO_SIZE_BYTES / (1024 * 1024));
      setClassificationNotice({
        kind: 'error',
        text: `A foto selecionada excede o limite de ${limitMb} MB. Escolha uma imagem menor.`,
      });
      if (classificationPhotoInputRef.current) {
        classificationPhotoInputRef.current.value = '';
      }
      return;
    }

    setClassificationNotice(null);
    setClassificationSelectedPhoto(file);
  }

  function clearClassificationSelectedPhoto() {
    setClassificationSelectedPhoto(null);
    if (classificationPhotoInputRef.current) {
      classificationPhotoInputRef.current.value = '';
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

  function getSdvStatusColor(status: string) {
    switch (status) {
      case 'REGISTRATION_CONFIRMED':
      case 'QR_PENDING_PRINT':
        return { color: '#C0392B', bg: '#FEF2F2', border: '#FECACA', label: 'Em aberto' };
      case 'QR_PRINTED':
        return { color: '#E67E22', bg: '#FFF7ED', border: '#FDE68A', label: 'Impressa' };
      case 'CLASSIFICATION_IN_PROGRESS':
        return { color: '#2980B9', bg: '#EFF6FF', border: '#BFDBFE', label: 'Classificando' };
      case 'CLASSIFIED':
        return { color: '#27AE60', bg: '#F0FDF4', border: '#BBF7D0', label: 'Classificada' };
      case 'INVALIDATED':
        return { color: '#C0392B', bg: '#FEF2F2', border: '#FECACA', label: 'Invalidada' };
      default:
        return { color: '#999', bg: '#f5f5f5', border: '#e0e0e0', label: '' };
    }
  }

  const sdvStatus = detail ? getSdvStatusColor(detail.sample.status) : null;

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="sdv-page">
        {loadingDetail ? <div className="sdv-loading">Carregando amostra...</div> : null}

        {!loadingDetail && detail ? (
          <>
            {/* Header verde */}
            <header className="sdv-header">
              <div className="sdv-header-top">
                <Link href="/samples" className="nsv2-back" aria-label="Voltar aos registros">
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </Link>
                <span className="sdv-header-title">Detalhes</span>
                <button
                  type="button"
                  className="nsv2-avatar"
                  aria-label="Abrir menu de perfil"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-profile-sheet'))}
                >
                  <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
                </button>
              </div>

              <div className="sdv-identity-card">
                <div className="sdv-identity-left">
                  <div className="sdv-identity-code-row">
                    <span className="sdv-identity-code">
                      {detail.sample.internalLotNumber ?? detail.sample.id}
                    </span>
                    {sdvStatus ? (
                      <span
                        className="sdv-identity-badge"
                        style={{
                          color: sdvStatus.color,
                          background: sdvStatus.bg,
                          borderColor: sdvStatus.border,
                        }}
                      >
                        {sdvStatus.label}
                      </span>
                    ) : null}
                  </div>
                  <span className="sdv-identity-owner">
                    {buildReadableValue(detail.sample.declared.owner)}
                  </span>
                </div>
                <div className="sdv-identity-actions">
                  {canInvalidateSample && detail.sample.status !== 'INVALIDATED' ? (
                    <button
                      type="button"
                      className="sdv-identity-btn is-danger"
                      onClick={(event) => {
                        lastInvalidateTriggerRef.current = event.currentTarget;
                        setInvalidateModalOpen(true);
                        setInvalidateReasonCode('OTHER');
                        setInvalidateReasonText('');
                        setInvalidateModalNotice(null);
                        setGeneralNotice(null);
                      }}
                      aria-label="Invalidar"
                    >
                      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              </div>
            </header>

            <NoticeSlot notice={pageNotice} />

            {/* Bloco de ações fixo */}
            <div className="sdv-actions-bar">
              <button
                type="button"
                className={`sdv-action-card is-print${printHighlighted ? ' is-highlight-pulse' : ''}`}
                onClick={(event) => {
                  setPrintHighlighted(false);
                  openLabelReviewModal(event.currentTarget);
                }}
                disabled={!canQuickPrint || labelModalSubmitting}
              >
                <span className="sdv-action-card-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 8V4.8h10V8" />
                    <rect x="5" y="9" width="14" height="7" rx="1.8" />
                    <path d="M8 14h8" />
                    <path d="M8 16.8h8V20H8z" />
                  </svg>
                </span>
                <span className="sdv-action-card-label">Imprimir</span>
              </button>
              <button
                type="button"
                className="sdv-action-card is-report"
                onClick={handleOpenExportTypeSelector}
                disabled={!canQuickReport || Boolean(exportingPdfType)}
              >
                <span className="sdv-action-card-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 4.8h7l3 3V19.2H7z" />
                    <path d="M14 4.8v3h3" />
                    <path d="M9 12h6" />
                    <path d="M9 15h6" />
                  </svg>
                </span>
                <span className="sdv-action-card-label">Gerar laudo</span>
              </button>
              <button
                type="button"
                className="sdv-action-card is-send"
                onClick={() => {
                  setEditingSendEventId(null);
                  setPhysicalSendClient(null);
                  setPhysicalSendDate(getTodayDateInput());
                  setPhysicalSendError(null);
                  setPhysicalSendModalOpen(true);
                }}
                disabled={!canPhysicalSend || physicalSending}
              >
                <span className="sdv-action-card-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m22 2-7 20-4-9-9-4 20-7z" />
                    <path d="M22 2 11 13" />
                  </svg>
                </span>
                <span className="sdv-action-card-label">Enviar</span>
              </button>
            </div>

            {/* Abas */}
            <div className="sdv-tabs" role="tablist" aria-label="Secoes da amostra">
              <button
                type="button"
                role="tab"
                aria-selected={detailSection === 'GENERAL'}
                className={`sdv-tab${detailSection === 'GENERAL' ? ' is-active' : ''}`}
                onClick={() => setDetailSection('GENERAL')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <ellipse cx="12" cy="14" rx="7" ry="9" />
                  <path d="M12 6c-1.5 3-1.8 6-.5 9s1.5 6 .5 9" />
                </svg>
                <span>Geral</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={detailSection === 'COMMERCIAL'}
                className={`sdv-tab${detailSection === 'COMMERCIAL' ? ' is-active' : ''}`}
                onClick={() => setDetailSection('COMMERCIAL')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2v20" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
                <span>Comercial</span>
              </button>
            </div>

            {/* Conteúdo com scroll */}
            <section className="sdv-content">
              <div className="sdv-content-inner">
                {detailSection === 'GENERAL' ? (
                  <section className="sdv-general">
                    {printFailed ? (
                      <div className="sdv-card sdv-print-failed-card">
                        <div className="sdv-print-failed-row">
                          <div className="sdv-print-failed-icon">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <circle cx="12" cy="12" r="10" />
                              <path d="M12 8v4" />
                              <path d="M12 16h.01" />
                            </svg>
                          </div>
                          <div className="sdv-print-failed-body">
                            <span className="sdv-print-failed-title">Impressao falhou</span>
                            <span className="sdv-print-failed-sub">
                              Tentativa {detail!.latestPrintJob!.attemptNumber}
                              {detail!.latestPrintJob!.error
                                ? ` — ${detail!.latestPrintJob!.error}`
                                : ''}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="sdv-print-failed-retry"
                          onClick={(event) => openLabelReviewModal(event.currentTarget)}
                        >
                          Tentar novamente
                        </button>
                      </div>
                    ) : null}
                    {/* Card 1: Informações */}
                    <div className="sdv-card sdv-info-compact">
                      <div className="sdv-info-grid">
                        <div className="sdv-info-item is-full">
                          <span className="sdv-info-label">Proprietario</span>
                          <span className="sdv-info-value">
                            {buildReadableValue(detail.sample.declared.owner)}
                          </span>
                        </div>
                        <div className="sdv-info-item is-full">
                          <span className="sdv-info-label">Inscricao</span>
                          <span className="sdv-info-value">
                            {buildReadableValue(
                              detail.sample.ownerRegistration?.registrationNumber ?? null
                            )}
                          </span>
                        </div>
                        <div className="sdv-info-sep" />
                        <div className="sdv-info-item">
                          <span className="sdv-info-label">Sacas</span>
                          <span className="sdv-info-value">
                            {buildReadableValue(detail.sample.declared.sacks)}
                          </span>
                        </div>
                        <div className="sdv-info-item">
                          <span className="sdv-info-label">Safra</span>
                          <span className="sdv-info-value">
                            {buildReadableValue(detail.sample.declared.harvest)}
                          </span>
                        </div>
                        <div className="sdv-info-sep" />
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
                        <div className="sdv-info-sep" />
                        <div className="sdv-info-item">
                          <span className="sdv-info-label">Recebido em</span>
                          <span className="sdv-info-value">
                            {formatTimestamp(detail.sample.createdAt)}
                          </span>
                        </div>
                      </div>
                      {canEditRegistrationStatus(detail.sample.status) ? (
                        <button
                          type="button"
                          className="sdv-edit-btn sdv-edit-btn-corner"
                          onClick={startRegistrationEdit}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                          </svg>
                          <span>
                            {detail.sample.status === 'REGISTRATION_IN_PROGRESS'
                              ? 'Completar registro'
                              : 'Editar'}
                          </span>
                        </button>
                      ) : null}
                      <NoticeSlot notice={generalNotice} />
                    </div>

                    {sendHistoryItems.length > 0 ? (
                      <div className="sdv-card">
                        <span className="sdv-card-title">Historico de envios</span>
                        <div className="sdv-send-history">
                          {sendHistoryItems.map((item) => {
                            const isPhysical = item.kind === 'PHYSICAL';
                            const cancelled = isPhysical && item.cancelled;
                            const dateStr = isPhysical ? item.sentDate : item.dateLabel;
                            return (
                              <div
                                key={item.key}
                                className={`sdv-send-item ${isPhysical ? 'is-physical' : 'is-pdf'}${cancelled ? ' is-cancelled' : ''}`}
                              >
                                <span className="sdv-send-icon">
                                  {isPhysical ? (
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                      <path d="m22 2-7 20-4-9-9-4 20-7z" />
                                      <path d="M22 2 11 13" />
                                    </svg>
                                  ) : (
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                      <path d="M7 4.8h7l3 3V19.2H7z" />
                                      <path d="M14 4.8v3h3" />
                                      <path d="M9 12h6" />
                                      <path d="M9 15h6" />
                                    </svg>
                                  )}
                                </span>
                                <div className="sdv-send-info">
                                  <div className="sdv-send-label">{item.recipientName}</div>
                                  <div className="sdv-send-date">
                                    {isPhysical ? 'Amostra fisica' : 'Laudo PDF'} &middot; {dateStr}
                                    {cancelled ? ' \u00b7 Cancelado' : ''}
                                  </div>
                                </div>
                                {isPhysical && !cancelled && canPhysicalSend ? (
                                  <div className="sdv-send-menu">
                                    <button
                                      type="button"
                                      className="sdv-send-menu-btn"
                                      aria-label="Acoes do envio"
                                      aria-haspopup="menu"
                                      aria-expanded={activeSendMenuId === item.sendEventId}
                                      onClick={() =>
                                        setActiveSendMenuId((current) =>
                                          current === item.sendEventId ? null : item.sendEventId
                                        )
                                      }
                                    >
                                      <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <circle cx="12" cy="5" r="1.5" />
                                        <circle cx="12" cy="12" r="1.5" />
                                        <circle cx="12" cy="19" r="1.5" />
                                      </svg>
                                    </button>
                                    {activeSendMenuId === item.sendEventId ? (
                                      <div className="sdv-send-menu-popover" role="menu">
                                        <button
                                          type="button"
                                          className="sdv-send-menu-item"
                                          role="menuitem"
                                          onClick={() => handleOpenEditSend(item)}
                                        >
                                          Editar
                                        </button>
                                        <button
                                          type="button"
                                          className="sdv-send-menu-item is-danger"
                                          role="menuitem"
                                          onClick={() => {
                                            setActiveSendMenuId(null);
                                            setCancelConfirmSendEventId(item.sendEventId);
                                          }}
                                        >
                                          Cancelar envio
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {/* Bloco de classificacao */}
                    {(() => {
                      const classData = detail.sample.latestClassification?.data;
                      const classPhotoUrl = classificationAttachment
                        ? `/api/v1/samples/${sampleId}/photos/${classificationAttachment.id}`
                        : null;
                      if (!classData) {
                        return (
                          <div className="sdv-card">
                            <span className="sdv-card-title">Classificacao</span>
                            <p className="sdv-empty-text">Sem classificacao</p>
                          </div>
                        );
                      }
                      const cd = classData as Record<string, unknown>;
                      const aspecto = String(cd.aspecto ?? '—');
                      const catacao = String(cd.catacao ?? '—');
                      // Classificadores: novo campo canonico `classificadores`
                      // (array de snapshots). Fallback para `conferidoPor` (eventos
                      // antigos pre-migration) ou string legacy `classificador`.
                      const classifiersArr = Array.isArray(cd.classificadores)
                        ? cd.classificadores
                        : Array.isArray(cd.conferidoPor)
                          ? cd.conferidoPor
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
                        : typeof cd.classificador === 'string' && cd.classificador.trim()
                          ? cd.classificador
                          : '—';
                      const classificadorLabel =
                        classifiersArr && classifiersArr.length > 1
                          ? 'Classificadores'
                          : 'Classificador';
                      return (
                        <div
                          className="sdv-card sdv-cls-block sdv-cls-block-clickable"
                          role="button"
                          tabIndex={0}
                          onClick={openClassificationDetail}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openClassificationDetail();
                            }
                          }}
                          aria-label="Ver classificacao completa"
                        >
                          <div className="sdv-card-header">
                            <span className="sdv-card-title">Classificacao</span>
                          </div>
                          <div className="sdv-cls-block-summary">
                            {classPhotoUrl ? (
                              // next/image nao se aplica: src vem do upload local, dimensoes via CSS class
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={classPhotoUrl}
                                alt="Foto da classificacao"
                                className="sdv-cls-block-thumb"
                              />
                            ) : null}
                            <div className="sdv-cls-block-fields">
                              <div className="sdv-info-item">
                                <span className="sdv-info-label">Aspecto</span>
                                <span className="sdv-info-value">{aspecto}</span>
                              </div>
                              <div className="sdv-info-item">
                                <span className="sdv-info-label">Catacao</span>
                                <span className="sdv-info-value">{catacao}</span>
                              </div>
                              <div className="sdv-info-item">
                                <span className="sdv-info-label">{classificadorLabel}</span>
                                <span className="sdv-info-value">{classificador}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {detail.sample.status === 'INVALIDATED' ? (
                      <div className="sdv-card sdv-card-invalidated">
                        <span className="sdv-card-title sdv-card-title-danger">
                          Amostra invalidada
                        </span>
                        <p className="sdv-empty-text">
                          Esta amostra foi retirada do fluxo operacional e permanece apenas para
                          consulta.
                        </p>
                      </div>
                    ) : null}
                  </section>
                ) : (
                  <section className="stack sample-detail-info-pane sample-detail-commercial-pane">
                    <SampleMovementsPanel
                      session={session}
                      sampleId={sampleId}
                      sample={detail.sample}
                      movements={detail.movements ?? []}
                      onRefresh={async () => {
                        await syncDetailState();
                      }}
                    />
                  </section>
                )}
              </div>
            </section>
          </>
        ) : null}
      </section>

      {detail && invalidateModalOpen ? (
        <div className="app-modal-backdrop">
          <section
            ref={invalidateTrapRef}
            className="app-modal sample-detail-invalidate-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-detail-invalidate-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="sample-detail-invalidate-modal-title" className="app-modal-title">
                  Invalidar amostra
                </h3>
                <p className="app-modal-description">
                  Retire a amostra do fluxo apenas quando a operacao realmente exigir.
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
                aria-label="Fechar modal de invalidacao"
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
                        Esta amostra possui{' '}
                        {activeMovements && activeMovements.length > 0
                          ? `${activeMovements.length} movimentacao${activeMovements.length > 1 ? 'oes' : ''} ativa${activeMovements.length > 1 ? 's' : ''}`
                          : 'movimentacoes ativas'}
                      </strong>
                      Para invalidar, todas as vendas e perdas registradas serao canceladas. Voce
                      tambem pode apenas cancelar as movimentacoes sem invalidar a amostra.
                    </div>
                  </div>

                  <div className="sample-detail-invalidate-movements">
                    {activeMovements === null ? (
                      <p className="sample-detail-invalidate-movements-hint">
                        Carregando movimentacoes...
                      </p>
                    ) : activeMovementsError ? (
                      <p className="sdv-modal-error">{activeMovementsError}</p>
                    ) : activeMovements.length === 0 ? (
                      <p className="sample-detail-invalidate-movements-hint">
                        Nenhuma movimentacao ativa encontrada.
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
                <span className="app-modal-label">Motivo da invalidacao</span>
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
                    {invalidating ? 'Cancelando...' : 'So cancelar movimentacoes'}
                  </button>
                  <button
                    type="submit"
                    className="danger sample-detail-invalidate-submit"
                    disabled={
                      invalidating ||
                      invalidateReasonText.trim().length === 0 ||
                      activeMovements === null ||
                      activeMovements.length === 0
                    }
                  >
                    {invalidating ? 'Processando...' : 'Cancelar e invalidar'}
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
                    className="danger sample-detail-invalidate-submit"
                    disabled={invalidating}
                  >
                    {invalidating ? 'Invalidando...' : 'Invalidar'}
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
                <strong>Proprietario:</strong> {buildReadableValue(detail.sample.declared.owner)}
              </p>
              <p>
                <strong>Sacas:</strong> {buildReadableValue(detail.sample.declared.sacks)}
              </p>
              <p>
                <strong>Safra:</strong> {buildReadableValue(detail.sample.declared.harvest)}
              </p>
              <p>
                <strong>Lote origem:</strong> {buildReadableValue(detail.sample.declared.originLot)}
              </p>
            </div>
          </article>
        </section>
      ) : null}

      {detail && labelModalOpen ? (
        <div className="app-modal-backdrop new-sample-label-modal-backdrop">
          <section
            ref={labelTrapRef}
            className="app-modal new-sample-label-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-detail-label-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="new-sample-label-modal-header">
              <h3 id="sample-detail-label-modal-title" className="new-sample-label-modal-title">
                {buildLabelModalTitle(labelModalStep, labelModalPrintAction)}
              </h3>

              {canCloseLabelModal ? (
                <button
                  ref={labelModalCloseButtonRef}
                  type="button"
                  className="new-sample-label-modal-close"
                  onClick={closeLabelModal}
                  aria-label="Fechar modal"
                >
                  <span aria-hidden="true">×</span>
                </button>
              ) : null}
            </header>

            <div className="new-sample-label-modal-content">
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
                    <strong>Proprietario:</strong>{' '}
                    {buildReadableValue(detail.sample.declared.owner)}
                  </p>
                  <p>
                    <strong>Sacas:</strong> {buildReadableValue(detail.sample.declared.sacks)}
                  </p>
                  <p>
                    <strong>Safra:</strong> {buildReadableValue(detail.sample.declared.harvest)}
                  </p>
                  <p>
                    <strong>Lote origem:</strong>{' '}
                    {buildReadableValue(detail.sample.declared.originLot)}
                  </p>
                </div>
              </article>
            </div>

            {labelModalError ? (
              <p className="error new-sample-label-modal-feedback">{labelModalError}</p>
            ) : null}
            {labelModalMessage ? (
              <p className="success new-sample-label-modal-feedback">{labelModalMessage}</p>
            ) : null}

            <div className="row new-sample-print-actions new-sample-label-modal-actions">
              {labelModalStep === 'review' ? (
                <>
                  <button
                    ref={labelModalPrimaryActionRef}
                    type="button"
                    className="new-sample-label-action-confirm"
                    disabled={labelModalSubmitting}
                    onClick={() => void handleSubmitLabelReview()}
                  >
                    {labelModalSubmitting
                      ? 'Enviando...'
                      : labelModalPrintAction === 'REPRINT'
                        ? 'Reimprimir etiqueta'
                        : 'Imprimir etiqueta'}
                  </button>
                  <button
                    type="button"
                    className="new-sample-label-action-edit"
                    disabled={labelModalSubmitting}
                    onClick={closeLabelModal}
                  >
                    Fechar
                  </button>
                </>
              ) : null}

              {labelModalStep === 'completed' ? (
                <button
                  ref={labelModalPrimaryActionRef}
                  type="button"
                  className="new-sample-label-action-new"
                  onClick={resetLabelModal}
                >
                  Fechar
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      <ClientQuickCreateModal
        session={session}
        open={ownerQuickCreateOpen}
        title="Cadastro rapido de proprietario"
        initialSearch={ownerQuickCreateSeed}
        initialPersonType="PJ"
        initialIsSeller
        initialIsBuyer={false}
        onClose={() => setOwnerQuickCreateOpen(false)}
        onCreated={(client) => {
          setOwnerQuickCreateOpen(false);
          setSelectedOwnerClient(client);
          setOwner(client.displayName ?? '');
          setSelectedOwnerRegistrationId(null);
          setGeneralNotice({
            kind: 'success',
            text: 'Cliente proprietario criado e selecionado com sucesso.',
          });
        }}
      />

      {registrationEditMode ? (
        <div className="app-modal-backdrop">
          <section
            ref={registrationEditTrapRef}
            className="app-modal cdm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="registration-edit-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cdm-header">
              <h3 id="registration-edit-modal-title" className="cdm-header-name">
                {detail?.sample.status === 'REGISTRATION_IN_PROGRESS'
                  ? 'Completar registro'
                  : 'Editar informacoes'}
              </h3>
              <button
                type="button"
                className="app-modal-close cdm-close"
                onClick={cancelRegistrationEdit}
                disabled={registrationUpdating}
                aria-label="Fechar"
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="sdv-edit-fields">
              <div className="sdv-edit-field">
                <ClientLookupField
                  session={session}
                  label="Proprietario"
                  kind="owner"
                  selectedClient={selectedOwnerClient}
                  disabled={registrationUpdating}
                  compact
                  onSelectClient={(client) => {
                    setSelectedOwnerClient(client);
                    setOwner(client?.displayName ?? '');
                    setSelectedOwnerRegistrationId(null);
                    setGeneralNotice(null);
                  }}
                  onRequestCreate={(searchTerm) => {
                    setOwnerQuickCreateSeed(searchTerm);
                    setOwnerQuickCreateOpen(true);
                  }}
                  createLabel="Cadastrar proprietario"
                />
              </div>
              <div className="sdv-edit-field">
                <ClientRegistrationSelect
                  label="Inscricao"
                  registrations={ownerRegistrations}
                  value={selectedOwnerRegistrationId}
                  disabled={
                    !selectedOwnerClient || ownerRegistrationLoading || registrationUpdating
                  }
                  onChange={setSelectedOwnerRegistrationId}
                  placeholder="Selecionar"
                  compact
                />
              </div>
              <div className="sdv-edit-row">
                <label className="sdv-edit-field">
                  <span className="sdv-edit-label">Sacas</span>
                  <input
                    className="sdv-edit-input"
                    value={sacks}
                    onChange={(event) => setSacks(event.target.value)}
                    inputMode="numeric"
                    disabled={registrationUpdating}
                  />
                </label>
                <label className="sdv-edit-field">
                  <span className="sdv-edit-label">Safra</span>
                  <input
                    className="sdv-edit-input"
                    value={harvest}
                    onChange={(event) => setHarvest(event.target.value.toUpperCase())}
                    disabled={registrationUpdating}
                  />
                </label>
              </div>
              <div className="sdv-edit-row">
                <label className="sdv-edit-field">
                  <span className="sdv-edit-label">Lote de origem</span>
                  <input
                    className="sdv-edit-input"
                    value={originLot}
                    onChange={(event) => setOriginLot(event.target.value.toUpperCase())}
                    disabled={registrationUpdating}
                  />
                </label>
                <label className="sdv-edit-field">
                  <span className="sdv-edit-label">Local</span>
                  <input
                    className="sdv-edit-input"
                    value={location}
                    onChange={(event) => setLocation(event.target.value.toUpperCase())}
                    maxLength={30}
                    placeholder="Ex: BM, Patos"
                    disabled={registrationUpdating}
                  />
                </label>
              </div>
              {detail?.sample.status !== 'REGISTRATION_IN_PROGRESS' ? (
                <>
                  <div className="sdv-edit-sep" />

                  <label className="sdv-edit-field">
                    <span className="sdv-edit-label">Motivo da edicao</span>
                    <select
                      className="sdv-edit-input"
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
                  <label className="sdv-edit-field">
                    <span className="sdv-edit-label">
                      Justificativa{registrationEditReasonCode === 'OTHER' ? ' (obrigatoria)' : ''}
                    </span>
                    <input
                      className="sdv-edit-input"
                      value={registrationEditReasonText}
                      onChange={(event) =>
                        setRegistrationEditReasonText(event.target.value.toUpperCase())
                      }
                      placeholder={
                        registrationEditReasonCode === 'OTHER' ? 'Explique a alteracao' : 'Opcional'
                      }
                      disabled={registrationUpdating}
                    />
                  </label>
                </>
              ) : null}
            </div>

            <NoticeSlot notice={registrationModalNotice} />
            <NoticeSlot notice={generalNotice} />

            <div className="sdv-edit-actions">
              <button
                type="button"
                className="cdm-manage-link"
                onClick={() => {
                  if (detail?.sample.status === 'REGISTRATION_IN_PROGRESS') {
                    void handleConfirmRegistration();
                  } else {
                    void handleConfirmRegistrationUpdate();
                  }
                }}
                disabled={
                  registrationUpdating ||
                  confirming ||
                  (detail?.sample.status !== 'REGISTRATION_IN_PROGRESS' &&
                    registrationEditReasonCode === 'OTHER' &&
                    registrationEditReasonText.trim().length === 0)
                }
              >
                {detail?.sample.status === 'REGISTRATION_IN_PROGRESS'
                  ? confirming
                    ? 'Confirmando...'
                    : 'Confirmar registro'
                  : registrationUpdating
                    ? 'Salvando...'
                    : 'Salvar edicao'}
              </button>
            </div>
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
            const renderVal = (
              key: keyof ClassificationFormState,
              label: string,
              inputMode: 'text' | 'decimal' = 'text'
            ) => (
              <div className="cld-field" key={key}>
                <span className="cld-field-label">{label}</span>
                {editing ? (
                  <input
                    type="text"
                    inputMode={inputMode}
                    className="cld-field-input"
                    value={f[key]}
                    onChange={(e) => {
                      const raw = e.target.value;
                      updateClassificationDetailField(
                        key,
                        inputMode === 'decimal' ? raw : raw.toUpperCase()
                      );
                    }}
                    disabled={saving}
                    placeholder="\u2014"
                  />
                ) : (
                  <span className="cld-field-value">{f[key] || '\u2014'}</span>
                )}
              </div>
            );
            const renderStatic = (label: string, value: string | number | null | undefined) => (
              <div className="cld-field">
                <span className="cld-field-label">{label}</span>
                <span className="cld-field-value">
                  {value !== null && value !== undefined && value !== '' ? String(value) : '\u2014'}
                </span>
              </div>
            );
            return (
              <div className="app-modal-backdrop" onClick={closeClassificationDetail}>
                <section
                  ref={classificationDetailTrapRef}
                  className="app-modal cld-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Classificacao completa"
                  onClick={(e) => e.stopPropagation()}
                >
                  <header className="cld-header">
                    <h3 className="cld-title">
                      Classificacao
                      {detail.sample.classificationType
                        ? ` \u2014 ${CLASSIFICATION_TYPE_LABEL[detail.sample.classificationType]}`
                        : ''}
                    </h3>
                    <div className="cld-header-actions">
                      {canEdit && !editing ? (
                        <button
                          type="button"
                          className="cld-reclassify-btn"
                          onClick={() => setReclassifyModalOpen(true)}
                          aria-label="Reclassificar amostra"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M21 12a9 9 0 1 1-3-6.7" />
                            <path d="M21 4v5h-5" />
                          </svg>
                          Reclassificar
                        </button>
                      ) : null}
                      {canEdit && !editing ? (
                        <button
                          type="button"
                          className="cld-edit-btn"
                          onClick={() => setClassificationDetailEditing(true)}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          </svg>
                          Editar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="app-modal-close cld-close-btn"
                        onClick={closeClassificationDetail}
                        aria-label="Fechar"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </header>

                  {(() => {
                    const typeConfig = getTypeConfig(detail.sample.classificationType);
                    const sieveList = typeConfig?.sieveFields ?? ALL_SIEVE_FIELDS;
                    const defectList = typeConfig?.defectFields ?? [
                      { key: 'broca' as const, label: 'Broca' },
                      { key: 'pva' as const, label: 'PVA' },
                      { key: 'imp' as const, label: 'Impureza' },
                      { key: 'defeito' as const, label: 'Defeito' },
                      { key: 'ap' as const, label: 'AP' },
                      { key: 'gpi' as const, label: 'GPI' },
                    ];
                    const showFundo2 = typeConfig?.hasFundo2 !== false;
                    const classificationType = detail.sample.classificationType;
                    return (
                      <div className={`cld-body${saved ? ' is-saved' : ''}`}>
                        <div className="cld-photo-section">
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
                                alt="Foto da classificacao"
                                className="cld-photo"
                              />
                            </button>
                          ) : (
                            <div className="cld-photo-empty">Sem foto</div>
                          )}
                        </div>

                        <div className="cld-section is-general">
                          <div className="cld-section-title">
                            <span className="cld-dot" />
                            Geral
                          </div>
                          <div className="cld-grid cld-grid-2">
                            {renderStatic('Lote', detail.sample.internalLotNumber)}
                            {renderStatic('Sacas', detail.sample.declared.sacks)}
                          </div>
                          <div className="cld-grid cld-grid-4">
                            {renderVal('padrao', 'Padrao')}
                            {renderVal('safra', 'Safra')}
                            {renderVal('aspecto', 'Aspecto')}
                            {renderVal('certif', 'Certif.')}
                          </div>
                          <div className="cld-grid cld-grid-4">
                            {renderVal('catacao', 'Catacao')}
                            {renderVal('broca', 'Broca', 'decimal')}
                            {renderVal('pva', 'PVA', 'decimal')}
                            {renderVal('bebida', 'Bebida')}
                          </div>
                        </div>

                        <div className="cld-section is-classifier">
                          <div className="cld-section-title">
                            <span className="cld-dot" />
                            Classificadores
                          </div>
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
                                  <span className="cld-classifier-chip-name">{entry.fullName}</span>
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
                                  <input
                                    type="text"
                                    className="cld-classifier-search"
                                    placeholder="Buscar por nome ou usuario"
                                    value={classificationDetailUserSearch}
                                    onChange={(e) =>
                                      setClassificationDetailUserSearch(e.target.value)
                                    }
                                  />
                                  <div className="cld-classifier-list">
                                    {(() => {
                                      const q = classificationDetailUserSearch.trim().toLowerCase();
                                      const filtered = q
                                        ? classificationDetailAvailableUsers.filter(
                                            (u) =>
                                              u.fullName.toLowerCase().includes(q) ||
                                              u.username.toLowerCase().includes(q)
                                          )
                                        : classificationDetailAvailableUsers;
                                      if (filtered.length === 0) {
                                        return (
                                          <div className="cld-classifier-empty">
                                            Nenhum usuario encontrado.
                                          </div>
                                        );
                                      }
                                      return filtered.map((user) => {
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
                                      });
                                    })()}
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

                        {classificationType === 'BICA' && (
                          <div className="cld-section is-sieves">
                            <div className="cld-section-title">
                              <span className="cld-dot" />
                              Peneiras <span className="cld-section-unit">%</span>
                            </div>
                            <div className="cld-grid cld-grid-3">
                              {renderVal('peneiraP17', 'P.17', 'decimal')}
                              {renderVal('peneiraMk', 'MK', 'decimal')}
                              {renderVal('imp', 'Impureza', 'decimal')}
                            </div>
                          </div>
                        )}
                        {classificationType === 'LOW_CAFF' && (
                          <div className="cld-section is-sieves">
                            <div className="cld-section-title">
                              <span className="cld-dot" />
                              Peneiras <span className="cld-section-unit">%</span>
                            </div>
                            <div className="cld-grid cld-grid-6">
                              {renderVal('peneiraP15', 'P.15', 'decimal')}
                              {renderVal('peneiraP14', 'P.14', 'decimal')}
                              {renderVal('peneiraP13', 'P.13', 'decimal')}
                              {renderVal('peneiraP12', 'P.12', 'decimal')}
                              {renderVal('peneiraP11', 'P.11', 'decimal')}
                              {renderVal('peneiraP10', 'P.10', 'decimal')}
                            </div>
                          </div>
                        )}
                        {classificationType === 'PREPARADO' && (
                          <div className="cld-section is-sieves">
                            <div className="cld-section-title">
                              <span className="cld-dot" />
                              Peneiras <span className="cld-section-unit">%</span>
                            </div>
                            <div className="cld-grid cld-grid-6">
                              {renderVal('peneiraP19', 'P.19', 'decimal')}
                              {renderVal('peneiraP18', 'P.18', 'decimal')}
                              {renderVal('peneiraP17', 'P.17', 'decimal')}
                              {renderVal('peneiraP16', 'P.16', 'decimal')}
                              {renderVal('peneiraP15', 'P.15', 'decimal')}
                              {renderVal('peneiraP14', 'P.14', 'decimal')}
                            </div>
                            <div className="cld-grid cld-grid-3">
                              {renderVal('peneiraMk', 'MK', 'decimal')}
                              {renderVal('defeito', 'Defeito', 'decimal')}
                              {renderVal('imp', 'Impureza', 'decimal')}
                            </div>
                          </div>
                        )}
                        {!classificationType && sieveList.length > 0 && (
                          <div className="cld-section is-sieves">
                            <div className="cld-section-title">
                              <span className="cld-dot" />
                              Peneiras <span className="cld-section-unit">%</span>
                            </div>
                            <div className="cld-grid cld-grid-4">
                              {sieveList.map((sf) => renderVal(sf.key, sf.label, 'decimal'))}
                            </div>
                          </div>
                        )}

                        {classificationType === 'LOW_CAFF' && (
                          <div className="cld-section is-defects">
                            <div className="cld-section-title">
                              <span className="cld-dot" />
                              Defeitos e analises
                            </div>
                            <div className="cld-grid cld-grid-4">
                              {renderVal('ap', 'AP (%)', 'decimal')}
                              {renderVal('gpi', 'GPI', 'decimal')}
                              {renderVal('defeito', 'Defeito', 'decimal')}
                              {renderVal('imp', 'Impureza', 'decimal')}
                            </div>
                          </div>
                        )}
                        {!classificationType && defectList.length > 0 && (
                          <div className="cld-section is-defects">
                            <div className="cld-section-title">
                              <span className="cld-dot" />
                              Defeitos e analises
                            </div>
                            <div className="cld-grid cld-grid-4">
                              {defectList.map((df) => renderVal(df.key, df.label, 'decimal'))}
                            </div>
                          </div>
                        )}

                        <div className="cld-section is-funds">
                          <div className="cld-section-title">
                            <span className="cld-dot" />
                            Fundos
                          </div>
                          <div className={`cld-grid ${showFundo2 ? 'cld-grid-4' : 'cld-grid-2'}`}>
                            {renderVal('fundo1Peneira', 'FD1 Pen.')}
                            {renderVal('fundo1Percent', 'FD1 %', 'decimal')}
                            {showFundo2 && renderVal('fundo2Peneira', 'FD2 Pen.')}
                            {showFundo2 && renderVal('fundo2Percent', 'FD2 %', 'decimal')}
                          </div>
                        </div>

                        <div className="cld-section is-notes">
                          <div className="cld-section-title">
                            <span className="cld-dot" />
                            Observacoes
                          </div>
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
                              placeholder="\u2014"
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

                  <div className={`cld-actions${editing ? '' : ' is-hidden'}`}>
                    <button
                      type="button"
                      className="cld-btn-cancel"
                      onClick={() => {
                        if (detail && session)
                          setClassificationDetailForm(
                            buildClassificationFormState(detail, session.user)
                          );
                        setClassificationDetailClassifiers(classificationDetailClassifiersOriginal);
                        setClassificationDetailPickerOpen(false);
                        setClassificationDetailUserSearch('');
                        setClassificationDetailEditing(false);
                      }}
                      disabled={saving}
                      tabIndex={editing ? 0 : -1}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="cld-btn-save"
                      onClick={() => void saveClassificationDetail()}
                      disabled={saving}
                      tabIndex={editing ? 0 : -1}
                    >
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>

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

      {classificationEditReasonModalOpen ? (
        <div className="app-modal-backdrop">
          <section
            ref={classificationEditTrapRef}
            className="app-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="classification-edit-reason-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="classification-edit-reason-modal-title" className="app-modal-title">
                  Confirmar motivo da edicao
                </h3>
                <p className="app-modal-description">
                  Informe o motivo da alteracao para registrar a edicao auditada da classificacao.
                </p>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={closeClassificationEditReasonModal}
                disabled={classificationUpdating}
                aria-label="Fechar"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="app-modal-content">
              <label className="app-modal-field">
                <span className="app-modal-label">Motivo da edicao</span>
                <select
                  className="app-modal-input"
                  value={classificationEditReasonCode}
                  onChange={(event) =>
                    setClassificationEditReasonCode(event.target.value as UpdateReasonCode)
                  }
                  disabled={classificationUpdating}
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
                  Justificativa
                  {classificationEditReasonCode === 'OTHER'
                    ? ' (obrigatoria, maximo 10 palavras)'
                    : ' (opcional, maximo 10 palavras)'}
                </span>
                <input
                  className="app-modal-input"
                  value={classificationEditReasonText}
                  onChange={(event) =>
                    setClassificationEditReasonText(event.target.value.toUpperCase())
                  }
                  placeholder={
                    classificationEditReasonCode === 'OTHER' ? 'Explique a alteracao' : 'Opcional'
                  }
                  disabled={classificationUpdating}
                />
              </label>

              <NoticeSlot notice={classificationModalNotice} />

              <div className="app-modal-actions">
                <button
                  type="button"
                  className="app-modal-submit"
                  onClick={handleConfirmClassificationUpdate}
                  disabled={
                    classificationUpdating ||
                    (classificationEditReasonCode === 'OTHER' &&
                      classificationEditReasonText.trim().length === 0)
                  }
                >
                  {classificationUpdating ? 'Salvando edicao...' : 'Salvar edicao'}
                </button>
                <button
                  className="app-modal-secondary"
                  type="button"
                  onClick={closeClassificationEditReasonModal}
                  disabled={classificationUpdating}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {classificationImageModalOpen && classificationServerPhotoUrl ? (
        <PhotoZoomViewer
          src={classificationServerPhotoUrl}
          alt="Foto da classificacao"
          exportFilename={buildClassificationPhotoFilename(detail)}
          onClose={() => setClassificationImageModalOpen(false)}
        />
      ) : null}

      {exportTypeSelectorOpen ? (
        <div className="app-modal-backdrop" onClick={handleCloseExportTypeSelector}>
          <section
            ref={exportTypeTrapRef}
            className="app-modal cdm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cdm-header">
              <h3 className="cdm-header-name">Gerar laudo</h3>
              <button
                type="button"
                className="app-modal-close cdm-close"
                onClick={handleCloseExportTypeSelector}
                aria-label="Fechar"
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <p className="sdv-modal-hint">Selecione o tipo de laudo</p>
            <div className="sdv-edit-actions">
              <button
                type="button"
                className="cdm-manage-link"
                onClick={() => handleSelectExportTypeFromModal('COMPLETO')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 4.8h7l3 3V19.2H7z" />
                  <path d="M14 4.8v3h3" />
                  <path d="M9 12h6" />
                  <path d="M9 15h6" />
                </svg>
                Laudo completo
              </button>
              <button
                type="button"
                className="cdm-manage-link is-secondary"
                onClick={() => handleSelectExportTypeFromModal('COMPRADOR_PARCIAL')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 4.8h7l3 3V19.2H7z" />
                  <path d="M14 4.8v3h3" />
                  <path d="M9 12h6" />
                </svg>
                Laudo comprador parcial
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {exportConfirmationOpen && pendingExportType ? (
        <div className="app-modal-backdrop" onClick={handleCloseExportConfirmation}>
          <section
            ref={exportConfirmTrapRef}
            className="app-modal cdm-modal cdm-lookup-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cdm-header">
              <h3 className="cdm-header-name">Confirmar exportacao</h3>
              <button
                type="button"
                className="app-modal-close cdm-close"
                onClick={handleCloseExportConfirmation}
                disabled={Boolean(exportingPdfType)}
                aria-label="Fechar"
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="sdv-edit-fields">
              <div className="sdv-edit-field">
                <span className="sdv-edit-label">Destinatario</span>
                <ClientLookupField
                  session={session!}
                  label="Destinatario"
                  kind="any"
                  selectedClient={exportRecipientClient}
                  onSelectClient={setExportRecipientClient}
                  disabled={Boolean(exportingPdfType)}
                  placeholder="Busque por nome, documento ou codigo"
                  compact
                />
              </div>
            </div>
            <div className="sdv-edit-actions">
              <button
                type="button"
                className="cdm-manage-link"
                onClick={handleConfirmExportFromModal}
                disabled={Boolean(exportingPdfType)}
              >
                {exportingPdfType ? 'Exportando...' : 'Confirmar exportacao'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {physicalSendModalOpen ? (
        <div className="app-modal-backdrop">
          <section
            ref={physicalSendTrapRef}
            className="app-modal cdm-modal cdm-lookup-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cdm-header">
              <h3 className="cdm-header-name">
                {editingSendEventId ? 'Editar envio de amostra' : 'Enviar amostra fisica'}
              </h3>
              <button
                type="button"
                className="app-modal-close cdm-close"
                onClick={() => {
                  setPhysicalSendModalOpen(false);
                  setEditingSendEventId(null);
                  setPhysicalSendError(null);
                }}
                disabled={physicalSending}
                aria-label="Fechar"
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="sdv-edit-fields">
              <div className="sdv-edit-field">
                <span className="sdv-edit-label">Destinatario</span>
                <ClientLookupField
                  session={session!}
                  label="Destinatario"
                  kind="any"
                  selectedClient={physicalSendClient}
                  onSelectClient={setPhysicalSendClient}
                  disabled={physicalSending}
                  placeholder="Busque por nome, documento ou codigo"
                  compact
                />
              </div>
              <label className="sdv-edit-field">
                <span className="sdv-edit-label">Data de envio</span>
                <input
                  type="date"
                  className="sdv-edit-input"
                  value={physicalSendDate}
                  onChange={(event) => setPhysicalSendDate(event.target.value)}
                  disabled={physicalSending}
                />
              </label>
              {physicalSendError ? (
                <div className="sdv-modal-error" role="alert">
                  {physicalSendError}
                </div>
              ) : null}
            </div>
            <div className="sdv-edit-actions">
              <button
                type="button"
                className="cdm-manage-link"
                onClick={handlePhysicalSend}
                disabled={physicalSending}
              >
                {physicalSending
                  ? editingSendEventId
                    ? 'Salvando...'
                    : 'Registrando...'
                  : editingSendEventId
                    ? 'Salvar alteracoes'
                    : 'Confirmar envio'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {cancelConfirmSendEventId ? (
        <div className="app-modal-backdrop">
          <section
            className="app-modal cdm-modal cdm-lookup-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cdm-header">
              <h3 className="cdm-header-name">Cancelar envio</h3>
              <button
                type="button"
                className="app-modal-close cdm-close"
                onClick={() => {
                  setCancelConfirmSendEventId(null);
                  setCancelSendError(null);
                }}
                disabled={cancellingSend}
                aria-label="Fechar"
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="sdv-edit-fields">
              <p className="sdv-confirm-text">
                Tem certeza que deseja cancelar este envio? Essa acao nao pode ser desfeita.
              </p>
              {cancelSendError ? (
                <div className="sdv-modal-error" role="alert">
                  {cancelSendError}
                </div>
              ) : null}
            </div>
            <div className="sdv-edit-actions sdv-edit-actions-split">
              <button
                type="button"
                className="cdm-manage-link is-secondary"
                onClick={() => {
                  setCancelConfirmSendEventId(null);
                  setCancelSendError(null);
                }}
                disabled={cancellingSend}
              >
                Voltar
              </button>
              <button
                type="button"
                className="cdm-manage-link is-danger"
                onClick={handleConfirmCancelSend}
                disabled={cancellingSend}
              >
                {cancellingSend ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {/* Botao flutuante Classificar — aparece apenas quando ha classificacao
          pendente/em andamento. Para reclassificar uma amostra ja CLASSIFIED,
          o usuario abre o modal full-view e usa o botao Reclassificar la. */}
      {detail &&
      (detail.sample.status === 'QR_PENDING_PRINT' ||
        detail.sample.status === 'QR_PRINTED' ||
        detail.sample.status === 'CLASSIFICATION_IN_PROGRESS') ? (
        <button
          type="button"
          className="sdv-fab-classify"
          onClick={() => router.push(`/camera?sampleId=${sampleId}`)}
          aria-label="Classificar amostra"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <span>Classificar</span>
        </button>
      ) : null}

      {/* Modal de confirmacao de reclassificacao — empilhado sobre o modal
          full-view de classificacao. Usa o padrao oficial .app-modal. */}
      {reclassifyModalOpen ? (
        <div className="app-modal-backdrop sample-detail-reclassify-backdrop">
          <section
            className="app-modal sample-detail-reclassify-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-detail-reclassify-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="sample-detail-reclassify-modal-title" className="app-modal-title">
                  Reclassificar amostra
                </h3>
                <p className="app-modal-description">
                  A nova classificacao vai substituir a atual. A classificacao anterior permanece no
                  historico de eventos.
                </p>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={() => setReclassifyModalOpen(false)}
                aria-label="Fechar modal de reclassificacao"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="app-modal-content">
              <div className="app-modal-actions">
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
                    setReclassifyModalOpen(false);
                    closeClassificationDetail();
                    router.push(`/camera?sampleId=${sampleId}`);
                  }}
                >
                  Sim, reclassificar
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
