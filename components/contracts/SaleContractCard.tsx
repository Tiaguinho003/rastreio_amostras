'use client';

import type {
  ContractAgenda,
  ContractAgendaKind,
  SaleContract,
  SaleContractStatus,
  SaleContractType,
} from '../../lib/types';

// Fechamento (Fase B.3): card de um contrato na pagina "Contratos". Versao
// recolhida (basico) + expandida (dropdown estilo Lotes): barra colorida na
// lateral + acoes e detalhes ao expandir. Nomes das partes vem do snapshot.
//
// RC-F6: este card e a lista do MOBILE. No desktop a lista virou `.fv-table`
// (ContratosPanel) — os helpers/mapas exportados daqui sao a fonte unica dos
// dois. O modo de selecao do Espelho (D76) SAIU junto com o gatilho da pagina:
// o espelho nasce so no Detalhes do contrato.
//
// RC-D68: o que a barra e o selo carregam NAO e mais a fase do contrato — e a
// AGENDA (o proximo compromisso), derivada no servidor. "Emitido" nunca foi
// informacao util: todo contrato vivo e emitido. O que o operador precisa saber
// e o que este contrato ainda vai pedir dele, e quando.

// Rótulo/cores do selo de SITUAÇÃO (o terminal). Exportado para o modal de
// Detalhes. (O seletor da Aprovação do /samples saiu na AP29.)
export const STATUS_META: Record<SaleContractStatus, { label: string; variant: string }> = {
  EMITIDO: { label: 'Em andamento', variant: 'status-badge-success' },
  FINALIZADO: { label: 'Finalizado', variant: 'status-badge-muted' },
  WASH_OUT: { label: 'Cancelado', variant: 'status-badge-danger' },
};

export const STATUS_TINT: Record<SaleContractStatus, string> = {
  EMITIDO: '#fef9c3', // amarelo claro
  FINALIZADO: '#dcfce7',
  WASH_OUT: '#fee2e2',
};

// Cor do TEXTO do selo. O "em andamento" usa amarelo ESCURO: o amarelo vivo da
// barra (#eab308) sumiria como texto no fundo claro.
export const STATUS_TEXT_COLOR: Record<SaleContractStatus, string> = {
  EMITIDO: '#a16207',
  FINALIZADO: '#15803d',
  WASH_OUT: '#dc2626',
};

// RC-D68: a paleta da AGENDA. Um compromisso por vez, e a cor diz o tom — âmbar
// pede ação, azul só lembra, vermelho venceu, verde/cinza acabou. O vencido é o
// único vermelho de contrato vivo no app (RC-D64).
const AGENDA_COLOR: Record<ContractAgendaKind, { bar: string; tint: string; text: string }> = {
  cancelado: { bar: '#dc2626', tint: '#fee2e2', text: '#dc2626' },
  finalizado: { bar: '#15803d', tint: '#dcfce7', text: '#15803d' },
  aprovacao: { bar: '#eab308', tint: '#fef9c3', text: '#a16207' },
  pagamento_vencido: { bar: '#dc2626', tint: '#fee2e2', text: '#dc2626' },
  faturamento: { bar: '#0d9488', tint: '#ccfbf1', text: '#0d9488' },
  pagamento: { bar: '#0d9488', tint: '#ccfbf1', text: '#0d9488' },
  nenhum: { bar: '#cbd5e1', tint: '#f1f5f9', text: '#64748b' },
};

// Variante do `.fv-chip` por agenda, pra tabela do desktop. Os mapas de cor acima
// pintam o card (barra + selo com `style` inline); a tabela usa o chip do kit
// institucional. Mesma leitura semantica nos dois.
export const AGENDA_CHIP: Record<ContractAgendaKind, string> = {
  cancelado: 'fv-chip fv-chip-red',
  finalizado: 'fv-chip fv-chip-green',
  aprovacao: 'fv-chip fv-chip-amber',
  pagamento_vencido: 'fv-chip fv-chip-red',
  faturamento: 'fv-chip fv-chip-blue',
  pagamento: 'fv-chip fv-chip-blue',
  nenhum: 'fv-chip',
};

const AGENDA_FALLBACK: ContractAgenda = { kind: 'nenhum', dayKey: null };

export function contractAgenda(contract: { agenda?: ContractAgenda }): ContractAgenda {
  return contract.agenda ?? AGENDA_FALLBACK;
}

export function agendaColor(agenda: ContractAgenda) {
  return AGENDA_COLOR[agenda.kind] ?? AGENDA_COLOR.nenhum;
}

// A frase da agenda. O servidor derivou O QUE é (kind + dayKey); a data vira texto
// aqui, porque formatar data é do front — foi por isso que o derivador não devolve
// `label` pronto.
export function contractAgendaLabel(agenda: ContractAgenda): string {
  const when = agenda.dayKey ? formatContractDate(agenda.dayKey) : null;
  switch (agenda.kind) {
    case 'cancelado':
      return 'Cancelado';
    case 'finalizado':
      return 'Finalizado';
    case 'aprovacao':
      return 'Aprovação a enviar';
    case 'pagamento_vencido':
      return when ? `Pagamento venceu ${when}` : 'Pagamento vencido';
    case 'faturamento':
      return when ? `Fatura em ${when}` : 'Fatura à definir';
    case 'pagamento':
      return when ? `Pagamento em ${when}` : 'Pagamento à definir';
    default:
      return '—';
  }
}

export const TYPE_LABEL: Record<SaleContractType, string> = {
  MERCADO_A_VISTA: 'À vista',
  FUTURO: 'Futuro',
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function snapshotName(snap: Record<string, unknown> | null): string {
  if (!snap) return '—';
  const value = (snap.displayName ?? snap.legalName ?? snap.fullName) as string | undefined;
  return value && value.trim() ? value : '—';
}

export function formatContractDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function money(value: number | null): string {
  return value != null ? BRL.format(value) : '—';
}

type SaleContractCardProps = {
  contract: SaleContract;
  isExpanded: boolean;
  onToggle: () => void;
  // Card ENXUTO (Fase J, D121): so o dia a dia — o marco terminal (canManage) +
  // Detalhes. Editar/Visualizar/Agio/Desagio/Washout vivem no modal de Detalhes.
  // RC-D62/D63: um botao so, e ele volta — "Finalizar" no contrato em andamento,
  // "Reabrir" no finalizado.
  onFinalizar: () => void;
  onReabrir: () => void;
  // Detalhes (D120): modal grande com o documento + infos + historico. Em
  // TODAS as situacoes, fora do canManage (COMMERCIAL ve tudo nos dele).
  onDetalhes: () => void;
  // Finalizar/Reabrir so pra quem pode gerenciar (D110).
  canManage?: boolean;
  // DSB-D11: realce (pisca/rola) quando chega do chip de faturamento do dashboard
  // (?highlight=<id>). Molde do FinanceiroCard.
  isHighlighted?: boolean;
};

export function SaleContractCard({
  contract,
  isExpanded,
  onToggle,
  onFinalizar,
  onReabrir,
  onDetalhes,
  canManage = true,
  isHighlighted = false,
}: SaleContractCardProps) {
  const agenda = contractAgenda(contract);
  const color = agendaColor(agenda);

  // Cabecalho (numero + agenda + partes) — compartilhado pelos dois modos.
  const head = (
    <>
      <span className="ctr-card-bar" style={{ background: color.bar }} aria-hidden="true" />
      <span className="ctr-card-head-main">
        <span className="ctr-card-top">
          <span className="ctr-card-number">{contract.contractNumber}</span>
          <span className="ctr-card-status" style={{ color: color.text, background: color.tint }}>
            {contractAgendaLabel(agenda)}
          </span>
        </span>
        <span className="ctr-card-parties">
          <span className="ctr-card-party">{snapshotName(contract.sellerSnapshot)}</span>
          <svg className="ctr-card-arrow" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          <span className="ctr-card-party">{snapshotName(contract.buyerSnapshot)}</span>
        </span>
      </span>
    </>
  );

  return (
    <div
      className={`ctr-card${isExpanded ? ' is-expanded' : ''}${isHighlighted ? ' is-highlighted' : ''}`}
      data-contract-id={contract.id}
    >
      <button
        type="button"
        className="ctr-card-head-btn"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        {head}
        <span className="ctr-card-head-right">
          <span className="ctr-card-type">{TYPE_LABEL[contract.type] ?? contract.type}</span>
          <svg className="ctr-card-chevron" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      <div className="ctr-card-expanded" aria-hidden={!isExpanded}>
        <div className="ctr-card-expanded-inner">
          <div className="ctr-card-essential">
            <span className="ctr-card-stat">
              <span className="ctr-card-stat-label">Sacas</span>
              <span className="ctr-card-stat-value">{contract.quantitySacks} sc</span>
            </span>
            <span className="ctr-card-stat">
              <span className="ctr-card-stat-label">Data</span>
              <span className="ctr-card-stat-value">
                {formatContractDate(contract.contractDate)}
              </span>
            </span>
            <span className="ctr-card-stat">
              <span className="ctr-card-stat-label">Total</span>
              <span className="ctr-card-stat-value">{money(contract.totalValue)}</span>
            </span>
            <span className="ctr-card-stat">
              <span className="ctr-card-stat-label">Preço/saca</span>
              <span className="ctr-card-stat-value">{money(contract.unitPrice)}</span>
            </span>
            {contract.agioDesagioType ? (
              <span className="ctr-card-stat">
                <span className="ctr-card-stat-label">
                  {contract.agioDesagioType === 'AGIO' ? 'Ágio' : 'Deságio'}
                </span>
                <span className="ctr-card-stat-value">{money(contract.agioDesagioValue)}/sc</span>
              </span>
            ) : null}
            <span className="ctr-card-stat">
              <span className="ctr-card-stat-label">Faturamento</span>
              <span className="ctr-card-stat-value">
                {contract.invoiceDate ? formatContractDate(contract.invoiceDate) : 'À definir'}
              </span>
            </span>
            <span className="ctr-card-stat">
              <span className="ctr-card-stat-label">Pagamento</span>
              <span className="ctr-card-stat-value">
                {contract.paymentDate ? formatContractDate(contract.paymentDate) : 'À definir'}
              </span>
            </span>
          </div>

          {contract.status === 'WASH_OUT' && contract.washoutReason ? (
            <p className="ctr-card-washout">Washout: {contract.washoutReason}</p>
          ) : null}

          {/* Card ENXUTO (D121): o marco terminal + Detalhes. O resto (Editar/
              Visualizar/Agio/Desagio/Washout/etiqueta) vive no modal de Detalhes.
              RC-D63: Finalizar e Reabrir NAO pedem confirmacao — sao reversiveis, e
              confirmar um toque reversivel e ruido. O washout, que e definitivo,
              continua pedindo motivo (no Detalhes). */}
          <div className="ctr-card-actions">
            {contract.status === 'EMITIDO' && canManage ? (
              <button type="button" className="ctr-btn ctr-btn-primary" onClick={onFinalizar}>
                Finalizar
              </button>
            ) : null}
            {contract.status === 'FINALIZADO' && canManage ? (
              <button type="button" className="ctr-btn" onClick={onReabrir}>
                Reabrir
              </button>
            ) : null}
            <button type="button" className="ctr-btn" onClick={onDetalhes}>
              Detalhes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
