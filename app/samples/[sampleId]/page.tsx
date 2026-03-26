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
  SessionUser
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

const CLASSIFICATION_STATUSES: SampleStatus[] = ['QR_PRINTED', 'CLASSIFICATION_IN_PROGRESS', 'CLASSIFIED'];
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
    defeito: parseNumberInput(form.defeito),
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
    technical.defectsCount = data.defeito;
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

function isPrintPendingStatus(status: SampleStatus): boolean {
  return status === 'REGISTRATION_CONFIRMED' || status === 'QR_PENDING_PRINT';
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
  const [classificationSelectedPhoto, setClassificationSelectedPhoto] = useState<File | null>(null);
  const [classificationSavedPhotoFile, setClassificationSavedPhotoFile] = useState<File | null>(null);
  const [classificationPhotoUploading, setClassificationPhotoUploading] = useState(false);
  const [showClassificationPhotoConfirmEffect, setShowClassificationPhotoConfirmEffect] = useState(false);
  const [classificationPhotoConfirmEffectKey, setClassificationPhotoConfirmEffectKey] = useState(0);
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
  const classificationPhotoStatusLabel = classificationPhotoUploading
    ? 'Salvando foto...'
    : '';
  const classificationCanComplete = !classificationPhotoUploading && !classificationSelectedPhoto && Boolean(classificationAttachment);
  const classificationCanAccessDataSteps = Boolean(classificationAttachment) || detail?.sample.status === 'CLASSIFIED';
  const classificationEditHighlightActive = classificationEditMode;
  const classificationStepNumber = classificationStep === 'PHOTO' ? 1 : classificationStep === 'GENERAL' ? 2 : 3;
  const classificationStepTitle =
    classificationStep === 'PHOTO' ? 'Foto da classificacao' : classificationStep === 'GENERAL' ? 'Dados gerais' : 'Leituras e peneiras';
  const classificationStepBusy =
    classificationPhotoUploading || classificationSaving || classificationCompleting || classificationUpdating;
  const classificationCanGoPrev = !classificationEditMode && classificationStep !== 'PHOTO' && !classificationStepBusy;
  const classificationCanGoNext =
    !classificationEditMode &&
    !classificationStepBusy &&
    (classificationStep === 'PHOTO'
      ? classificationCanAccessDataSteps && !classificationSelectedPhoto
      : classificationStep === 'GENERAL');
  const classificationTabDotTone = detail ? getOperationalStatusDotTone(detail.sample.status) : null;
  const classificationTabDotLabel = detail ? getOperationalStatusDotLabel(detail.sample.status) : null;
  const commercialTabDotTone = detail ? getCommercialStatusDotTone(detail.sample.commercialStatus) : null;
  const commercialTabDotLabel = detail ? getCommercialStatusDotLabel(detail.sample.commercialStatus) : null;

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
    if (!session || !detail || detail.sample.status !== 'QR_PRINTED') {
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
      setClassificationStep('MEASURES');
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

  function handleAdvanceFromClassificationPhoto() {
    if (classificationSelectedPhoto) {
      void handleUploadClassificationPhoto();
      return;
    }

    if (classificationCanAccessDataSteps) {
      setClassificationStep('GENERAL');
      return;
    }

    setClassificationNotice({ kind: 'error', text: 'Selecione e salve uma foto da classificacao antes de continuar.' });
  }

  function handleAdvanceFromClassificationGeneral() {
    setClassificationNotice(null);
    setClassificationStep('MEASURES');
  }

  function handleGoBackClassificationStep() {
    if (classificationStep === 'GENERAL') {
      setClassificationStep('PHOTO');
      return;
    }

    if (classificationStep === 'MEASURES') {
      setClassificationStep('GENERAL');
    }
  }

  function handleGoForwardClassificationStep() {
    if (classificationStep === 'PHOTO') {
      handleAdvanceFromClassificationPhoto();
      return;
    }

    if (classificationStep === 'GENERAL') {
      handleAdvanceFromClassificationGeneral();
    }
  }

  async function handleCompleteClassification() {
    if (!session || !detail || detail.sample.status !== 'CLASSIFICATION_IN_PROGRESS') {
      return;
    }

    if (!classificationAttachment) {
      setClassificationStep('PHOTO');
      setClassificationNotice({ kind: 'error', text: 'A foto da classificacao e obrigatoria para concluir.' });
      return;
    }

    if (classificationSelectedPhoto) {
      setClassificationStep('PHOTO');
      setClassificationNotice({ kind: 'error', text: 'Use a nova foto selecionada ou clique em "Tentar novamente" antes de concluir.' });
      return;
    }

    const validationError = validateClassificationForm(classificationForm);
    if (validationError) {
      setClassificationStep('MEASURES');
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
    registrationEditModeRef.current = false;
    setRegistrationEditMode(false);
    setRegistrationEditReasonCode('OTHER');
    setRegistrationEditReasonText('');
    setRegistrationEditReasonModalOpen(false);
  }

  function handleRequestRegistrationUpdate() {
    if (!session || !detail) {
      return;
    }

    if (!canEditRegistrationStatus(detail.sample.status)) {
      setGeneralNotice({ kind: 'error', text: 'Status atual nao permite edicao de registro.' });
      return;
    }

    if (!selectedOwnerClient) {
      setGeneralNotice({ kind: 'error', text: 'Selecione um cliente proprietario antes de salvar a edicao.' });
      return;
    }

    const parsedForm = registrationFormSchema.safeParse({
      owner: selectedOwnerClient.displayName ?? owner,
      sacks,
      harvest,
      originLot
    });
    if (!parsedForm.success) {
      setGeneralNotice({ kind: 'error', text: parsedForm.error.issues[0]?.message ?? 'Dados de registro invalidos' });
      return;
    }

    setRegistrationEditReasonModalOpen(true);
    setGeneralNotice(null);
  }

  function closeRegistrationEditReasonModal() {
    if (registrationUpdating) {
      return;
    }

    setRegistrationEditReasonModalOpen(false);
    setRegistrationModalNotice(null);
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
      await updateRegistration(session, sampleId, {
        expectedVersion: detail.sample.version,
        after: {
          declared: parsedForm.data,
          ownerClientId: selectedOwnerClient.id,
          ownerRegistrationId: selectedOwnerRegistrationId
        },
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

  return (
    <AppShell session={session} onLogout={logout}>
      <section className="sample-detail-page">
        {loadingDetail ? <p>Carregando amostra...</p> : null}

        {!loadingDetail && detail ? (
          <div className="stack sample-detail-page-shell">
            <div className="sample-detail-top-bar">
              <Link href="/samples" className="sample-detail-back-button" aria-label="Voltar aos registros" title="Voltar aos registros">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </Link>

              <section className="sample-detail-hero-panel">
                <div className="sample-detail-hero-main">
                  <span
                    className={`sample-detail-hero-status-line is-${getOperationalStatusDotTone(detail.sample.status)}`}
                    aria-hidden="true"
                  />
                  <div className="sample-detail-hero-text">
                    <h2 style={{ margin: 0 }}>{detail.sample.internalLotNumber ?? detail.sample.id}</h2>
                    <p style={{ margin: 0 }}>{buildReadableValue(detail.sample.declared.owner)}</p>
                  </div>
                </div>

                {canInvalidateSample && detail.sample.status !== 'INVALIDATED' ? (
                  <button
                    type="button"
                    className="sample-detail-hero-action is-danger"
                    onClick={(event) => {
                      lastInvalidateTriggerRef.current = event.currentTarget;
                      setInvalidateModalOpen(true);
                      setInvalidateReasonCode('OTHER');
                      setInvalidateReasonText('');
                      setInvalidateModalNotice(null);
                      setGeneralNotice(null);
                    }}
                    aria-label="Invalidar amostra"
                    title="Invalidar amostra"
                  >
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <circle cx="12" cy="12" r="8" />
                      <path d="m8.6 15.4 6.8-6.8" />
                    </svg>
                  </button>
                ) : null}
              </section>
            </div>

            <NoticeSlot notice={pageNotice} />

            <div className="sample-detail-info-switch-header sample-detail-info-switch-floating" role="tablist" aria-label="Secoes da amostra">
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailSection === 'GENERAL'}
                  className={detailSection === 'GENERAL' ? 'sample-detail-info-tab is-active' : 'sample-detail-info-tab'}
                  onClick={() => setDetailSection('GENERAL')}
                >
                  <span className="sample-detail-info-tab-label">Geral</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailSection === 'CLASSIFICATION'}
                  className={detailSection === 'CLASSIFICATION' ? 'sample-detail-info-tab is-active' : 'sample-detail-info-tab'}
                  onClick={() => setDetailSection('CLASSIFICATION')}
                  aria-label={classificationTabDotLabel ? `Classificacao - ${classificationTabDotLabel}` : 'Classificacao'}
                >
                  <span className="sample-detail-info-tab-label">Classificacao</span>
                  {classificationTabDotTone ? (
                    <span
                      className={`sample-detail-info-tab-dot is-${classificationTabDotTone}`}
                      aria-hidden="true"
                      title={classificationTabDotLabel ?? undefined}
                    />
                  ) : null}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailSection === 'COMMERCIAL'}
                  className={detailSection === 'COMMERCIAL' ? 'sample-detail-info-tab is-active' : 'sample-detail-info-tab'}
                  onClick={() => setDetailSection('COMMERCIAL')}
                  aria-label={commercialTabDotLabel ? `Comercial - ${commercialTabDotLabel}` : 'Comercial'}
                >
                  <span className="sample-detail-info-tab-label">Comercial</span>
                  {commercialTabDotTone ? (
                    <span
                      className={`sample-detail-info-tab-dot is-commercial-${commercialTabDotTone}`}
                      aria-hidden="true"
                      title={commercialTabDotLabel ?? undefined}
                    />
                  ) : null}
                </button>
            </div>

            <section className="panel stack sample-detail-content-switch sample-detail-content-panel">
              <div className={`sample-detail-info-switch-body${detailSection === 'CLASSIFICATION' ? ' is-classification' : ''}`}>
                {detailSection === 'GENERAL' ? (
                  <section className="stack sample-detail-info-pane sample-detail-general-pane">
                    <section className="panel sample-detail-main-layout sample-detail-main-layout-general">
                      <article className={`stack sample-detail-main-info sample-detail-main-info-grid${registrationEditMode ? ' is-editing' : ''}`}>
                        <div className="sample-detail-general-stage">
                          <div className="sample-detail-general-card-top">
                            <div className="sample-detail-edit-tools sample-detail-edit-tools-general">
                              {registrationEditMode ? (
                                <div className="sample-detail-edit-trigger-slot">
                                  <button
                                    type="button"
                                    className="sample-detail-icon-action"
                                    onClick={handleRequestRegistrationUpdate}
                                    disabled={registrationUpdating}
                                    aria-label="Confirmar edicao do registro"
                                    title="Confirmar edicao do registro"
                                  >
                                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                      <path d="m5 12 4.5 4.5L19 7" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="secondary sample-detail-icon-action"
                                    onClick={cancelRegistrationEdit}
                                    disabled={registrationUpdating}
                                    aria-label="Cancelar edicao do registro"
                                    title="Cancelar edicao do registro"
                                  >
                                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                      <path d="m6 6 12 12" />
                                      <path d="M18 6 6 18" />
                                    </svg>
                                  </button>
                                </div>
                              ) : (
                                <div className="sample-detail-edit-trigger-slot">
                                  <button
                                    type="button"
                                    className="secondary sample-detail-icon-action"
                                    onClick={startRegistrationEdit}
                                    disabled={!canEditRegistrationStatus(detail.sample.status)}
                                    aria-label="Editar informacoes principais"
                                    title={canEditRegistrationStatus(detail.sample.status) ? 'Editar informacoes principais' : 'Edicao indisponivel neste status'}
                                  >
                                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                      <path d="M12 20h9" />
                                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="sample-detail-general-qr-block">
                              <div className="sample-detail-qr-quick-code">
                                <QRCodeCanvas value={qrValue} size={156} />
                              </div>

                              <div className="row sample-detail-qr-quick-actions">
                                <button
                                  type="button"
                                  className="sample-detail-qr-action"
                                  onClick={(event) => openLabelReviewModal(event.currentTarget)}
                                  disabled={!canQuickPrint || labelModalSubmitting}
                                  aria-label="Imprimir etiqueta da amostra"
                                  title="Imprimir etiqueta da amostra"
                                >
                                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                    <path d="M7 8V4.8h10V8" />
                                    <rect x="5" y="9" width="14" height="7" rx="1.8" />
                                    <path d="M8 14h8" />
                                    <path d="M8 16.8h8V20H8z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  className="sample-detail-qr-action secondary"
                                  onClick={handleOpenExportTypeSelector}
                                  disabled={!canQuickReport || Boolean(exportingPdfType)}
                                  aria-label="Gerar laudo da amostra"
                                  title="Gerar laudo da amostra"
                                >
                                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                    <path d="M7 4.8h7l3 3V19.2H7z" />
                                    <path d="M14 4.8v3h3" />
                                    <path d="M9 12h6" />
                                    <path d="M9 15h6" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="sample-detail-main-facts sample-detail-main-facts-columns sample-detail-main-facts-general">
                            <div className="sample-detail-main-fact">
                              <span>Proprietario</span>
                              {registrationEditMode ? (
                                <ClientLookupField
                                  session={session}
                                  label="Cliente proprietario"
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
                              ) : (
                                <strong className="sample-detail-inline-value">{buildReadableValue(detail.sample.declared.owner)}</strong>
                              )}
                            </div>

                            <div className="sample-detail-main-fact is-wide-value">
                              <span>Inscricao do proprietario</span>
                              {registrationEditMode ? (
                                <ClientRegistrationSelect
                                  label="Inscricao"
                                  registrations={ownerRegistrations}
                                  value={selectedOwnerRegistrationId}
                                  disabled={!selectedOwnerClient || ownerRegistrationLoading || registrationUpdating}
                                  onChange={setSelectedOwnerRegistrationId}
                                  placeholder="Selecionar"
                                  compact
                                />
                              ) : (
                                <strong className="sample-detail-inline-value">
                                  {buildReadableValue(detail.sample.ownerRegistration?.registrationNumber ?? null)}
                                </strong>
                              )}
                            </div>

                            <div className="sample-detail-main-fact">
                              <span>Sacas</span>
                              {registrationEditMode ? (
                                <input
                                  className="sample-detail-inline-input"
                                  value={sacks}
                                  onChange={(event) => setSacks(event.target.value)}
                                  inputMode="numeric"
                                  disabled={registrationUpdating}
                                />
                              ) : (
                                <strong className="sample-detail-inline-value">{buildReadableValue(detail.sample.declared.sacks)}</strong>
                              )}
                            </div>

                            <div className="sample-detail-main-fact">
                              <span>Safra</span>
                              {registrationEditMode ? (
                                <input
                                  className="sample-detail-inline-input"
                                  value={harvest}
                                  onChange={(event) => setHarvest(event.target.value)}
                                  disabled={registrationUpdating}
                                />
                              ) : (
                                <strong className="sample-detail-inline-value">{buildReadableValue(detail.sample.declared.harvest)}</strong>
                              )}
                            </div>

                            <div className="sample-detail-main-fact">
                              <span>Lote de origem</span>
                              {registrationEditMode ? (
                                <input
                                  className="sample-detail-inline-input"
                                  value={originLot}
                                  onChange={(event) => setOriginLot(event.target.value)}
                                  disabled={registrationUpdating}
                                />
                              ) : (
                                <strong className="sample-detail-inline-value">{buildReadableValue(detail.sample.declared.originLot)}</strong>
                              )}
                            </div>

                            <div className="sample-detail-main-fact is-wide-value">
                              <span>Recebido</span>
                              <strong className="sample-detail-inline-value">{formatTimestamp(detail.sample.createdAt)}</strong>
                            </div>
                          </div>
                        </div>
                        <NoticeSlot notice={generalNotice} />
                      </article>
                    </section>

                    {detail.sample.status === 'INVALIDATED' ? (
                      <section className="panel stack sample-detail-status-note">
                        <h3 className="sample-detail-card-title">Amostra invalidada</h3>
                        <p style={{ margin: 0, color: 'var(--muted)' }}>
                          Esta amostra foi retirada do fluxo operacional e permanece apenas para consulta.
                        </p>
                      </section>
                    ) : null}
                  </section>
                ) : detailSection === 'CLASSIFICATION' ? (
                  isClassificationStatus(detail.sample.status) ? (
                    <section className="stack sample-detail-info-pane sample-detail-classification-pane" id="classification-section" ref={classificationSectionRef}>
                      {fromQrSource ? (
                        <p className="success sample-classification-feedback" style={{ margin: 0 }}>
                          Acesso por leitura de QR confirmado para esta amostra.
                        </p>
                      ) : null}

                      {detail.sample.status === 'QR_PRINTED' ? (
                        <section className="panel sample-classification-start-card">
                          <div className="sample-classification-start-copy">
                            <h4 style={{ margin: 0 }}>Classificacao pronta para iniciar</h4>
                          </div>
                          <button type="button" onClick={handleStartClassification} disabled={classificationStarting}>
                            {classificationStarting ? 'Iniciando classificacao...' : 'Iniciar classificacao'}
                          </button>
                        </section>
                      ) : null}

                      {classificationShowsWorkspace ? (
                        <form
                          className={[
                            'stack sample-classification-flow',
                            'sample-classification-step-shell',
                            classificationEditHighlightActive ? 'is-editing' : '',
                            classificationFieldsReadOnly ? 'is-readonly' : ''
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (classificationStep === 'PHOTO') {
                              handleAdvanceFromClassificationPhoto();
                              return;
                            }

                            if (classificationStep === 'GENERAL') {
                              handleAdvanceFromClassificationGeneral();
                              return;
                            }

                            if (detail.sample.status === 'CLASSIFICATION_IN_PROGRESS') {
                              void handleCompleteClassification();
                              return;
                            }

                            if (classificationEditMode) {
                              handleRequestClassificationUpdate();
                            }
                          }}
                        >
                          <div className="sample-classification-step-header">
                            <div className="sample-classification-step-switch-row">
                            <div className="sample-classification-step-switch" role="tablist" aria-label="Etapas da classificacao">
                              <button
                                type="button"
                                className={classificationStep === 'PHOTO' ? 'sample-classification-step-tab is-active' : 'sample-classification-step-tab'}
                                onClick={() => setClassificationStep('PHOTO')}
                              >
                                Foto
                                {classificationAttachment ? (
                                  <span className="sample-classification-step-check" aria-label="Foto adicionada">
                                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                      <path d="m5 12.5 4.3 4.2L19 7" />
                                    </svg>
                                  </span>
                                ) : null}
                              </button>
                              <button
                                type="button"
                                className={classificationStep === 'GENERAL' ? 'sample-classification-step-tab is-active' : 'sample-classification-step-tab'}
                                onClick={() => setClassificationStep('GENERAL')}
                                disabled={!classificationCanAccessDataSteps}
                                aria-disabled={!classificationCanAccessDataSteps}
                              >
                                Dados
                              </button>
                              <button
                                type="button"
                                className={classificationStep === 'MEASURES' ? 'sample-classification-step-tab is-active' : 'sample-classification-step-tab'}
                                onClick={() => setClassificationStep('MEASURES')}
                                disabled={!classificationCanAccessDataSteps}
                                aria-disabled={!classificationCanAccessDataSteps}
                              >
                                Leituras
                              </button>
                            </div>
                            </div>
                          </div>

                          <div ref={classificationStepBodyRef} className="sample-classification-step-body">
                            {classificationStep === 'PHOTO' ? (
                              <section className="panel stack sample-classification-photo-panel">
                                <div className="sample-classification-photo-shell">
                                  <label
                                    htmlFor="sample-classification-photo-input"
                                    className={`new-sample-photo-stage sample-classification-photo-stage${
                                      classificationPhotoEditingAllowed ? '' : ' is-static'
                                    }`}
                                  >
                                    <input
                                      id="sample-classification-photo-input"
                                      ref={classificationPhotoInputRef}
                                      className="new-sample-file-input"
                                      accept="image/*"
                                      capture="environment"
                                      type="file"
                                      disabled={!classificationPhotoEditingAllowed || classificationPhotoUploading}
                                      onChange={(event) => handleClassificationPhotoSelected(event.target.files?.[0] ?? null)}
                                    />

                                    {classificationVisiblePhotoPreviewUrl ? (
                                      <img
                                        src={classificationVisiblePhotoPreviewUrl}
                                        alt="Pre-visualizacao da foto da classificacao"
                                        className="new-sample-photo-preview"
                                        onClick={(event) => {
                                          if (classificationSavedPhotoUrl && !classificationSelectedPhoto) {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            setClassificationPhotoPreviewOpen(true);
                                          }
                                        }}
                                        style={classificationSavedPhotoUrl && !classificationSelectedPhoto ? { cursor: 'pointer' } : undefined}
                                      />
                                    ) : (
                                      <span className="new-sample-photo-placeholder sample-classification-photo-placeholder">
                                        <span className="new-sample-photo-placeholder-icon" aria-hidden="true">
                                          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                            <path d="M4 8.5h3l1.1-2h5.8l1.1 2h3A1.8 1.8 0 0 1 20 10.3v7.4a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 17.7v-7.4A1.8 1.8 0 0 1 5.8 8.5Z" />
                                            <circle cx="12" cy="13.3" r="3.1" />
                                          </svg>
                                        </span>
                                        <span className="new-sample-photo-placeholder-title">Espaco reservado para foto</span>
                                        <span className="new-sample-photo-placeholder-text">
                                          {classificationPhotoEditingAllowed
                                            ? classificationAttachment
                                              ? 'Toque para substituir a foto'
                                              : 'Toque para capturar ou anexar'
                                            : classificationAttachment
                                              ? 'Foto registrada para esta classificacao'
                                              : 'Imagem da classificacao nao localizada'}
                                        </span>
                                      </span>
                                    )}

                                    {showClassificationPhotoConfirmEffect ? (
                                      <span key={classificationPhotoConfirmEffectKey} className="new-sample-photo-confirm-fx" aria-hidden="true">
                                        <span className="new-sample-photo-confirm-glow" />
                                        <span className="new-sample-photo-confirm-ring" />
                                        <span className="new-sample-photo-confirm-badge">
                                          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                            <path d="m5 12.5 4.3 4.2L19 7" />
                                          </svg>
                                        </span>
                                        <span className="new-sample-photo-spark new-sample-photo-spark-a" />
                                        <span className="new-sample-photo-spark new-sample-photo-spark-b" />
                                        <span className="new-sample-photo-spark new-sample-photo-spark-c" />
                                        <span className="new-sample-photo-spark new-sample-photo-spark-d" />
                                        <span className="new-sample-photo-spark new-sample-photo-spark-e" />
                                      </span>
                                    ) : null}

                                    {classificationPhotoEditingAllowed ? (
                                      <div className="sample-classification-photo-inline-actions">
                                        <button
                                          type="button"
                                          className={`sample-classification-photo-inline-button sample-classification-photo-inline-icon${
                                            classificationAttachment || classificationSelectedPhoto ? ' is-ready is-discard' : ''
                                          }`}
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            classificationPhotoInputRef.current?.click();
                                          }}
                                          disabled={classificationPhotoUploading}
                                          aria-label={classificationAttachment ? 'Enviar nova foto' : 'Adicionar foto'}
                                          title={classificationAttachment ? 'Enviar nova foto' : 'Adicionar foto'}
                                        >
                                          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                            <path d="M4 8.5h3l1.1-2h5.8l1.1 2h3A1.8 1.8 0 0 1 20 10.3v7.4a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 17.7v-7.4A1.8 1.8 0 0 1 5.8 8.5Z" />
                                            <circle cx="12" cy="13.3" r="3.1" />
                                          </svg>
                                        </button>

                                        <button
                                          type="button"
                                          className={`sample-classification-photo-inline-button sample-classification-photo-inline-icon is-confirm${
                                            classificationSelectedPhoto ? ' is-ready' : ''
                                          }`}
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            void handleUploadClassificationPhoto();
                                          }}
                                          disabled={classificationPhotoUploading || !classificationSelectedPhoto}
                                          aria-label="Salvar foto da classificacao"
                                          title="Salvar foto da classificacao"
                                        >
                                          {classificationPhotoUploading ? (
                                            <span className="sample-classification-photo-inline-spinner" aria-hidden="true" />
                                          ) : (
                                            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                              <path d="m5 12.5 4.3 4.2L19 7" />
                                            </svg>
                                          )}
                                        </button>
                                      </div>
                                    ) : null}
                                  </label>
                                </div>
                              </section>
                            ) : null}

                          {classificationStep === 'GENERAL' ? (
                            <section className="panel stack sample-classification-form-panel">
                              <div className="grid sample-classification-form-grid sample-classification-form-grid-general">
                                {renderClassificationInputField('padrao', 'Padrao')}
                                {renderClassificationInputField('catacao', 'Catacao')}
                                {renderClassificationInputField('aspecto', 'Aspecto')}
                                {renderClassificationInputField('bebida', 'Bebida')}
                                {renderClassificationInputField('classificador', 'Classificador')}
                                {renderClassificationInputField('loteOrigem', 'Lote de origem')}
                                {renderClassificationInputField('aspectoCor', 'Aspecto da cor', {
                                  className: 'sample-classification-field-span-full'
                                })}
                              </div>
                            </section>
                          ) : null}

                          {classificationStep === 'MEASURES' ? (
                            <section className="panel stack sample-classification-form-panel sample-classification-measures-panel">
                              <div className="grid sample-classification-measures-grid">
                                {renderClassificationInputField('broca', 'Broca', { inputMode: 'decimal' })}
                                {renderClassificationInputField('pva', 'PVA', { inputMode: 'decimal' })}
                                {renderClassificationInputField('imp', 'IMP', { inputMode: 'decimal' })}
                                {renderClassificationInputField('defeito', 'Defeito', { inputMode: 'decimal' })}
                                {renderClassificationInputField('umidade', 'Umidade', { inputMode: 'decimal' })}
                              </div>

                              <div className="grid sample-classification-sieve-grid sample-classification-sieve-grid-compact">
                                {SIEVE_FIELDS.map((field) => (
                                  renderClassificationInputField(field.key, field.label, { inputMode: 'decimal' })
                                ))}
                              </div>

                              {renderClassificationTextareaField('observacoes', 'Observacoes', {
                                className: 'sample-classification-field-span-full',
                                rows: 2
                              })}
                            </section>
                          ) : null}
                          </div>

                          <div className="sample-classification-footer">
                            <button
                              className="secondary sample-classification-nav-arrow"
                              type="button"
                              onClick={handleGoBackClassificationStep}
                              disabled={!classificationCanGoPrev}
                              aria-label="Voltar etapa da classificacao"
                              title="Voltar"
                            >
                              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                <path d="M15 6 9 12l6 6" />
                              </svg>
                            </button>

                            <div className="sample-classification-footer-actions">
                            {classificationEditMode ? (
                              <>
                                <button
                                  className="secondary"
                                  type="button"
                                  onClick={cancelClassificationEdit}
                                  disabled={classificationUpdating || classificationSaving || classificationCompleting}
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={handleRequestClassificationUpdate}
                                  disabled={classificationUpdating || classificationSaving || classificationCompleting}
                                >
                                  Salvar
                                </button>
                              </>
                            ) : (
                              <>
                                {detail.sample.status === 'CLASSIFICATION_IN_PROGRESS' && classificationStep === 'MEASURES' ? (
                                  <>
                                    <button
                                      className="secondary"
                                      type="button"
                                      onClick={handleSaveClassificationPartial}
                                      disabled={classificationSaving || classificationCompleting || classificationUpdating}
                                    >
                                      {classificationSaving ? 'Salvando...' : 'Salvar'}
                                    </button>
                                    <button
                                      type="submit"
                                      disabled={
                                        classificationCompleting ||
                                        classificationSaving ||
                                        classificationUpdating ||
                                        !classificationCanComplete
                                      }
                                    >
                                      {classificationCompleting ? 'Concluindo...' : 'Concluir'}
                                    </button>
                                  </>
                                ) : null}
                              </>
                            )}
                            </div>

                            <div className="sample-classification-footer-right">
                              {detail.sample.status === 'CLASSIFIED' && !classificationEditMode ? (
                                <button
                                  className="secondary sample-classification-nav-arrow"
                                  type="button"
                                  onClick={startClassificationEdit}
                                  disabled={classificationStepBusy}
                                  aria-label="Editar classificacao"
                                  title="Editar classificacao"
                                >
                                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                                  </svg>
                                </button>
                              ) : null}
                              <button
                                className="secondary sample-classification-nav-arrow"
                                type="button"
                                onClick={handleGoForwardClassificationStep}
                                disabled={!classificationCanGoNext}
                                aria-label="Avancar etapa da classificacao"
                                title="Avancar"
                              >
                                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                  <path d="m9 6 6 6-6 6" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </form>
                      ) : null}
                      <NoticeSlot notice={classificationNotice} />
                    </section>
                  ) : (
                    <section className="stack sample-detail-info-pane sample-detail-empty-pane" id="classification-section" ref={classificationSectionRef}>
                      <p style={{ margin: 0, color: 'var(--muted)' }}>Classificacao indisponivel no status atual.</p>
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
          </div>
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

      {registrationEditReasonModalOpen ? (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            closeRegistrationEditReasonModal();
          }}
        >
          <section
            ref={registrationEditTrapRef}
            className="app-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="registration-edit-reason-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="registration-edit-reason-modal-title" className="app-modal-title">
                  Confirmar motivo da edicao
                </h3>
                <p className="app-modal-description">
                  Informe o motivo da alteracao para registrar a edicao auditada do registro.
                </p>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={closeRegistrationEditReasonModal}
                disabled={registrationUpdating}
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
                  value={registrationEditReasonCode}
                  onChange={(event) => setRegistrationEditReasonCode(event.target.value as UpdateReasonCode)}
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
                  Justificativa{registrationEditReasonCode === 'OTHER' ? ' (obrigatoria, maximo 10 palavras)' : ' (opcional, maximo 10 palavras)'}
                </span>
                <input
                  className="app-modal-input"
                  value={registrationEditReasonText}
                  onChange={(event) => setRegistrationEditReasonText(event.target.value)}
                  placeholder={registrationEditReasonCode === 'OTHER' ? 'Explique a alteracao' : 'Opcional'}
                  disabled={registrationUpdating}
                />
              </label>

              <NoticeSlot notice={registrationModalNotice} />

              <div className="app-modal-actions">
                <button
                  type="button"
                  className="app-modal-submit"
                  onClick={() => void handleConfirmRegistrationUpdate()}
                  disabled={registrationUpdating || (registrationEditReasonCode === 'OTHER' && registrationEditReasonText.trim().length === 0)}
                >
                  {registrationUpdating ? 'Salvando edicao...' : 'Salvar edicao'}
                </button>
                <button
                  className="app-modal-secondary"
                  type="button"
                  onClick={closeRegistrationEditReasonModal}
                  disabled={registrationUpdating}
                >
                  Cancelar
                </button>
              </div>
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
        <div
          className="app-modal-backdrop"
          onClick={() => setClassificationPhotoPreviewOpen(false)}
        >
          <section
            className="app-modal sample-classification-photo-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Foto da classificacao"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 className="app-modal-title">Foto da classificacao</h3>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={() => setClassificationPhotoPreviewOpen(false)}
                aria-label="Fechar"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>
            <div className="sample-classification-photo-preview-body">
              <img
                src={classificationSavedPhotoUrl}
                alt="Foto da classificacao em tamanho ampliado"
                className="sample-classification-photo-preview-img"
              />
            </div>
          </section>
        </div>
      ) : null}

      {exportTypeSelectorOpen ? (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            handleCloseExportTypeSelector();
          }}
        >
          <section
            ref={exportTypeTrapRef}
            className="app-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-type-select-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="export-type-select-modal-title" className="app-modal-title">
                  Escolher tipo de laudo
                </h3>
                <p className="app-modal-description">
                  Selecione o tipo de laudo para seguir com o envio e confirmar a exportacao.
                </p>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={handleCloseExportTypeSelector}
                aria-label="Fechar"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="app-modal-actions">
              <button type="button" className="app-modal-submit" onClick={() => handleSelectExportTypeFromModal('COMPLETO')}>
                Completo
              </button>
              <button type="button" className="app-modal-submit" onClick={() => handleSelectExportTypeFromModal('COMPRADOR_PARCIAL')}>
                Comprador Parcial
              </button>
              <button className="app-modal-secondary" type="button" onClick={handleCloseExportTypeSelector}>
                Cancelar
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {exportConfirmationOpen && pendingExportType ? (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            handleCloseExportConfirmation();
          }}
        >
          <section
            ref={exportConfirmTrapRef}
            className="app-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-confirm-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="export-confirm-modal-title" className="app-modal-title">
                  Confirmar exportacao de laudo
                </h3>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={handleCloseExportConfirmation}
                disabled={Boolean(exportingPdfType)}
                aria-label="Fechar"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="app-modal-content">
              <label className="app-modal-field">
                <span className="app-modal-label">Destinatario (opcional, recomendado)</span>
                <input
                  className="app-modal-input"
                  value={exportDestination}
                  onChange={(event) => setExportDestination(event.target.value)}
                  placeholder="Ex.: Comprador XPTO / email / setor"
                  disabled={Boolean(exportingPdfType)}
                />
              </label>

              <div className="app-modal-actions">
                <button type="button" className="app-modal-submit" onClick={handleConfirmExportFromModal} disabled={Boolean(exportingPdfType)}>
                  {Boolean(exportingPdfType) ? 'Exportando...' : 'Confirmar exportacao'}
                </button>
                <button
                  className="app-modal-secondary"
                  type="button"
                  onClick={handleCloseExportConfirmation}
                  disabled={Boolean(exportingPdfType)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
