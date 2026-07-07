'use client';

// Fase J (D120–D126): modal de DETALHES do contrato. Frame grande do modal de
// emissão (BottomSheet .ctr-contract-sheet: central na área de conteúdo no
// desktop ≥901px, sheet de coluna única no mobile). Desktop: o DOCUMENTO
// (PDF on-demand, D126 — mesmo blob/iframe do antigo "Visualizar", que este
// modal absorveu) na coluna ESQUERDA e as seções read-only na DIREITA; mobile:
// documento primeiro. Exportar/Baixar acompanham a seção do documento, em
// todos os status. O HISTÓRICO (timeline D125) fecha o modal em largura total:
// linha = "há X tempo" + quem + o quê, com a data/hora exata de apoio (D119);
// marcos legados (pré-D123) saem só com a data, sem autor. Rodapé = ações por
// status (D121/D122): EMITIDO = Editar·Ágio·Deságio·Washout; FATURADO/PAGO =
// Washout; WASH_OUT = sem ações. COMMERCIAL vê TUDO nos contratos dele (D120 —
// a restrição da D86 vale só no Financeiro). Dados: getSaleContract fresco
// (com corretores) + getSaleContractTimeline.

import { useEffect, useRef, useState } from 'react';

import {
  ApiError,
  downloadSaleContractPdf,
  getSaleContract,
  getSaleContractTimeline,
} from '../../lib/api-client';
import { formatRelativeTime } from '../../lib/relative-time';
import { downloadFile, shareOrDownloadFile } from '../../lib/share-blob';
import type {
  AgioDesagioType,
  SaleContract,
  SaleContractBrokerView,
  SaleContractTimelineItem,
  SessionData,
} from '../../lib/types';
import { BottomSheet } from '../BottomSheet';
import { STATUS_META, STATUS_TEXT_COLOR, STATUS_TINT } from './SaleContractCard';

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
      const base =
        item.toStatus === 'FATURADO' ? 'Faturado' : item.toStatus === 'PAGO' ? 'Pago' : 'Washout';
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
  }, [open, session, contract.id]);

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

  const view = fresh ?? contract;
  const meta = STATUS_META[view.status];

  // Rodapé por status (D121/D122). WASH_OUT (ou sem gestão) = sem rodapé —
  // Exportar/Baixar já vivem na seção do documento.
  const footerButtons: Array<{
    key: string;
    label: string;
    danger?: boolean;
    onClick: () => void;
  }> = [];
  if (canManage && view.status === 'EMITIDO') {
    footerButtons.push(
      { key: 'editar', label: 'Editar', onClick: onEditar },
      { key: 'agio', label: 'Ágio', onClick: () => onApplyAgio('AGIO') },
      { key: 'desagio', label: 'Deságio', onClick: () => onApplyAgio('DESAGIO') },
      { key: 'washout', label: 'Washout', danger: true, onClick: onWashout }
    );
  } else if (canManage && (view.status === 'FATURADO' || view.status === 'PAGO')) {
    footerButtons.push({ key: 'washout', label: 'Washout', danger: true, onClick: onWashout });
  }

  const footer =
    footerButtons.length > 0 ? (
      <div className="ctr-details-actions">
        {footerButtons.map((button) => (
          <button
            key={button.key}
            type="button"
            className={`ctr-btn${button.danger ? ' ctr-btn-danger' : ''}`}
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
  identRows.push(['Faturamento (planejado)', dateOnly(view.invoiceDate)]);
  if (view.invoicedAt) identRows.push(['Faturado em', dateOnly(view.invoicedAt)]);
  identRows.push(['Pagamento (planejado)', dateOnly(view.paymentDate)]);
  if (view.paidAt) identRows.push(['Pago em', dateOnly(view.paidAt)]);
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
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`Contrato ${view.contractNumber}`}
      ariaLabel={`Detalhes do contrato ${view.contractNumber}`}
      className="ctr-form-sheet ctr-contract-sheet ctr-details-sheet"
      footer={footer}
    >
      <div className="ctr-details-head">
        <span
          className="spv2-card-badge"
          style={{ background: STATUS_TINT[view.status], color: STATUS_TEXT_COLOR[view.status] }}
        >
          {meta.label}
        </span>
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
    </BottomSheet>
  );
}
