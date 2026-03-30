'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { AppShell } from '../../../components/AppShell';
import { ClientLookupField } from '../../../components/clients/ClientLookupField';
import { ClientQuickCreateModal } from '../../../components/clients/ClientQuickCreateModal';
import { ClientRegistrationSelect } from '../../../components/clients/ClientRegistrationSelect';
import { SampleMovementsPanel } from '../../../components/samples/SampleMovementsPanel';
import { WarehouseLookupField } from '../../../components/warehouses/WarehouseLookupField';
import {
  ApiError,
  completeClassification,
  confirmRegistration,
  exportSamplePdf,
  getClient,
  getSampleDetail,
  invalidateSample,
  requestQrReprint,
  requestQrPrint,
  saveClassificationPartial,
  startClassification,
  updateClassification,
  updateRegistration,
  uploadClassificationPhoto
} from '../../../lib/api-client';
import { compressImage } from '../../../lib/compress-image';
import { invalidateSampleSchema, registrationFormSchema, updateReasonSchema } from '../../../lib/form-schemas';
import { useFocusTrap } from '../../../lib/use-focus-trap';
import { useRequireAuth } from '../../../lib/use-auth';
import type {
  ClientRegistrationSummary,
  ClientSummary,
  CommercialStatus,
  InvalidateReasonCode,
  PrintAction,
  SampleDetailResponse,
  SampleExportType,
  UpdateReasonCode,
  SampleStatus,
  SessionUser,
  WarehouseSummary
} from '../../../lib/types';

type ClassificationFormState = {
  dataClassificacao: string;
  padrao: string;
  catacao: string;
  aspecto: string;
  bebida: string;
  broca: string;
  pva: string;
  imp: string;
  classificador: string;
  defeito: string;
  umidade: string;
  aspectoCor: string;
  observacoes: string;
  loteOrigem: string;
  peneiraP18: string;
  peneiraP17: string;
  peneiraP16: string;
  peneiraMk: string;
  peneiraP15: string;
  peneiraP14: string;
  peneiraP13: string;
  peneiraP10: string;
  peneiraFundo: string;
};

type ClassificationSievePayload = {
  p18: number | null;
  p17: number | null;
  p16: number | null;
  mk: number | null;
  p15: number | null;
  p14: number | null;
  p13: number | null;
  p10: number | null;
  fundo: number | null;
};

type ClassificationDataPayload = {
  dataClassificacao?: string | null;
  padrao: string | null;
  catacao: string | null;
  aspecto: string | null;
  bebida: string | null;
  broca: number | null;
  pva: number | null;
  imp: number | null;
  classificador: string | null;
  peneirasPercentuais: ClassificationSievePayload | null;
  defeito: number | null;
  umidade: number | null;
  aspectoCor: string | null;
  observacoes: string | null;
  loteOrigem: string | null;
};

type LabelModalStep = 'review' | 'completed';
type SampleDetailSection = 'GENERAL' | 'CLASSIFICATION' | 'COMMERCIAL';
type ClassificationStep = 'PHOTO' | 'GENERAL' | 'MEASURES';

type NumericField = {
  key: keyof ClassificationFormState;
  label: string;
};

const CLASSIFICATION_STATUSES: SampleStatus[] = ['REGISTRATION_CONFIRMED', 'QR_PENDING_PRINT', 'QR_PRINTED', 'CLASSIFICATION_IN_PROGRESS', 'CLASSIFIED'];
const REGISTRATION_EDITABLE_STATUSES: SampleStatus[] = [
  'REGISTRATION_CONFIRMED',
  'QR_PENDING_PRINT',
  'QR_PRINTED',
  'CLASSIFICATION_IN_PROGRESS',
  'CLASSIFIED'
];

const EMPTY_CLASSIFICATION_FORM: ClassificationFormState = {
  dataClassificacao: '',
  padrao: '',
  catacao: '',
  aspecto: '',
  bebida: '',
  broca: '',
  pva: '',
  imp: '',
  classificador: '',
  defeito: '',
  umidade: '',
  aspectoCor: '',
  observacoes: '',
  loteOrigem: '',
  peneiraP18: '',
  peneiraP17: '',
  peneiraP16: '',
  peneiraMk: '',
  peneiraP15: '',
  peneiraP14: '',
  peneiraP13: '',
  peneiraP10: '',
  peneiraFundo: ''
};

const SIEVE_FIELDS: NumericField[] = [
  { key: 'peneiraP18', label: 'Peneira 18 (%)' },
  { key: 'peneiraP17', label: 'Peneira 17 (%)' },
  { key: 'peneiraP16', label: 'Peneira 16 (%)' },
  { key: 'peneiraMk', label: 'Peneira MK (%)' },
  { key: 'peneiraP15', label: 'Peneira 15 (%)' },
  { key: 'peneiraP14', label: 'Peneira 14 (%)' },
  { key: 'peneiraP13', label: 'Peneira 13 (%)' },
  { key: 'peneiraP10', label: 'Peneira 10 (%)' },
  { key: 'peneiraFundo', label: 'Fundo (%)' }
];

const NUMERIC_FIELDS: NumericField[] = [
  { key: 'broca', label: 'Broca' },
  { key: 'pva', label: 'PVA' },
  { key: 'imp', label: 'IMP' },
  { key: 'defeito', label: 'Defeito' },
  { key: 'umidade', label: 'Umidade' },
  ...SIEVE_FIELDS
];

const INVALIDATE_REASON_OPTIONS: Array<{ value: InvalidateReasonCode; label: string }> = [
  { value: 'DUPLICATE', label: 'Duplicada' },
  { value: 'WRONG_SAMPLE', label: 'Amostra incorreta' },
  { value: 'DAMAGED', label: 'Danificada' },
  { value: 'CANCELLED', label: 'Cancelada' },
  { value: 'OTHER', label: 'Outro motivo' }
];

const UPDATE_REASON_OPTIONS: Array<{ value: UpdateReasonCode; label: string }> = [
  { value: 'DATA_FIX', label: 'Correcao de dados' },
  { value: 'TYPO', label: 'Erro de digitacao' },
  { value: 'MISSING_INFO', label: 'Informacao faltante' },
  { value: 'OTHER', label: 'Outro motivo' }
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

function getTodayDateInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function parseNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function validateClassificationForm(form: ClassificationFormState): string | null {
  for (const field of NUMERIC_FIELDS) {
    const raw = form[field.key].trim();
    if (!raw) {
      continue;
    }

    const parsed = Number(raw.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      return `${field.label} deve ser um numero valido.`;
    }
  }

  return null;
}

function buildClassificationDataPayload(
  form: ClassificationFormState,
  options: {
    includeAutomaticDate?: boolean;
  } = {}
): ClassificationDataPayload {
  const sieve: ClassificationSievePayload = {
    p18: parseNumberInput(form.peneiraP18),
    p17: parseNumberInput(form.peneiraP17),
    p16: parseNumberInput(form.peneiraP16),
    mk: parseNumberInput(form.peneiraMk),
    p15: parseNumberInput(form.peneiraP15),
    p14: parseNumberInput(form.peneiraP14),
    p13: parseNumberInput(form.peneiraP13),
    p10: parseNumberInput(form.peneiraP10),
    fundo: parseNumberInput(form.peneiraFundo)
  };

  const hasSieve = Object.values(sieve).some((value) => value !== null);
  const payload: ClassificationDataPayload = {
    padrao: form.padrao.trim() || null,
    catacao: form.catacao.trim() || null,
    aspecto: form.aspecto.trim() || null,
    bebida: form.bebida.trim() || null,
    broca: parseNumberInput(form.broca),
    pva: parseNumberInput(form.pva),
    imp: parseNumberInput(form.imp),
    classificador: form.classificador.trim() || null,
    peneirasPercentuais: hasSieve ? sieve : null,
    defeito: (() => { const v = parseNumberInput(form.defeito); return v !== null ? Math.round(v) : null; })(),
    umidade: parseNumberInput(form.umidade),
    aspectoCor: form.aspectoCor.trim() || null,
    observacoes: form.observacoes.trim() || null,
    loteOrigem: form.loteOrigem.trim() || null
  };

  if (options.includeAutomaticDate) {
    payload.dataClassificacao = getTodayDateInput();
  }

  return payload;
}

type ClassificationTechnicalPayload = {
  defectsCount?: number;
  moisture?: number;
  colorAspect?: string | null;
  notes?: string | null;
};

function buildTechnicalFromClassificationData(data: ClassificationDataPayload): ClassificationTechnicalPayload | undefined {
  const technical: ClassificationTechnicalPayload = {};

  if (data.defeito !== null) {
    technical.defectsCount = Math.round(data.defeito);
  }
  if (data.umidade !== null) {
    technical.moisture = data.umidade;
  }
  if (data.aspectoCor !== null) {
    technical.colorAspect = data.aspectoCor;
  }
  if (data.observacoes !== null) {
    technical.notes = data.observacoes;
  }

  return Object.keys(technical).length > 0 ? technical : undefined;
}

function buildClassificationFormState(detail: SampleDetailResponse, user: SessionUser): ClassificationFormState {
  const latestData = isRecord(detail.sample.latestClassification.data) ? detail.sample.latestClassification.data : {};
  const draftData =
    detail.sample.status === 'CLASSIFICATION_IN_PROGRESS' && isRecord(detail.sample.classificationDraft.snapshot)
      ? detail.sample.classificationDraft.snapshot
      : {};
  const mergedData = { ...latestData, ...draftData };

  const latestSieve = isRecord(latestData.peneirasPercentuais) ? latestData.peneirasPercentuais : {};
  const draftSieve = isRecord(draftData.peneirasPercentuais) ? draftData.peneirasPercentuais : {};
  const mergedSieve = { ...latestSieve, ...draftSieve };

  const fallbackClassifier = user.displayName ?? user.username;
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
    classificador: toText(mergedData.classificador) || fallbackClassifier,
    defeito: toText(mergedData.defeito),
    umidade: toText(mergedData.umidade),
    aspectoCor: toText(mergedData.aspectoCor),
    observacoes: toText(mergedData.observacoes),
    loteOrigem: toText(mergedData.loteOrigem) || toText(detail.sample.declared.originLot),
    peneiraP18: toText(mergedSieve.p18),
    peneiraP17: toText(mergedSieve.p17),
    peneiraP16: toText(mergedSieve.p16),
    peneiraMk: toText(mergedSieve.mk),
    peneiraP15: toText(mergedSieve.p15),
    peneiraP14: toText(mergedSieve.p14),
    peneiraP13: toText(mergedSieve.p13),
    peneiraP10: toText(mergedSieve.p10),
    peneiraFundo: toText(mergedSieve.fundo)
  };
}

function NoticeSlot({ notice }: { notice: Notice }) {
  return (
    <div className="notice-slot" aria-live="polite">
      {notice ? (
        <p className={`notice-slot-text is-${notice.kind}`}>{notice.text}</p>
      ) : null}
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

function isClassificationStatus(status: SampleStatus): boolean {
  return CLASSIFICATION_STATUSES.includes(status);
}

function getExportTypeLabel(exportType: SampleExportType): string {
  return exportType === 'COMPLETO' ? 'Completo' : 'Comprador Parcial';
}

const DETAIL_EVENT_PREVIEW_LIMIT = 1;
const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB — same as backend DEFAULT_MAX_UPLOAD_SIZE_BYTES

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

function mapSampleOwnerClientToSummary(client: SampleDetailResponse['sample']['ownerClient']): ClientSummary | null {
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
    registrationCount: 0,
    activeRegistrationCount: 0,
    primaryCity: null,
    primaryState: null,
    createdAt: null,
    updatedAt: null
  };
}

export default function SampleDetailPage() {
  const { session, loading, logout } = useRequireAuth();
  const params = useParams<{ sampleId: string }>();
  const searchParams = useSearchParams();
  const sampleId = typeof params.sampleId === 'string' ? params.sampleId : '';
  const focusClassification = searchParams.get('focus') === 'classification';
  const fromQrSource = searchParams.get('source') === 'qr';

  const [detail, setDetail] = useState<SampleDetailResponse | null>(null);
  const detailRef = useRef<SampleDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [pageNotice, setPageNotice] = useState<Notice>(null);
  const [generalNotice, setGeneralNotice] = useState<Notice>(null);
  const [classificationNotice, setClassificationNotice] = useState<Notice>(null);
  const [registrationModalNotice, setRegistrationModalNotice] = useState<Notice>(null);
  const [classificationModalNotice, setClassificationModalNotice] = useState<Notice>(null);
  const [invalidateModalNotice, setInvalidateModalNotice] = useState<Notice>(null);

  const [classificationPhotoPreviewOpen, setClassificationPhotoPreviewOpen] = useState(false);
  const [arrivalPhotoPreviewOpen, setArrivalPhotoPreviewOpen] = useState(false);
  const [classificationSelectedPhoto, setClassificationSelectedPhoto] = useState<File | null>(null);
  const [classificationSavedPhotoFile, setClassificationSavedPhotoFile] = useState<File | null>(null);
  const [classificationPhotoUploading, setClassificationPhotoUploading] = useState(false);
  const [_showClassificationPhotoConfirmEffect, setShowClassificationPhotoConfirmEffect] = useState(false);
  const [_classificationPhotoConfirmEffectKey, setClassificationPhotoConfirmEffectKey] = useState(0);
  const [exportingPdfType, setExportingPdfType] = useState<SampleExportType | null>(null);
  const [exportTypeSelectorOpen, setExportTypeSelectorOpen] = useState(false);
  const [exportConfirmationOpen, setExportConfirmationOpen] = useState(false);
  const [pendingExportType, setPendingExportType] = useState<SampleExportType | null>(null);
  const [exportDestination, setExportDestination] = useState('');

  const [owner, setOwner] = useState('');
  const [selectedOwnerClient, setSelectedOwnerClient] = useState<ClientSummary | null>(null);
  const [ownerRegistrations, setOwnerRegistrations] = useState<ClientRegistrationSummary[]>([]);
  const [selectedOwnerRegistrationId, setSelectedOwnerRegistrationId] = useState<string | null>(null);
  const [ownerRegistrationLoading, setOwnerRegistrationLoading] = useState(false);
  const [ownerQuickCreateOpen, setOwnerQuickCreateOpen] = useState(false);
  const [ownerQuickCreateSeed, setOwnerQuickCreateSeed] = useState('');
  const [sacks, setSacks] = useState('');
  const [harvest, setHarvest] = useState('');
  const [originLot, setOriginLot] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseSummary | null>(null);
  const [warehouseText, setWarehouseText] = useState('');
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

  const [classificationForm, setClassificationForm] = useState<ClassificationFormState>(EMPTY_CLASSIFICATION_FORM);
  const [classificationStarting, setClassificationStarting] = useState(false);
  const [classificationSaving, setClassificationSaving] = useState(false);
  const [classificationCompleting, setClassificationCompleting] = useState(false);
  const [classificationStep, setClassificationStep] = useState<ClassificationStep>('PHOTO');
  const [detailSection, setDetailSection] = useState<SampleDetailSection>('GENERAL');
  const [registrationEditMode, setRegistrationEditMode] = useState(false);
  const registrationEditModeRef = useRef(false);
  const [registrationUpdating, setRegistrationUpdating] = useState(false);
  const [registrationEditReasonCode, setRegistrationEditReasonCode] = useState<UpdateReasonCode>('OTHER');
  const [registrationEditReasonText, setRegistrationEditReasonText] = useState('');
  const [registrationEditReasonModalOpen, setRegistrationEditReasonModalOpen] = useState(false);
  const [classificationEditMode, setClassificationEditMode] = useState(false);
  const classificationEditModeRef = useRef(false);
  const [classificationEditReasonCode, setClassificationEditReasonCode] = useState<UpdateReasonCode>('OTHER');
  const [classificationEditReasonText, setClassificationEditReasonText] = useState('');
  const [classificationEditReasonModalOpen, setClassificationEditReasonModalOpen] = useState(false);
  const [classificationUpdating, setClassificationUpdating] = useState(false);
  const invalidateTrapRef = useFocusTrap(invalidateModalOpen);
  const labelTrapRef = useFocusTrap(labelModalOpen);
  const registrationEditTrapRef = useFocusTrap(registrationEditReasonModalOpen);
  const classificationEditTrapRef = useFocusTrap(classificationEditReasonModalOpen);
  const exportTypeTrapRef = useFocusTrap(exportTypeSelectorOpen);
  const exportConfirmTrapRef = useFocusTrap(exportConfirmationOpen);
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
          signal: controller.signal
        });

        if (controller.signal.aborted) {
          return undefined;
        }

        setDetail(response);
        detailRef.current = response;

        if (!registrationEditModeRef.current) {
          setOwner(response.sample.declared.owner ?? '');
          setSelectedOwnerClient(mapSampleOwnerClientToSummary(response.sample.ownerClient ?? null));
          setSelectedOwnerRegistrationId(response.sample.ownerRegistrationId ?? null);
          setSacks(response.sample.declared.sacks ? String(response.sample.declared.sacks) : '');
          setHarvest(response.sample.declared.harvest ?? '');
          setOriginLot(response.sample.declared.originLot ?? '');
          setSelectedWarehouse(response.sample.warehouse ? { id: response.sample.warehouse.id, name: response.sample.warehouse.name, address: response.sample.warehouse.address, phone: response.sample.warehouse.phone, status: response.sample.warehouse.status, createdAt: null, updatedAt: null } : null);
          setWarehouseText(response.sample.declared?.warehouse ?? '');
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

        const activeRegistrations = response.registrations.filter((registration) => registration.status === 'ACTIVE');
        setOwnerRegistrations(activeRegistrations);
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        setOwnerRegistrations([]);
        setSelectedOwnerRegistrationId(null);
        setGeneralNotice({ kind: 'error', text: cause instanceof ApiError ? cause.message : 'Falha ao carregar inscricoes do proprietario' });
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
    setExportDestination('');
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
    () => detail?.attachments.find((attachment) => attachment.kind === 'CLASSIFICATION_PHOTO') ?? null,
    [detail]
  );
  const qrValue = useMemo(
    () => detail?.sample.internalLotNumber ?? detail?.sample.id ?? '',
    [detail?.sample.internalLotNumber, detail?.sample.id]
  );
  const canQuickPrint = detail
    ? detail.sample.status === 'REGISTRATION_CONFIRMED' || canRequestReprintStatus(detail.sample.status)
    : false;
  const canQuickReport = Boolean(detail && detail.sample.status === 'CLASSIFIED' && classificationAttachment);
  const labelModalPrintAction = detail ? getLabelPrintActionForStatus(detail.sample.status) : null;
  const canCloseLabelModal = labelModalStep === 'review' || labelModalStep === 'completed';
  const classificationShowsWorkspace = Boolean(
    detail &&
      (detail.sample.status === 'CLASSIFICATION_IN_PROGRESS' || detail.sample.status === 'CLASSIFIED')
  );
  const classificationPhotoEditingAllowed =
    detail?.sample.status === 'CLASSIFICATION_IN_PROGRESS' ||
    (detail?.sample.status === 'CLASSIFIED' && classificationEditMode);
  const classificationFieldsReadOnly = detail?.sample.status === 'CLASSIFIED' && !classificationEditMode;
  const classificationServerPhotoUrl = classificationAttachment
    ? `/api/v1/samples/${sampleId}/photos/${classificationAttachment.id}`
    : null;
  const classificationVisiblePhotoPreviewUrl =
    classificationSelectedPhotoPreviewUrl ?? classificationSavedPhotoPreviewUrl ?? classificationServerPhotoUrl;
  const classificationSavedPhotoUrl = classificationSavedPhotoPreviewUrl ?? classificationServerPhotoUrl;
  const classificationCanComplete = !classificationPhotoUploading && !classificationSelectedPhoto && Boolean(classificationAttachment);
  const classificationCanAccessDataSteps = Boolean(classificationAttachment) || detail?.sample.status === 'CLASSIFIED';
  const classificationTabDotTone = detail ? getOperationalStatusDotTone(detail.sample.status) : null;

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
    if (!detail || !focusClassification) {
      return;
    }

    if (detailSection !== 'CLASSIFICATION') {
      setDetailSection('CLASSIFICATION');
    }
  }, [detail, detailSection, focusClassification]);

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

  if (loading || !session) {
    return null;
  }

  if (!sampleId) {
      return (
        <AppShell session={session} onLogout={logout}>
          <p className="error">sampleId invalido na rota.</p>
        </AppShell>
      );
  }

  async function handleUploadClassificationPhoto() {
    if (!session || !classificationSelectedPhoto || !detail) {
      setClassificationNotice({ kind: 'error', text: 'Selecione uma foto de classificacao antes de usar.' });
      return;
    }

    setClassificationPhotoUploading(true);
    setClassificationNotice(null);

    try {
      const compressed = await compressImage(classificationSelectedPhoto);
      await uploadClassificationPhoto(session, sampleId, compressed, true);
      setClassificationSavedPhotoFile(compressed);
      setClassificationSelectedPhoto(null);
      if (classificationPhotoInputRef.current) {
        classificationPhotoInputRef.current.value = '';
      }
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
      setGeneralNotice({ kind: 'error', text: 'A exportacao de laudo so e permitida para amostras classificadas.' });
      return;
    }

    setGeneralNotice(null);
    setPendingExportType(exportType);
    setExportDestination('');
    setExportConfirmationOpen(true);
  }

  function handleOpenExportTypeSelector() {
    if (!detail) {
      return;
    }

    if (detail.sample.status !== 'CLASSIFIED') {
      setGeneralNotice({ kind: 'error', text: 'A exportacao de laudo so e permitida para amostras classificadas.' });
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
    setExportDestination('');
  }

  async function handleExportPdf(exportType: SampleExportType, destination?: string | null) {
    if (!session || !detail) {
      return;
    }

    if (detail.sample.status !== 'CLASSIFIED') {
      setGeneralNotice({ kind: 'error', text: 'A exportacao de laudo so e permitida para amostras classificadas.' });
      return;
    }

    setGeneralNotice(null);
    setExportingPdfType(exportType);

    try {
      const normalizedDestination =
        typeof destination === 'string' && destination.trim().length > 0 ? destination.trim() : null;
      const exported = await exportSamplePdf(session, sampleId, {
        exportType,
        destination: normalizedDestination
      });

      const blobUrl = URL.createObjectURL(exported.blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = exported.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);

      setGeneralNotice({ kind: 'success', text: `Laudo PDF (${getExportTypeLabel(exportType)}) exportado com sucesso.` });
      setExportConfirmationOpen(false);
      setPendingExportType(null);
      setExportDestination('');
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

    await handleExportPdf(pendingExportType, exportDestination);
  }

  async function handleConfirmRegistration() {
    if (!session || !detail) {
      return;
    }

    setGeneralNotice(null);

    if (!selectedOwnerClient) {
      setGeneralNotice({ kind: 'error', text: 'Selecione um cliente proprietario antes de confirmar o registro.' });
      return;
    }

    const parsed = registrationFormSchema.safeParse({
      owner: selectedOwnerClient.displayName ?? owner,
      sacks,
      harvest,
      originLot
    });

    if (!parsed.success) {
      setGeneralNotice({ kind: 'error', text: parsed.error.issues[0]?.message ?? 'Dados de registro invalidos' });
      return;
    }

    setConfirming(true);
    try {
      await confirmRegistration(session, sampleId, {
        expectedVersion: detail.sample.version,
        ownerClientId: selectedOwnerClient.id,
        ownerRegistrationId: selectedOwnerRegistrationId,
        declared: parsed.data
      });
      setGeneralNotice({ kind: 'success', text: 'Registro confirmado com sucesso.' });
      await syncDetailState();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setGeneralNotice({ kind: 'error', text: cause.message });
      } else {
        setGeneralNotice({ kind: 'error', text: 'Falha ao confirmar registro' });
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
      setGeneralNotice({ kind: 'error', text: 'A impressao ainda nao esta disponivel para este status.' });
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
          printerId: normalizedPrinterId
        });
      } else {
        await requestQrReprint(session, sampleId, {
          printerId: normalizedPrinterId,
          reasonText: null
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
      setInvalidateModalNotice({ kind: 'error', text: 'Sua sessao atual nao permite invalidar esta amostra.' });
      return;
    }

    const parsed = invalidateSampleSchema.safeParse({
      reasonCode: invalidateReasonCode,
      reasonText: invalidateReasonText
    });

    if (!parsed.success) {
      setInvalidateModalNotice({ kind: 'error', text: parsed.error.issues[0]?.message ?? 'Dados de invalidacao invalidos' });
      return;
    }

    setInvalidating(true);
    setInvalidateModalNotice(null);

    try {
      await invalidateSample(session, sampleId, {
        expectedVersion: detail.sample.version,
        reasonCode: parsed.data.reasonCode,
        reasonText: parsed.data.reasonText
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

  async function handleStartClassification() {
    if (!session || !detail || !isClassificationStatus(detail.sample.status) || detail.sample.status === 'CLASSIFICATION_IN_PROGRESS' || detail.sample.status === 'CLASSIFIED') {
      return;
    }

    setClassificationStarting(true);
    setClassificationNotice(null);

    try {
      await startClassification(session, sampleId, {
        expectedVersion: detail.sample.version,
        classificationId: null,
        notes: null
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
    if (!session || !detail || detail.sample.status !== 'CLASSIFICATION_IN_PROGRESS') {
      return;
    }

    const validationError = validateClassificationForm(classificationForm);
    if (validationError) {
      setClassificationNotice({ kind: 'error', text: validationError });
      return;
    }

    const classificationData = buildClassificationDataPayload(classificationForm);

    setClassificationSaving(true);
    setClassificationNotice(null);

    try {
      const partialPayload: {
        expectedVersion: number;
        snapshotPartial: ClassificationDataPayload;
      } = {
        expectedVersion: detail.sample.version,
        snapshotPartial: { ...classificationData }
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
    if (!session || !detail || detail.sample.status !== 'CLASSIFICATION_IN_PROGRESS') {
      return;
    }

    if (!classificationAttachment) {
      setClassificationNotice({ kind: 'error', text: 'A foto da classificacao e obrigatoria para concluir.' });
      return;
    }

    if (classificationSelectedPhoto) {
      setClassificationNotice({ kind: 'error', text: 'Confirme a foto selecionada antes de concluir.' });
      return;
    }

    const validationError = validateClassificationForm(classificationForm);
    if (validationError) {
      setClassificationNotice({ kind: 'error', text: validationError });
      return;
    }

    const classificationData = buildClassificationDataPayload(classificationForm, {
      includeAutomaticDate: true
    });
    const technical = buildTechnicalFromClassificationData(classificationData);

    setClassificationCompleting(true);
    setClassificationNotice(null);

    try {
      await completeClassification(session, sampleId, {
        expectedVersion: detail.sample.version,
        classificationData,
        technical,
        classifierName: classificationData.classificador
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
    setSelectedWarehouse(detail.sample.warehouse ? { id: detail.sample.warehouse.id, name: detail.sample.warehouse.name, address: detail.sample.warehouse.address, phone: detail.sample.warehouse.phone, status: detail.sample.warehouse.status, createdAt: null, updatedAt: null } : null);
    setWarehouseText(detail.sample.declared?.warehouse ?? '');
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
    setSelectedWarehouse(detail.sample.warehouse ? { id: detail.sample.warehouse.id, name: detail.sample.warehouse.name, address: detail.sample.warehouse.address, phone: detail.sample.warehouse.phone, status: detail.sample.warehouse.status, createdAt: null, updatedAt: null } : null);
    setWarehouseText(detail.sample.declared?.warehouse ?? '');
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
      originLot
    });
    if (!parsedForm.success) {
      setRegistrationModalNotice({ kind: 'error', text: parsedForm.error.issues[0]?.message ?? 'Dados de registro invalidos' });
      return;
    }

    const parsedReason = updateReasonSchema.safeParse({
      reasonCode: registrationEditReasonCode,
      reasonText: registrationEditReasonText
    });
    if (!parsedReason.success) {
      setRegistrationModalNotice({ kind: 'error', text: parsedReason.error.issues[0]?.message ?? 'Justificativa invalida' });
      return;
    }

    setRegistrationUpdating(true);
    setRegistrationModalNotice(null);

    try {
      const afterPayload: { [key: string]: string | number | boolean | null | { [key: string]: string | number | boolean | null } } = {
        declared: parsedForm.data,
        ownerClientId: selectedOwnerClient.id,
        ownerRegistrationId: selectedOwnerRegistrationId
      };

      const currentWarehouseId = detail.sample.warehouseId ?? null;
      const nextWarehouseId = selectedWarehouse?.id ?? null;
      const nextWarehouseName = warehouseText.trim() || null;
      const currentWarehouseName = detail.sample.declared?.warehouse ?? null;

      if (nextWarehouseId !== currentWarehouseId || nextWarehouseName !== currentWarehouseName) {
        if (nextWarehouseId) {
          afterPayload.warehouseId = nextWarehouseId;
        } else if (nextWarehouseName) {
          afterPayload.warehouseName = nextWarehouseName;
        } else {
          afterPayload.warehouseId = null;
        }
      }

      await updateRegistration(session, sampleId, {
        expectedVersion: detail.sample.version,
        after: afterPayload,
        reasonCode: parsedReason.data.reasonCode,
        reasonText: parsedReason.data.reasonText
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

  function handleRequestClassificationUpdate() {
    if (!detail || detail.sample.status === 'INVALIDATED') {
      return;
    }

    const validationError = validateClassificationForm(classificationForm);
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

    const validationError = validateClassificationForm(classificationForm);
    if (validationError) {
      setClassificationModalNotice({ kind: 'error', text: validationError });
      return;
    }

    const parsedReason = updateReasonSchema.safeParse({
      reasonCode: classificationEditReasonCode,
      reasonText: classificationEditReasonText
    });
    if (!parsedReason.success) {
      setClassificationModalNotice({ kind: 'error', text: parsedReason.error.issues[0]?.message ?? 'Justificativa invalida' });
      return;
    }

    const classificationData = buildClassificationDataPayload(classificationForm);
    const technical = buildTechnicalFromClassificationData(classificationData);

    setClassificationUpdating(true);
    setClassificationModalNotice(null);

    try {
      await updateClassification(session, sampleId, {
        expectedVersion: detail.sample.version,
        after: {
          classificationData,
          ...(technical ? { technical } : {})
        },
        reasonCode: parsedReason.data.reasonCode,
        reasonText: parsedReason.data.reasonText
      });

      setClassificationEditReasonModalOpen(false);
      classificationEditModeRef.current = false;
      setClassificationEditMode(false);
      setClassificationEditReasonCode('OTHER');
      setClassificationEditReasonText('');
      setClassificationNotice({ kind: 'success', text: 'Edicao de classificacao salva com sucesso.' });
      await syncDetailState({ refreshHistory: true });
    } catch (cause) {
      if (cause instanceof ApiError) {
        setClassificationModalNotice({ kind: 'error', text: cause.message });
      } else {
        setClassificationModalNotice({ kind: 'error', text: 'Falha ao salvar edicao de classificacao' });
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
      [key]: value
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
      placeholder: classificationFieldsReadOnly ? '-' : undefined
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

    return (
      <label key={String(key)} className={fieldState.fieldClassName}>
        {label}
        <input
          type={options.type ?? 'text'}
          inputMode={options.inputMode}
          value={classificationForm[key]}
          onChange={(event) => updateClassificationField(key, event.target.value)}
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
          onChange={(event) => updateClassificationField(key, event.target.value)}
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
      setClassificationNotice({ kind: 'error', text: `A foto selecionada excede o limite de ${limitMb} MB. Escolha uma imagem menor.` });
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
  const userAvatarInitials = userFullName.split(' ').map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  function getSdvStatusColor(status: string) {
    switch (status) {
      case 'REGISTRATION_CONFIRMED': case 'QR_PENDING_PRINT': return { color: '#C0392B', bg: '#FEF2F2', border: '#FECACA', label: 'Em aberto' };
      case 'QR_PRINTED': return { color: '#E67E22', bg: '#FFF7ED', border: '#FDE68A', label: 'Impressa' };
      case 'CLASSIFICATION_IN_PROGRESS': return { color: '#2980B9', bg: '#EFF6FF', border: '#BFDBFE', label: 'Classificando' };
      case 'CLASSIFIED': return { color: '#27AE60', bg: '#F0FDF4', border: '#BBF7D0', label: 'Finalizada' };
      case 'INVALIDATED': return { color: '#C0392B', bg: '#FEF2F2', border: '#FECACA', label: 'Invalidada' };
      default: return { color: '#999', bg: '#f5f5f5', border: '#e0e0e0', label: '' };
    }
  }

  const sdvStatus = detail ? getSdvStatusColor(detail.sample.status) : null;

  return (
    <AppShell session={session} onLogout={logout}>
      <section className="sdv-page">
        {loadingDetail ? <div className="sdv-loading">Carregando amostra...</div> : null}

        {!loadingDetail && detail ? (
          <>
            {/* Header verde */}
            <header className="sdv-header">
              <div className="sdv-header-top">
                <Link href="/samples" className="nsv2-back" aria-label="Voltar aos registros">
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                </Link>
                <span className="sdv-header-title">Detalhes</span>
                <button type="button" className="nsv2-avatar" aria-label="Abrir menu de perfil" onClick={() => window.dispatchEvent(new CustomEvent('open-profile-sheet'))}>
                  <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
                </button>
              </div>

              <div className="sdv-identity-card">
                <div className="sdv-identity-left">
                  <div className="sdv-identity-code-row">
                    <span className="sdv-identity-code">{detail.sample.internalLotNumber ?? detail.sample.id}</span>
                    {sdvStatus ? (
                      <span className="sdv-identity-badge" style={{ color: sdvStatus.color, background: sdvStatus.bg, borderColor: sdvStatus.border }}>{sdvStatus.label}</span>
                    ) : null}
                  </div>
                  <span className="sdv-identity-owner">{buildReadableValue(detail.sample.declared.owner)}</span>
                </div>
                <div className="sdv-identity-actions">
                  {canInvalidateSample && detail.sample.status !== 'INVALIDATED' ? (
                    <button type="button" className="sdv-identity-btn is-danger" onClick={(event) => { lastInvalidateTriggerRef.current = event.currentTarget; setInvalidateModalOpen(true); setInvalidateReasonCode('OTHER'); setInvalidateReasonText(''); setInvalidateModalNotice(null); setGeneralNotice(null); }} aria-label="Invalidar">
                      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                    </button>
                  ) : null}
                </div>
              </div>
            </header>

            <NoticeSlot notice={pageNotice} />

            {/* Abas */}
            <div className="sdv-tabs" role="tablist" aria-label="Secoes da amostra">
              <button type="button" role="tab" aria-selected={detailSection === 'GENERAL'} className={`sdv-tab${detailSection === 'GENERAL' ? ' is-active' : ''}`} onClick={() => setDetailSection('GENERAL')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="14" rx="7" ry="9" /><path d="M12 6c-1.5 3-1.8 6-.5 9s1.5 6 .5 9" /></svg>
                <span>Geral</span>
              </button>
              <button type="button" role="tab" aria-selected={detailSection === 'CLASSIFICATION'} className={`sdv-tab${detailSection === 'CLASSIFICATION' ? ' is-active' : ''}`} onClick={() => setDetailSection('CLASSIFICATION')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                <span>Classificacao</span>
                {classificationTabDotTone && detail.sample.status !== 'CLASSIFIED' ? <span className="sdv-tab-dot" /> : null}
              </button>
              <button type="button" role="tab" aria-selected={detailSection === 'COMMERCIAL'} className={`sdv-tab${detailSection === 'COMMERCIAL' ? ' is-active' : ''}`} onClick={() => setDetailSection('COMMERCIAL')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                <span>Comercial</span>
              </button>
            </div>

            {/* Conteúdo com scroll */}
            <section className="sdv-content">
              <div className={`sdv-content-inner${detailSection === 'CLASSIFICATION' ? ' is-classification' : ''}`}>
                {detailSection === 'GENERAL' ? (
                  <section className="sdv-general">
                    {/* Card 1: QR Code + Actions */}
                    <div className="sdv-card">
                      <div className="sdv-qr-row">
                        <div className="sdv-qr-box">
                          <QRCodeCanvas value={qrValue} size={76} />
                        </div>
                        <div className="sdv-qr-actions">
                          <span className="sdv-qr-label">QR Code da amostra</span>
                          <button type="button" className="sdv-qr-btn is-primary" onClick={(event) => openLabelReviewModal(event.currentTarget)} disabled={!canQuickPrint || labelModalSubmitting}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V4.8h10V8" /><rect x="5" y="9" width="14" height="7" rx="1.8" /><path d="M8 14h8" /><path d="M8 16.8h8V20H8z" /></svg>
                            <span>Imprimir etiqueta</span>
                          </button>
                          <button type="button" className="sdv-qr-btn is-secondary" onClick={handleOpenExportTypeSelector} disabled={!canQuickReport || Boolean(exportingPdfType)}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.8h7l3 3V19.2H7z" /><path d="M14 4.8v3h3" /><path d="M9 12h6" /><path d="M9 15h6" /></svg>
                            <span>Gerar laudo</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Informações */}
                    <div className="sdv-card sdv-info-compact">
                      <div className="sdv-info-grid">
                        <div className="sdv-info-item">
                          <span className="sdv-info-label">Proprietario</span>
                          <span className="sdv-info-value">{buildReadableValue(detail.sample.declared.owner)}</span>
                        </div>
                        <div className="sdv-info-item">
                          <span className="sdv-info-label">Inscricao</span>
                          <span className="sdv-info-value">{buildReadableValue(detail.sample.ownerRegistration?.registrationNumber ?? null)}</span>
                        </div>
                        <div className="sdv-info-sep" />
                        <div className="sdv-info-item">
                          <span className="sdv-info-label">Sacas</span>
                          <span className="sdv-info-value">{buildReadableValue(detail.sample.declared.sacks)}</span>
                        </div>
                        <div className="sdv-info-item">
                          <span className="sdv-info-label">Safra</span>
                          <span className="sdv-info-value">{buildReadableValue(detail.sample.declared.harvest)}</span>
                        </div>
                        <div className="sdv-info-sep" />
                        <div className="sdv-info-item">
                          <span className="sdv-info-label">Lote de origem</span>
                          <span className="sdv-info-value">{buildReadableValue(detail.sample.declared.originLot)}</span>
                        </div>
                        <div className="sdv-info-item">
                          <span className="sdv-info-label">Armazem</span>
                          <span className="sdv-info-value">{buildReadableValue(detail.sample.declared?.warehouse)}</span>
                        </div>
                        <div className="sdv-info-item">
                          <span className="sdv-info-label">Recebido em</span>
                          <span className="sdv-info-value">{formatTimestamp(detail.sample.createdAt)}</span>
                        </div>
                      </div>
                      {canEditRegistrationStatus(detail.sample.status) ? (
                        <button type="button" className="sdv-edit-btn sdv-edit-btn-inline" onClick={startRegistrationEdit}>
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></svg>
                          <span>Editar informacoes</span>
                        </button>
                      ) : null}
                      <NoticeSlot notice={generalNotice} />
                    </div>

                    {/* Card 3: Foto */}
                    <div className="sdv-card">
                      <span className="sdv-card-title">Foto da amostra</span>
                      {(() => {
                        const arrivalAttachment = detail.attachments.find((a) => a.kind === 'ARRIVAL_PHOTO');
                        if (arrivalAttachment) {
                          return (
                            <button type="button" className="sdv-photo-wrap" onClick={() => setArrivalPhotoPreviewOpen(true)}>
                              <img src={`/api/v1/samples/${detail.sample.id}/photos/${arrivalAttachment.id}`} alt="Foto da amostra" className="sdv-photo-img" />
                              <span className="sdv-photo-hint">Toque para ampliar</span>
                            </button>
                          );
                        }
                        return (
                          <div className="sdv-photo-empty">
                            <span>Sem foto</span>
                          </div>
                        );
                      })()}
                    </div>

                    {detail.sample.status === 'INVALIDATED' ? (
                      <div className="sdv-card" style={{ borderLeft: '3px solid #C0392B' }}>
                        <span className="sdv-card-title" style={{ color: '#C0392B' }}>Amostra invalidada</span>
                        <p style={{ margin: 0, fontSize: 'clamp(12px, 3.2vw, 13px)', color: '#999' }}>
                          Esta amostra foi retirada do fluxo operacional e permanece apenas para consulta.
                        </p>
                      </div>
                    ) : null}
                  </section>
                ) : detailSection === 'CLASSIFICATION' ? (
                  isClassificationStatus(detail.sample.status) ? (
                    <section className="sdv-classification" id="classification-section" ref={classificationSectionRef}>
                      {/* Pending start */}
                      {detail.sample.status === 'REGISTRATION_CONFIRMED' || detail.sample.status === 'QR_PENDING_PRINT' || detail.sample.status === 'QR_PRINTED' ? (
                        <div className="sdv-cls-pending">
                          <div className="sdv-cls-pending-icon">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                          </div>
                          <p className="sdv-cls-pending-title">Classificacao pendente</p>
                          <p className="sdv-cls-pending-sub">Esta amostra ainda nao foi classificada</p>
                          <button type="button" className="cdm-manage-link" onClick={handleStartClassification} disabled={classificationStarting} style={{ padding: 'clamp(10px, 2.8vw, 12px) clamp(24px, 7vw, 28px)' }}>
                            {classificationStarting ? 'Iniciando...' : 'Iniciar classificacao'}
                          </button>
                        </div>
                      ) : null}

                      {/* Workspace */}
                      {classificationShowsWorkspace ? (
                        <>
                          {/* Hidden file input */}
                          <input
                            id="sample-classification-photo-input"
                            ref={classificationPhotoInputRef}
                            style={{ display: 'none' }}
                            accept="image/*"
                            capture="environment"
                            type="file"
                            disabled={!classificationPhotoEditingAllowed || classificationPhotoUploading}
                            onChange={(event) => handleClassificationPhotoSelected(event.target.files?.[0] ?? null)}
                          />

                          {/* Card 1: Photo */}
                          <div className="sdv-card">
                            <span className="sdv-card-title">Foto da classificacao</span>
                            {classificationVisiblePhotoPreviewUrl ? (
                              <div className="sdv-photo-wrap" style={{ position: 'relative' }}>
                                <img src={classificationVisiblePhotoPreviewUrl} alt="Foto da classificacao" className="sdv-photo-img" style={{ height: 'clamp(110px, 30vw, 130px)' }} onClick={() => { if (classificationSavedPhotoUrl && !classificationSelectedPhoto) setClassificationPhotoPreviewOpen(true); }} />
                                {classificationPhotoEditingAllowed && !classificationSelectedPhoto ? (
                                  <button type="button" className="sdv-photo-change-btn" onClick={() => classificationPhotoInputRef.current?.click()} disabled={classificationPhotoUploading}>
                                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3l1.1-2h5.8l1.1 2h3A1.8 1.8 0 0 1 20 10.3v7.4a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 17.7v-7.4A1.8 1.8 0 0 1 5.8 8.5Z" /><circle cx="12" cy="13.3" r="3.1" /></svg>
                                    <span>Trocar</span>
                                  </button>
                                ) : null}
                                {classificationSelectedPhoto ? (
                                  <div className="sdv-photo-confirm-bar">
                                    <button type="button" className="sdv-photo-confirm-btn is-cancel" onClick={() => clearClassificationSelectedPhoto()}>
                                      Descartar
                                    </button>
                                    <button type="button" className="sdv-photo-confirm-btn is-save" onClick={() => void handleUploadClassificationPhoto()} disabled={classificationPhotoUploading}>
                                      {classificationPhotoUploading ? 'Enviando...' : 'Confirmar foto'}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <button type="button" className="sdv-cls-photo-empty" onClick={() => classificationPhotoInputRef.current?.click()} disabled={!classificationPhotoEditingAllowed}>
                                <div className="sdv-cls-photo-empty-icon">
                                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3l1.1-2h5.8l1.1 2h3A1.8 1.8 0 0 1 20 10.3v7.4a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 17.7v-7.4A1.8 1.8 0 0 1 5.8 8.5Z" /><circle cx="12" cy="13.3" r="3.1" /></svg>
                                </div>
                                <span className="sdv-cls-photo-empty-title">Adicionar foto</span>
                                <span className="sdv-cls-photo-empty-sub">Obrigatorio para classificar</span>
                              </button>
                            )}
                          </div>

                          {/* Card 2: Dados */}
                          <div className="sdv-card">
                            <div className="sdv-card-header">
                              <span className="sdv-card-title">Dados da classificacao</span>
                              {detail.sample.status === 'CLASSIFIED' ? (
                                <button type="button" className="sdv-edit-btn" onClick={() => classificationEditMode ? cancelClassificationEdit() : startClassificationEdit()}>
                                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></svg>
                                  <span style={classificationEditMode ? { color: '#C0392B' } : undefined}>{classificationEditMode ? 'Cancelar' : 'Editar'}</span>
                                </button>
                              ) : null}
                            </div>
                            <div className="sdv-cls-fields">
                              {renderClassificationInputField('padrao', 'Padrao')}
                              {renderClassificationInputField('catacao', 'Catacao')}
                              {renderClassificationInputField('aspecto', 'Aspecto')}
                              {renderClassificationInputField('bebida', 'Bebida')}
                              {renderClassificationInputField('classificador', 'Classificador')}
                              {renderClassificationInputField('loteOrigem', 'Lote de origem')}
                              <div className="sdv-cls-field-full">
                                {renderClassificationInputField('aspectoCor', 'Aspecto da cor')}
                              </div>
                            </div>
                          </div>

                          {/* Card 3: Leituras */}
                          <div className="sdv-card">
                            <div className="sdv-card-header">
                              <span className="sdv-card-title">Leituras e analises</span>
                              {detail.sample.status === 'CLASSIFIED' ? (
                                <button type="button" className="sdv-edit-btn" onClick={() => classificationEditMode ? cancelClassificationEdit() : startClassificationEdit()}>
                                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></svg>
                                  <span style={classificationEditMode ? { color: '#C0392B' } : undefined}>{classificationEditMode ? 'Cancelar' : 'Editar'}</span>
                                </button>
                              ) : null}
                            </div>
                            <div className="sdv-cls-fields sdv-cls-fields-3col">
                              {renderClassificationInputField('broca', 'Broca', { inputMode: 'decimal' })}
                              {renderClassificationInputField('pva', 'PVA', { inputMode: 'decimal' })}
                              {renderClassificationInputField('imp', 'IMP', { inputMode: 'decimal' })}
                            </div>
                            <div className="sdv-cls-fields">
                              {renderClassificationInputField('defeito', 'Defeito', { inputMode: 'decimal' })}
                              {renderClassificationInputField('umidade', 'Umidade', { inputMode: 'decimal' })}
                            </div>
                            <div className="sdv-cls-sieve-label">Peneiras (%)</div>
                            <div className="sdv-cls-fields sdv-cls-fields-3col">
                              {SIEVE_FIELDS.map((field) => renderClassificationInputField(field.key, field.label, { inputMode: 'decimal' }))}
                            </div>
                          </div>

                          {/* Action buttons */}
                          {detail.sample.status !== 'CLASSIFIED' ? (
                            <div className="sdv-cls-actions">
                              <button type="button" className="sdv-cls-action-save" onClick={() => void handleSaveClassificationPartial()} disabled={classificationSaving || classificationCompleting}>
                                {classificationSaving ? 'Salvando...' : 'Salvar'}
                              </button>
                              <button type="button" className="sdv-cls-action-complete" onClick={() => void handleCompleteClassification()} disabled={classificationCompleting || classificationSaving || !classificationCanComplete}>
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.3 4.2L19 7" /></svg>
                                {classificationCompleting ? 'Concluindo...' : 'Concluir'}
                              </button>
                            </div>
                          ) : classificationEditMode ? (
                            <div className="sdv-cls-actions">
                              <button type="button" className="sdv-cls-action-complete" onClick={handleRequestClassificationUpdate} disabled={classificationUpdating}>
                                {classificationUpdating ? 'Salvando...' : 'Salvar edicao'}
                              </button>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                      <NoticeSlot notice={classificationNotice} />
                    </section>
                  ) : (
                    <section className="sdv-classification" id="classification-section" ref={classificationSectionRef}>
                      <p style={{ margin: 0, color: '#999', textAlign: 'center', padding: '40px 0' }}>Classificacao indisponivel no status atual.</p>
                    </section>
                  )
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
        <div
          className="app-modal-backdrop"
          onClick={() => {
            if (!invalidating) {
              setInvalidateModalOpen(false);
            }
          }}
        >
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
                <p className="app-modal-description">Retire a amostra do fluxo apenas quando a operacao realmente exigir.</p>
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
                void handleInvalidateSample();
              }}
            >
              <label className="app-modal-field">
                <span className="app-modal-label">Motivo da invalidacao</span>
                <select className="app-modal-input" value={invalidateReasonCode} onChange={(event) => setInvalidateReasonCode(event.target.value as InvalidateReasonCode)}>
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
                  onChange={(event) => setInvalidateReasonText(event.target.value)}
                  placeholder="Descreva o motivo da invalidacao"
                  disabled={invalidating}
                />
              </label>

              <NoticeSlot notice={invalidateModalNotice} />

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
                <button type="submit" className="danger sample-detail-invalidate-submit" disabled={invalidating}>
                  {invalidating ? 'Invalidando...' : 'Invalidar'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {detail ? (
        <section className="sample-detail-print-root" aria-hidden="true">
          <article id="sample-detail-label-print" className="label-print-card sample-detail-label-print-card">
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
              <p>
                <strong>Armazem:</strong> {buildReadableValue(detail.sample.declared?.warehouse)}
              </p>
            </div>
          </article>
        </section>
      ) : null}

      {detail && labelModalOpen ? (
        <div
          className="new-sample-label-modal-backdrop"
          onClick={() => {
            if (canCloseLabelModal) {
              closeLabelModal();
            }
          }}
        >
          <section
            ref={labelTrapRef}
            className="new-sample-label-modal"
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
              <p>
                <strong>Armazem:</strong> {buildReadableValue(detail.sample.declared?.warehouse)}
                  </p>
                </div>
              </article>
            </div>

            {labelModalError ? <p className="error new-sample-label-modal-feedback">{labelModalError}</p> : null}
            {labelModalMessage ? <p className="success new-sample-label-modal-feedback">{labelModalMessage}</p> : null}

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
                  <button type="button" className="new-sample-label-action-edit" disabled={labelModalSubmitting} onClick={closeLabelModal}>
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
          setGeneralNotice({ kind: 'success', text: 'Cliente proprietario criado e selecionado com sucesso.' });
        }}
      />

      {registrationEditMode ? (
        <div className="app-modal-backdrop" onClick={() => cancelRegistrationEdit()}>
          <section
            ref={registrationEditTrapRef}
            className="cdm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="registration-edit-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cdm-header" style={{ gap: '10px' }}>
              <h3 id="registration-edit-modal-title" className="cdm-header-name" style={{ flex: 1 }}>Editar informacoes</h3>
              <button type="button" className="cdm-close" onClick={cancelRegistrationEdit} disabled={registrationUpdating} aria-label="Fechar">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
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
                  disabled={!selectedOwnerClient || ownerRegistrationLoading || registrationUpdating}
                  onChange={setSelectedOwnerRegistrationId}
                  placeholder="Selecionar"
                  compact
                />
              </div>
              <div className="sdv-edit-row">
                <label className="sdv-edit-field">
                  <span className="sdv-edit-label">Sacas</span>
                  <input className="sdv-edit-input" value={sacks} onChange={(event) => setSacks(event.target.value)} inputMode="numeric" disabled={registrationUpdating} />
                </label>
                <label className="sdv-edit-field">
                  <span className="sdv-edit-label">Safra</span>
                  <input className="sdv-edit-input" value={harvest} onChange={(event) => setHarvest(event.target.value)} disabled={registrationUpdating} />
                </label>
              </div>
              <label className="sdv-edit-field">
                <span className="sdv-edit-label">Lote de origem</span>
                <input className="sdv-edit-input" value={originLot} onChange={(event) => setOriginLot(event.target.value)} disabled={registrationUpdating} />
              </label>
              <div className="sdv-edit-field">
                <WarehouseLookupField
                  session={session}
                  label="Armazem"
                  selectedWarehouse={selectedWarehouse}
                  onSelectWarehouse={(w) => {
                    setSelectedWarehouse(w);
                    setWarehouseText(w?.name ?? '');
                  }}
                  onTextChange={setWarehouseText}
                  disabled={registrationUpdating}
                  compact
                  placeholder="Busque ou digite o armazem"
                />
              </div>

              <div className="sdv-edit-sep" />

              <label className="sdv-edit-field">
                <span className="sdv-edit-label">Motivo da edicao</span>
                <select className="sdv-edit-input" value={registrationEditReasonCode} onChange={(event) => setRegistrationEditReasonCode(event.target.value as UpdateReasonCode)} disabled={registrationUpdating}>
                  {UPDATE_REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="sdv-edit-field">
                <span className="sdv-edit-label">Justificativa{registrationEditReasonCode === 'OTHER' ? ' (obrigatoria)' : ''}</span>
                <input className="sdv-edit-input" value={registrationEditReasonText} onChange={(event) => setRegistrationEditReasonText(event.target.value)} placeholder={registrationEditReasonCode === 'OTHER' ? 'Explique a alteracao' : 'Opcional'} disabled={registrationUpdating} />
              </label>
            </div>

            <NoticeSlot notice={registrationModalNotice} />
            <NoticeSlot notice={generalNotice} />

            <div className="sdv-edit-actions">
              <button type="button" className="cdm-manage-link" onClick={() => void handleConfirmRegistrationUpdate()} disabled={registrationUpdating || (registrationEditReasonCode === 'OTHER' && registrationEditReasonText.trim().length === 0)} style={{ opacity: registrationUpdating ? 0.65 : 1 }}>
                {registrationUpdating ? 'Salvando...' : 'Salvar edicao'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {classificationEditReasonModalOpen ? (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            closeClassificationEditReasonModal();
          }}
        >
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
                  onChange={(event) => setClassificationEditReasonCode(event.target.value as UpdateReasonCode)}
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
                  Justificativa{classificationEditReasonCode === 'OTHER' ? ' (obrigatoria, maximo 10 palavras)' : ' (opcional, maximo 10 palavras)'}
                </span>
                <input
                  className="app-modal-input"
                  value={classificationEditReasonText}
                  onChange={(event) => setClassificationEditReasonText(event.target.value)}
                  placeholder={classificationEditReasonCode === 'OTHER' ? 'Explique a alteracao' : 'Opcional'}
                  disabled={classificationUpdating}
                />
              </label>

              <NoticeSlot notice={classificationModalNotice} />

              <div className="app-modal-actions">
                <button
                  type="button"
                  className="app-modal-submit"
                  onClick={handleConfirmClassificationUpdate}
                  disabled={classificationUpdating || (classificationEditReasonCode === 'OTHER' && classificationEditReasonText.trim().length === 0)}
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

      {classificationPhotoPreviewOpen && classificationSavedPhotoUrl ? (
        <div className="app-modal-backdrop" style={{ background: 'rgba(0,0,0,0.92)' }} onClick={() => setClassificationPhotoPreviewOpen(false)}>
          <img src={classificationSavedPhotoUrl} alt="Foto da classificacao" style={{ maxWidth: '92vw', maxHeight: '85dvh', objectFit: 'contain', borderRadius: '12px' }} onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null}

      {arrivalPhotoPreviewOpen && detail ? (() => {
        const arrivalAtt = detail.attachments.find((a) => a.kind === 'ARRIVAL_PHOTO');
        if (!arrivalAtt) return null;
        return (
          <div className="app-modal-backdrop" style={{ background: 'rgba(0,0,0,0.92)' }} onClick={() => setArrivalPhotoPreviewOpen(false)}>
            <img src={`/api/v1/samples/${detail.sample.id}/photos/${arrivalAtt.id}`} alt="Foto da amostra" style={{ maxWidth: '92vw', maxHeight: '85dvh', objectFit: 'contain', borderRadius: '12px' }} onClick={(e) => e.stopPropagation()} />
          </div>
        );
      })() : null}

      {exportTypeSelectorOpen ? (
        <div className="app-modal-backdrop" onClick={handleCloseExportTypeSelector}>
          <section ref={exportTypeTrapRef} className="cdm-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="cdm-header" style={{ gap: '10px' }}>
              <h3 className="cdm-header-name" style={{ flex: 1 }}>Gerar laudo</h3>
              <button type="button" className="cdm-close" onClick={handleCloseExportTypeSelector} aria-label="Fechar">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 'clamp(12px, 3.2vw, 13px)', color: '#999' }}>Selecione o tipo de laudo</p>
            <div className="sdv-edit-actions">
              <button type="button" className="cdm-manage-link" onClick={() => handleSelectExportTypeFromModal('COMPLETO')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.8h7l3 3V19.2H7z" /><path d="M14 4.8v3h3" /><path d="M9 12h6" /><path d="M9 15h6" /></svg>
                Laudo completo
              </button>
              <button type="button" className="cdm-manage-link" style={{ background: 'linear-gradient(135deg, #0D47A1, #1565C0)' }} onClick={() => handleSelectExportTypeFromModal('COMPRADOR_PARCIAL')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.8h7l3 3V19.2H7z" /><path d="M14 4.8v3h3" /><path d="M9 12h6" /></svg>
                Laudo comprador parcial
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {exportConfirmationOpen && pendingExportType ? (
        <div className="app-modal-backdrop" onClick={handleCloseExportConfirmation}>
          <section ref={exportConfirmTrapRef} className="cdm-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="cdm-header" style={{ gap: '10px' }}>
              <h3 className="cdm-header-name" style={{ flex: 1 }}>Confirmar exportacao</h3>
              <button type="button" className="cdm-close" onClick={handleCloseExportConfirmation} disabled={Boolean(exportingPdfType)} aria-label="Fechar">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>
            <div className="sdv-edit-fields">
              <label className="sdv-edit-field">
                <span className="sdv-edit-label">Destinatario (opcional)</span>
                <input className="sdv-edit-input" value={exportDestination} onChange={(event) => setExportDestination(event.target.value)} placeholder="Ex.: Comprador XPTO / email / setor" disabled={Boolean(exportingPdfType)} />
              </label>
            </div>
            <div className="sdv-edit-actions">
              <button type="button" className="cdm-manage-link" onClick={handleConfirmExportFromModal} disabled={Boolean(exportingPdfType)} style={{ opacity: exportingPdfType ? 0.65 : 1 }}>
                {exportingPdfType ? 'Exportando...' : 'Confirmar exportacao'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
