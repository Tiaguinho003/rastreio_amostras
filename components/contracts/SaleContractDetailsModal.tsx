'use client';

// DETALHES do contrato. Desde a F3 do redesign (RD9) vive no DetailOverlay dirigido por
// URL (`/contratos?details=<id>` — peek lateral de 620px no desktop ≥901px, sheet de tela
// cheia no mobile; quem controla o param é o ContratosPanel).
//
// RC-D121 (2026-07-30): deixou de ser UMA coluna rolável com oito seções de texto e virou
// QUATRO ABAS — `Detalhes · Aprovação · Espelho · Histórico`. Cada uma responde uma
// pergunta, e as três superfícies que flutuavam por cima do detalhe (a etiqueta de
// aprovação, a conferência do espelho e a prévia do espelho) viraram conteúdo de aba.
//
//   - Detalhes (RC-D122) = o DOCUMENTO. As seções de texto saíram porque o PDF já as
//     imprime; o que fica acima dele é a FAIXA, e ela é exatamente o que o papel NÃO diz:
//     valor total, ágio/deságio, preço efetivo, corretagem em R$ e os corretores. 🔴 Sem
//     essa faixa, aplicar um Ágio (botão que vive nesta aba) não mudaria nada na tela.
//   - Aprovação (RC-D126) = o latch "Solicitar aprovação" ou os campos da etiqueta.
//   - Espelho (RC-D124) = um bloco por lado com corretagem.
//   - Histórico (RC-D128) = a linha do tempo, e é o ÚNICO lugar onde o motivo do washout
//     e os espelhos substituídos/expirados continuam alcançáveis.
//
// RC-D123: o rodapé é DA ABA, não do overlay — só Detalhes tem ações.
// RC-D129: a aba não entra na URL; `?details=<id>` abre sempre em Detalhes.
//
// Dados: `getSaleContract` fresco (com corretores e o dono atual do lote) +
// `getSaleContractTimeline`, ambos ao abrir. O que é caro é lazy por aba: o PDF do
// contrato carrega com a aba padrão, o prefill da etiqueta e os PDFs do espelho só na
// primeira ativação — e a aba fica MONTADA depois disso, para não refazer a busca a cada
// volta.

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
import { espelhoSideLabel, type EspelhoSide } from '../../lib/espelho';
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
import { DetailOverlay } from '../DetailOverlay';
import { ApprovalLabelForm } from './ApprovalLabelForm';
import { ContractDocumentView, useContractDocumentPages } from './ContractDocumentView';
import { ContractEspelhoTab, StoredEspelhoFrame } from './ContractEspelhoTab';
import {
  agendaColor,
  contractAgenda,
  contractAgendaLabel,
  finalizeBlockedReason,
  terminalErrorMessage,
  STATUS_META,
  STATUS_TEXT_COLOR,
  STATUS_TINT,
} from './SaleContractCard';

type ContractDetailTab = 'detalhes' | 'aprovacao' | 'espelho' | 'historico';

const TABS: Array<{ key: ContractDetailTab; label: string }> = [
  { key: 'detalhes', label: 'Detalhes' },
  { key: 'aprovacao', label: 'Aprovação' },
  { key: 'espelho', label: 'Espelho' },
  { key: 'historico', label: 'Histórico' },
];

type SaleContractDetailsModalProps = {
  session: SessionData;
  open: boolean;
  // Snapshot vindo da lista — o modal re-busca o contrato FRESCO ao abrir
  // (padrão do espelho) pra corretores + valores atuais.
  contract: SaleContract;
  canManage: boolean;
  onClose: () => void;
  onEditar: () => void;
  onApplyAgio: (type: AgioDesagioType) => void;
  onWashout: () => void;
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
      // RC-D105: a linha FICA depois de o documento expirar (o fato auditado não
      // expira), e é por isso que ela não diz nada sobre disponibilidade — quem mostra
      // o que ainda se pode abrir é a aba Espelho.
      return `Espelho exportado — ${espelhoSideLabel(item.side)}`;
    case 'STATUS': {
      // RC-D63: a marca terminal VAI e VOLTA — o log acumula as duas linhas, e
      // é por isso que "quem finalizou e quando" não virou coluna do contrato.
      // 🔴 RC-D128: esta linha é o ÚNICO lugar do produto onde o MOTIVO do washout
      // aparece — o PDF do contrato não o imprime e a faixa da aba Detalhes é sobre
      // dinheiro. Apagar o histórico apagaria o motivo junto.
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

export function SaleContractDetailsModal({
  session,
  open,
  contract,
  canManage,
  onClose,
  onEditar,
  onApplyAgio,
  onWashout,
}: SaleContractDetailsModalProps) {
  // Contrato fresco (corretores incluídos) + timeline, buscados ao abrir.
  const [fresh, setFresh] = useState<SaleContract | null>(null);
  const [brokers, setBrokers] = useState<SaleContractBrokerView[]>([]);
  // RC-D37/D110: dono ATUAL do lote — só o aviso de divergência da aba Espelho usa.
  const [sampleOwner, setSampleOwner] = useState<{
    clientId: string;
    displayName: string | null;
  } | null>(null);
  const [timeline, setTimeline] = useState<SaleContractTimelineItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ContractDetailTab>('detalhes');
  // Aba já visitada = aba MONTADA. Sem isto, voltar para o Espelho refaria o download de
  // cada PDF, e voltar para a Aprovação refaria o prefill.
  const [mounted, setMounted] = useState<Record<ContractDetailTab, boolean>>({
    detalhes: true,
    aprovacao: false,
    espelho: false,
    historico: false,
  });
  useEffect(() => {
    setMounted((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
  }, [activeTab]);

  // Documento (PDF on-demand, D126) — mesmo pipeline do antigo "Visualizar". O blob
  // (e não uma object URL) porque quem desenha é o `ContractDocumentView`, que
  // rasteriza — RC-D130.
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<{ blob: Blob; fileName: string } | null>(null);
  const [now] = useState(() => Date.now());
  // RC-D62/D63: Finalizar/Reabrir vivem no rodapé da aba Detalhes, sem confirmação.
  const [terminalBusy, setTerminalBusy] = useState(false);
  // RC-D126/D127: o prefill da etiqueta. Antes era buscado no clique de um botão que
  // abria um modal; agora é o conteúdo da aba, buscado na primeira ativação dela.
  const [labelPrefill, setLabelPrefill] = useState<ApprovalLabelPrefill | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  // Recarrega contrato + timeline + prefill depois de imprimir etiqueta, entregar espelho
  // ou finalizar/reabrir (os três mudam o que as abas mostram).
  const [reloadNonce, setReloadNonce] = useState(0);
  const toast = useToast();
  // AP32: "Solicitar aprovação" — latch de mão única + confirmação (é definitivo).
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalConfirmOpen, setApprovalConfirmOpen] = useState(false);
  const approvalConfirmTrapRef = useFocusTrap(approvalConfirmOpen);
  // RC-D128: a linha "Espelho exportado" do Histórico abre o documento ali mesmo. É por
  // onde se chega aos SUBSTITUÍDOS — que a aba Espelho, mostrando um por lado, não mostra.
  const [openHistoryEspelho, setOpenHistoryEspelho] = useState<{
    logId: string;
    side: EspelhoSide;
  } | null>(null);

  // Com o confirm de aprovação aberto, ESC/X do overlay NÃO fecham o detalhe (molde do
  // dismissGuardRef da F1 — ver DetailOverlay). É a única superfície interna que sobrou:
  // a etiqueta e o espelho deixaram de ser modais na RC-D125/D127.
  const dismissGuardRef = useRef(false);
  useEffect(() => {
    dismissGuardRef.current = approvalConfirmOpen;
    return () => {
      dismissGuardRef.current = false;
    };
  }, [approvalConfirmOpen]);

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
        setSampleOwner(detail.contract.sampleOwner ?? null);
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

  // 🔴 O `reloadNonce` está aqui de propósito: o "Gerar etiqueta" da aba Aprovação
  // grava o **Nº compra** no contrato, e o PDF IMPRIME o Nº compra. Sem esta
  // dependência, voltar para a aba Detalhes mostrava o documento anterior à gravação —
  // o papel dizendo uma coisa e a etiqueta que acabou de sair dizendo outra.
  useEffect(() => {
    if (!open) return;
    let aborted = false;
    (async () => {
      setPdfError(null);
      setPdfBlob(null);
      try {
        const { blob, fileName } = await downloadSaleContractPdf(session, contract.id);
        if (aborted) return;
        fileRef.current = { blob, fileName };
        setPdfBlob(blob);
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
    };
  }, [open, session, contract.id, reloadNonce]);

  // RC-D130: o documento vira imagem de página. Antes era `<iframe src={blobUrl}>`, que
  // entrega o PDF embrulhado no visualizador do navegador — barra escura, miniaturas e
  // fundo cinza em volta da folha.
  const contractDocument = useContractDocumentPages(pdfBlob);

  const view = fresh ?? contract;
  const meta = STATUS_META[view.status];
  const agenda = contractAgenda(view);
  const agendaTone = agendaColor(agenda);

  // RC-D126: o prefill só existe quando a aprovação foi pedida — o endpoint responde 409
  // quando não (é a mesma pré-condição, não um erro a mostrar). O `status === 'EMITIDO'`
  // entra pelo mesmo motivo: o gate AP21 do prefill é o mesmo do envio, então buscar num
  // contrato finalizado só produziria um 409 a exibir. A aba escreve a frase em vez disso.
  const wantsPrefill =
    mounted.aprovacao && canManage && view.requiresApproval && view.status === 'EMITIDO';
  useEffect(() => {
    if (!open || !wantsPrefill) return;
    let aborted = false;
    (async () => {
      setLabelError(null);
      try {
        const prefill = await getApprovalLabelPrefill(session, contract.id);
        if (!aborted) setLabelPrefill(prefill);
      } catch (cause) {
        if (!aborted) {
          setLabelError(
            cause instanceof ApiError ? cause.message : 'Não foi possível carregar a etiqueta.'
          );
        }
      }
    })();
    return () => {
      aborted = true;
    };
  }, [open, session, contract.id, wantsPrefill, reloadNonce]);

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
      toast.error({ title: terminalErrorMessage(cause, 'Não foi possível atualizar o contrato.') });
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

  // RC-D123: o rodapé é da ABA. Só Detalhes tem ações — as outras três não mudam a
  // situação do contrato, e um rodapé que segue igual nas quatro diria o contrário.
  const footerButtons: Array<{
    key: string;
    label: string;
    danger?: boolean;
    disabled?: boolean;
    hint?: string;
    onClick: () => void;
  }> = [];
  if (activeTab === 'detalhes' && canManage && view.status === 'EMITIDO') {
    // RC-D85/D86: a trava do Finalizar. O motivo vira a linha acima do rodapé —
    // aqui o operador tem o "Editar" logo acima do PDF, que é justamente a saída.
    const finalizeBlocked = finalizeBlockedReason(view);
    footerButtons.push(
      { key: 'agio', label: 'Ágio', onClick: () => onApplyAgio('AGIO') },
      { key: 'desagio', label: 'Deságio', onClick: () => onApplyAgio('DESAGIO') },
      {
        key: 'finalizar',
        label: terminalBusy ? 'Finalizando...' : 'Finalizar',
        disabled: terminalBusy || finalizeBlocked != null,
        hint: finalizeBlocked ?? undefined,
        onClick: () => void runTerminal('finalize'),
      },
      { key: 'washout', label: 'Washout', danger: true, onClick: onWashout }
    );
  } else if (activeTab === 'detalhes' && canManage && view.status === 'FINALIZADO') {
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

  const footerHint = footerButtons.find((button) => button.hint)?.hint ?? null;
  const footer =
    footerButtons.length > 0 ? (
      <div className="ctr-details-actions">
        {footerHint ? <p className="ctr-details-actions-hint">{footerHint}</p> : null}
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

  // RC-D122: a FAIXA — só o que o PDF do contrato NÃO imprime. A caixa "QUANTIDADES E
  // VALORES" do papel sai com Qtd./Vlr. Saca (CRU)/Peso/C. Vend. %/C. Comp. %; não sai
  // ágio, nem total, nem corretagem em R$, nem os corretores. Repetir aqui o que o
  // documento já diz seria voltar à ficha de texto que esta rodada apagou.
  const faixaRows: Array<[string, string]> = [['Valor total', money(view.totalValue)]];
  if (view.agioDesagioType && view.agioDesagioValue != null) {
    faixaRows.push([
      view.agioDesagioType === 'AGIO' ? 'Ágio' : 'Deságio',
      `${money(view.agioDesagioValue)}/sc`,
    ]);
    // Só com ágio/deságio o preço efetivo difere do impresso — sem isso seria ruído.
    faixaRows.push(['Preço efetivo', `${money(view.effectiveUnitPrice)}/sc`]);
  }
  faixaRows.push([
    'Corretagem vendedor',
    `${view.sellerBrokeragePct ?? 0}% · ${money(view.sellerBrokerageValue)}`,
  ]);
  faixaRows.push([
    'Corretagem comprador',
    `${view.buyerBrokeragePct ?? 0}% · ${money(view.buyerBrokerageValue)}`,
  ]);
  if (brokers.length > 0) {
    faixaRows.push(['Corretores', brokers.map((broker) => broker.brokerNameSnapshot).join(', ')]);
  }

  function panelProps(tab: ContractDetailTab) {
    return {
      role: 'tabpanel' as const,
      id: `ctr-tabpanel-${tab}`,
      'aria-labelledby': `ctr-tab-${tab}`,
      hidden: activeTab !== tab,
      // O `hidden` sozinho perde para qualquer regra de display do conteúdo.
      style: activeTab === tab ? undefined : { display: 'none' },
    };
  }

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
        {/* RC-D68: dois selos — a SITUAÇÃO (emitido/finalizado/cancelado) e, quando há um,
            o PRÓXIMO COMPROMISSO. Ficam ACIMA das abas: valem para as quatro. */}
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

        {/* RC-D121: molde ARIA do .fv-tabs (o mesmo do detalhe do lote, RD15). */}
        <div className="fv-tabs" role="tablist" aria-label="Seções do contrato">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`ctr-tab-${tab.key}`}
              aria-selected={activeTab === tab.key}
              aria-controls={`ctr-tabpanel-${tab.key}`}
              className={`fv-tab${activeTab === tab.key ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="ctr-details-panels">
          {/* ── Detalhes (RC-D122): a faixa + o documento. ── */}
          <div {...panelProps('detalhes')}>
            <div className="ctr-details-faixa">
              <dl className="ctr-details-rows">
                {faixaRows.map(([label, value]) => (
                  <div key={label} className="ctr-details-row">
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="ctr-details-faixa-actions">
                {canManage && view.status === 'EMITIDO' ? (
                  <button type="button" className="ctr-btn" onClick={onEditar}>
                    Editar
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ctr-btn"
                  onClick={() =>
                    fileRef.current && downloadFile(fileRef.current.blob, fileRef.current.fileName)
                  }
                  disabled={!pdfBlob}
                >
                  Baixar
                </button>
                <button
                  type="button"
                  className="ctr-btn"
                  onClick={() => void handleExport()}
                  disabled={!pdfBlob || busy}
                >
                  {busy ? 'Exportando...' : 'Exportar'}
                </button>
              </div>
            </div>

            {pdfError ? (
              <p className="sdv-modal-error">{pdfError}</p>
            ) : (
              <ContractDocumentView
                document={contractDocument}
                label={`o contrato ${view.contractNumber}`}
                loadingLabel="Gerando o documento..."
                onFallbackDownload={
                  fileRef.current
                    ? () =>
                        fileRef.current &&
                        downloadFile(fileRef.current.blob, fileRef.current.fileName)
                    : null
                }
              />
            )}
          </div>

          {/* ── Aprovação (RC-D126/D127) ── */}
          {mounted.aprovacao ? (
            <div {...panelProps('aprovacao')}>
              {view.requiresApproval ? (
                // 🔴 A etiqueta só sai em EMITIDO (AP21, `APPROVAL_ELIGIBLE_STATUSES`) — e o
                // prefill é gateado pelo MESMO enum: fora dele o endpoint responde 409. Como
                // a busca acontece ao ativar a aba, e não num clique, um 409 aqui viraria um
                // banner de erro cru que ninguém pediu. Cada situação escreve a própria
                // frase, ANTES de qualquer busca (o `wantsPrefill` também confere o status).
                view.status !== 'EMITIDO' ? (
                  <p className="ctr-details-empty">
                    {view.status === 'WASH_OUT'
                      ? 'Contrato cancelado — a etiqueta de aprovação não sai mais.'
                      : 'Contrato finalizado — a etiqueta de aprovação só sai enquanto ele está emitido. Reabra o contrato para gerá-la.'}
                  </p>
                ) : !canManage ? (
                  <p className="ctr-details-empty">Este contrato exige aprovação.</p>
                ) : labelError ? (
                  <p className="sdv-modal-error">{labelError}</p>
                ) : labelPrefill ? (
                  <ApprovalLabelForm
                    session={session}
                    saleContractId={contract.id}
                    prefill={labelPrefill}
                    onSent={() => setReloadNonce((n) => n + 1)}
                  />
                ) : (
                  <p className="ctr-modal-loading">Carregando a etiqueta...</p>
                )
              ) : canManageApproval ? (
                // AP32: latch de mão única — a confirmação é obrigatória.
                <div className="ctr-approval-latch">
                  <p className="fv-panel-lead">
                    Este contrato não exige aprovação. Ligar a exigência é definitivo.
                  </p>
                  <div className="ctr-details-actions">
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
                </div>
              ) : (
                <p className="ctr-details-empty">
                  Este contrato não exige aprovação, e a exigência só pode ser ligada enquanto ele
                  está emitido.
                </p>
              )}
            </div>
          ) : null}

          {/* ── Espelho (RC-D124/D125) ── */}
          {mounted.espelho ? (
            <div {...panelProps('espelho')}>
              <ContractEspelhoTab
                session={session}
                contract={view}
                timeline={timeline}
                sampleOwner={sampleOwner}
                onDelivered={() => setReloadNonce((n) => n + 1)}
              />
            </div>
          ) : null}

          {/* ── Histórico (RC-D128): ordem decrescente. Linha D118/D119 = "há X tempo" +
              quem + o quê, com a data exata de apoio; marcos legados (pré-D123) saem só
              com a data, sem autor. ── */}
          {mounted.historico ? (
            <div {...panelProps('historico')}>
              {timeline === null ? (
                <p className="ctr-modal-loading">Carregando o histórico...</p>
              ) : timeline.length === 0 ? (
                <p className="ctr-details-empty">Sem eventos registrados.</p>
              ) : (
                <ul className="ctr-tl">
                  {timeline.map((item) => {
                    const openable =
                      item.kind === 'ESPELHO' && item.available && item.logId && item.side;
                    const isOpen = openHistoryEspelho?.logId === item.logId;
                    return (
                      <li key={item.id} className="ctr-tl-item">
                        <span className="ctr-tl-rel">{formatRelativeTime(item.at, now)}</span>
                        <span className="ctr-tl-main">
                          {item.actorName ? <strong>{item.actorName}</strong> : null}
                          {item.actorName ? ' · ' : ''}
                          {openable ? (
                            <button
                              type="button"
                              className="ctr-tl-open"
                              onClick={() =>
                                setOpenHistoryEspelho(
                                  isOpen
                                    ? null
                                    : {
                                        logId: item.logId as string,
                                        side: item.side as EspelhoSide,
                                      }
                                )
                              }
                            >
                              {timelineLabel(item)}
                              {item.superseded ? ' (substituído)' : ''}
                            </button>
                          ) : (
                            timelineLabel(item)
                          )}
                        </span>
                        <span className="ctr-tl-exact">{exactStamp(item)}</span>
                        {isOpen ? (
                          <StoredEspelhoFrame
                            session={session}
                            contractId={contract.id}
                            logId={item.logId as string}
                            side={item.side as EspelhoSide}
                            contractNumber={view.contractNumber}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </DetailOverlay>

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
