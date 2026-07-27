'use client';

import type { SaleContract, SaleContractStatus, SaleContractType } from '../../lib/types';

// Fechamento (Fase B.3): card de um contrato na pagina "Contratos". Versao
// recolhida (basico) + expandida (dropdown estilo Lotes): barra colorida por
// status na lateral + acoes e detalhes ao expandir. As acoes dependem do status
// (maquina do Passo 2). Nomes das partes vem do snapshot.
//
// Modo de selecao do Espelho de Corretagem (Fase E, D76): quando `espelhoMode`,
// o card vira um BOTAO de selecao (tap-to-open); inelegiveis (status nao
// congelado) ficam esmaecidos e nao selecionaveis.

// Exportado: rótulo/cores do selo de status, reusados por outros componentes de
// contrato (ex.: o modal de Detalhes). (O seletor da Aprovação do /samples saiu na AP29.)
export const STATUS_META: Record<SaleContractStatus, { label: string; variant: string }> = {
  EMITIDO: { label: 'Emitido', variant: 'status-badge-success' },
  FATURADO: { label: 'Faturado', variant: 'status-badge-muted' },
  PAGO: { label: 'Pago', variant: 'status-badge-muted' },
  WASH_OUT: { label: 'Washout', variant: 'status-badge-danger' },
};

// Cor da barra lateral por status (decisao: distintas por status).
const STATUS_BAR_COLOR: Record<SaleContractStatus, string> = {
  EMITIDO: '#eab308', // amarelo
  FATURADO: '#0d9488', // azul-petroleo (teal)
  PAGO: '#15803d', // verde-escuro
  WASH_OUT: '#dc2626', // vermelho
};

// Fundo (tint claro) do selo de status — combina com a cor do texto/barra.
export const STATUS_TINT: Record<SaleContractStatus, string> = {
  EMITIDO: '#fef9c3', // amarelo claro
  FATURADO: '#ccfbf1',
  PAGO: '#dcfce7',
  WASH_OUT: '#fee2e2',
};

// Cor do TEXTO do selo. Igual à barra, EXCETO o Emitido: a barra é amarelo vivo
// (#eab308), que sumiria como texto no fundo claro — então o selo usa um amarelo
// escuro legível.
export const STATUS_TEXT_COLOR: Record<SaleContractStatus, string> = {
  EMITIDO: '#a16207', // amarelo-escuro (legível no selo)
  FATURADO: '#0d9488',
  PAGO: '#15803d',
  WASH_OUT: '#dc2626',
};

const TYPE_LABEL: Record<SaleContractType, string> = {
  MERCADO_A_VISTA: 'À vista',
  FUTURO: 'Futuro',
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function snapshotName(snap: Record<string, unknown> | null): string {
  if (!snap) return '—';
  const value = (snap.displayName ?? snap.legalName ?? snap.fullName) as string | undefined;
  return value && value.trim() ? value : '—';
}

function formatContractDate(iso: string | null): string {
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
  // Card ENXUTO (Fase J, D121): so o dia a dia — avancar status (canManage) +
  // Detalhes. Editar/Visualizar/Agio/Desagio/Washout vivem no modal de Detalhes
  // (Desfazer removido, D122).
  onFaturar: () => void;
  // RC-D22 REVOGA a D137: o "Pago" VOLTA pro card, ao lado do Faturado. Ele
  // morava so no Financeiro, que a RC-D3 fecha pro ADMIN — sem isso, 4 dos 5
  // papeis perderiam o fim do ciclo do dinheiro. Segue tambem no Financeiro.
  onPagar: () => void;
  // Detalhes (D120): modal grande com o documento + infos + historico. Em
  // TODOS os status, fora do canManage (COMMERCIAL ve tudo nos dele).
  onDetalhes: () => void;
  // Avancar status (Faturado/Pago) so pra quem pode gerenciar (D110).
  canManage?: boolean;
  // DSB-D11: realce (pisca/rola) quando chega do chip de faturamento do dashboard
  // (?highlight=<id>). Molde do EmbarqueCard/FinanceiroCard.
  isHighlighted?: boolean;
  // Modo de selecao p/ o Espelho de Corretagem (Fase E): o card vira botao de
  // selecao; inelegiveis (status != EMITIDO/FATURADO/PAGO) ficam esmaecidos.
  espelhoMode?: boolean;
  espelhoEligible?: boolean;
  espelhoReason?: string;
  onSelectEspelho?: () => void;
};

export function SaleContractCard({
  contract,
  isExpanded,
  onToggle,
  onFaturar,
  onPagar,
  onDetalhes,
  canManage = true,
  isHighlighted = false,
  espelhoMode = false,
  espelhoEligible = false,
  espelhoReason,
  onSelectEspelho,
}: SaleContractCardProps) {
  const meta = STATUS_META[contract.status];

  // Cabecalho (numero + status + partes) — compartilhado pelos dois modos.
  const head = (
    <>
      <span
        className="ctr-card-bar"
        style={{ background: STATUS_BAR_COLOR[contract.status] }}
        aria-hidden="true"
      />
      <span className="ctr-card-head-main">
        <span className="ctr-card-top">
          <span className="ctr-card-number">{contract.contractNumber}</span>
          <span
            className="ctr-card-status"
            style={{
              color: STATUS_TEXT_COLOR[contract.status],
              background: STATUS_TINT[contract.status],
            }}
          >
            {meta.label}
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

  // ----- Modo de selecao do Espelho de Corretagem (tap-to-open, D76) -----
  if (espelhoMode) {
    return (
      <div className={`ctr-card ctr-card-selectable${espelhoEligible ? '' : ' is-ineligible'}`}>
        <button
          type="button"
          className="ctr-card-head-btn"
          onClick={espelhoEligible ? onSelectEspelho : undefined}
          disabled={!espelhoEligible}
          aria-label={
            espelhoEligible
              ? `Gerar Espelho de Corretagem do contrato ${contract.contractNumber}`
              : `Contrato ${contract.contractNumber} indisponível para espelho`
          }
        >
          {head}
          <span className="ctr-card-head-right">
            {espelhoEligible ? (
              <span className="ctr-card-select-cta">
                Gerar
                <svg className="ctr-card-arrow" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            ) : (
              <span className="ctr-card-select-hint">{espelhoReason ?? 'Indisponível'}</span>
            )}
          </span>
        </button>
      </div>
    );
  }

  // ----- Modo normal (gestao) -----
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

          {/* Card ENXUTO (D121): avancar status + Detalhes. O resto (Editar/Visualizar/
              Agio/Desagio/Washout/etiqueta/embarque) vive no modal de Detalhes.
              RC-D22: um botao de avanco por vez — EMITIDO mostra [Faturado],
              FATURADO mostra [Pago]; o portao do embarque (EMB28) segue no dialogo. */}
          <div className="ctr-card-actions">
            {contract.status === 'EMITIDO' && canManage ? (
              <button type="button" className="ctr-btn ctr-btn-primary" onClick={onFaturar}>
                Faturado
              </button>
            ) : null}
            {contract.status === 'FATURADO' && canManage ? (
              <button type="button" className="ctr-btn ctr-btn-primary" onClick={onPagar}>
                Pago
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
