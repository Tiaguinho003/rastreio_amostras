'use client';

import type { ReactNode, RefObject } from 'react';

import { ApiError } from '../../lib/api-client';
import { todayInputValueBRT } from '../../lib/business-days';
import {
  contractCountdownLabel,
  contractTimeProgress,
  type ContractTimeTone,
} from '../../lib/contract-timeline';
import type {
  ContractAgenda,
  ContractAgendaKind,
  SaleContract,
  SaleContractStatus,
  SaleContractType,
} from '../../lib/types';

// RC-D112/D113: o card de contrato — e, desde a RC-D112, a lista dos DOIS
// breakpoints. A tabela do desktop (RC-D43) saiu: cada linha de /contratos e uma
// HISTORIA (prazo correndo, estado, próximo compromisso), não um valor a comparar
// coluna a coluna com o vizinho — e história pede cartão.
//
// O que o card responde, nesta ordem: QUEM (nº + vendedor → comprador), QUANTO
// TEMPO FALTA (a barra + a frase) e EM QUE PÉ ESTÁ (a faixa de campos). Dinheiro
// NÃO está na lista (RC-D113): total, preço/saca e ágio vivem no Detalhes e no
// /financeiro.

// Rótulo do selo de SITUAÇÃO. Exportado para o modal de Detalhes, que mostra este
// selo + o da agenda lado a lado.
// RC-D115: "Emitido" no lugar de "Em andamento" — é a palavra do documento, e a
// que o operador usa. O "em andamento" ficou para o KPI, que fala de estado.
export const STATUS_META: Record<SaleContractStatus, { label: string; variant: string }> = {
  EMITIDO: { label: 'Emitido', variant: 'status-badge-success' },
  FINALIZADO: { label: 'Finalizado', variant: 'status-badge-muted' },
  WASH_OUT: { label: 'Cancelado', variant: 'status-badge-danger' },
};

// RC-D115: a paleta do STATUS é azul / verde / laranja. O VERMELHO saiu daqui e
// ficou reservado ao ATRASO (o tom `late` da barra) — era o washout que o usava, e
// cancelado não pede ação nenhuma hoje, enquanto um pagamento vencido pede.
export const STATUS_TINT: Record<SaleContractStatus, string> = {
  EMITIDO: '#dbeafe',
  FINALIZADO: '#dcfce7',
  WASH_OUT: '#ffedd5',
};

export const STATUS_TEXT_COLOR: Record<SaleContractStatus, string> = {
  EMITIDO: '#1d4ed8',
  FINALIZADO: '#15803d',
  WASH_OUT: '#c2410c',
};

// RC-D114/D115: o tom da BARRA pinta também a tarja e o ponto do status — uma
// derivação, três peças. É o que faz um contrato emitido e ATRASADO ficar vermelho
// inteiro sem que "atrasado" precise existir como status no banco.
const TONE_COLOR: Record<ContractTimeTone, { bar: string; tint: string; text: string }> = {
  running: { bar: '#2563eb', tint: '#dbeafe', text: '#1d4ed8' },
  late: { bar: '#dc2626', tint: '#fee2e2', text: '#dc2626' },
  done: { bar: '#15803d', tint: '#dcfce7', text: '#15803d' },
  cancelled: { bar: '#ea580c', tint: '#ffedd5', text: '#c2410c' },
};

// RC-D68: a paleta da AGENDA. Um compromisso por vez, e a cor diz o tom — âmbar
// pede ação, azul só lembra, vermelho venceu, verde/cinza acabou. Vive para o modal
// de Detalhes, que mostra o compromisso como segundo selo.
const AGENDA_COLOR: Record<ContractAgendaKind, { bar: string; tint: string; text: string }> = {
  cancelado: { bar: '#ea580c', tint: '#ffedd5', text: '#c2410c' },
  finalizado: { bar: '#15803d', tint: '#dcfce7', text: '#15803d' },
  aprovacao: { bar: '#eab308', tint: '#fef9c3', text: '#a16207' },
  pagamento_vencido: { bar: '#dc2626', tint: '#fee2e2', text: '#dc2626' },
  faturamento: { bar: '#0d9488', tint: '#ccfbf1', text: '#0d9488' },
  pagamento: { bar: '#0d9488', tint: '#ccfbf1', text: '#0d9488' },
  nenhum: { bar: '#cbd5e1', tint: '#f1f5f9', text: '#64748b' },
};

const AGENDA_FALLBACK: ContractAgenda = { kind: 'nenhum', dayKey: null };

export function contractAgenda(contract: { agenda?: ContractAgenda }): ContractAgenda {
  return contract.agenda ?? AGENDA_FALLBACK;
}

export function agendaColor(agenda: ContractAgenda) {
  return AGENDA_COLOR[agenda.kind] ?? AGENDA_COLOR.nenhum;
}

// A frase da agenda em DATA ("Fatura em 12/08"). Vive para o modal de Detalhes, que
// é onde a data exata importa; a LISTA usa a contagem de dias
// (`contractCountdownLabel`), porque lá a pergunta é "quanto falta".
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

// RC-D85/D86: "Finalizar" só a partir da data de faturamento — antes dela não houve
// nota, logo não houve pagamento a declarar. Sem data planejada ("À definir", D144)
// também não finaliza; a saída é editar o contrato e pôr a data.
//
// Devolve o MOTIVO em pt-BR (ou `null` quando pode), porque botão que some sem
// explicação vira beco. É a fonte única dos dois lugares onde o "Finalizar"
// aparece: o menu ⋯ do card e o rodapé do Detalhes.
//
// ⚠️ Espelha `finalizeBlockReason` do `sale-contract-support.js` — a trava de
// verdade é a de lá (esta só evita o clique). Mexeu numa, mexa na outra. O
// `todayInputValueBRT` fixa America/Sao_Paulo justamente para os dois não
// discordarem quando o device está em outro fuso.
export function finalizeBlockedReason(contract: { invoiceDate: string | null }): string | null {
  if (!contract.invoiceDate) return 'Defina a data de faturamento primeiro.';
  const invoiceDayKey = contract.invoiceDate.slice(0, 10);
  if (invoiceDayKey > todayInputValueBRT()) {
    return `Só a partir do faturamento, em ${formatContractDate(contract.invoiceDate)}.`;
  }
  return null;
}

// A trava do servidor devolve 409, o mesmo status do conflito de concorrência — e
// "recarregue a página" seria a frase errada para ela. O código desempata.
const TERMINAL_ERROR_BY_CODE: Record<string, string> = {
  SALE_CONTRACT_INVOICE_DATE_MISSING: 'Defina a data de faturamento antes de finalizar.',
  SALE_CONTRACT_BEFORE_INVOICE_DATE:
    'Este contrato só pode ser finalizado a partir da data de faturamento.',
};

export function terminalErrorMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof ApiError)) return fallback;
  const code = (cause.details as { code?: string } | null)?.code;
  if (code && TERMINAL_ERROR_BY_CODE[code]) return TERMINAL_ERROR_BY_CODE[code];
  if (cause.status === 409)
    return 'Este contrato foi modificado. Recarregue a página e tente de novo.';
  return cause.message;
}

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

type SaleContractCardProps = {
  contract: SaleContract;
  /** Dia BRT corrente ('YYYY-MM-DD'), calculado UMA vez pela lista. */
  todayKey: string;
  // RC-D119: o mobile é o mesmo card ENXUTO — sem trilho e com 2 campos no lugar de
  // 4. É troca de ÁRVORE (conteúdo diferente), não de CSS, então vem daqui e não de
  // um `display: none` (skill `responsive`, §901px).
  isDesktop: boolean;
  // RC-D120: o card INTEIRO abre o Detalhes — sem seta, sem "Ver detalhes" no menu.
  onDetalhes: () => void;
  // RC-D62/D63: um botão só, e ele volta — "Finalizar" no contrato em andamento,
  // "Reabrir" no finalizado. Sem confirmação: são reversíveis.
  onFinalizar: () => void;
  onReabrir: () => void;
  canManage?: boolean;
  // DSB-D11: realce (pisca/rola) quando chega do chip de faturamento do dashboard.
  isHighlighted?: boolean;
  /** POST de Finalizar/Reabrir em voo: trava o duplo-toque. */
  busy?: boolean;
  // O menu ⋯ vive na LISTA (um aberto por vez, e o clique-fora é um listener só).
  menuOpen: boolean;
  onMenuToggle: (trigger: HTMLButtonElement) => void;
  onMenuClose: () => void;
  menuRef?: RefObject<HTMLDivElement | null>;
};

// A barra de tempo + a frase. Sem `pct` (pagamento "À definir", D144) o trilho não
// aparece: um trilho vazio inventaria um prazo que o contrato não tem.
function ContractTimeBar({
  pct,
  tone,
  label,
  withRail,
}: {
  pct: number | null;
  tone: ContractTimeTone;
  label: string;
  withRail: boolean;
}) {
  const color = TONE_COLOR[tone];
  return (
    <span className="ctr-timebar">
      {withRail && pct != null ? (
        <span
          className="ctr-timebar-rail"
          role="img"
          aria-label={`${Math.round(pct * 100)}% do prazo`}
        >
          <span
            className="ctr-timebar-fill"
            style={{ width: `${Math.max(2, pct * 100)}%`, background: color.bar }}
          />
        </span>
      ) : null}
      <span className="ctr-timebar-label" style={{ color: color.text }}>
        {label}
      </span>
    </span>
  );
}

export function SaleContractCard({
  contract,
  todayKey,
  isDesktop,
  onDetalhes,
  onFinalizar,
  onReabrir,
  canManage = true,
  isHighlighted = false,
  busy = false,
  menuOpen,
  onMenuToggle,
  onMenuClose,
  menuRef,
}: SaleContractCardProps) {
  const progress = contractTimeProgress(contract, todayKey);
  const tone = TONE_COLOR[progress.tone];
  const countdown = contractCountdownLabel(contractAgenda(contract), todayKey);
  const finalizeBlocked = finalizeBlockedReason(contract);
  const statusLabel = STATUS_META[contract.status]?.label ?? contract.status;
  // O ⋯ só existe quando há marco a mover. O washout não tem: cancelar é
  // definitivo, e um menu que abre vazio é pior que menu nenhum.
  const hasMenu = canManage && contract.status !== 'WASH_OUT';

  const field = (label: string, value: ReactNode) => (
    <span className="ctr-card-field">
      <span className="ctr-card-field-label">{label}</span>
      <span className="ctr-card-field-value">{value}</span>
    </span>
  );

  return (
    <div
      className={`ctr-card${isHighlighted ? ' is-highlighted' : ''}`}
      data-contract-id={contract.id}
      onClick={onDetalhes}
    >
      {/* A tarja segue o TOM (RC-D115): azul correndo, vermelho atrasado, verde
          finalizado, laranja cancelado. */}
      <span className="ctr-card-bar" style={{ background: tone.bar }} aria-hidden="true" />

      <div className="ctr-card-body">
        <div className="ctr-card-head">
          {/* O card inteiro clica; este <button> é o alvo de TECLADO (mesmo molde do
              `.fv-table-name-btn` da tabela que saiu). */}
          <button
            type="button"
            className="ctr-card-title-btn"
            onClick={(event) => {
              event.stopPropagation();
              onDetalhes();
            }}
          >
            <span className="ctr-card-number">{contract.contractNumber}</span>
            <span className="ctr-card-parties">
              <span className="ctr-card-party">{snapshotName(contract.sellerSnapshot)}</span>
              <svg className="ctr-card-arrow" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <span className="ctr-card-party">{snapshotName(contract.buyerSnapshot)}</span>
            </span>
          </button>

          {/* No desktop a barra fica na linha do título (a largura sobra); no mobile
              ela desce para a própria linha, e sem trilho. */}
          {isDesktop ? (
            <ContractTimeBar pct={progress.pct} tone={progress.tone} label={countdown} withRail />
          ) : null}

          {hasMenu ? (
            <div
              className="ctr-card-menu-wrap"
              ref={menuRef}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="ctr-card-dots"
                aria-label={`Ações do contrato ${contract.contractNumber}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={(event) => onMenuToggle(event.currentTarget)}
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="19" cy="12" r="1.6" />
                </svg>
              </button>
              {menuOpen ? (
                <div
                  className="fv-row-menu"
                  role="menu"
                  aria-label={`Ações do contrato ${contract.contractNumber}`}
                >
                  {/* RC-D120: só o marco terminal. Editar, Ágio, Washout e o Espelho
                      vivem no PAINEL de Detalhes — precisam do contrato na tela —, e
                      "Ver detalhes" saiu porque o card inteiro faz isso.
                      RC-D85/D86: travado, o "Finalizar" vira DUAS linhas (rótulo +
                      motivo). Item apagado e mudo é um beco: no toque não há tooltip
                      para socorrer, e a frase carrega a saída. */}
                  {contract.status === 'EMITIDO' ? (
                    <button
                      type="button"
                      role="menuitem"
                      className={`fv-row-menu-item${finalizeBlocked ? ' is-blocked' : ''}`}
                      disabled={busy || finalizeBlocked != null}
                      onClick={() => {
                        onMenuClose();
                        onFinalizar();
                      }}
                    >
                      Finalizar
                      {finalizeBlocked ? (
                        <span className="fv-row-menu-hint">{finalizeBlocked}</span>
                      ) : null}
                    </button>
                  ) : null}
                  {contract.status === 'FINALIZADO' ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="fv-row-menu-item"
                      disabled={busy}
                      onClick={() => {
                        onMenuClose();
                        onReabrir();
                      }}
                    >
                      Reabrir
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {isDesktop ? null : (
          <ContractTimeBar
            pct={progress.pct}
            tone={progress.tone}
            label={countdown}
            withRail={false}
          />
        )}

        {/* A faixa: 4 campos no desktop, 2 no mobile (RC-D119). Tipo e Datas ficam
            acessíveis pelo Detalhes. */}
        <div className="ctr-card-fields">
          {field('Sacas', `${contract.quantitySacks} sc`)}
          {isDesktop ? field('Tipo', TYPE_LABEL[contract.type] ?? contract.type) : null}
          {isDesktop
            ? field(
                'Datas',
                <>
                  {/* "À definir" (D144): data nula é um estado legítimo do contrato,
                      não um vazio. */}
                  <span className="ctr-card-date">
                    Fat.{' '}
                    {contract.invoiceDate ? formatContractDate(contract.invoiceDate) : 'À definir'}
                  </span>
                  <span className="ctr-card-date">
                    Pag.{' '}
                    {contract.paymentDate ? formatContractDate(contract.paymentDate) : 'À definir'}
                  </span>
                </>
              )
            : null}
          {field(
            'Status',
            <span className="ctr-card-status">
              <span
                className="ctr-card-status-dot"
                style={{ background: tone.bar }}
                aria-hidden="true"
              />
              {statusLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
