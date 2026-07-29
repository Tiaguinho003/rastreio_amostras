'use client';

// Fase J (D120–D126): DETALHES do contrato. Desde a F3 do redesign (RD9) vive
// no DetailOverlay dirigido por URL (`/contratos?details=<id>` — peek lateral
// de 620px no desktop ≥901px, sheet de tela cheia no mobile; quem controla o
// param é o ContratosPanel). Coluna ÚNICA: o DOCUMENTO (PDF on-demand, D126 —
// mesmo blob/iframe do antigo "Visualizar", que este modal absorveu) primeiro,
// seções na sequência — read-only, MENOS Aprovação, que desde a RC-D25 carrega
// o "Gerar etiqueta" que morava na /embarques extinta. Exportar/Baixar
// acompanham a seção do documento, em todas as situações.
// O HISTÓRICO (timeline D125) fecha o overlay:
// linha = "há X tempo" + quem + o quê, com a data/hora exata de apoio (D119);
// marcos legados (pré-D123) saem só com a data, sem autor. Rodapé = ações por
// situação (D121): EMITIDO = Editar·Ágio·Deságio·Finalizar·Washout;
// FINALIZADO = Reabrir·Washout; WASH_OUT = sem ações. COMMERCIAL vê TUDO nos
// contratos dele (D120 — a restrição da D86 vale só no Financeiro). Dados:
// getSaleContract fresco (com corretores) + getSaleContractTimeline.
//
// RC-D65: a seção Embarque (confirmação + fotos + transporte) morreu inteira.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  ApiError,
  downloadSaleContractPdf,
  getApprovalLabelPrefill,
  getSaleContract,
  finalizeSaleContract,
  getSaleContractTimeline,
  reopenSaleContract,
  setSaleContractApprovalFlag,
} from '../../lib/api-client';
import { formatRelativeTime } from '../../lib/relative-time';
import { downloadFile, shareOrDownloadFile } from '../../lib/share-blob';
import { useToast } from '../../lib/toast/ToastProvider';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type {
  AgioDesagioType,
  ApprovalLabelPrefill,
  SaleContract,
  SaleContractBrokerView,
  SaleContractTimelineItem,
  SessionData,
} from '../../lib/types';
import { ApprovalLabelModal } from '../ApprovalLabelModal';
import { DetailOverlay } from '../DetailOverlay';
import {
  agendaColor,
  contractAgenda,
  contractAgendaLabel,
  STATUS_META,
  STATUS_TEXT_COLOR,
  STATUS_TINT,
} from './SaleContractCard';

type SaleContractDetailsModalProps = {
  session: SessionData;
  open: boolean;
  // Snapshot vindo da lista — o modal re-busca o contrato FRESCO ao abrir
  // (padrão do EspelhoCorretagemModal) pra corretores + valores atuais.
  contract: SaleContract;
  canManage: boolean;
  onClose: () => void;
  onEditar: () => void;
  onApplyAgio: (type: AgioDesagioType) => void;
  onWashout: () => void;
  // Espelho: o botão "Gerar espelho" (só quando elegível) abre a Conferência no pai.
  espelhoEligible?: boolean;
  onGerarEspelho?: () => void;
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const TYPE_LABEL: Record<string, string> = { MERCADO_A_VISTA: 'À vista', FUTURO: 'Futuro' };

function money(value: number | null | undefined): string {
  return value != null ? BRL.format(value) : '—';
}

function dateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

// Data/hora exata de apoio do timeline (D119). Marcos legados são @db.Date
// (meia-noite UTC) — mostrar só a data em UTC evita "voltar um dia" no fuso.
function exactStamp(item: SaleContractTimelineItem): string {
  if (item.legacy) return dateOnly(item.at);
  const date = new Date(item.at);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function timelineLabel(item: SaleContractTimelineItem): string {
  switch (item.kind) {
    case 'CRIACAO':
      return 'Contrato criado';
    case 'EDICAO':
      return 'Contrato editado';
    case 'APROVACAO':
      return 'Aprovação enviada';
    case 'AGIO': {
      const valor = item.agioDesagioValue != null ? `${money(item.agioDesagioValue)}/sc` : '';
      return item.agioDesagioType === 'DESAGIO'
        ? `Deságio aplicado ${valor}`.trim()
        : `Ágio aplicado ${valor}`.trim();
    }
    case 'ESPELHO':
      // D127: o log é gravado na EXPORTAÇÃO (Exportar/Baixar) — a prévia não audita.
      return `Espelho exportado — ${item.side === 'seller' ? 'Vendedor' : 'Comprador'}`;
    case 'STATUS': {
      // RC-D63: a marca terminal VAI e VOLTA — o log acumula as duas linhas, e
      // é por isso que "quem finalizou e quando" não virou coluna do contrato.
      const base =
        item.toStatus === 'FINALIZADO'
          ? 'Contrato finalizado'
          : item.toStatus === 'EMITIDO'
            ? 'Contrato reaberto'
            : 'Washout';
      return item.reason ? `${base} — ${item.reason}` : base;
    }
    default:
      return '';
  }
}

type Snapshot = Record<string, unknown> | null;

function snapText(snap: Snapshot, key: string): string | null {
  const value = snap?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

// Linhas de uma PARTE (vendedor/comprador) a partir do snapshot congelado
// (D25): identidade + IE + endereço + filial. Linhas vazias somem.
function partyRows(snap: Snapshot): Array<[string, string]> {
  if (!snap) return [];
  const rows: Array<[string, string]> = [];
  const name = snapText(snap, 'displayName');
  if (name) rows.push(['Nome', name]);
  const tax = snapText(snap, 'cnpj') ?? snapText(snap, 'cpf');
  if (tax) rows.push([snapText(snap, 'cnpj') ? 'CNPJ' : 'CPF', tax]);
  const ie = snapText(snap, 'registrationNumber');
  if (ie) rows.push(['IE', ie]);
  const address = [snapText(snap, 'addressLine'), snapText(snap, 'district')]
    .filter(Boolean)
    .join(' — ');
  if (address) rows.push(['Endereço', address]);
  const cityState = [snapText(snap, 'city'), snapText(snap, 'state')].filter(Boolean).join('/');
  if (cityState) rows.push(['Cidade', cityState]);
  const cep = snapText(snap, 'postalCode');
  if (cep) rows.push(['CEP', cep]);
  const unit = (snap.unit ?? null) as Snapshot;
  const unitName = snapText(unit, 'name');
  if (unitName) rows.push(['Filial', unitName]);
  return rows;
}

function warehouseRows(label: string, snap: Snapshot): Array<[string, string]> {
  if (!snap) return [];
  const name = snapText(snap, 'displayName');
  if (!name) return [];
  const cityState = [snapText(snap, 'city'), snapText(snap, 'state')].filter(Boolean).join('/');
  return [[label, cityState ? `${name} — ${cityState}` : name]];
}

function bankRows(snap: Snapshot): Array<[string, string]> {
  if (!snap) return [];
  const rows: Array<[string, string]> = [];
  const bank = [snapText(snap, 'bankName'), snapText(snap, 'compeCode')]
    .filter(Boolean)
    .join(' · ');
  if (bank) rows.push(['Banco', bank]);
  const agency = snapText(snap, 'agency');
  if (agency) rows.push(['Agência', agency]);
  const account = snapText(snap, 'accountNumber');
  if (account) rows.push(['Conta', account]);
  const holder = [snapText(snap, 'holderName'), snapText(snap, 'holderTaxId')]
    .filter(Boolean)
    .join(' — ');
  if (holder) rows.push(['Titular', holder]);
  const pix = snapText(snap, 'pixKey');
  if (pix) rows.push(['Chave PIX', pix]);
  return rows;
}

function FieldRows({ rows }: { rows: Array<[string, string]> }) {
  if (rows.length === 0) return <p className="ctr-details-empty">—</p>;
  return (
    <dl className="ctr-details-rows">
      {rows.map(([label, value]) => (
        <div key={`${label}-${value}`} className="ctr-details-row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SaleContractDetailsModal({
  session,
  open,
  contract,
  canManage,
  onClose,
  onEditar,
  onApplyAgio,
  onWashout,
  espelhoEligible = false,
  onGerarEspelho,
}: SaleContractDetailsModalProps) {
  // Contrato fresco (corretores incluídos) + timeline, buscados ao abrir.
  const [fresh, setFresh] = useState<SaleContract | null>(null);
  const [brokers, setBrokers] = useState<SaleContractBrokerView[]>([]);
  const [timeline, setTimeline] = useState<SaleContractTimelineItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Documento (PDF on-demand, D126) — mesmo pipeline do antigo "Visualizar".
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<{ blob: Blob; fileName: string } | null>(null);
  const [now] = useState(() => Date.now());
  // RC-D62/D63: Finalizar/Reabrir também vivem aqui (o rodapé), sem confirmação.
  const [terminalBusy, setTerminalBusy] = useState(false);
  // RC-D25: geração da etiqueta de aprovação (revoga a AP29 — a sub-aba era "a
  // única porta proativa"). Busca o prefill e abre o ApprovalLabelModal, molde
  // do ex-AprovacoesPanel.
  const [labelPrefill, setLabelPrefill] = useState<ApprovalLabelPrefill | null>(null);
  const [labelBusy, setLabelBusy] = useState(false);
  // Recarrega contrato + timeline depois de gerar etiqueta ou finalizar/reabrir
  // (os dois mudam o que as seções mostram).
  const [reloadNonce, setReloadNonce] = useState(0);
  const toast = useToast();
  // AP32: "Solicitar aprovação" — latch de mão única (mutação inline no Detalhes) +
  // confirmação (é definitivo). Substitui o toggle Sim/Não da AP23.
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalConfirmOpen, setApprovalConfirmOpen] = useState(false);
  const approvalConfirmTrapRef = useFocusTrap(approvalConfirmOpen);

  // F3 do redesign: com superficie interna aberta (confirm de aprovacao ou
  // etiqueta), ESC/X do overlay NAO fecham o detalhe (molde do dismissGuardRef
  // da F1 — ver DetailOverlay).
  const dismissGuardRef = useRef(false);
  useEffect(() => {
    dismissGuardRef.current = approvalConfirmOpen || labelPrefill != null;
    return () => {
      dismissGuardRef.current = false;
    };
  }, [approvalConfirmOpen, labelPrefill]);

  useEffect(() => {
    if (!open) return;
    let aborted = false;
    (async () => {
      setLoadError(null);
      try {
        const [detail, tl] = await Promise.all([
          getSaleContract(session, contract.id),
          getSaleContractTimeline(session, contract.id),
        ]);
        if (aborted) return;
        setFresh(detail.contract);
        setBrokers(detail.contract.brokers ?? []);
        setTimeline(tl.items);
      } catch (cause) {
        if (!aborted) {
          setLoadError(
            cause instanceof ApiError ? cause.message : 'Não foi possível carregar os detalhes.'
          );
        }
      }
    })();
    return () => {
      aborted = true;
    };
  }, [open, session, contract.id, reloadNonce]);

  useEffect(() => {
    if (!open) return;
    let aborted = false;
    let objectUrl: string | null = null;
    (async () => {
      setPdfError(null);
      setPdfUrl(null);
      try {
        const { blob, fileName } = await downloadSaleContractPdf(session, contract.id);
        if (aborted) return;
        fileRef.current = { blob, fileName };
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (cause) {
        if (!aborted) {
          setPdfError(
            cause instanceof ApiError ? cause.message : 'Não foi possível gerar o documento.'
          );
        }
      }
    })();
    return () => {
      aborted = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, session, contract.id]);

  async function handleExport() {
    if (!fileRef.current || busy) return;
    setBusy(true);
    try {
      await shareOrDownloadFile(fileRef.current.blob, fileRef.current.fileName, {
        mimeType: 'application/pdf',
        shareTitle: `Contrato ${contract.contractNumber}`,
      });
    } catch {
      setPdfError('Não foi possível compartilhar o documento.');
    } finally {
      setBusy(false);
    }
  }

  // RC-D25: [Gerar etiqueta] busca o prefill e só então abre o modal (molde do
  // ex-AprovacoesPanel). Falha vira toast — o overlay segue aberto.
  async function handleOpenLabel() {
    if (labelBusy) return;
    setLabelBusy(true);
    try {
      setLabelPrefill(await getApprovalLabelPrefill(session, contract.id));
    } catch (cause) {
      toast.error({
        title: 'Não foi possível abrir a etiqueta',
        description: cause instanceof ApiError ? cause.message : undefined,
      });
    } finally {
      setLabelBusy(false);
    }
  }

  const view = fresh ?? contract;
  const meta = STATUS_META[view.status];
  const agenda = contractAgenda(view);
  const agendaTone = agendaColor(agenda);

  // AP32: "Solicitar aprovação" é um latch de mão única — só aparece quando o contrato
  // ainda é "Não" + EMITIDO + gerencia; depois de "Sim" não há como desmarcar (nem aqui
  // nem no Editar). Congelamento por situação (finalizado/washout) igual à AP20.
  const canManageApproval = canManage && view.status === 'EMITIDO';

  // RC-D62/D63: Finalizar e Reabrir — um toque, sem confirmação (voltam atrás) e
  // sem data (não afirmam um fato do mundo). O contrato recarrega e a lista do pai
  // se atualiza no fechamento do overlay.
  async function runTerminal(direction: 'finalize' | 'reopen') {
    if (terminalBusy) return;
    setTerminalBusy(true);
    try {
      const call = direction === 'finalize' ? finalizeSaleContract : reopenSaleContract;
      const res = await call(session, contract.id, { expectedVersion: view.version });
      setFresh(res.contract);
      setReloadNonce((n) => n + 1);
      toast.success({
        title: direction === 'finalize' ? 'Contrato finalizado' : 'Contrato reaberto',
      });
    } catch (cause) {
      toast.error({
        title:
          cause instanceof ApiError && cause.status === 409
            ? 'Este contrato foi modificado. Recarregue a página e tente de novo.'
            : cause instanceof ApiError
              ? cause.message
              : 'Não foi possível atualizar o contrato.',
      });
    } finally {
      setTerminalBusy(false);
    }
  }
  async function handleRequestApproval() {
    if (approvalBusy) return;
    setApprovalBusy(true);
    setApprovalError(null);
    try {
      const res = await setSaleContractApprovalFlag(session, contract.id, {
        requiresApproval: true,
        expectedVersion: view.version,
      });
      setFresh(res.contract);
      setApprovalConfirmOpen(false);
    } catch (cause) {
      setApprovalError(
        cause instanceof ApiError ? cause.message : 'Não foi possível solicitar a aprovação.'
      );
    } finally {
      setApprovalBusy(false);
    }
  }

  // Rodapé por situação (D121). WASH_OUT (ou sem gestão) = sem rodapé —
  // Exportar/Baixar já vivem na seção do documento.
  const footerButtons: Array<{
    key: string;
    label: string;
    danger?: boolean;
    disabled?: boolean;
    onClick: () => void;
  }> = [];
  if (canManage && view.status === 'EMITIDO') {
    footerButtons.push(
      { key: 'editar', label: 'Editar', onClick: onEditar },
      { key: 'agio', label: 'Ágio', onClick: () => onApplyAgio('AGIO') },
      { key: 'desagio', label: 'Deságio', onClick: () => onApplyAgio('DESAGIO') },
      {
        key: 'finalizar',
        label: terminalBusy ? 'Finalizando...' : 'Finalizar',
        disabled: terminalBusy,
        onClick: () => void runTerminal('finalize'),
      },
      { key: 'washout', label: 'Washout', danger: true, onClick: onWashout }
    );
  } else if (canManage && view.status === 'FINALIZADO') {
    footerButtons.push(
      {
        key: 'reabrir',
        label: terminalBusy ? 'Reabrindo...' : 'Reabrir',
        disabled: terminalBusy,
        onClick: () => void runTerminal('reopen'),
      },
      { key: 'washout', label: 'Washout', danger: true, onClick: onWashout }
    );
  }
  // Espelho: elegível em mais status que as ações acima (inclui WASH_OUT do FUTURO) —
  // botão à parte, guiado pela elegibilidade (não pelo branch de status).
  if (canManage && espelhoEligible && onGerarEspelho) {
    footerButtons.push({ key: 'espelho', label: 'Gerar espelho', onClick: onGerarEspelho });
  }

  const footer =
    footerButtons.length > 0 ? (
      <div className="ctr-details-actions">
        {footerButtons.map((button) => (
          <button
            key={button.key}
            type="button"
            className={`ctr-btn${button.danger ? ' ctr-btn-danger' : ''}`}
            disabled={button.disabled}
            onClick={button.onClick}
          >
            {button.label}
          </button>
        ))}
      </div>
    ) : undefined;

  const identRows: Array<[string, string]> = [
    ['Tipo', TYPE_LABEL[view.type] ?? view.type],
    ['Data do contrato', dateOnly(view.contractDate)],
  ];
  if (view.purchaseNumber) identRows.push(['Nº compra', view.purchaseNumber]);
  if (view.weightKg != null) identRows.push(['Peso', `${view.weightKg} Kg`]);
  // D144: planejada null = "À definir" (as reais seguem com o dateOnly/"—").
  identRows.push([
    'Faturamento (planejado)',
    view.invoiceDate ? dateOnly(view.invoiceDate) : 'À definir',
  ]);
  identRows.push([
    'Pagamento (planejado)',
    view.paymentDate ? dateOnly(view.paymentDate) : 'À definir',
  ]);
  if (view.status === 'WASH_OUT' && view.washoutAt) {
    identRows.push(['Washout em', dateOnly(view.washoutAt)]);
  }
  if (view.status === 'WASH_OUT' && view.washoutReason) {
    identRows.push(['Motivo do washout', view.washoutReason]);
  }

  const paymentRows: Array<[string, string]> = [];
  if (view.paymentCondition) paymentRows.push(['Condição', view.paymentCondition]);
  if (view.paymentFormText) paymentRows.push(['Forma', view.paymentFormText]);
  if (view.modalityText) paymentRows.push(['Modalidade', view.modalityText]);
  if (view.packagingText) paymentRows.push(['Embalagem', view.packagingText]);

  const valueRows: Array<[string, string]> = [
    ['Sacas', `${view.quantitySacks} sc`],
    ['Preço/saca', money(view.unitPrice)],
  ];
  if (view.agioDesagioType && view.agioDesagioValue != null) {
    valueRows.push([
      view.agioDesagioType === 'AGIO' ? 'Ágio' : 'Deságio',
      `${money(view.agioDesagioValue)}/sc`,
    ]);
  }
  valueRows.push(['Valor total', money(view.totalValue)]);
  valueRows.push([
    'Corretagem vendedor',
    `${view.sellerBrokeragePct ?? 0}% · ${money(view.sellerBrokerageValue)}`,
  ]);
  valueRows.push([
    'Corretagem comprador',
    `${view.buyerBrokeragePct ?? 0}% · ${money(view.buyerBrokerageValue)}`,
  ]);
  if (brokers.length > 0) {
    valueRows.push(['Corretores', brokers.map((broker) => broker.brokerNameSnapshot).join(', ')]);
  }

  const armazemRows = [
    ...warehouseRows('Do comprador', view.buyerWarehouseSnapshot as Snapshot),
    ...warehouseRows('Do vendedor', view.sellerWarehouseSnapshot as Snapshot),
  ];

  return (
    <>
      <DetailOverlay
        open={open}
        onClose={onClose}
        title={`Contrato ${view.contractNumber}`}
        ariaLabel={`Detalhes do contrato ${view.contractNumber}`}
        className="ctr-details-overlay"
        footer={footer}
        dismissGuardRef={dismissGuardRef}
      >
        {/* RC-D68: dois selos — a SITUAÇÃO (em andamento/finalizado/cancelado) e,
            quando há um, o PRÓXIMO COMPROMISSO. A lista mostra só o segundo, porque
            lá o espaço é uma coluna; aqui cabem os dois, e o detalhe é onde faz
            sentido saber as duas coisas. Ambos derivados da mesma fonte. */}
        <div className="ctr-details-head">
          <span
            className="spv2-card-badge"
            style={{ background: STATUS_TINT[view.status], color: STATUS_TEXT_COLOR[view.status] }}
          >
            {meta.label}
          </span>
          {agenda.kind !== 'nenhum' &&
          agenda.kind !== 'finalizado' &&
          agenda.kind !== 'cancelado' ? (
            <span
              className="spv2-card-badge"
              style={{ background: agendaTone.tint, color: agendaTone.text }}
            >
              {contractAgendaLabel(agenda)}
            </span>
          ) : null}
          <span className="ctr-details-type">{TYPE_LABEL[view.type] ?? view.type}</span>
        </div>

        {loadError ? <p className="sdv-modal-error">{loadError}</p> : null}

        <div className="ctr-details-cols">
          {/* Documento (D126): coluna esquerda no desktop, primeira seção no
            mobile. Exportar/Baixar acompanham o preview em todos os status. */}
          <section className="ctr-details-doc">
            <h4 className="ctr-section-title">Contrato (PDF)</h4>
            {pdfError ? <p className="sdv-modal-error">{pdfError}</p> : null}
            {pdfUrl ? (
              <iframe
                className="ctr-details-doc-frame"
                src={pdfUrl}
                title={`Documento do contrato ${view.contractNumber}`}
              />
            ) : !pdfError ? (
              <p className="ctr-modal-loading">Gerando o documento...</p>
            ) : null}
            <div className="ctr-details-doc-actions">
              <button
                type="button"
                className="ctr-btn"
                onClick={() =>
                  fileRef.current && downloadFile(fileRef.current.blob, fileRef.current.fileName)
                }
                disabled={!pdfUrl}
              >
                Baixar
              </button>
              <button
                type="button"
                className="ctr-btn"
                onClick={() => void handleExport()}
                disabled={!pdfUrl || busy}
              >
                {busy ? 'Exportando...' : 'Exportar'}
              </button>
            </div>
          </section>

          <div className="ctr-details-info">
            <section>
              <h4 className="ctr-section-title">Identificação</h4>
              <FieldRows rows={identRows} />
            </section>
            <section>
              <h4 className="ctr-section-title">Vendedor</h4>
              <FieldRows rows={partyRows(view.sellerSnapshot as Snapshot)} />
            </section>
            <section>
              <h4 className="ctr-section-title">Comprador</h4>
              <FieldRows rows={partyRows(view.buyerSnapshot as Snapshot)} />
            </section>
            <section>
              <h4 className="ctr-section-title">Banco do vendedor</h4>
              <FieldRows rows={bankRows(view.sellerBankSnapshot as Snapshot)} />
            </section>
            {armazemRows.length > 0 ? (
              <section>
                <h4 className="ctr-section-title">Armazéns</h4>
                <FieldRows rows={armazemRows} />
              </section>
            ) : null}
            {paymentRows.length > 0 ? (
              <section>
                <h4 className="ctr-section-title">Pagamento e logística</h4>
                <FieldRows rows={paymentRows} />
              </section>
            ) : null}
            <section>
              <h4 className="ctr-section-title">Valores e corretagem</h4>
              <FieldRows rows={valueRows} />
            </section>
            {canManageApproval || view.requiresApproval ? (
              <section>
                <h4 className="ctr-section-title">Aprovação</h4>
                {view.requiresApproval ? (
                  <>
                    <FieldRows rows={[['Precisa de aprovação', 'Sim']]} />
                    {/* RC-D25: a geração da etiqueta mora AQUI (revoga a AP29 —
                        a sub-aba Aprovações era "a única porta proativa" e foi
                        extinta). Reenvio é permitido (o log conta N×); só o
                        washout tira o botão, como fazia a worklist. */}
                    {canManage && view.status !== 'WASH_OUT' ? (
                      <div className="ctr-details-actions">
                        <button
                          type="button"
                          className="ctr-btn"
                          disabled={labelBusy}
                          onClick={handleOpenLabel}
                        >
                          {labelBusy ? 'Abrindo...' : 'Gerar etiqueta'}
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  // AP32: latch de mão única — botão "Solicitar aprovação" (só quando
                  // ainda "Não" + EMITIDO + gerencia); a confirmação é obrigatória.
                  <div className="app-modal-field">
                    <span className="app-modal-label">Este contrato precisa de aprovação?</span>
                    <button
                      type="button"
                      className="ctr-btn"
                      disabled={approvalBusy}
                      onClick={() => {
                        setApprovalError(null);
                        setApprovalConfirmOpen(true);
                      }}
                    >
                      Solicitar aprovação
                    </button>
                  </div>
                )}
              </section>
            ) : null}
            {view.observations || view.description ? (
              <section>
                <h4 className="ctr-section-title">Textos</h4>
                {view.observations ? (
                  <p className="ctr-details-text">
                    <strong>Observações:</strong> {view.observations}
                  </p>
                ) : null}
                {view.description ? (
                  <p className="ctr-details-text">
                    <strong>Descrição:</strong> {view.description}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        </div>

        {/* Histórico (D125): largura total, ordem decrescente. Linha D118/D119 =
          "há X tempo" + quem + o quê, com a data exata de apoio; marcos
          legados (pré-D123) saem só com a data, sem autor. */}
        <section className="ctr-details-history">
          <h4 className="ctr-section-title">Histórico</h4>
          {timeline === null ? (
            <p className="ctr-modal-loading">Carregando o histórico...</p>
          ) : timeline.length === 0 ? (
            <p className="ctr-details-empty">Sem eventos registrados.</p>
          ) : (
            <ul className="ctr-tl">
              {timeline.map((item) => (
                <li key={item.id} className="ctr-tl-item">
                  <span className="ctr-tl-rel">{formatRelativeTime(item.at, now)}</span>
                  <span className="ctr-tl-main">
                    {item.actorName ? <strong>{item.actorName}</strong> : null}
                    {item.actorName ? ' · ' : ''}
                    {timelineLabel(item)}
                  </span>
                  <span className="ctr-tl-exact">{exactStamp(item)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </DetailOverlay>
      {/* RC-D25: as duas superfícies que a extinção de /embarques trouxe pra cá.
          Ambas seguram o dismissGuardRef enquanto abertas e, ao concluir,
          bumpam o reloadNonce — contrato, timeline e fotos voltam frescos. */}
      {labelPrefill ? (
        <ApprovalLabelModal
          open
          session={session}
          prefill={labelPrefill}
          saleContractId={contract.id}
          onSent={() => setReloadNonce((n) => n + 1)}
          onClose={() => setLabelPrefill(null)}
        />
      ) : null}
      {/* AP32: confirmação do latch de mão única — "Solicitar aprovação" é definitivo. */}
      {approvalConfirmOpen
        ? createPortal(
            <div className="app-modal-backdrop">
              <section
                ref={approvalConfirmTrapRef}
                className="app-modal is-themed is-action sample-detail-compact-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ctr-request-approval-title"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 id="ctr-request-approval-title" className="app-modal-title">
                      Solicitar aprovação
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="app-modal-close"
                    onClick={() => setApprovalConfirmOpen(false)}
                    disabled={approvalBusy}
                    aria-label="Fechar"
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </header>
                {approvalError ? (
                  <p className="sdv-modal-error" role="alert">
                    {approvalError}
                  </p>
                ) : null}
                <div className="app-modal-content">
                  <p className="ctr-confirm-text">
                    O contrato {view.contractNumber} passará a exigir aprovação antes do
                    faturamento. Esta ação <strong>não pode ser desfeita</strong>.
                  </p>
                </div>
                <div className="app-modal-actions">
                  <button
                    type="button"
                    className="app-modal-secondary"
                    onClick={() => setApprovalConfirmOpen(false)}
                    disabled={approvalBusy}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="app-modal-submit"
                    onClick={() => void handleRequestApproval()}
                    disabled={approvalBusy}
                  >
                    {approvalBusy ? 'Solicitando...' : 'Solicitar aprovação'}
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
