'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { BottomSheet } from '../BottomSheet';
import { OriginLotChips } from '../OriginLotChips';
import { PhotoZoomViewer } from '../PhotoZoomViewer';
import { SkeletonDetail } from '../Skeleton';
import { SuccessCheckOverlay, SUCCESS_CHECK_MS } from '../SuccessCheckOverlay';
import {
  buildReadableValue,
  ownerDisplayValue,
  sampleStatusDisplay,
} from '../../lib/sample-display';
import { ClientLookupField } from '../clients/ClientLookupField';
import { ClientQuickCreateModal } from '../clients/ClientQuickCreateModal';
import { BlendBadge } from '../samples/BlendBadge';
import { BlendHarvestPropagationModal } from '../samples/BlendHarvestPropagationModal';
import { HarvestDisplay } from '../samples/HarvestDisplay';
import { BlendRevertModal } from '../samples/BlendRevertModal';
import { RelatedSampleRow } from '../samples/RelatedSampleRow';
import { SampleInvalidateBlockedModal } from '../samples/SampleInvalidateBlockedModal';
import { SampleLabelPrintSheet } from '../samples/SampleLabelPrintSheet';
import { SampleMovementsPanel } from '../samples/SampleMovementsPanel';
import { SampleSendFlow } from '../samples/SampleSendFlow';
import {
  ApiError,
  cancelSampleMovement,
  getBlendFeasibility,
  getSampleDetail,
  invalidateSample,
  listSampleEvents,
  listSampleMovements,
  lookupUsersForReference,
  revertBlend,
  updateClassification,
  updatePhysicalSampleSend,
  updateRegistration,
} from '../../lib/api-client';
import {
  invalidateSampleSchema,
  registrationFormSchema,
  updateReasonSchema,
} from '../../lib/form-schemas';
import { useCameraSheet } from '../../lib/camera-sheet/CameraSheetProvider';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { useRevalidate } from '../../lib/revalidation/use-revalidate';
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
  SessionData,
  UpdateReasonCode,
  UserLookupItem,
  SampleStatus,
} from '../../lib/types';
import {
  type ClassificationFormState,
  CLASSIFICATION_TYPE_LABEL,
  EMPTY_CLASSIFICATION_FORM,
  validateClassificationForm,
  buildClassificationDataPayload,
} from '../../lib/classification-form';
import { formatPercentDisplay } from '../../lib/classification-format';

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

// CAM-P3 / camada do contexto: o `CameraSheetProvider` e montado DENTRO do
// `AppShell` (envolve os children). Na epoca de pagina, o componente de rota
// RENDERIZAVA o AppShell e vivia ACIMA do provider — chamar `useCameraSheet()`
// no corpo estourava "useCameraSheet deve ser usado dentro de
// <CameraSheetProvider>" e derrubava o detalhe inteiro (bug b2e75b2), dai os
// gatilhos virarem satelites que consomem o contexto ja dentro dos children.
// Desde a F2 o `SampleDetailView` vive no overlay de /samples (children do
// AppShell) e consome o contexto direto — o botao Classificar/Reclassificar do
// hero (FV) abre a camera dali. Este satelite ficou pro modal de confirmacao,
// que dispara a reclassificacao de dentro de um portal.
function ReclassifySampleButton({
  sampleId,
  onBeforeOpen,
}: {
  sampleId: string;
  onBeforeOpen: () => void;
}) {
  const cameraSheet = useCameraSheet();
  return (
    <button
      type="button"
      className="app-modal-submit"
      onClick={() => {
        // CAM-P3: reclassificacao abre o sheet global em Flow B (sem sair do
        // detalhe). O fechamento dos modais fica com o pai via onBeforeOpen.
        onBeforeOpen();
        cameraSheet.open({ sampleId });
      }}
    >
      Reclassificar
    </button>
  );
}

function NoticeSlot({ notice }: { notice: Notice }) {
  return (
    <div className="notice-slot" aria-live="polite">
      {notice ? <p className={`notice-slot-text is-${notice.kind}`}>{notice.text}</p> : null}
    </div>
  );
}

// RD16 M3: a linha de fatos do hero (o PAPEL do cliente dono — Vendedor /
// Comprador / Armazem) SAIU. Papel e atributo do cliente, nao do lote: quem
// abre o detalhe do lote quer o lote. O papel segue nos chips do drawer do
// cliente, que e onde ele significa alguma coisa.

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

/** Acao profunda do menu ⋯ da tabela (FV): ?acao= da URL de /samples. */
export type SampleDetailInitialAction = 'imprimir' | 'deletar';

/** Abas do detalhe (FV RD15). */
type SampleDetailTab = 'overview' | 'classificacao' | 'movimentacoes';

interface SampleDetailViewProps {
  session: SessionData;
  sampleId: string;
  /** Fecha o overlay-pai (saida programatica pos-invalidacao/reversao). */
  onClose: () => void;
  /** Troca o lote aberto no overlay (links detalhe→detalhe). */
  onOpenSample?: (sampleId: string) => void;
  /** Sinaliza ao overlay-pai que ha modal interno aberto (bloqueia ESC/X). */
  dismissGuardRef?: MutableRefObject<boolean>;
  /** FV: abre o modal correspondente UMA vez apos o load (?acao= da URL). */
  initialAction?: SampleDetailInitialAction;
  /** Chamado ao consumir a acao — a pagina limpa o ?acao= via replace. */
  onInitialActionConsumed?: () => void;
  /** F3: "Enviar amostra" do ⋯ do hero — a PAGINA hidrata e abre o fluxo. */
  onRequestSend?: (sampleId: string) => void;
  /** F3: "Registrar perda" do ⋯ do hero — idem. */
  onRequestLoss?: (sampleId: string) => void;
  /** F3: contador que a pagina incrementa quando um fluxo DELA muda o lote
   *  (envio/perda abertos pelo ⋯ do hero). Toda mudanca refaz o fetch. */
  externalRefreshKey?: number;
}

// Conteudo completo do detalhe do lote, extraido da antiga pagina
// /samples/[sampleId] (F2 do redesign, RD8). Sem guard nem chrome de pagina:
// vive DENTRO do DetailOverlay de /samples (?lote=), que ja garante sessao e
// papel — a rota antiga e so um redirect.
export function SampleDetailView({
  session,
  sampleId,
  onClose,
  onOpenSample,
  dismissGuardRef,
  initialAction,
  onInitialActionConsumed,
  onRequestSend,
  onRequestLoss,
  externalRefreshKey = 0,
}: SampleDetailViewProps) {
  const searchParams = useSearchParams();
  const highlightPrint = searchParams.get('highlight') === 'print';
  const [reclassifyModalOpen, setReclassifyModalOpen] = useState(false);

  const [detail, setDetail] = useState<SampleDetailResponse | null>(null);
  const detailRef = useRef<SampleDetailResponse | null>(null);
  // FV (RD15): o detalhe virou 3 abas. Visao geral = informacoes + resumo
  // comercial + liga; Classificacao = a ficha; Movimentacoes = a timeline.
  const [activeTab, setActiveTab] = useState<SampleDetailTab>('overview');
  // Foco vindo de fora (?focus=): dashboard manda `movimentacoes`/`informacoes`
  // e o QR do laudo manda `classification`. Com as abas (FV RD15) ele deixa de
  // rolar ate a ancora e passa a SELECIONAR a aba, uma unica vez, assim que o
  // detalhe carrega — `classification` ganha efeito (antes caia no vazio).
  const focusAppliedRef = useRef(false);
  useEffect(() => {
    if (focusAppliedRef.current || !detail) {
      return;
    }
    const focus = searchParams.get('focus');
    const targetTab: SampleDetailTab | null =
      focus === 'movimentacoes'
        ? 'movimentacoes'
        : focus === 'classification'
          ? 'classificacao'
          : focus === 'informacoes'
            ? 'overview'
            : null;
    if (!targetTab) {
      return;
    }
    focusAppliedRef.current = true;
    setActiveTab(targetTab);
  }, [detail, searchParams]);
  // Liga B4 Fase 7: viabilidade da liga (flag derivado "liga inviavel").
  // Buscado so pra liga ainda vendavel; null pra amostra normal ou em erro.
  const [blendFeasibility, setBlendFeasibility] = useState<BlendFeasibilityResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [pageNotice, setPageNotice] = useState<Notice>(null);
  const [generalNotice, setGeneralNotice] = useState<Notice>(null);
  const [registrationModalNotice, setRegistrationModalNotice] = useState<Notice>(null);
  const [invalidateModalNotice, setInvalidateModalNotice] = useState<Notice>(null);

  const [classificationImageModalOpen, setClassificationImageModalOpen] = useState(false);
  // Links detalhe→detalhe: no overlay trocam o lote via callback (replace do
  // ?lote=); o href aponta pra lista com o param — deep-link equivalente.
  const openSampleHref = (id: string) => `/samples?lote=${id}`;
  const [printHighlighted, setPrintHighlighted] = useState(false);

  // FV: menu ⋯ do hero (acoes que nao viraram botao redondo). Dismiss =
  // clique-fora + ESC em CAPTURE devolvendo o foco ao trigger — sem o capture
  // o ESC vazaria pro overlay e fecharia o lote junto (molde do hero do
  // cliente e do menu de linha da tabela).
  const [heroMenuOpen, setHeroMenuOpen] = useState(false);
  const heroMenuRef = useRef<HTMLDivElement | null>(null);
  const heroMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!heroMenuOpen) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!heroMenuRef.current?.contains(target)) {
        setHeroMenuOpen(false);
      }
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setHeroMenuOpen(false);
      heroMenuTriggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown, true);
    };
  }, [heroMenuOpen]);
  // Envio: a EDICAO virou dropdown inline na propria timeline (dois campos —
  // pequena demais pra um painel); aqui fica so qual envio esta aberto, pra
  // entrar no detailBusy. O CANCELAMENTO (destrutivo) segue no SampleSendFlow.
  // O envio NOVO migrou p/ o card da lista (/samples).
  const [editSendEventId, setEditSendEventId] = useState<string | null>(null);
  const [cancelSendId, setCancelSendId] = useState<string | null>(null);

  // Lote editavel: edicao da data de chegada (createdAt do lote) pelo item
  // "Registro" da timeline. Como o envio, virou dropdown INLINE no card — aqui
  // fica so o "esta aberto?", pra entrar no detailBusy.
  const [dateEditOpen, setDateEditOpen] = useState(false);

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

  const [labelModalOpen, setLabelModalOpen] = useState(false);
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
  const classificationSaveConfirmTrapRef = useFocusTrap(classificationSaveConfirmOpen);
  const classificationPhotoSectionRef = useRef<HTMLDivElement | null>(null);
  // LDT-A4: o modal de reclassificar estava sem foco preso. (Edicao, data,
  // impressao e exclusao viraram paineis na F3 — o BottomSheet ja prende.)
  const reclassifyTrapRef = useFocusTrap(reclassifyModalOpen);
  const lastQuickPrintButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastInvalidateTriggerRef = useRef<HTMLButtonElement | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const canInvalidateSample = Boolean(session);
  const hasActiveMovements = Boolean(
    detail && ((detail.sample.soldSacks ?? 0) > 0 || (detail.sample.lostSacks ?? 0) > 0)
  );
  // RC-D87: o painel "Deletar lote" só age sobre PERDA. A venda que aparecer na
  // lista é informação — ela se desfaz pelo Washout do contrato, e o serviço recusa
  // por aqui (409 MOVEMENT_HAS_CONTRACT). Na prática a venda nem chega: o item do ⋯
  // exige `soldSacks === 0`. O filtro é a rede para o que escapar disso.
  const activeLossMovements = (activeMovements ?? []).filter(
    (movement) => movement.movementType === 'LOSS'
  );
  const hasActiveSaleMovement = (activeMovements ?? []).some(
    (movement) => movement.movementType === 'SALE'
  );
  // RC-D88 (endurece a RC-D41): o vendedor do contrato É o dono do lote (RC-D37) e
  // o snapshot do vendedor é reescrito a cada save do contrato. Até aqui trocar o
  // dono era permitido e a UI só AVISAVA da consequência — um aviso que dependia de
  // ser lido. Agora o campo congela e o servidor recusa (409). O que vale é ter
  // contrato, não ter venda: venda por caminho baixo (import) não emite contrato.
  const lockedByContract = detail?.saleContract ?? null;
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

  // F3 (decisao 12): envio e perda tambem no ⋯ do hero. Mesmo gating da linha
  // da tabela (`describeSampleRow`): operacao comercial exige registro
  // confirmado ou classificado, e a perda ainda exige saldo.
  const commercialActionsAllowed = Boolean(
    detail &&
    (detail.sample.status === 'REGISTRATION_CONFIRMED' || detail.sample.status === 'CLASSIFIED')
  );
  const canSendFromHero = Boolean(onRequestSend) && commercialActionsAllowed;
  const canLossFromHero =
    Boolean(onRequestLoss) && commercialActionsAllowed && (detail?.sample.availableSacks ?? 0) > 0;

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
        // Quem desliga o "carregando" e o request ATUAL, seja ele qual for —
        // nao "quem ligou a flag". Historico das duas versoes erradas:
        //
        // 1. `if (!aborted)` — o carregamento inicial e abortado por qualquer
        //    refetch que chegue no meio, entao a flag ficava presa em true e o
        //    painel abria em BRANCO (nenhum ramo do render cobria
        //    `loadingDetail && detail`).
        // 2. `if (shouldShowLoading)` — o inicial, ao ser abortado, desligava a
        //    flag enquanto o refetch que o substituiu (silencioso, sem
        //    showLoading) ainda estava no ar: caiamos em `!detail &&
        //    !loadingDetail`, que e o ramo de ERRO, e o "Tentar de novo"
        //    piscava a toa em toda abertura (o remount do StrictMode aborta o
        //    primeiro fetch por construcao).
        //
        // Com a checagem do controller atual: quem foi substituido nao mexe na
        // flag (o substituto e que responde por ela) e quem termina como atual
        // sempre desliga. Assim "carregando" cobre TODA a janela em que ha
        // request no ar, e o erro so aparece quando de fato acabou sem dados.
        if (fetchAbortRef.current === controller) {
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
    editSendEventId !== null ||
    cancelSendId !== null;
  const detailBusyRef = useRef(detailBusy);
  detailBusyRef.current = detailBusy;
  // F2 do redesign: espelha o "tem modal/acao aberta" pro overlay-pai — ESC/X
  // do DetailOverlay nao fecham o detalhe no meio de uma acao (molde do
  // anyModalOpen->dismissGuardRef do ClientDetailView, F1).
  useEffect(() => {
    if (!dismissGuardRef) return;
    dismissGuardRef.current = detailBusy;
    return () => {
      dismissGuardRef.current = false;
    };
  }, [dismissGuardRef, detailBusy]);
  const revalidateDetail = useCallback(() => {
    if (detailBusyRef.current) return;
    void refreshDetail();
  }, [refreshDetail]);
  // F2c: o sheet global da camera FECHOU (true→false) → rebusca o detalhe.
  // Classificacao/reclassificacao acontecem SOBRE o overlay e o provider nao
  // tem callback de "classificado" — sem isto, so o poll passivo (60s)
  // refletia a classificacao recem-feita. Fechar sem classificar gera um
  // refetch a toa, inofensivo (silencioso).
  // FV: o hero tambem ABRE a camera (botao Classificar/Reclassificar), entao o
  // contexto inteiro entra aqui — nao so o `isOpen`.
  const cameraSheet = useCameraSheet();
  const cameraSheetOpen = cameraSheet.isOpen;
  const cameraWasOpenRef = useRef(false);
  useEffect(() => {
    if (cameraWasOpenRef.current && !cameraSheetOpen) {
      void refreshDetail();
    }
    cameraWasOpenRef.current = cameraSheetOpen;
  }, [cameraSheetOpen, refreshDetail]);
  const detailStatus = detail?.sample.status;
  // O detalhe mostra o lote e o cliente/dono. O `revalidateDetail` ja tem guard
  // de `detailBusyRef`, entao a publicacao das proprias acoes daqui (envio,
  // perda, invalidacao, edicao) nao vira busca duplicada.
  useRevalidate({
    subjects: ['lotes', 'clientes'],
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

  // F3: impressao e exclusao viraram PAINEIS — o BottomSheet cuida de scroll
  // lock, ESC (pela pilha de sheets) e foco. Sobrou devolver o foco ao botao
  // que abriu, que o sheet nao conhece.
  useEffect(() => {
    if (labelModalOpen) return;
    // setTimeout: o sheet ainda esta animando a saida com o focus-trap ativo;
    // focar no mesmo tick seria roubado de volta.
    const timer = window.setTimeout(() => lastQuickPrintButtonRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [labelModalOpen]);

  useEffect(() => {
    if (invalidateModalOpen) return;
    const timer = window.setTimeout(() => lastInvalidateTriggerRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [invalidateModalOpen]);

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

  // Salvamento do editor inline de envio (timeline). Lanca em caso de falha —
  // quem mostra a mensagem e o proprio editor, dentro do card.
  const submitSendEdit = useCallback(
    async (sendEventId: string, input: { recipientClientId: string | null; sentDate: string }) => {
      await updatePhysicalSampleSend(session, sampleId, sendEventId, input);
      setEditSendEventId(null);
      await fetchSendHistory();
    },
    [session, sampleId, fetchSendHistory]
  );

  // F3: envio e perda disparados pelo ⋯ do hero rodam em componentes da
  // PAGINA (mesmo fluxo da lista) — ela avisa por aqui que o lote mudou.
  const firstExternalRefreshRef = useRef(true);
  useEffect(() => {
    if (firstExternalRefreshRef.current) {
      firstExternalRefreshRef.current = false;
      return;
    }
    void refreshDetail();
    void fetchSendHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalRefreshKey]);

  const sendHistoryItems = useMemo(() => projectSendHistoryItems(sendHistory), [sendHistory]);

  function closeLabelModal() {
    setLabelModalOpen(false);
  }

  // FV (acoes profundas do menu ⋯ da tabela): dispara o modal UMA vez quando o
  // lote termina de carregar e devolve o consumo pra pagina limpar a URL. O ref
  // reseta quando a prop limpa (value -> undefined), permitindo uma nova acao
  // no MESMO lote montado (sem remount). Molde do ClientDetailView.
  const initialActionConsumedRef = useRef(false);
  useEffect(() => {
    if (!initialAction) {
      initialActionConsumedRef.current = false;
      return;
    }
    if (!detail || initialActionConsumedRef.current) return;
    initialActionConsumedRef.current = true;
    if (initialAction === 'imprimir') {
      openLabelReviewModal();
    } else if (canInvalidateNormal) {
      setInvalidateModalOpen(true);
    }
    onInitialActionConsumed?.();
    // openLabelReviewModal e uma funcao do corpo do componente (recriada a cada
    // render); as deps relevantes sao a acao e a chegada do detalhe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction, detail, canInvalidateNormal]);

  function openLabelReviewModal(trigger?: HTMLButtonElement) {
    if (!detail) {
      return;
    }

    if (trigger) {
      lastQuickPrintButtonRef.current = trigger;
    }

    setGeneralNotice(null);
    setLabelModalOpen(true);
  }

  // Mostra o efeito de X vermelho (~1.3s) e, se pedido, fecha o overlay
  // (volta pra lista). Substitui as mensagens verdes de sucesso de
  // invalidacao/cancelamento.
  function showXEffect(label: string, redirectToList: boolean) {
    setXEffect(label);
    window.setTimeout(() => {
      if (redirectToList) {
        onClose();
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

  // RC-D87: as duas funcoes abaixo cancelavam TODAS as movimentacoes ativas em laco
  // — e cancelar uma VENDA quebra o contrato ligado a ela sem passar pela pergunta
  // de corretagem da RC-D89. Elas voltaram restritas a PERDA (`activeLossMovements`),
  // que nao tem contrato nenhum: uma perda registrada por engano precisava de
  // desfazer, e sem ele o lote tambem ficava sem como ser deletado. A venda continua
  // sendo desfeita so pelo Washout do contrato — o servico recusa o resto (409
  // MOVEMENT_HAS_CONTRACT).
  async function handleCancelLossesOnly() {
    if (!session || !detail || activeLossMovements.length === 0) {
      return;
    }

    const trimmedReason = invalidateReasonText.trim();
    if (trimmedReason.length === 0) {
      setInvalidateModalNotice({
        kind: 'error',
        text: 'Informe o motivo para cancelar as perdas.',
      });
      return;
    }

    setInvalidating(true);
    setInvalidateModalNotice(null);

    try {
      let currentVersion = detail.sample.version;
      for (const mv of activeLossMovements) {
        await cancelSampleMovement(session, sampleId, mv.id, {
          expectedVersion: currentVersion,
          reasonText: trimmedReason,
        });
        const refreshed = await refreshDetail();
        if (!refreshed) {
          throw new Error('Falha ao recarregar o lote após cancelar a perda');
        }
        currentVersion = refreshed.sample.version;
      }

      setInvalidateModalOpen(false);
      setInvalidateReasonCode('OTHER');
      setInvalidateReasonText('');
      // Efeito de X (sem mensagem verde), permanecendo na pagina.
      showXEffect('Perdas canceladas', false);
      void syncDetailState();
    } catch (cause) {
      setInvalidateModalNotice({
        kind: 'error',
        text:
          cause instanceof ApiError
            ? cause.message
            : cause instanceof Error
              ? cause.message
              : 'Falha ao cancelar perdas',
      });
      await refetchActiveMovements();
    } finally {
      setInvalidating(false);
    }
  }

  async function handleCancelLossesAndInvalidate() {
    if (!session || !detail || activeLossMovements.length === 0) {
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
      for (const mv of activeLossMovements) {
        await cancelSampleMovement(session, sampleId, mv.id, {
          expectedVersion: currentVersion,
          reasonText: parsed.data.reasonText,
        });
        const refreshed = await refreshDetail();
        if (!refreshed) {
          throw new Error('Falha ao recarregar o lote após cancelar a perda');
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
                : 'Falha ao cancelar perdas e deletar lote',
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

    // RC-D88: com o dono congelado não há o que selecionar — exigir a seleção aqui
    // travaria a edição dos OUTROS campos num lote legado (dono só em texto).
    if (!lockedByContract && !selectedOwnerClient) {
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
      owner: selectedOwnerClient?.displayName ?? owner,
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
        // RC-D88 (`forms` §3): campo travado sai do payload. Mandá-lo seria pedir
        // pro servidor ignorar — e ele não ignora, recusa (409).
        ...(lockedByContract || !selectedOwnerClient
          ? {}
          : { ownerClientId: selectedOwnerClient.id }),
      };

      await updateRegistration(session, sampleId, {
        expectedVersion: detail.sample.version,
        after: afterPayload,
        reasonCode: parsedReason.data.reasonCode,
        reasonText: parsedReason.data.reasonText,
        confirmHarvestPropagation,
      });

      // Sucesso: efeito de check e fecha o modal (sem mensagem verde).
      setHarvestPropagationBlends(null);
      setRegistrationSaveSuccess(true);
      window.setTimeout(() => {
        setRegistrationSaveSuccess(false);
        registrationEditModeRef.current = false;
        setRegistrationEditMode(false);
        setRegistrationEditReasonCode('OTHER');
        setRegistrationEditReasonText('');
      }, SUCCESS_CHECK_MS);
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

  // Lote editavel: alterna o dropdown inline da data de chegada no card
  // "Registro" da timeline (o prefill vem do proprio createdAt do lote).
  function toggleDateEdit() {
    if (!detail || !canEditRegistrationStatus(detail.sample.status)) {
      return;
    }
    setDateEditOpen((current) => !current);
  }

  // Salvamento do editor inline da data. Lanca em caso de falha — quem mostra
  // a mensagem e o proprio editor, dentro do card.
  async function submitRegistrationDate(receivedDate: string) {
    if (!detail) return;
    try {
      // Edicao rapida: motivo fixo DATA_FIX (nao exige justificativa do usuario).
      await updateRegistration(session, sampleId, {
        expectedVersion: detail.sample.version,
        after: { receivedDate },
        reasonCode: 'DATA_FIX',
        reasonText: 'Ajuste da data de chegada',
      });
    } catch (cause) {
      // 409 "No registration changes detected" = mesma data -> fecha silencioso.
      if (
        cause instanceof ApiError &&
        cause.status === 409 &&
        /no registration changes/i.test(cause.message)
      ) {
        setDateEditOpen(false);
        return;
      }
      throw cause;
    }
    setDateEditOpen(false);
    await syncDetailState();
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
        after: afterPayload as { [key: string]: import('../../lib/api-client').JsonValue },
        reasonCode: 'DATA_FIX',
        reasonText,
        classificationType: classificationDetailType,
      });

      // Refresh em background pra nao segurar a animacao; fecha logo apos o check.
      void syncDetailState({ refreshHistory: true });
      window.setTimeout(() => {
        closeClassificationDetail();
      }, SUCCESS_CHECK_MS);
    } catch {
      // Falha: reverte o check e volta pro modo edicao pra tentar de novo.
      setClassificationDetailSaved(false);
      setClassificationDetailEditing(true);
    } finally {
      setClassificationDetailSaving(false);
    }
  }

  // Chip de status COMERCIAL do hero (Em aberto / Vendido / Perdido), com
  // "Deletado" quando o lote foi invalidado. Vem da FONTE UNICA
  // (`lib/sample-display`), a mesma que pinta o card e a linha da lista — o
  // mapa daqui era uma copia, e as duas divergiram.
  const sdvCommercialStatus = detail ? sampleStatusDisplay(detail.sample) : null;

  // Deletar: mesmo fluxo do antigo rodape, agora disparado pelo ⋯ do hero.
  // Liga B3.5 proativo — se o lote ja e origem de liga ativa, abre direto o
  // modal de bloqueio, sem pedir motivo.
  function openInvalidateFlow(trigger: HTMLButtonElement | null) {
    if (!detail) return;
    lastInvalidateTriggerRef.current = trigger;
    setGeneralNotice(null);
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
  }

  // Bloco comercial: o RESUMO (minicards) fica na Visao geral e a TIMELINE na
  // aba Movimentacoes — o cartao unico virou duas metades pedidas em separado
  // ao mesmo componente. A timeline unifica venda/perda + envio de amostra +
  // criacao de laudo (sendItems vem da projecao de eventos).
  //
  // Fica numa variavel porque muda de LUGAR conforme a aba: na Visao geral ele
  // entra DENTRO da `.sdv-general`, logo depois de "Informacoes" e antes dos
  // cards de liga (ordem pedida pelo Flavio); em Movimentacoes a `.sdv-general`
  // nem existe e ele e o unico conteudo.
  const commercialPane =
    detail && activeTab !== 'classificacao' ? (
      <section className="stack sample-detail-info-pane sample-detail-commercial-pane">
        <SampleMovementsPanel
          session={session}
          sample={detail.sample}
          movements={detail.movements ?? []}
          onOpenSample={onOpenSample}
          sendItems={sendHistoryItems}
          canEditSend={canPhysicalSend}
          editingSendEventId={editSendEventId}
          onToggleSendEdit={(sendEventId) =>
            setEditSendEventId((current) => (current === sendEventId ? null : sendEventId))
          }
          onSubmitSendEdit={submitSendEdit}
          onCancelSend={(sendEventId) => setCancelSendId(sendEventId)}
          canEditRegistrationDate={canEditRegistrationStatus(detail.sample.status)}
          registrationDate={(detail.sample.createdAt ?? '').slice(0, 10)}
          editingRegistrationDate={dateEditOpen}
          onToggleRegistrationDateEdit={toggleDateEdit}
          onSubmitRegistrationDate={submitRegistrationDate}
          section={activeTab === 'overview' ? 'summary' : 'timeline'}
        />
      </section>
    ) : null;

  return (
    <>
      {/* Sem o marcador --sample: e ele que liga o layout desktop 2-colunas
          no globals (o peek de 620px e coluna unica); o fundo branco + sombra
          dos cards que ele dava no mobile voltam via .lote-details-overlay. */}
      <section className="sdv-page">
        {/* Os tres ramos cobrem TODAS as combinacoes de (detail, loadingDetail)
            — antes "carregando com detalhe em maos" e "sem detalhe e sem
            carregar" caiam no vazio e o painel abria em branco, sem nem
            mostrar o erro (o NoticeSlot do pageNotice mora la dentro). */}
        {/* F4: esqueleto no FORMATO do detalhe no lugar do texto "Carregando
            lote…" — area grande nao tem texto (design-system §3). */}
        {!detail && loadingDetail ? <SkeletonDetail /> : null}
        {!detail && !loadingDetail ? (
          <div className="spv2-empty">
            <p className="spv2-empty-text">
              {pageNotice?.text ?? 'Não foi possível carregar este lote.'}
            </p>
            <button
              type="button"
              className="fv-btn fv-btn-primary"
              onClick={() => void loadDetail()}
            >
              Tentar de novo
            </button>
          </div>
        ) : null}
        {detail ? (
          <>
            {/* FV (RD15): hero institucional no lugar do header verde de
                identidade. Miniatura da foto da classificacao no papel do
                avatar do cliente, numero do lote, chips de estado, a linha
                proprietario · sacas · safra e as acoes redondas. Imprimir,
                Editar e Classificar viram botoes proprios; o resto (reverter
                liga, deletar) mora no ⋯. */}
            <header className="fv-sd-hero">
              {classificationServerPhotoUrl ? (
                <button
                  type="button"
                  className="fv-sd-thumb"
                  aria-label="Ampliar foto da classificação"
                  onClick={() => setClassificationImageModalOpen(true)}
                >
                  {/* next/image nao se aplica: src vem do upload local. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={classificationServerPhotoUrl} alt="Foto da classificação" />
                </button>
              ) : (
                <div className="fv-sd-thumb is-empty" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="8.5" cy="10" r="1.6" />
                    <path d="m4 17 5-4.5 4 3.2 3-2.2 4 3.5" />
                  </svg>
                </div>
              )}

              <h2 className="fv-sd-lot">{detail.sample.internalLotNumber ?? detail.sample.id}</h2>

              <div className="fv-sd-chips">
                {sdvCommercialStatus ? (
                  <span className={`fv-chip ${sdvCommercialStatus.chip}`}>
                    {sdvCommercialStatus.label}
                  </span>
                ) : null}
                {detail.sample.isBlend ? <BlendBadge size="sm" /> : null}
                {detail.sample.status === 'CLASSIFIED' ? (
                  <span className="fv-chip fv-chip-green">Classificado</span>
                ) : detail.sample.status !== 'INVALIDATED' ? (
                  <span className="fv-chip fv-chip-amber">Pendente</span>
                ) : null}
              </div>

              <div className="fv-sd-actions-row">
                {/* Imprimir: mesmo gating/highlight/fluxo de etiqueta de antes. */}
                <button
                  type="button"
                  className={`fv-iconbtn${printHighlighted ? ' is-highlight-pulse' : ''}`}
                  disabled={!canQuickPrint || detail.latestPrintJob?.status === 'PENDING'}
                  onClick={(event) => {
                    setPrintHighlighted(false);
                    openLabelReviewModal(event.currentTarget);
                  }}
                  aria-label="Imprimir etiqueta"
                  title="Imprimir etiqueta"
                >
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M6 9V2h12v7" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" rx="1" />
                  </svg>
                </button>
                {/* Editar informacoes: saiu do header do card "Informacoes". */}
                <button
                  type="button"
                  className="fv-iconbtn"
                  disabled={!canEditRegistrationStatus(detail.sample.status)}
                  onClick={startRegistrationEdit}
                  aria-label="Editar informações"
                  title="Editar informações"
                >
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                  </svg>
                </button>
                {/* Classificar / Reclassificar: abre o sheet global da camera
                    (CAM-P3, Flow B). Bloqueado enquanto o lote nao estiver com
                    o registro confirmado nem classificado. */}
                <button
                  type="button"
                  className="fv-iconbtn"
                  disabled={
                    detail.sample.status !== 'REGISTRATION_CONFIRMED' &&
                    detail.sample.status !== 'CLASSIFIED'
                  }
                  onClick={() => cameraSheet.open({ sampleId })}
                  aria-label={
                    detail.sample.status === 'CLASSIFIED' ? 'Reclassificar' : 'Classificar'
                  }
                  title={detail.sample.status === 'CLASSIFIED' ? 'Reclassificar' : 'Classificar'}
                >
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M4 8V6a2 2 0 0 1 2-2h2" />
                    <path d="M16 4h2a2 2 0 0 1 2 2v2" />
                    <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
                    <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
                <div className="fv-more-wrap" ref={heroMenuRef}>
                  <button
                    type="button"
                    ref={heroMenuTriggerRef}
                    className="fv-iconbtn"
                    aria-haspopup="menu"
                    aria-expanded={heroMenuOpen}
                    aria-label="Mais ações"
                    title="Mais ações"
                    onClick={() => setHeroMenuOpen((open) => !open)}
                  >
                    <svg
                      className="fv-iconbtn-dots"
                      viewBox="0 0 24 24"
                      focusable="false"
                      aria-hidden="true"
                    >
                      <circle cx="5" cy="12" r="1.6" />
                      <circle cx="12" cy="12" r="1.6" />
                      <circle cx="19" cy="12" r="1.6" />
                    </svg>
                  </button>
                  {heroMenuOpen ? (
                    <div className="fv-more-menu" role="menu" aria-label="Mais ações">
                      {canSendFromHero ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="fv-more-item"
                          onClick={() => {
                            setHeroMenuOpen(false);
                            onRequestSend?.(sampleId);
                          }}
                        >
                          Enviar amostra
                        </button>
                      ) : null}
                      {canLossFromHero ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="fv-more-item"
                          onClick={() => {
                            setHeroMenuOpen(false);
                            onRequestLoss?.(sampleId);
                          }}
                        >
                          Registrar perda
                        </button>
                      ) : null}
                      {canRevertBlend ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="fv-more-item"
                          onClick={() => {
                            setHeroMenuOpen(false);
                            setRevertModalOpen(true);
                            setRevertError(null);
                            setGeneralNotice(null);
                          }}
                        >
                          Reverter liga
                        </button>
                      ) : null}
                      {canInvalidateNormal ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="fv-more-item is-danger"
                          onClick={(event) => {
                            const trigger = event.currentTarget;
                            setHeroMenuOpen(false);
                            openInvalidateFlow(trigger);
                          }}
                        >
                          Deletar lote
                        </button>
                      ) : null}
                      {!canSendFromHero &&
                      !canLossFromHero &&
                      !canRevertBlend &&
                      !canInvalidateNormal ? (
                        <span className="fv-more-empty">Nenhuma ação disponível</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </header>

            <NoticeSlot notice={pageNotice} />

            {/* FV (RD15): 3 abas no molde ARIA do .cad-tabs. O conteudo era
                uma pagina unica rolavel (Geral + Comercial emendados). */}
            <div className="fv-tabs" role="tablist" aria-label="Seções do lote">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'overview'}
                className={`fv-tab${activeTab === 'overview' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                Visão geral
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'classificacao'}
                className={`fv-tab${activeTab === 'classificacao' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('classificacao')}
              >
                Classificação
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'movimentacoes'}
                className={`fv-tab${activeTab === 'movimentacoes' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('movimentacoes')}
              >
                Movimentações
              </button>
            </div>

            <section className="sdv-content">
              <div className="sdv-content-inner">
                {activeTab !== 'movimentacoes' ? (
                  <section className="sdv-general">
                    {activeTab === 'overview' ? (
                      <>
                        {/* Container 1: Informacoes principais — cabecalho separado
                      dos campos por uma divisoria discreta. Imprimir e Editar
                      migraram para os botoes redondos do hero; este card fica
                      so com as informacoes. */}
                        <div id="sdv-informacoes" className="sdv-card sdv-info-compact">
                          <div className="sdv-card-header">
                            {/* FV: o "Editar" saiu daqui — virou botao redondo do hero. */}
                            <span className="sdv-card-title">Informações</span>
                          </div>
                          <div className="sdv-info-grid">
                            <div className="sdv-info-item is-full">
                              <span className="sdv-info-label">Proprietario</span>
                              <span className="sdv-info-value">
                                {ownerDisplayValue(detail.sample)}
                              </span>
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
                                <HarvestDisplay
                                  harvest={detail.sample.declared.harvest}
                                  fallback=""
                                />
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
                      </>
                    ) : null}

                    {/* Aba Classificacao: a ficha inline (foto + peneiras +
                      defeitos + bebida + obs). O modal .cld-modal so sobrevive
                      no mobile. */}
                    {activeTab === 'classificacao'
                      ? (() => {
                          const classData = detail.sample.latestClassification?.data;
                          const classPhotoUrl = classificationAttachment
                            ? `/api/v1/samples/${sampleId}/photos/${classificationAttachment.id}`
                            : null;
                          const cd = (classData ?? null) as Record<string, unknown> | null;
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
                          const classificadorLabel =
                            classifiersArr && classifiersArr.length > 1
                              ? 'Classificadores'
                              : 'Classificador';
                          // Ficha inline: bloco estreito (metade da largura da coluna),
                          // entao vale so o PRIMEIRO nome de cada classificador — nomes
                          // longos seriam truncados. O modal de edicao segue com o
                          // nome completo.
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

                          // Foto da ficha: quadrada a ESQUERDA, com a foto inteira
                          // visivel (contain), clicavel pra ampliar.
                          const clsPhotoNode = classPhotoUrl ? (
                            <button
                              type="button"
                              className="sdv-cls-block-thumb"
                              aria-label="Ampliar foto da classificação"
                              onClick={() => setClassificationImageModalOpen(true)}
                            >
                              {/* next/image nao se aplica: src vem do upload local; dimensoes via CSS */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={classPhotoUrl}
                                alt="Foto da classificação"
                                className="sdv-cls-block-thumb-img"
                              />
                            </button>
                          ) : (
                            <div
                              className="sdv-cls-block-thumb sdv-cls-block-thumb-empty"
                              aria-hidden="true"
                            >
                              Sem foto
                            </div>
                          );
                          // Ficha completa read-only (FV: era o ramo desktop dormente do
                          // mockup de 2026-06-24; agora e o conteudo da aba, adaptado a
                          // coluna unica de 620px).
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
                          // Ficha inline em blocos empilhados (coluna de 620px): foto
                          // larga no topo, stats (Data/Classificador · Aspecto/Catacao/
                          // Padrao · Certificado/Bebida), Peneiras, Defeitos e
                          // Observacoes. O ramo de 2 colunas do mockup de 2026-06-24
                          // (grid-areas photo|stats / pen|def / pen|obs) nao cabe aqui.
                          const fichaNode = (
                            <div className="fv-sd-ficha">
                              {/* Linha do topo: foto quadrada a esquerda e, ao lado,
                                  Data + Classificador empilhados. O resto da ficha
                                  segue abaixo, em largura cheia. */}
                              <div className="sdv-cls-top">
                                {clsPhotoNode}
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
                              </div>
                              <div className="sdv-cls-statwrap">
                                <div className="sdv-cls-statbox sdv-cls-statbox--main">
                                  <div className="sdv-cls-statbox-row sdv-cls-statbox-row--3">
                                    {clsField('Aspecto', cd ? toText(cd.aspecto) : '')}
                                    {clsField(
                                      'Catação',
                                      cd ? formatPercentDisplay(cd.catacao) : ''
                                    )}
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
                                {/* Corrigir uma classificacao existente segue pelo
                                    Editar (caminho 3, sem camera); classificar e
                                    reclassificar POR FOTO moram no hero (CAM-D2). */}
                                {cd ? (
                                  <button
                                    type="button"
                                    className="fv-add-btn"
                                    onClick={openClassificationEdit}
                                    aria-label="Editar classificação"
                                  >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                      <path d="M12 20h9" />
                                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                                    </svg>
                                    <span>Editar</span>
                                  </button>
                                ) : null}
                              </div>
                              {cd ? (
                                fichaNode
                              ) : (
                                <div className="sdv-cls-empty">
                                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                    <rect x="3" y="5" width="18" height="14" rx="2" />
                                    <circle cx="8.5" cy="10" r="1.6" />
                                    <path d="m4 17 5-4.5 4 3.2 3-2.2 4 3.5" />
                                  </svg>
                                  <p className="sdv-empty-text">
                                    Este lote ainda não foi classificado.
                                  </p>
                                  <p className="sdv-cls-empty-hint">
                                    Use o botão de classificar no topo do painel para fotografar a
                                    ficha.
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })()
                      : null}

                    {/* Ordem da Visao geral (pedido do Flavio): Informacoes →
                        Resumo comercial → cards de liga (por ultimo). */}
                    {activeTab === 'overview' ? commercialPane : null}

                    {activeTab === 'overview' ? (
                      <>
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
                            <span className="sdv-card-title sdv-card-title-danger">
                              Liga inviável
                            </span>
                            <p className="sdv-empty-text">
                              {blendFeasibility.blockingOrigins.length === 1
                                ? 'Uma origem desta liga não tem saldo suficiente para a venda.'
                                : 'Origens desta liga não têm saldo suficiente para a venda.'}
                            </p>
                            <ul className="sdv-infeasible-list">
                              {blendFeasibility.blockingOrigins.map((origin) => (
                                <li key={origin.sampleId}>
                                  <Link
                                    href={openSampleHref(origin.sampleId)}
                                    className="sdv-infeasible-origin"
                                    onClick={
                                      onOpenSample
                                        ? (event) => {
                                            event.preventDefault();
                                            onOpenSample(origin.sampleId);
                                          }
                                        : undefined
                                    }
                                  >
                                    Lote {origin.lotNumber ?? origin.sampleId.slice(0, 8)}
                                  </Link>{' '}
                                  — precisa {origin.contributedSacks} sc, tem{' '}
                                  {origin.availableSacks} sc
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {/* Liga B3.2: Composicao da liga (origens + contribuicoes).
                        Backend mantem `components` em liga revertida (F8.3) —
                        a secao continua visivel como historico. */}
                        {detail.sample.isBlend &&
                        detail.components &&
                        detail.components.length > 0 ? (
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
                                      href={openSampleHref(origin.id)}
                                      onOpen={
                                        onOpenSample ? () => onOpenSample(origin.id) : undefined
                                      }
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
                                    href={openSampleHref(blend.sampleId)}
                                    onOpen={
                                      onOpenSample ? () => onOpenSample(blend.sampleId) : undefined
                                    }
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
                            <span className="sdv-card-title sdv-card-title-danger">
                              Lote deletado
                            </span>
                            <p className="sdv-empty-text">
                              Este lote foi deletado e nao aparece mais nas listagens. O numero foi
                              liberado para reuso.
                            </p>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </section>
                ) : null}

                {/* Em Movimentacoes a `.sdv-general` nao e renderizada — o
                    bloco comercial (timeline) fica sozinho aqui. Na Visao
                    geral ele ja entrou la dentro, entre Informacoes e liga. */}
                {activeTab === 'movimentacoes' ? commercialPane : null}

                {/* FV: o rodape "Deletar" saiu — a acao terminal mora no ⋯
                    do hero, junto de "Reverter liga". */}
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
        onOpenSample={
          onOpenSample
            ? (id) => {
                // Fecha o modal ANTES de trocar o lote: o remount (key nova)
                // nao pode herdar o bloqueio aberto do lote anterior.
                setInvalidateBlockedOpen(false);
                onOpenSample(id);
              }
            : undefined
        }
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

      <BottomSheet
        open={Boolean(detail) && invalidateModalOpen}
        onClose={() => setInvalidateModalOpen(false)}
        onDismissAttempt={() => !invalidating}
        ariaLabel="Deletar lote"
        stacked
        closeVariant="edge-back"
        dragDisabled={invalidating}
        className="fv-panel-sheet side-sheet sample-invalidate-sheet"
        footer={
          // RC-D87: com VENDA ativa nao ha o que submeter — deletar exige o saldo
          // intacto e o lote nao desfaz venda. Ai o painel so explica. Com PERDA, as
          // duas acoes valem: cancelar as perdas e ficar, ou cancelar e deletar.
          hasActiveSaleMovement ? null : hasActiveMovements ? (
            <div className="fv-panel-footer-row">
              <button
                type="button"
                className="app-modal-secondary"
                onClick={() => {
                  void handleCancelLossesOnly();
                }}
                disabled={
                  invalidating ||
                  invalidateReasonText.trim().length === 0 ||
                  activeLossMovements.length === 0
                }
              >
                {invalidating ? 'Cancelando...' : 'Cancelar perdas'}
              </button>
              <button
                type="submit"
                form="sample-invalidate-form"
                className="app-modal-submit is-danger sample-detail-invalidate-submit"
                disabled={
                  invalidating ||
                  invalidateReasonText.trim().length === 0 ||
                  activeLossMovements.length === 0
                }
              >
                {invalidating ? 'Deletando...' : 'Deletar'}
              </button>
            </div>
          ) : (
            <button
              type="submit"
              form="sample-invalidate-form"
              className="app-modal-submit is-danger sample-detail-invalidate-submit"
              disabled={invalidating}
            >
              {invalidating ? 'Deletando...' : 'Deletar'}
            </button>
          )
        }
      >
        <>
          <p className="fv-panel-lead">
            {hasActiveSaleMovement
              ? 'Este lote tem venda ativa.'
              : 'Use apenas quando a operação realmente exigir.'}
          </p>

          <form
            id="sample-invalidate-form"
            className="sample-invalidate-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (hasActiveSaleMovement) {
                return;
              }
              if (hasActiveMovements) {
                void handleCancelLossesAndInvalidate();
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
                  {/* RC-D87: a PERDA volta a ser cancelável aqui (ela não tem
                      contrato); a VENDA não — ela se desfaz pelo Washout do
                      contrato, e ali existe a pergunta da corretagem (RC-D89). */}
                  <div className="sdv-warn-text">
                    <strong>
                      Este lote possui{' '}
                      {activeMovements && activeMovements.length > 0
                        ? `${activeMovements.length} ${activeMovements.length > 1 ? 'movimentações ativas' : 'movimentação ativa'}`
                        : 'movimentações ativas'}
                    </strong>
                    {hasActiveSaleMovement
                      ? 'Venda se desfaz pelo Washout do contrato, em Contratos — não pelo lote. Enquanto ela existir, o lote não é deletável.'
                      : 'Para deletar o lote, as perdas serão canceladas. Você também pode só cancelar as perdas.'}
                  </div>
                </div>

                <div className="sample-detail-invalidate-movements">
                  {activeMovements === null ? (
                    <p className="sample-detail-invalidate-movements-hint">Carregando…</p>
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

            {/* RC-D87: o motivo some só quando NADA é submetível — com venda ativa
                não há ação, e pedir o motivo de uma ação indisponível é pedir por
                pedir. Com perda, ele volta: as duas ações o usam. */}
            {hasActiveSaleMovement ? null : (
              <>
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
              </>
            )}

            <NoticeSlot notice={invalidateModalNotice} />
          </form>
        </>
      </BottomSheet>

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

      <SampleLabelPrintSheet
        session={session}
        open={labelModalOpen}
        sample={detail?.sample ?? null}
        stacked
        onClose={closeLabelModal}
        onPrinted={() => void refreshDetail()}
      />

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

      {/* A edicao rapida da data de chegada NAO tem painel: e um dropdown
          inline no card "Registro" da timeline (SampleMovementsPanel). */}

      <BottomSheet
        open={registrationEditMode}
        onClose={cancelRegistrationEdit}
        onDismissAttempt={() => !registrationUpdating && !registrationSaveSuccess}
        ariaLabel="Editar informações do lote"
        stacked
        closeVariant="edge-back"
        dragDisabled={registrationUpdating || registrationSaveSuccess}
        className="fv-panel-sheet side-sheet sample-reg-edit-sheet"
        footer={
          registrationSaveSuccess ? null : (
            <button
              type="submit"
              form="sample-reg-edit-form"
              className="app-modal-submit"
              disabled={registrationUpdating}
            >
              {registrationUpdating ? 'Salvando...' : 'Salvar'}
            </button>
          )
        }
      >
        <>
          <form
            id="sample-reg-edit-form"
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
                {lockedByContract ? (
                  // RC-D88, molde do `forms` §3: valor + instrução, não input
                  // desabilitado. Não há o que clicar, então não pode parecer
                  // clicável — e o dono não volta a abrir, não é indisponível "por
                  // enquanto".
                  <>
                    <span className="app-modal-label">Proprietario</span>
                    <p className="sdv-locked-value">
                      {detail?.sample.declared.owner ?? 'Sem proprietário'}
                    </p>
                    <span className="sdv-edit-hint">
                      Este lote tem o contrato {lockedByContract.contractNumber}. O dono do lote é o
                      vendedor do contrato e não pode ser trocado.
                    </span>
                  </>
                ) : (
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
                )}
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
                  Justificativa
                  {registrationEditReasonCode === 'OTHER' ? ' (obrigatória)' : ''}
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
          </form>

          <SuccessCheckOverlay show={registrationSaveSuccess} />
        </>
      </BottomSheet>

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
              <BottomSheet
                open
                onClose={closeClassificationDetail}
                onDismissAttempt={() => !saving && !saved}
                ariaLabel="Editar classificação"
                stacked
                closeVariant="edge-back"
                dragDisabled={saving || saved}
                className="fv-panel-sheet side-sheet sample-classification-sheet"
                footer={
                  saved ? null : (
                    <button
                      type="button"
                      className="app-modal-submit"
                      onClick={requestClassificationDetailSave}
                      disabled={saving}
                    >
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  )
                }
              >
                <>
                  {(() => {
                    return (
                      <div className="cld-body">
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
                                <div className="cld-classifier-loading">Carregando…</div>
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

                  {classificationDetailError ? (
                    <p className="sdv-modal-error" role="alert">
                      {classificationDetailError}
                    </p>
                  ) : null}

                  <SuccessCheckOverlay show={saved} />
                </>
              </BottomSheet>
            );
          })()
        : null}

      {classificationSaveConfirmOpen
        ? createPortal(
            <div
              className="app-modal-backdrop fv-panel-scrim"
              onClick={() => setClassificationSaveConfirmOpen(false)}
            >
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
                        // F3: o painel e so de EDICAO (a ficha em leitura mora na
                        // aba, atras dele). Desistir descarta a edicao e fecha o
                        // painel, revelando a ficha original.
                        cancelClassificationDetailEdit();
                        closeClassificationDetail();
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
            </div>,
            document.body
          )
        : null}

      {classificationImageModalOpen && classificationServerPhotoUrl
        ? createPortal(
            <PhotoZoomViewer
              src={classificationServerPhotoUrl}
              alt="Foto da classificação"
              exportFilename={buildClassificationPhotoFilename(detail)}
              onClose={() => setClassificationImageModalOpen(false)}
            />,
            document.body
          )
        : null}

      {/* Envio: CANCELAR envios existentes (disparado pela timeline). A edicao
          virou dropdown inline no proprio card; o envio NOVO migrou p/ o card
          da lista (/samples). */}
      {cancelSendId ? (
        <SampleSendFlow
          session={session}
          sampleId={sampleId}
          cancelEventId={cancelSendId}
          onChanged={fetchSendHistory}
          onClose={() => setCancelSendId(null)}
        />
      ) : null}

      {/* Modal de confirmacao de reclassificacao — empilhado sobre o modal
          full-view de classificacao. Usa o padrao oficial .app-modal. */}
      {reclassifyModalOpen
        ? createPortal(
            <div className="app-modal-backdrop fv-panel-scrim sample-detail-reclassify-backdrop">
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
                    <ReclassifySampleButton
                      sampleId={sampleId}
                      onBeforeOpen={() => {
                        setReclassifyModalOpen(false);
                        closeClassificationDetail();
                      }}
                    />
                  </div>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
