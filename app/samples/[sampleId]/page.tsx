'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

import { AppShell } from '../../../components/AppShell';
import { StatusBadge } from '../../../components/StatusBadge';
import {
  ApiError,
  completeClassification,
  confirmRegistration,
  exportSamplePdf,
  getSampleDetail,
  invalidateSample,
  recordQrPrintFailed,
  recordQrPrinted,
  requestQrReprint,
  revertSampleUpdate,
  requestQrPrint,
  saveClassificationPartial,
  startClassification,
  startRegistration,
  updateClassification,
  updateRegistration,
  uploadClassificationPhoto,
  uploadLabelPhoto
} from '../../../lib/api-client';
import { invalidateSampleSchema, qrFailSchema, registrationFormSchema, updateReasonSchema } from '../../../lib/form-schemas';
import { isAdmin } from '../../../lib/roles';
import { useRequireAuth } from '../../../lib/use-auth';
import type {
  InvalidateReasonCode,
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
  completionPercent: string;
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
  dataClassificacao: string | null;
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

type HistoryRow = {
  eventId: string;
  eventType: string;
  eventLabel: string;
  occurredAt: string;
  actor: string;
  field: string;
  before: string;
  after: string;
  reason: string;
  reversible: boolean;
  showRevertAction: boolean;
};

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
  peneiraFundo: '',
  completionPercent: ''
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

const CLASSIFICATION_PROGRESS_FIELDS: Array<keyof ClassificationFormState> = [
  'dataClassificacao',
  'padrao',
  'catacao',
  'aspecto',
  'bebida',
  'broca',
  'pva',
  'imp',
  'classificador',
  'defeito',
  'umidade',
  'aspectoCor',
  'observacoes',
  'loteOrigem',
  'peneiraP18',
  'peneiraP17',
  'peneiraP16',
  'peneiraMk',
  'peneiraP15',
  'peneiraP14',
  'peneiraP13',
  'peneiraP10',
  'peneiraFundo'
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

const HISTORY_EVENT_LABELS: Record<string, string> = {
  SAMPLE_RECEIVED: 'Amostra recebida',
  REGISTRATION_STARTED: 'Registro iniciado',
  PHOTO_ADDED: 'Foto adicionada',
  OCR_EXTRACTED: 'OCR extraido',
  OCR_FAILED: 'OCR com falha',
  OCR_CONFIRMED: 'OCR confirmado',
  REGISTRATION_CONFIRMED: 'Registro confirmado',
  QR_PRINT_REQUESTED: 'Impressao de QR solicitada',
  QR_PRINT_FAILED: 'Falha na impressao de QR',
  QR_PRINTED: 'QR impresso',
  QR_REPRINT_REQUESTED: 'Reimpressao de QR solicitada',
  CLASSIFICATION_STARTED: 'Classificacao iniciada',
  CLASSIFICATION_SAVED_PARTIAL: 'Classificacao parcial salva',
  CLASSIFICATION_COMPLETED: 'Classificacao concluida',
  REGISTRATION_UPDATED: 'Registro editado',
  CLASSIFICATION_UPDATED: 'Classificacao editada',
  SAMPLE_INVALIDATED: 'Amostra invalidada',
  REPORT_EXPORTED: 'Laudo exportado'
};

const HISTORY_FIELD_LABELS: Record<string, string> = {
  'declared.owner': 'Proprietario',
  'declared.sacks': 'Quantidade de sacas',
  'declared.harvest': 'Safra',
  'declared.originLot': 'Lote de origem',
  'classificationData.dataClassificacao': 'Data da classificacao',
  'classificationData.padrao': 'Padrao',
  'classificationData.catacao': 'Catacao',
  'classificationData.aspecto': 'Aspecto',
  'classificationData.bebida': 'Bebida',
  'classificationData.broca': 'Broca',
  'classificationData.pva': 'PVA',
  'classificationData.imp': 'IMP',
  'classificationData.classificador': 'Classificador',
  'classificationData.defeito': 'Defeito',
  'classificationData.umidade': 'Umidade',
  'classificationData.aspectoCor': 'Aspecto da cor',
  'classificationData.observacoes': 'Observacoes',
  'classificationData.loteOrigem': 'Lote de origem (classificacao)',
  'classificationData.peneirasPercentuais': 'Peneiras (%)',
  'classificationData.peneirasPercentuais.p18': 'Peneira 18 (%)',
  'classificationData.peneirasPercentuais.p17': 'Peneira 17 (%)',
  'classificationData.peneirasPercentuais.p16': 'Peneira 16 (%)',
  'classificationData.peneirasPercentuais.mk': 'Peneira MK (%)',
  'classificationData.peneirasPercentuais.p15': 'Peneira 15 (%)',
  'classificationData.peneirasPercentuais.p14': 'Peneira 14 (%)',
  'classificationData.peneirasPercentuais.p13': 'Peneira 13 (%)',
  'classificationData.peneirasPercentuais.p10': 'Peneira 10 (%)',
  'classificationData.peneirasPercentuais.fundo': 'Fundo (%)',
  'classificationData.consumoGramas': 'Consumo (gramas)',
  'technical.type': 'Tipo tecnico',
  'technical.screen': 'Peneira tecnica',
  'technical.defectsCount': 'Defeitos (tecnico)',
  'technical.moisture': 'Umidade (tecnico)',
  'technical.density': 'Densidade (tecnico)',
  'technical.colorAspect': 'Aspecto de cor (tecnico)',
  'technical.notes': 'Observacoes tecnicas',
  consumptionGrams: 'Consumo (gramas)'
};

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

function parseNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function readCompletionPercent(value: string): number | null {
  const parsed = parseNumberInput(value);
  return parsed === null ? null : parsed;
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

  const completionRaw = form.completionPercent.trim();
  if (completionRaw) {
    const completionNumber = Number(completionRaw.replace(',', '.'));
    if (!Number.isFinite(completionNumber) || completionNumber < 0 || completionNumber > 100) {
      return 'Percentual de preenchimento deve estar entre 0 e 100.';
    }
  }

  return null;
}

function buildClassificationDataPayload(form: ClassificationFormState): ClassificationDataPayload {
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

  return {
    dataClassificacao: form.dataClassificacao.trim() || null,
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
}

function buildClassificationFormState(detail: SampleDetailResponse, user: SessionUser): ClassificationFormState {
  const latestData = isRecord(detail.sample.latestClassification.data) ? detail.sample.latestClassification.data : {};
  const draftData = isRecord(detail.sample.classificationDraft.snapshot) ? detail.sample.classificationDraft.snapshot : {};
  const mergedData = { ...latestData, ...draftData };

  const latestSieve = isRecord(latestData.peneirasPercentuais) ? latestData.peneirasPercentuais : {};
  const draftSieve = isRecord(draftData.peneirasPercentuais) ? draftData.peneirasPercentuais : {};
  const mergedSieve = { ...latestSieve, ...draftSieve };

  const fallbackClassifier = user.displayName ?? user.username;
  const completionPercent = detail.sample.classificationDraft.completionPercent;

  return {
    ...EMPTY_CLASSIFICATION_FORM,
    dataClassificacao: toDateInput(mergedData.dataClassificacao),
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
    loteOrigem: toText(mergedData.loteOrigem),
    peneiraP18: toText(mergedSieve.p18),
    peneiraP17: toText(mergedSieve.p17),
    peneiraP16: toText(mergedSieve.p16),
    peneiraMk: toText(mergedSieve.mk),
    peneiraP15: toText(mergedSieve.p15),
    peneiraP14: toText(mergedSieve.p14),
    peneiraP13: toText(mergedSieve.p13),
    peneiraP10: toText(mergedSieve.p10),
    peneiraFundo: toText(mergedSieve.fundo),
    completionPercent: typeof completionPercent === 'number' ? String(completionPercent) : ''
  };
}

function buildReadableValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'Nao informado';
  }

  if (typeof value === 'string') {
    return value.trim() ? value : 'Nao informado';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return 'Nao informado';
}

function readAttemptNumber(payload: Record<string, unknown>): number | null {
  const raw = payload.attemptNumber;

  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
    return raw;
  }

  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function readPrintAction(payload: Record<string, unknown>): 'PRINT' | 'REPRINT' | null {
  const raw = payload.printAction;
  if (raw === 'PRINT' || raw === 'REPRINT') {
    return raw;
  }

  return null;
}

function getPendingAttemptByAction(
  events: SampleDetailResponse['events'],
  action: 'PRINT' | 'REPRINT'
): number | null {
  const requested = new Set<number>();
  const resolved = new Set<number>();

  for (const event of events) {
    const payload = isRecord(event.payload) ? event.payload : null;
    if (!payload) {
      continue;
    }

    const attempt = readAttemptNumber(payload);
    if (attempt === null) {
      continue;
    }

    if (event.eventType === 'QR_PRINT_REQUESTED' || event.eventType === 'QR_REPRINT_REQUESTED') {
      const printAction = readPrintAction(payload);
      if (printAction === action) {
        requested.add(attempt);
      }
      continue;
    }

    if (event.eventType === 'QR_PRINTED' || event.eventType === 'QR_PRINT_FAILED') {
      const printAction = readPrintAction(payload);
      if (printAction === action) {
        resolved.add(attempt);
      }
    }
  }

  const pending = Array.from(requested).filter((attempt) => !resolved.has(attempt));
  if (pending.length === 0) {
    return null;
  }

  return Math.max(...pending);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('pt-BR');
}

function normalizeHistoryValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'Nao informado';
  }

  if (typeof value === 'string') {
    return value.trim() || 'Nao informado';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Nao';
  }

  if (Array.isArray(value) || isRecord(value)) {
    return JSON.stringify(value);
  }

  return String(value);
}

function flattenChangeObject(value: unknown, prefix = ''): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  const flattened: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (isRecord(nested)) {
      const nestedFlattened = flattenChangeObject(nested, nextPath);
      if (Object.keys(nestedFlattened).length === 0) {
        flattened[nextPath] = nested;
      } else {
        Object.assign(flattened, nestedFlattened);
      }
      continue;
    }

    flattened[nextPath] = nested;
  }

  return flattened;
}

function translateHistoryEvent(eventType: string): string {
  return HISTORY_EVENT_LABELS[eventType] ?? eventType;
}

function translateHistoryField(fieldPath: string): string {
  return HISTORY_FIELD_LABELS[fieldPath] ?? fieldPath;
}

function buildHistoryRows(events: SampleDetailResponse['events']): HistoryRow[] {
  const rows: HistoryRow[] = [];

  for (const event of events) {
    const payload = isRecord(event.payload) ? event.payload : {};
    const actor = event.actorType === 'SYSTEM' ? 'SYSTEM' : event.actorUserId ?? 'Usuario desconhecido';
    const reason = typeof payload.reasonText === 'string' && payload.reasonText.trim() ? payload.reasonText : '-';
    const reversible = event.eventType === 'REGISTRATION_UPDATED' || event.eventType === 'CLASSIFICATION_UPDATED';
    const beforeFlat = flattenChangeObject(payload.before);
    const afterFlat = flattenChangeObject(payload.after);
    const keys = Array.from(new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)]));
    const changedKeys = keys.filter((key) => normalizeHistoryValue(beforeFlat[key]) !== normalizeHistoryValue(afterFlat[key]));

    if (!reversible || changedKeys.length === 0) {
      rows.push({
        eventId: event.eventId,
        eventType: event.eventType,
        eventLabel: translateHistoryEvent(event.eventType),
        occurredAt: event.occurredAt,
        actor,
        field: '-',
        before: '-',
        after: '-',
        reason,
        reversible,
        showRevertAction: reversible
      });
      continue;
    }

    changedKeys.forEach((key, index) => {
      rows.push({
        eventId: event.eventId,
        eventType: event.eventType,
        eventLabel: translateHistoryEvent(event.eventType),
        occurredAt: event.occurredAt,
        actor,
        field: translateHistoryField(key),
        before: normalizeHistoryValue(beforeFlat[key]),
        after: normalizeHistoryValue(afterFlat[key]),
        reason,
        reversible,
        showRevertAction: index === 0
      });
    });
  }

  return rows;
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

export default function SampleDetailPage() {
  const { session, loading, logout } = useRequireAuth();
  const params = useParams<{ sampleId: string }>();
  const searchParams = useSearchParams();
  const sampleId = typeof params.sampleId === 'string' ? params.sampleId : '';
  const focusClassification = searchParams.get('focus') === 'classification';
  const fromQrSource = searchParams.get('source') === 'qr';

  const [detail, setDetail] = useState<SampleDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [manualMode, setManualMode] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [classificationSelectedPhoto, setClassificationSelectedPhoto] = useState<File | null>(null);
  const [classificationPhotoUploading, setClassificationPhotoUploading] = useState(false);
  const [exportingPdfType, setExportingPdfType] = useState<SampleExportType | null>(null);
  const [exportConfirmationOpen, setExportConfirmationOpen] = useState(false);
  const [pendingExportType, setPendingExportType] = useState<SampleExportType | null>(null);
  const [exportDestination, setExportDestination] = useState('');

  const [owner, setOwner] = useState('');
  const [sacks, setSacks] = useState('');
  const [harvest, setHarvest] = useState('');
  const [originLot, setOriginLot] = useState('');
  const [confirming, setConfirming] = useState(false);

  const [printerId, setPrinterId] = useState('printer-main');
  const [printErrorText, setPrintErrorText] = useState('');
  const [printSubmitting, setPrintSubmitting] = useState(false);
  const [reprintErrorText, setReprintErrorText] = useState('');
  const [reprintSubmitting, setReprintSubmitting] = useState(false);
  const [invalidateReasonCode, setInvalidateReasonCode] = useState<InvalidateReasonCode>('OTHER');
  const [invalidateReasonText, setInvalidateReasonText] = useState('');
  const [invalidating, setInvalidating] = useState(false);

  const [classificationForm, setClassificationForm] = useState<ClassificationFormState>(EMPTY_CLASSIFICATION_FORM);
  const [classificationStarting, setClassificationStarting] = useState(false);
  const [classificationSaving, setClassificationSaving] = useState(false);
  const [classificationCompleting, setClassificationCompleting] = useState(false);
  const [registrationEditMode, setRegistrationEditMode] = useState(false);
  const [registrationEditReasonCode, setRegistrationEditReasonCode] = useState<UpdateReasonCode>('OTHER');
  const [registrationEditReasonText, setRegistrationEditReasonText] = useState('');
  const [registrationUpdating, setRegistrationUpdating] = useState(false);
  const [classificationEditMode, setClassificationEditMode] = useState(false);
  const [classificationEditReasonCode, setClassificationEditReasonCode] = useState<UpdateReasonCode>('OTHER');
  const [classificationEditReasonText, setClassificationEditReasonText] = useState('');
  const [classificationUpdating, setClassificationUpdating] = useState(false);
  const [revertTargetEventId, setRevertTargetEventId] = useState<string | null>(null);
  const [revertReasonCode, setRevertReasonCode] = useState<UpdateReasonCode>('OTHER');
  const [revertReasonText, setRevertReasonText] = useState('');
  const [revertingEdit, setRevertingEdit] = useState(false);
  const classificationSectionRef = useRef<HTMLElement | null>(null);
  const canInvalidateSample = session ? isAdmin(session.user.role) : false;

  const loadDetail = useCallback(async () => {
    if (!session || !sampleId) {
      return;
    }

    setLoadingDetail(true);
    setError(null);

    try {
      const response = await getSampleDetail(session, sampleId);
      setDetail(response);
      setOwner(response.sample.declared.owner ?? '');
      setSacks(response.sample.declared.sacks ? String(response.sample.declared.sacks) : '');
      setHarvest(response.sample.declared.harvest ?? '');
      setOriginLot(response.sample.declared.originLot ?? '');
      setClassificationForm(buildClassificationFormState(response, session.user));
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao carregar amostra');
      }
    } finally {
      setLoadingDetail(false);
    }
  }, [sampleId, session]);

  useEffect(() => {
    if (!sampleId) {
      return;
    }
    void loadDetail();
  }, [loadDetail, sampleId]);

  useEffect(() => {
    setPrintErrorText('');
    setReprintErrorText('');
    setExportConfirmationOpen(false);
    setPendingExportType(null);
    setExportDestination('');
    setRegistrationEditMode(false);
    setRegistrationEditReasonCode('OTHER');
    setRegistrationEditReasonText('');
    setClassificationEditMode(false);
    setClassificationEditReasonCode('OTHER');
    setClassificationEditReasonText('');
    setRevertTargetEventId(null);
    setRevertReasonCode('OTHER');
    setRevertReasonText('');
  }, [sampleId]);

  const printAttempts = useMemo(() => {
    if (!detail) {
      return [] as number[];
    }

    return detail.events
      .filter((event) => event.eventType === 'QR_PRINT_REQUESTED')
      .map((event) => {
        if (!isRecord(event.payload)) {
          return null;
        }
        if (readPrintAction(event.payload) !== 'PRINT') {
          return null;
        }
        return readAttemptNumber(event.payload);
      })
      .filter((value): value is number => value !== null);
  }, [detail]);

  const reprintAttempts = useMemo(() => {
    if (!detail) {
      return [] as number[];
    }

    return detail.events
      .filter((event) => event.eventType === 'QR_REPRINT_REQUESTED')
      .map((event) => {
        if (!isRecord(event.payload)) {
          return null;
        }
        if (readPrintAction(event.payload) !== 'REPRINT') {
          return null;
        }
        return readAttemptNumber(event.payload);
      })
      .filter((value): value is number => value !== null);
  }, [detail]);

  const nextAttempt = (printAttempts.length ? Math.max(...printAttempts) : 0) + 1;
  const activeAttempt = printAttempts.length ? Math.max(...printAttempts) : 1;
  const nextReprintAttempt = (reprintAttempts.length ? Math.max(...reprintAttempts) : 0) + 1;
  const activeReprintAttempt = useMemo(
    () => (detail ? getPendingAttemptByAction(detail.events, 'REPRINT') : null),
    [detail]
  );

  const printStats = useMemo(() => {
    if (!detail) {
      return {
        totalSuccess: 0,
        initialSuccess: 0,
        reprintSuccess: 0,
        failures: 0,
        lastSuccess: null as { occurredAt: string; actor: string; action: 'PRINT' | 'REPRINT'; attempt: number | null } | null
      };
    }

    let initialSuccess = 0;
    let reprintSuccess = 0;
    let failures = 0;
    let lastSuccess: { occurredAt: string; actor: string; action: 'PRINT' | 'REPRINT'; attempt: number | null } | null = null;

    for (const event of detail.events) {
      if (!isRecord(event.payload)) {
        continue;
      }

      const action = readPrintAction(event.payload);
      const attempt = readAttemptNumber(event.payload);
      const actor = event.actorType === 'SYSTEM' ? 'SYSTEM' : event.actorUserId ?? 'Usuario desconhecido';

      if (event.eventType === 'QR_PRINTED' && action) {
        if (action === 'PRINT') {
          initialSuccess += 1;
        } else {
          reprintSuccess += 1;
        }

        if (!lastSuccess || new Date(event.occurredAt).getTime() >= new Date(lastSuccess.occurredAt).getTime()) {
          lastSuccess = {
            occurredAt: event.occurredAt,
            actor,
            action,
            attempt
          };
        }
      }

      if (event.eventType === 'QR_PRINT_FAILED' && action) {
        failures += 1;
      }
    }

    return {
      totalSuccess: initialSuccess + reprintSuccess,
      initialSuccess,
      reprintSuccess,
      failures,
      lastSuccess
    };
  }, [detail]);

  const classificationCompletionAuto = useMemo(() => {
    const total = CLASSIFICATION_PROGRESS_FIELDS.length;
    if (total === 0) {
      return 0;
    }

    const filled = CLASSIFICATION_PROGRESS_FIELDS.filter((key) => classificationForm[key].trim().length > 0).length;
    return Math.round((filled / total) * 100);
  }, [classificationForm]);

  const latestClassificationData = useMemo(() => {
    if (!detail || !isRecord(detail.sample.latestClassification.data)) {
      return null;
    }
    return detail.sample.latestClassification.data;
  }, [detail]);

  const arrivalAttachments = useMemo(
    () => detail?.attachments.filter((attachment) => attachment.kind === 'ARRIVAL_PHOTO') ?? [],
    [detail]
  );
  const classificationAttachment = useMemo(
    () => detail?.attachments.find((attachment) => attachment.kind === 'CLASSIFICATION_PHOTO') ?? null,
    [detail]
  );
  const historyRows = useMemo(() => buildHistoryRows(detail?.events ?? []), [detail]);

  useEffect(() => {
    if (!detail || !focusClassification || !classificationSectionRef.current) {
      return;
    }

    if (!isClassificationStatus(detail.sample.status)) {
      return;
    }

    classificationSectionRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }, [detail, focusClassification]);

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

  async function handleStartRegistration() {
    if (!session || !detail) {
      return;
    }

    setError(null);
    setMessage(null);
    try {
      await startRegistration(session, sampleId, detail.sample.version, null);
      setMessage('Registro iniciado com sucesso.');
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao iniciar registro');
      }
    }
  }

  async function handleUploadPhoto() {
    if (!session || !selectedPhoto || !detail) {
      setError('Selecione uma foto antes de enviar.');
      return;
    }

    setPhotoUploading(true);
    setError(null);
    setMessage(null);

    try {
      await uploadLabelPhoto(session, sampleId, selectedPhoto, true);
      setSelectedPhoto(null);
      setMessage('Foto enviada com sucesso.');
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao enviar foto');
      }
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleUploadClassificationPhoto() {
    if (!session || !classificationSelectedPhoto || !detail) {
      setError('Selecione uma foto de classificacao antes de usar.');
      return;
    }

    setClassificationPhotoUploading(true);
    setError(null);
    setMessage(null);

    try {
      await uploadClassificationPhoto(session, sampleId, classificationSelectedPhoto, true);
      setClassificationSelectedPhoto(null);
      setMessage('Foto da classificacao salva com sucesso.');
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao enviar foto da classificacao');
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
      setError('A exportacao de laudo so e permitida para amostras classificadas.');
      return;
    }

    setError(null);
    setMessage(null);
    setPendingExportType(exportType);
    setExportDestination('');
    setExportConfirmationOpen(true);
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
      setError('A exportacao de laudo so e permitida para amostras classificadas.');
      return;
    }

    setError(null);
    setMessage(null);
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

      setMessage(`Laudo PDF (${getExportTypeLabel(exportType)}) exportado com sucesso.`);
      setExportConfirmationOpen(false);
      setPendingExportType(null);
      setExportDestination('');
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao exportar laudo PDF');
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

    setError(null);
    setMessage(null);

    const parsed = registrationFormSchema.safeParse({
      owner,
      sacks,
      harvest,
      originLot
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Dados de registro invalidos');
      return;
    }

    setConfirming(true);
    try {
      await confirmRegistration(session, sampleId, {
        expectedVersion: detail.sample.version,
        declared: parsed.data
      });
      setMessage('Registro confirmado com sucesso.');
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao confirmar registro');
      }
    } finally {
      setConfirming(false);
    }
  }

  async function handleRequestPrint() {
    if (!session || !detail) {
      return;
    }

    setPrintSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await requestQrPrint(session, sampleId, {
        expectedVersion: detail.sample.version,
        attemptNumber: nextAttempt,
        printerId: printerId.trim() || null
      });
      setMessage(`Solicitacao de impressao enviada (tentativa ${nextAttempt}).`);
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao solicitar impressao');
      }
    } finally {
      setPrintSubmitting(false);
    }
  }

  async function handleRequestReprint() {
    if (!session || !detail) {
      return;
    }

    setReprintSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await requestQrReprint(session, sampleId, {
        attemptNumber: nextReprintAttempt,
        printerId: printerId.trim() || null,
        reasonText: null
      });
      setMessage(`Solicitacao de reimpressao enviada (tentativa ${nextReprintAttempt}).`);
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao solicitar reimpressao');
      }
    } finally {
      setReprintSubmitting(false);
    }
  }

  async function handlePrintFailed() {
    if (!session || !detail) {
      return;
    }

    const parsed = qrFailSchema.safeParse({ error: printErrorText });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Informe o motivo da falha');
      return;
    }

    setPrintSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await recordQrPrintFailed(session, sampleId, {
        attemptNumber: activeAttempt,
        printerId: printerId.trim() || null,
        error: parsed.data.error
      });
      setMessage(`Falha registrada para tentativa ${activeAttempt}.`);
      setPrintErrorText('');
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao registrar erro de impressao');
      }
    } finally {
      setPrintSubmitting(false);
    }
  }

  async function handleMarkPrinted() {
    if (!session || !detail) {
      return;
    }

    setPrintSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await recordQrPrinted(session, sampleId, {
        expectedVersion: detail.sample.version,
        attemptNumber: activeAttempt,
        printerId: printerId.trim() || null
      });
      setMessage(`Amostra marcada como QR impresso (tentativa ${activeAttempt}).`);
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao marcar impressao');
      }
    } finally {
      setPrintSubmitting(false);
    }
  }

  async function handleReprintFailed() {
    if (!session || !detail || activeReprintAttempt === null) {
      return;
    }

    const parsed = qrFailSchema.safeParse({ error: reprintErrorText });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Informe o motivo da falha');
      return;
    }

    setReprintSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await recordQrPrintFailed(session, sampleId, {
        attemptNumber: activeReprintAttempt,
        printerId: printerId.trim() || null,
        error: parsed.data.error,
        printAction: 'REPRINT'
      });
      setMessage(`Falha registrada para reimpressao ${activeReprintAttempt}.`);
      setReprintErrorText('');
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao registrar erro de reimpressao');
      }
    } finally {
      setReprintSubmitting(false);
    }
  }

  async function handleMarkReprintPrinted() {
    if (!session || !detail || activeReprintAttempt === null) {
      return;
    }

    setReprintSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await recordQrPrinted(session, sampleId, {
        expectedVersion: detail.sample.version,
        attemptNumber: activeReprintAttempt,
        printerId: printerId.trim() || null,
        printAction: 'REPRINT'
      });
      setMessage(`Reimpressao marcada como impressa (tentativa ${activeReprintAttempt}).`);
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao marcar reimpressao');
      }
    } finally {
      setReprintSubmitting(false);
    }
  }

  async function handleInvalidateSample() {
    if (!session || !detail) {
      return;
    }

    if (!canInvalidateSample) {
      setError('Somente usuarios ADMIN podem invalidar amostras.');
      return;
    }

    const parsed = invalidateSampleSchema.safeParse({
      reasonCode: invalidateReasonCode,
      reasonText: invalidateReasonText
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Dados de invalidacao invalidos');
      return;
    }

    setInvalidating(true);
    setError(null);
    setMessage(null);

    try {
      await invalidateSample(session, sampleId, {
        expectedVersion: detail.sample.version,
        reasonCode: parsed.data.reasonCode,
        reasonText: parsed.data.reasonText
      });
      setMessage('Amostra invalidada com sucesso.');
      setInvalidateReasonCode('OTHER');
      setInvalidateReasonText('');
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao invalidar amostra');
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
    setError(null);
    setMessage(null);

    try {
      await startClassification(session, sampleId, {
        expectedVersion: detail.sample.version,
        classificationId: null,
        notes: null
      });
      setMessage('Classificacao iniciada com sucesso.');
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao iniciar classificacao');
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
      setError(validationError);
      return;
    }

    const classificationData = buildClassificationDataPayload(classificationForm);
    const completionPercent = readCompletionPercent(classificationForm.completionPercent);

    setClassificationSaving(true);
    setError(null);
    setMessage(null);

    try {
      const partialPayload: {
        expectedVersion: number;
        snapshotPartial: ClassificationDataPayload;
        completionPercent?: number;
      } = {
        expectedVersion: detail.sample.version,
        snapshotPartial: { ...classificationData }
      };

      if (completionPercent !== null) {
        partialPayload.completionPercent = completionPercent;
      }

      await saveClassificationPartial(session, sampleId, partialPayload);
      setMessage('Rascunho de classificacao salvo.');
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao salvar classificacao parcial');
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
      setError('A foto da classificacao e obrigatoria para concluir.');
      return;
    }

    if (classificationSelectedPhoto) {
      setError('Use a nova foto selecionada ou clique em "Tentar novamente" antes de concluir.');
      return;
    }

    const validationError = validateClassificationForm(classificationForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    const classificationData = buildClassificationDataPayload(classificationForm);
    const technical: {
      defectsCount?: number;
      moisture?: number;
      colorAspect?: string | null;
      notes?: string | null;
    } = {};

    if (classificationData.defeito !== null) {
      technical.defectsCount = classificationData.defeito;
    }
    if (classificationData.umidade !== null) {
      technical.moisture = classificationData.umidade;
    }
    if (classificationData.aspectoCor !== null) {
      technical.colorAspect = classificationData.aspectoCor;
    }
    if (classificationData.observacoes !== null) {
      technical.notes = classificationData.observacoes;
    }

    setClassificationCompleting(true);
    setError(null);
    setMessage(null);

    try {
      await completeClassification(session, sampleId, {
        expectedVersion: detail.sample.version,
        classificationData,
        technical: Object.keys(technical).length ? technical : undefined,
        classifierName: classificationData.classificador
      });
      setMessage('Classificacao concluida com sucesso.');
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao concluir classificacao');
      }
    } finally {
      setClassificationCompleting(false);
    }
  }

  function startRegistrationEdit() {
    if (!detail) {
      return;
    }

    setOwner(detail.sample.declared.owner ?? '');
    setSacks(detail.sample.declared.sacks ? String(detail.sample.declared.sacks) : '');
    setHarvest(detail.sample.declared.harvest ?? '');
    setOriginLot(detail.sample.declared.originLot ?? '');
    setRegistrationEditReasonCode('OTHER');
    setRegistrationEditReasonText('');
    setRegistrationEditMode(true);
    setError(null);
    setMessage(null);
  }

  function cancelRegistrationEdit() {
    if (!detail) {
      setRegistrationEditMode(false);
      return;
    }

    setOwner(detail.sample.declared.owner ?? '');
    setSacks(detail.sample.declared.sacks ? String(detail.sample.declared.sacks) : '');
    setHarvest(detail.sample.declared.harvest ?? '');
    setOriginLot(detail.sample.declared.originLot ?? '');
    setRegistrationEditReasonCode('OTHER');
    setRegistrationEditReasonText('');
    setRegistrationEditMode(false);
  }

  async function handleSaveRegistrationUpdate() {
    if (!session || !detail) {
      return;
    }

    if (!canEditRegistrationStatus(detail.sample.status)) {
      setError('Status atual nao permite edicao de registro.');
      return;
    }

    const parsedForm = registrationFormSchema.safeParse({
      owner,
      sacks,
      harvest,
      originLot
    });
    if (!parsedForm.success) {
      setError(parsedForm.error.issues[0]?.message ?? 'Dados de registro invalidos');
      return;
    }

    const parsedReason = updateReasonSchema.safeParse({
      reasonCode: registrationEditReasonCode,
      reasonText: registrationEditReasonText
    });
    if (!parsedReason.success) {
      setError(parsedReason.error.issues[0]?.message ?? 'Justificativa invalida');
      return;
    }

    setRegistrationUpdating(true);
    setError(null);
    setMessage(null);

    try {
      await updateRegistration(session, sampleId, {
        expectedVersion: detail.sample.version,
        after: {
          declared: parsedForm.data
        },
        reasonCode: parsedReason.data.reasonCode,
        reasonText: parsedReason.data.reasonText
      });

      setRegistrationEditMode(false);
      setRegistrationEditReasonCode('OTHER');
      setRegistrationEditReasonText('');
      setMessage('Edicao de registro salva com sucesso.');
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao salvar edicao de registro');
      }
    } finally {
      setRegistrationUpdating(false);
    }
  }

  function startClassificationEdit() {
    if (!detail || !session) {
      return;
    }

    setClassificationForm(buildClassificationFormState(detail, session.user));
    setClassificationEditReasonCode('OTHER');
    setClassificationEditReasonText('');
    setClassificationEditMode(true);
    setError(null);
    setMessage(null);
  }

  function cancelClassificationEdit() {
    if (detail && session) {
      setClassificationForm(buildClassificationFormState(detail, session.user));
    }
    setClassificationEditReasonCode('OTHER');
    setClassificationEditReasonText('');
    setClassificationEditMode(false);
  }

  async function handleSaveClassificationUpdate() {
    if (!session || !detail || detail.sample.status === 'INVALIDATED') {
      return;
    }

    const validationError = validateClassificationForm(classificationForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    const parsedReason = updateReasonSchema.safeParse({
      reasonCode: classificationEditReasonCode,
      reasonText: classificationEditReasonText
    });
    if (!parsedReason.success) {
      setError(parsedReason.error.issues[0]?.message ?? 'Justificativa invalida');
      return;
    }

    const classificationData = buildClassificationDataPayload(classificationForm);
    const technical: {
      defectsCount?: number;
      moisture?: number;
      colorAspect?: string | null;
      notes?: string | null;
    } = {};

    if (classificationData.defeito !== null) {
      technical.defectsCount = classificationData.defeito;
    }
    if (classificationData.umidade !== null) {
      technical.moisture = classificationData.umidade;
    }
    if (classificationData.aspectoCor !== null) {
      technical.colorAspect = classificationData.aspectoCor;
    }
    if (classificationData.observacoes !== null) {
      technical.notes = classificationData.observacoes;
    }

    setClassificationUpdating(true);
    setError(null);
    setMessage(null);

    try {
      await updateClassification(session, sampleId, {
        expectedVersion: detail.sample.version,
        after: {
          classificationData,
          ...(Object.keys(technical).length > 0 ? { technical } : {})
        },
        reasonCode: parsedReason.data.reasonCode,
        reasonText: parsedReason.data.reasonText
      });

      setClassificationEditMode(false);
      setClassificationEditReasonCode('OTHER');
      setClassificationEditReasonText('');
      setMessage('Edicao de classificacao salva com sucesso.');
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao salvar edicao de classificacao');
      }
    } finally {
      setClassificationUpdating(false);
    }
  }

  async function handleConfirmRevertUpdate() {
    if (!session || !detail || !revertTargetEventId) {
      return;
    }

    const parsedReason = updateReasonSchema.safeParse({
      reasonCode: revertReasonCode,
      reasonText: revertReasonText
    });
    if (!parsedReason.success) {
      setError(parsedReason.error.issues[0]?.message ?? 'Justificativa invalida');
      return;
    }

    setRevertingEdit(true);
    setError(null);
    setMessage(null);

    try {
      await revertSampleUpdate(session, sampleId, {
        expectedVersion: detail.sample.version,
        targetEventId: revertTargetEventId,
        reasonCode: parsedReason.data.reasonCode,
        reasonText: parsedReason.data.reasonText
      });

      setRevertTargetEventId(null);
      setRevertReasonCode('OTHER');
      setRevertReasonText('');
      setMessage('Edicao revertida com sucesso.');
      await loadDetail();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao reverter edicao');
      }
    } finally {
      setRevertingEdit(false);
    }
  }

  function updateClassificationField(key: keyof ClassificationFormState, value: string) {
    setClassificationForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  return (
    <AppShell session={session} onLogout={logout}>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <Link href="/dashboard">
          <button className="secondary" type="button">
            Voltar ao dashboard
          </button>
        </Link>
      </div>

      {loadingDetail ? <p>Carregando amostra...</p> : null}

      {!loadingDetail && detail ? (
        <div className="stack">
          <section className="panel stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ margin: 0 }}>{detail.sample.internalLotNumber ?? detail.sample.id}</h2>
                <p style={{ margin: '0.3rem 0 0', color: 'var(--muted)' }}>Sample ID: {detail.sample.id}</p>
              </div>
              <StatusBadge status={detail.sample.status} />
            </div>

            {error ? <p className="error">{error}</p> : null}
            {message ? <p className="success">{message}</p> : null}
          </section>

          {canInvalidateSample && detail.sample.status !== 'INVALIDATED' ? (
            <section className="panel stack">
              <h3 style={{ margin: 0 }}>Controle administrativo</h3>
              <p style={{ margin: 0, color: 'var(--muted)' }}>
                Acao restrita para ADMIN. A invalidacao encerra a amostra em status terminal.
              </p>

              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleInvalidateSample();
                }}
              >
                <label>
                  Motivo da invalidacao
                  <select
                    value={invalidateReasonCode}
                    onChange={(event) => setInvalidateReasonCode(event.target.value as InvalidateReasonCode)}
                  >
                    {INVALIDATE_REASON_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Detalhes
                  <textarea
                    rows={3}
                    value={invalidateReasonText}
                    onChange={(event) => setInvalidateReasonText(event.target.value)}
                    placeholder="Descreva o motivo da invalidacao"
                  />
                </label>

                <div className="row">
                  <button className="danger" type="submit" disabled={invalidating}>
                    {invalidating ? 'Invalidando...' : 'Invalidar amostra'}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {detail.sample.status === 'INVALIDATED' ? (
            <section className="panel stack">
              <h3 style={{ margin: 0 }}>Amostra invalidada</h3>
              <p style={{ margin: 0, color: 'var(--muted)' }}>
                Esta amostra esta em estado terminal e nao permite novas operacoes de fluxo.
              </p>
            </section>
          ) : null}

          {detail.sample.status === 'PHYSICAL_RECEIVED' ? (
            <section className="panel stack">
              <h3 style={{ margin: 0 }}>Iniciar registro</h3>
              <p style={{ margin: 0, color: 'var(--muted)' }}>
                Esta amostra chegou fisicamente e ainda nao iniciou o registro digital.
              </p>
              <div className="row">
                <button type="button" onClick={handleStartRegistration}>
                  Iniciar registro agora
                </button>
              </div>
            </section>
          ) : null}

          {(detail.sample.status === 'REGISTRATION_IN_PROGRESS' || detail.sample.status === 'REGISTRATION_CONFIRMED') && (
            <section className="grid grid-2">
              <article className="panel stack">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0 }}>Foto da etiqueta</h3>
                  <button className="secondary" onClick={() => setManualMode(true)} type="button">
                    Preencher manualmente
                  </button>
                </div>

                <p style={{ margin: 0, color: 'var(--muted)' }}>
                  Foto opcional nesta fase e recomendada como primeira acao. Depois siga com os campos de registro.
                </p>

                <label>
                  Tirar foto / enviar imagem
                  <input
                    accept="image/*"
                    capture="environment"
                    type="file"
                    onChange={(event) => setSelectedPhoto(event.target.files?.[0] ?? null)}
                  />
                </label>

                {selectedPhoto ? <p style={{ margin: 0 }}>Arquivo selecionado: {selectedPhoto.name}</p> : null}

                <div className="row">
                  <button
                    type="button"
                    onClick={handleUploadPhoto}
                    disabled={!selectedPhoto || photoUploading || detail.sample.status !== 'REGISTRATION_IN_PROGRESS'}
                  >
                    {photoUploading ? 'Salvando foto...' : 'Usar foto'}
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setSelectedPhoto(null)}
                    disabled={photoUploading || !selectedPhoto}
                  >
                    Tentar novamente
                  </button>
                </div>

                <div className="stack">
                  <strong>Fotos de chegada ({arrivalAttachments.length})</strong>
                  {arrivalAttachments.length === 0 ? (
                    <p style={{ margin: 0, color: 'var(--muted)' }}>Nenhuma foto anexada.</p>
                  ) : (
                    arrivalAttachments.map((attachment) => (
                      <p style={{ margin: 0 }} key={attachment.id}>
                        {attachment.id} - {attachment.mimeType ?? 'arquivo'}
                      </p>
                    ))
                  )}
                </div>
              </article>

              <article className="panel stack">
                <h3 style={{ margin: 0 }}>Campos manuais de registro</h3>

                {manualMode ? (
                  <form
                    className="stack"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleConfirmRegistration();
                    }}
                  >
                    <label>
                      Proprietario
                      <input value={owner} onChange={(event) => setOwner(event.target.value)} />
                    </label>

                    <label>
                      Sacas
                      <input value={sacks} onChange={(event) => setSacks(event.target.value)} inputMode="numeric" />
                    </label>

                    <label>
                      Safra
                      <input value={harvest} onChange={(event) => setHarvest(event.target.value)} placeholder="24/25" />
                    </label>

                    <label>
                      Lote de origem
                      <input value={originLot} onChange={(event) => setOriginLot(event.target.value)} />
                    </label>

                    <button
                      type="submit"
                      disabled={
                        confirming ||
                        detail.sample.status !== 'REGISTRATION_IN_PROGRESS'
                      }
                    >
                      {confirming ? 'Confirmando registro...' : 'Confirmar registro'}
                    </button>
                  </form>
                ) : null}
              </article>
            </section>
          )}

          {canEditRegistrationStatus(detail.sample.status) ? (
            <section className="panel stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>Edicao de registro (auditada)</h3>
                {!registrationEditMode ? (
                  <button type="button" onClick={startRegistrationEdit}>
                    Editar registro
                  </button>
                ) : null}
              </div>

              <p style={{ margin: 0, color: 'var(--muted)' }}>
                Todas as alteracoes ficam registradas no historico interno. Justificativa obrigatoria (maximo 10
                palavras).
              </p>

              {registrationEditMode ? (
                <form
                  className="stack"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSaveRegistrationUpdate();
                  }}
                >
                  <label>
                    Motivo da edicao
                    <select
                      value={registrationEditReasonCode}
                      onChange={(event) => setRegistrationEditReasonCode(event.target.value as UpdateReasonCode)}
                    >
                      {UPDATE_REASON_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Justificativa (maximo 10 palavras)
                    <input
                      value={registrationEditReasonText}
                      onChange={(event) => setRegistrationEditReasonText(event.target.value)}
                      placeholder="Explique a alteracao"
                    />
                  </label>

                  <div className="grid grid-2">
                    <label>
                      Proprietario
                      <input value={owner} onChange={(event) => setOwner(event.target.value)} />
                    </label>

                    <label>
                      Sacas
                      <input value={sacks} onChange={(event) => setSacks(event.target.value)} inputMode="numeric" />
                    </label>

                    <label>
                      Safra
                      <input value={harvest} onChange={(event) => setHarvest(event.target.value)} />
                    </label>

                    <label>
                      Lote de origem
                      <input value={originLot} onChange={(event) => setOriginLot(event.target.value)} />
                    </label>
                  </div>

                  <div className="row">
                    <button type="submit" disabled={registrationUpdating}>
                      {registrationUpdating ? 'Salvando edicao...' : 'Salvar edicao'}
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      onClick={cancelRegistrationEdit}
                      disabled={registrationUpdating}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <p style={{ margin: 0, color: 'var(--muted)' }}>
                  Clique em <strong>Editar registro</strong> para atualizar os campos do cadastro.
                </p>
              )}
            </section>
          ) : null}

          {(detail.sample.status === 'REGISTRATION_CONFIRMED' ||
            detail.sample.status === 'QR_PENDING_PRINT' ||
            detail.sample.status === 'QR_PRINTED' ||
            detail.sample.status === 'CLASSIFICATION_IN_PROGRESS' ||
            detail.sample.status === 'CLASSIFIED') && (
            <section className="panel stack">
              <h3 style={{ margin: 0 }}>Geracao e impressao de QR</h3>

              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <p style={{ margin: 0, color: 'var(--muted)' }}>ID interno</p>
                  <strong>{detail.sample.internalLotNumber}</strong>
                </div>
                <QRCodeCanvas value={detail.sample.internalLotNumber ?? detail.sample.id} size={156} />
              </div>

              <label>
                Impressora (opcional)
                <input value={printerId} onChange={(event) => setPrinterId(event.target.value)} />
              </label>

              <section className="panel stack">
                <h4 style={{ margin: 0 }}>Resumo de impressao</h4>
                <div className="grid grid-2">
                  <p style={{ margin: 0 }}>
                    <strong>Total impresso:</strong> {printStats.totalSuccess}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Impressao inicial:</strong> {printStats.initialSuccess}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Reimpressoes:</strong> {printStats.reprintSuccess}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Falhas:</strong> {printStats.failures}
                  </p>
                </div>
                <p style={{ margin: 0 }}>
                  <strong>Ultima impressao:</strong>{' '}
                  {printStats.lastSuccess
                    ? `${formatTimestamp(printStats.lastSuccess.occurredAt)} por ${printStats.lastSuccess.actor} (${printStats.lastSuccess.action} tentativa ${printStats.lastSuccess.attempt ?? '-'})`
                    : 'Nao registrada'}
                </p>
              </section>

              {detail.sample.status === 'REGISTRATION_CONFIRMED' ? (
                <div className="row">
                  <button type="button" onClick={handleRequestPrint} disabled={printSubmitting}>
                    {printSubmitting ? 'Solicitando...' : `Solicitar impressao (tentativa ${nextAttempt})`}
                  </button>
                </div>
              ) : null}

              {detail.sample.status === 'QR_PENDING_PRINT' ? (
                <div className="stack">
                  <label>
                    Motivo da falha
                    <input
                      value={printErrorText}
                      onChange={(event) => setPrintErrorText(event.target.value)}
                      placeholder="Ex.: sem papel"
                    />
                  </label>

                  <div className="row">
                    <button className="danger" type="button" onClick={handlePrintFailed} disabled={printSubmitting}>
                      Registrar falha
                    </button>
                    <button type="button" onClick={handleMarkPrinted} disabled={printSubmitting}>
                      Marcar como impresso
                    </button>
                  </div>
                </div>
              ) : null}

              {canRequestReprintStatus(detail.sample.status) ? (
                <section className="panel stack">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <h4 style={{ margin: 0 }}>Reimpressao</h4>
                    <p style={{ margin: 0, color: 'var(--muted)' }}>
                      Proxima tentativa: {nextReprintAttempt}
                    </p>
                  </div>

                  {activeReprintAttempt === null ? (
                    <div className="row">
                      <button type="button" onClick={handleRequestReprint} disabled={reprintSubmitting}>
                        {reprintSubmitting
                          ? 'Solicitando reimpressao...'
                          : `Imprimir novamente (tentativa ${nextReprintAttempt})`}
                      </button>
                    </div>
                  ) : (
                    <div className="stack">
                      <p style={{ margin: 0, color: 'var(--muted)' }}>
                        Reimpressao pendente na tentativa {activeReprintAttempt}. Marque sucesso ou falha.
                      </p>
                      <label>
                        Motivo da falha (opcional ate registrar)
                        <input
                          value={reprintErrorText}
                          onChange={(event) => setReprintErrorText(event.target.value)}
                          placeholder="Ex.: sem papel"
                        />
                      </label>
                      <div className="row">
                        <button
                          className="danger"
                          type="button"
                          onClick={handleReprintFailed}
                          disabled={reprintSubmitting}
                        >
                          Registrar falha reimpressao
                        </button>
                        <button type="button" onClick={handleMarkReprintPrinted} disabled={reprintSubmitting}>
                          Marcar reimpressao como impressa
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              ) : null}

              {detail.sample.status === 'QR_PRINTED' ? (
                <p className="success">QR impresso com sucesso. Amostra pronta para classificacao.</p>
              ) : null}
            </section>
          )}

          {isClassificationStatus(detail.sample.status) ? (
            <section className="panel stack" id="classification-section" ref={classificationSectionRef}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>Classificacao da amostra</h3>
                <StatusBadge status={detail.sample.status} />
              </div>

              <p style={{ margin: 0, color: 'var(--muted)' }}>
                Aqui o classificador pode iniciar, salvar rascunho e concluir classificacao. A foto da classificacao e
                obrigatoria para concluir.
              </p>

              {fromQrSource ? (
                <p className="success" style={{ margin: 0 }}>
                  Acesso por leitura de QR confirmado para esta amostra.
                </p>
              ) : null}

              <section className="grid grid-2">
                <article className="panel stack">
                  <h4 style={{ margin: 0 }}>Dados pre-cadastrados</h4>
                  <p style={{ margin: 0, color: 'var(--muted)' }}>
                    Confirmacao rapida do que foi preenchido no registro da amostra.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Proprietario:</strong> {buildReadableValue(detail.sample.declared.owner)}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Sacas:</strong> {buildReadableValue(detail.sample.declared.sacks)}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Safra:</strong> {buildReadableValue(detail.sample.declared.harvest)}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Lote de origem:</strong> {buildReadableValue(detail.sample.declared.originLot)}
                  </p>
                </article>

                <article className="panel stack">
                  <h4 style={{ margin: 0 }}>Resumo da classificacao</h4>
                  <p style={{ margin: 0 }}>
                    <strong>Versao mais recente:</strong> {detail.sample.latestClassification.version ?? 'Nao iniciado'}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Rascunho salvo:</strong>{' '}
                    {detail.sample.classificationDraft.snapshot ? 'Sim' : 'Nao'}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Preenchimento do rascunho:</strong>{' '}
                    {detail.sample.classificationDraft.completionPercent ?? 'Nao informado'}
                    {typeof detail.sample.classificationDraft.completionPercent === 'number' ? '%' : ''}
                  </p>
                </article>
              </section>

              {detail.sample.status === 'QR_PRINTED' ? (
                <div className="row">
                  <button type="button" onClick={handleStartClassification} disabled={classificationStarting}>
                    {classificationStarting ? 'Iniciando classificacao...' : 'Iniciar classificacao'}
                  </button>
                </div>
              ) : null}

              {detail.sample.status === 'CLASSIFICATION_IN_PROGRESS' ? (
                <form
                  className="stack"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleCompleteClassification();
                  }}
                >
                  <section className="panel stack">
                    <h4 style={{ margin: 0 }}>Foto da classificacao (obrigatoria)</h4>
                    <p style={{ margin: 0, color: 'var(--muted)' }}>
                      Tire ou anexe a foto da amostra classificada. Use <strong>Usar foto</strong> para salvar.
                    </p>

                    <label>
                      Captura da classificacao
                      <input
                        accept="image/*"
                        capture="environment"
                        type="file"
                        onChange={(event) => setClassificationSelectedPhoto(event.target.files?.[0] ?? null)}
                      />
                    </label>

                    {classificationSelectedPhoto ? (
                      <p style={{ margin: 0 }}>Arquivo selecionado: {classificationSelectedPhoto.name}</p>
                    ) : null}

                    <div className="row">
                      <button
                        type="button"
                        onClick={handleUploadClassificationPhoto}
                        disabled={!classificationSelectedPhoto || classificationPhotoUploading}
                      >
                        {classificationPhotoUploading ? 'Salvando foto...' : 'Usar foto'}
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => setClassificationSelectedPhoto(null)}
                        disabled={classificationPhotoUploading || !classificationSelectedPhoto}
                      >
                        Tentar novamente
                      </button>
                    </div>

                    {classificationAttachment ? (
                      <p className="success" style={{ margin: 0 }}>
                        Foto de classificacao ativa: {classificationAttachment.id}
                      </p>
                    ) : (
                      <p className="error" style={{ margin: 0 }}>
                        Nenhuma foto de classificacao salva ainda.
                      </p>
                    )}
                  </section>

                  <div className="grid grid-2">
                    <label>
                      Data da classificacao
                      <input
                        type="date"
                        value={classificationForm.dataClassificacao}
                        onChange={(event) => updateClassificationField('dataClassificacao', event.target.value)}
                      />
                    </label>

                    <label>
                      Padrao
                      <input
                        value={classificationForm.padrao}
                        onChange={(event) => updateClassificationField('padrao', event.target.value)}
                      />
                    </label>

                    <label>
                      Catacao
                      <input
                        value={classificationForm.catacao}
                        onChange={(event) => updateClassificationField('catacao', event.target.value)}
                      />
                    </label>

                    <label>
                      Aspecto
                      <input
                        value={classificationForm.aspecto}
                        onChange={(event) => updateClassificationField('aspecto', event.target.value)}
                      />
                    </label>

                    <label>
                      Bebida
                      <input
                        value={classificationForm.bebida}
                        onChange={(event) => updateClassificationField('bebida', event.target.value)}
                      />
                    </label>

                    <label>
                      Broca
                      <input
                        inputMode="decimal"
                        value={classificationForm.broca}
                        onChange={(event) => updateClassificationField('broca', event.target.value)}
                      />
                    </label>

                    <label>
                      PVA
                      <input
                        inputMode="decimal"
                        value={classificationForm.pva}
                        onChange={(event) => updateClassificationField('pva', event.target.value)}
                      />
                    </label>

                    <label>
                      IMP
                      <input
                        inputMode="decimal"
                        value={classificationForm.imp}
                        onChange={(event) => updateClassificationField('imp', event.target.value)}
                      />
                    </label>

                    <label>
                      Defeito
                      <input
                        inputMode="decimal"
                        value={classificationForm.defeito}
                        onChange={(event) => updateClassificationField('defeito', event.target.value)}
                      />
                    </label>

                    <label>
                      Umidade
                      <input
                        inputMode="decimal"
                        value={classificationForm.umidade}
                        onChange={(event) => updateClassificationField('umidade', event.target.value)}
                      />
                    </label>

                    <label>
                      Classificador
                      <input
                        value={classificationForm.classificador}
                        onChange={(event) => updateClassificationField('classificador', event.target.value)}
                      />
                    </label>

                    <label>
                      Lote de origem (classificacao)
                      <input
                        value={classificationForm.loteOrigem}
                        onChange={(event) => updateClassificationField('loteOrigem', event.target.value)}
                      />
                    </label>

                    <label>
                      Aspecto da cor
                      <input
                        value={classificationForm.aspectoCor}
                        onChange={(event) => updateClassificationField('aspectoCor', event.target.value)}
                      />
                    </label>

                    <label>
                      Percentual de preenchimento (0-100)
                      <input
                        inputMode="decimal"
                        placeholder={`Sugestao: ${classificationCompletionAuto}%`}
                        value={classificationForm.completionPercent}
                        onChange={(event) => updateClassificationField('completionPercent', event.target.value)}
                      />
                    </label>
                  </div>

                  <label>
                    Observacoes
                    <textarea
                      rows={4}
                      value={classificationForm.observacoes}
                      onChange={(event) => updateClassificationField('observacoes', event.target.value)}
                    />
                  </label>

                  <section className="panel stack">
                    <h4 style={{ margin: 0 }}>% de peneira</h4>
                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))'
                      }}
                    >
                      {SIEVE_FIELDS.map((field) => (
                        <label key={field.key}>
                          {field.label}
                          <input
                            inputMode="decimal"
                            value={classificationForm[field.key]}
                            onChange={(event) => updateClassificationField(field.key, event.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="panel stack">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <h4 style={{ margin: 0 }}>Edicao auditada</h4>
                      {!classificationEditMode ? (
                        <button type="button" className="secondary" onClick={startClassificationEdit}>
                          Editar classificacao
                        </button>
                      ) : null}
                    </div>

                    {classificationEditMode ? (
                      <>
                        <label>
                          Motivo da edicao
                          <select
                            value={classificationEditReasonCode}
                            onChange={(event) => setClassificationEditReasonCode(event.target.value as UpdateReasonCode)}
                          >
                            {UPDATE_REASON_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          Justificativa (maximo 10 palavras)
                          <input
                            value={classificationEditReasonText}
                            onChange={(event) => setClassificationEditReasonText(event.target.value)}
                            placeholder="Explique a alteracao"
                          />
                        </label>

                        <div className="row">
                          <button
                            type="button"
                            onClick={handleSaveClassificationUpdate}
                            disabled={classificationUpdating || classificationSaving || classificationCompleting}
                          >
                            {classificationUpdating ? 'Salvando edicao...' : 'Salvar edicao auditada'}
                          </button>
                          <button
                            className="secondary"
                            type="button"
                            onClick={cancelClassificationEdit}
                            disabled={classificationUpdating || classificationSaving || classificationCompleting}
                          >
                            Cancelar
                          </button>
                        </div>
                      </>
                    ) : (
                      <p style={{ margin: 0, color: 'var(--muted)' }}>
                        Para registrar alteracoes com motivo, clique em <strong>Editar classificacao</strong>.
                      </p>
                    )}
                  </section>

                  <div className="row">
                    <button
                      className="secondary"
                      type="button"
                      onClick={handleSaveClassificationPartial}
                      disabled={classificationSaving || classificationCompleting}
                    >
                      {classificationSaving ? 'Salvando rascunho...' : 'Salvar parcial'}
                    </button>
                    <button
                      type="submit"
                      disabled={
                        classificationCompleting ||
                        classificationSaving ||
                        !classificationAttachment ||
                        classificationPhotoUploading ||
                        Boolean(classificationSelectedPhoto)
                      }
                    >
                      {classificationCompleting ? 'Concluindo classificacao...' : 'Concluir classificacao'}
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => updateClassificationField('completionPercent', String(classificationCompletionAuto))}
                      disabled={classificationSaving || classificationCompleting}
                    >
                      Aplicar % sugerido
                    </button>
                  </div>
                </form>
              ) : null}

              {detail.sample.status === 'CLASSIFIED' ? (
                <section className="panel stack">
                  <section className="panel stack">
                    <h4 style={{ margin: 0 }}>Exportar laudo PDF</h4>
                    <p style={{ margin: 0, color: 'var(--muted)' }}>
                      Escolha o tipo de exportacao. O sistema aplica automaticamente os campos permitidos para cada
                      tipo e remove do laudo os campos sem valor preenchido.
                    </p>
                    <p style={{ margin: 0, color: 'var(--muted)' }}>
                      Em todos os tipos, o laudo omite o ID interno da amostra e qualquer Lote de origem.
                    </p>

                    <p style={{ margin: 0, color: 'var(--muted)' }}>
                      <strong>Completo:</strong> exporta todos os campos preenchidos permitidos no laudo.
                    </p>
                    <p style={{ margin: 0, color: 'var(--muted)' }}>
                      <strong>Comprador Parcial:</strong> exporta os campos preenchidos, exceto <strong>Proprietario</strong>.
                    </p>

                    <div className="row">
                      <button
                        type="button"
                        onClick={() => handleOpenExportConfirmation('COMPLETO')}
                        disabled={Boolean(exportingPdfType) || !classificationAttachment}
                      >
                        {exportingPdfType === 'COMPLETO' ? 'Gerando Completo...' : 'Exportar Completo'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenExportConfirmation('COMPRADOR_PARCIAL')}
                        disabled={Boolean(exportingPdfType) || !classificationAttachment}
                      >
                        {exportingPdfType === 'COMPRADOR_PARCIAL'
                          ? 'Gerando Comprador Parcial...'
                          : 'Exportar Comprador Parcial'}
                      </button>
                    </div>
                  </section>

                  <h4 style={{ margin: 0 }}>Classificacao final</h4>
                  <p style={{ margin: 0 }}>
                    <strong>Foto da classificacao:</strong>{' '}
                    {classificationAttachment ? classificationAttachment.id : 'Nao localizada'}
                  </p>
                  {latestClassificationData ? (
                    <>
                      <div className="grid grid-2">
                        <p style={{ margin: 0 }}>
                          <strong>Data:</strong> {buildReadableValue(latestClassificationData.dataClassificacao)}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>Padrao:</strong> {buildReadableValue(latestClassificationData.padrao)}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>Catacao:</strong> {buildReadableValue(latestClassificationData.catacao)}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>Aspecto:</strong> {buildReadableValue(latestClassificationData.aspecto)}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>Bebida:</strong> {buildReadableValue(latestClassificationData.bebida)}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>Broca:</strong> {buildReadableValue(latestClassificationData.broca)}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>PVA:</strong> {buildReadableValue(latestClassificationData.pva)}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>IMP:</strong> {buildReadableValue(latestClassificationData.imp)}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>Defeito:</strong> {buildReadableValue(latestClassificationData.defeito)}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>Umidade:</strong> {buildReadableValue(latestClassificationData.umidade)}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>Classificador:</strong> {buildReadableValue(latestClassificationData.classificador)}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>Lote de origem:</strong> {buildReadableValue(latestClassificationData.loteOrigem)}
                        </p>
                      </div>

                      <p style={{ margin: 0 }}>
                        <strong>Aspecto da cor:</strong> {buildReadableValue(latestClassificationData.aspectoCor)}
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong>Observacoes:</strong> {buildReadableValue(latestClassificationData.observacoes)}
                      </p>

                      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                        <p style={{ margin: 0 }}>
                          <strong>P18:</strong>{' '}
                          {buildReadableValue(
                            isRecord(latestClassificationData.peneirasPercentuais)
                              ? latestClassificationData.peneirasPercentuais.p18
                              : null
                          )}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>P17:</strong>{' '}
                          {buildReadableValue(
                            isRecord(latestClassificationData.peneirasPercentuais)
                              ? latestClassificationData.peneirasPercentuais.p17
                              : null
                          )}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>P16:</strong>{' '}
                          {buildReadableValue(
                            isRecord(latestClassificationData.peneirasPercentuais)
                              ? latestClassificationData.peneirasPercentuais.p16
                              : null
                          )}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>MK:</strong>{' '}
                          {buildReadableValue(
                            isRecord(latestClassificationData.peneirasPercentuais)
                              ? latestClassificationData.peneirasPercentuais.mk
                              : null
                          )}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>P15:</strong>{' '}
                          {buildReadableValue(
                            isRecord(latestClassificationData.peneirasPercentuais)
                              ? latestClassificationData.peneirasPercentuais.p15
                              : null
                          )}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>P14:</strong>{' '}
                          {buildReadableValue(
                            isRecord(latestClassificationData.peneirasPercentuais)
                              ? latestClassificationData.peneirasPercentuais.p14
                              : null
                          )}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>P13:</strong>{' '}
                          {buildReadableValue(
                            isRecord(latestClassificationData.peneirasPercentuais)
                              ? latestClassificationData.peneirasPercentuais.p13
                              : null
                          )}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>P10:</strong>{' '}
                          {buildReadableValue(
                            isRecord(latestClassificationData.peneirasPercentuais)
                              ? latestClassificationData.peneirasPercentuais.p10
                              : null
                          )}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>Fundo:</strong>{' '}
                          {buildReadableValue(
                            isRecord(latestClassificationData.peneirasPercentuais)
                              ? latestClassificationData.peneirasPercentuais.fundo
                              : null
                          )}
                        </p>
                      </div>
                    </>
                  ) : (
                    <p style={{ margin: 0, color: 'var(--muted)' }}>
                      Classificacao concluida, mas sem dados detalhados no snapshot atual.
                    </p>
                  )}
                </section>
              ) : null}
            </section>
          ) : null}

          {detail.sample.status !== 'INVALIDATED' && detail.sample.status !== 'CLASSIFICATION_IN_PROGRESS' ? (
            <section className="panel stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>Edicao de classificacao (auditada)</h3>
                {!classificationEditMode ? (
                  <button type="button" onClick={startClassificationEdit}>
                    Editar classificacao
                  </button>
                ) : null}
              </div>

              <p style={{ margin: 0, color: 'var(--muted)' }}>
                Disponivel em todos os status ativos. A justificativa e obrigatoria e registrada no historico interno.
              </p>

              {classificationEditMode ? (
                <form
                  className="stack"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSaveClassificationUpdate();
                  }}
                >
                  <label>
                    Motivo da edicao
                    <select
                      value={classificationEditReasonCode}
                      onChange={(event) => setClassificationEditReasonCode(event.target.value as UpdateReasonCode)}
                    >
                      {UPDATE_REASON_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Justificativa (maximo 10 palavras)
                    <input
                      value={classificationEditReasonText}
                      onChange={(event) => setClassificationEditReasonText(event.target.value)}
                      placeholder="Explique a alteracao"
                    />
                  </label>

                  <div className="grid grid-2">
                    <label>
                      Data da classificacao
                      <input
                        type="date"
                        value={classificationForm.dataClassificacao}
                        onChange={(event) => updateClassificationField('dataClassificacao', event.target.value)}
                      />
                    </label>

                    <label>
                      Padrao
                      <input
                        value={classificationForm.padrao}
                        onChange={(event) => updateClassificationField('padrao', event.target.value)}
                      />
                    </label>

                    <label>
                      Catacao
                      <input
                        value={classificationForm.catacao}
                        onChange={(event) => updateClassificationField('catacao', event.target.value)}
                      />
                    </label>

                    <label>
                      Aspecto
                      <input
                        value={classificationForm.aspecto}
                        onChange={(event) => updateClassificationField('aspecto', event.target.value)}
                      />
                    </label>

                    <label>
                      Bebida
                      <input
                        value={classificationForm.bebida}
                        onChange={(event) => updateClassificationField('bebida', event.target.value)}
                      />
                    </label>

                    <label>
                      Broca
                      <input
                        inputMode="decimal"
                        value={classificationForm.broca}
                        onChange={(event) => updateClassificationField('broca', event.target.value)}
                      />
                    </label>

                    <label>
                      PVA
                      <input
                        inputMode="decimal"
                        value={classificationForm.pva}
                        onChange={(event) => updateClassificationField('pva', event.target.value)}
                      />
                    </label>

                    <label>
                      IMP
                      <input
                        inputMode="decimal"
                        value={classificationForm.imp}
                        onChange={(event) => updateClassificationField('imp', event.target.value)}
                      />
                    </label>

                    <label>
                      Defeito
                      <input
                        inputMode="decimal"
                        value={classificationForm.defeito}
                        onChange={(event) => updateClassificationField('defeito', event.target.value)}
                      />
                    </label>

                    <label>
                      Umidade
                      <input
                        inputMode="decimal"
                        value={classificationForm.umidade}
                        onChange={(event) => updateClassificationField('umidade', event.target.value)}
                      />
                    </label>

                    <label>
                      Classificador
                      <input
                        value={classificationForm.classificador}
                        onChange={(event) => updateClassificationField('classificador', event.target.value)}
                      />
                    </label>

                    <label>
                      Lote de origem (classificacao)
                      <input
                        value={classificationForm.loteOrigem}
                        onChange={(event) => updateClassificationField('loteOrigem', event.target.value)}
                      />
                    </label>

                    <label>
                      Aspecto da cor
                      <input
                        value={classificationForm.aspectoCor}
                        onChange={(event) => updateClassificationField('aspectoCor', event.target.value)}
                      />
                    </label>
                  </div>

                  <label>
                    Observacoes
                    <textarea
                      rows={4}
                      value={classificationForm.observacoes}
                      onChange={(event) => updateClassificationField('observacoes', event.target.value)}
                    />
                  </label>

                  <section className="panel stack">
                    <h4 style={{ margin: 0 }}>% de peneira</h4>
                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))'
                      }}
                    >
                      {SIEVE_FIELDS.map((field) => (
                        <label key={field.key}>
                          {field.label}
                          <input
                            inputMode="decimal"
                            value={classificationForm[field.key]}
                            onChange={(event) => updateClassificationField(field.key, event.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  </section>

                  <div className="row">
                    <button type="submit" disabled={classificationUpdating}>
                      {classificationUpdating ? 'Salvando edicao...' : 'Salvar edicao'}
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      onClick={cancelClassificationEdit}
                      disabled={classificationUpdating}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <p style={{ margin: 0, color: 'var(--muted)' }}>
                  Clique em <strong>Editar classificacao</strong> para atualizar os campos e registrar o motivo.
                </p>
              )}
            </section>
          ) : null}

          {revertTargetEventId ? (
            <section className="panel stack">
              <h3 style={{ margin: 0 }}>Reverter edicao</h3>
              <p style={{ margin: 0, color: 'var(--muted)' }}>
                Informe o motivo da reversao. Isso gera um novo evento de auditoria.
              </p>

              <label>
                Motivo da reversao
                <select value={revertReasonCode} onChange={(event) => setRevertReasonCode(event.target.value as UpdateReasonCode)}>
                  {UPDATE_REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Justificativa (maximo 10 palavras)
                <input
                  value={revertReasonText}
                  onChange={(event) => setRevertReasonText(event.target.value)}
                  placeholder="Explique a reversao"
                />
              </label>

              <div className="row">
                <button type="button" onClick={handleConfirmRevertUpdate} disabled={revertingEdit}>
                  {revertingEdit ? 'Revertendo...' : 'Confirmar reversao'}
                </button>
                <button
                  className="secondary"
                  type="button"
                  disabled={revertingEdit}
                  onClick={() => {
                    setRevertTargetEventId(null);
                    setRevertReasonCode('OTHER');
                    setRevertReasonText('');
                  }}
                >
                  Cancelar
                </button>
              </div>
            </section>
          ) : null}

          <section className="panel stack">
            <h3 style={{ margin: 0 }}>Historico completo da amostra</h3>
            <p style={{ margin: 0, color: 'var(--muted)' }}>
              Colunas: data/hora, usuario, campo, valor anterior, valor novo e motivo.
            </p>

            {historyRows.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--muted)' }}>Nenhum evento registrado.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Data/Hora</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Usuario</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Evento</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Campo</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Antes</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Depois</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Motivo</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row, index) => (
                      <tr key={`${row.eventId}-${row.field}-${index}`} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <td style={{ padding: '0.5rem', verticalAlign: 'top' }}>{formatTimestamp(row.occurredAt)}</td>
                        <td style={{ padding: '0.5rem', verticalAlign: 'top' }}>{row.actor}</td>
                        <td style={{ padding: '0.5rem', verticalAlign: 'top' }}>{row.eventLabel}</td>
                        <td style={{ padding: '0.5rem', verticalAlign: 'top' }}>{row.field}</td>
                        <td style={{ padding: '0.5rem', verticalAlign: 'top' }}>{row.before}</td>
                        <td style={{ padding: '0.5rem', verticalAlign: 'top' }}>{row.after}</td>
                        <td style={{ padding: '0.5rem', verticalAlign: 'top' }}>{row.reason}</td>
                        <td style={{ padding: '0.5rem', verticalAlign: 'top' }}>
                          {row.reversible && row.showRevertAction ? (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                setRevertTargetEventId(row.eventId);
                                setRevertReasonCode('OTHER');
                                setRevertReasonText('');
                              }}
                            >
                              Reverter
                            </button>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
      ) : null}

      {exportConfirmationOpen && pendingExportType ? (
        <div
          className="export-confirm-backdrop"
          onClick={() => {
            handleCloseExportConfirmation();
          }}
        >
          <section
            className="export-confirm-modal panel stack"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-confirm-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="export-confirm-modal-title" style={{ margin: 0 }}>
              Confirmar exportacao de laudo
            </h3>

            <p style={{ margin: 0, color: 'var(--muted)' }}>
              Voce esta prestes a exportar o laudo no tipo <strong>{getExportTypeLabel(pendingExportType)}</strong>.
              Essa acao gera o arquivo e registra o evento de auditoria da exportacao.
            </p>

            <label>
              Destinatario (opcional, recomendado)
              <input
                value={exportDestination}
                onChange={(event) => setExportDestination(event.target.value)}
                placeholder="Ex.: Comprador XPTO / email / setor"
                disabled={Boolean(exportingPdfType)}
              />
            </label>

            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.86rem' }}>
              Se informado, o destinatario sera salvo junto da auditoria da exportacao.
            </p>

            <div className="row">
              <button
                className="secondary"
                type="button"
                onClick={handleCloseExportConfirmation}
                disabled={Boolean(exportingPdfType)}
              >
                Nao
              </button>
              <button type="button" onClick={handleConfirmExportFromModal} disabled={Boolean(exportingPdfType)}>
                {Boolean(exportingPdfType) ? 'Exportando...' : 'Confirmar exportacao'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
