'use client';

import { BottomSheet } from '../BottomSheet';
import {
  DEFEITO_KEYS,
  DEFEITO_UNITS,
  PENEIRA_KEYS,
  type DefeitoKey,
  type EstimateFieldValue,
  type LigaEstimate,
  type PeneiraKey,
} from '../../lib/playground/engine';
import type { SimulationOutcome } from '../../lib/playground/simulation';

const PENEIRA_LABELS: Record<PeneiraKey, string> = {
  p18: 'P18',
  p17: 'P17',
  p16: 'P16',
  p15: 'P15',
  p14: 'P14',
  p13: 'P13',
  p12: 'P12',
  p11: 'P11',
  p10: 'P10',
  mk: 'MK',
};

const DEFEITO_LABELS: Record<DefeitoKey, string> = {
  imp: 'Impureza',
  pva: 'PVA',
  broca: 'Broca',
  gpi: 'GPI',
  ap: 'Aproveitamento',
  defeito: 'Defeito',
};

function formatNumberBr(value: number): string {
  return String(value).replace('.', ',');
}

function formatProportion(proportion: number): string {
  return `${Math.round(proportion * 100)}%`;
}

/** PG42: campo que ninguém declarou vira traço — nunca 0%. */
function fieldText(field: EstimateFieldValue, unit: string): string {
  if (field.kind === 'empty') return '—';
  return `${formatNumberBr(field.value)}${unit}`;
}

type ExclusionNote = { field: string; lotNumber: string; raw: string };

/**
 * PG45: junta, de todos os campos, os componentes que ficaram de fora por
 * trazerem texto não numérico. Vira uma prestação de contas única no rodapé
 * em vez de poluir cada linha da ficha.
 */
function collectExclusions(estimate: LigaEstimate): ExclusionNote[] {
  const notes: ExclusionNote[] = [];
  const push = (field: string, value: EstimateFieldValue) => {
    for (const item of value.excluded) {
      notes.push({ field, lotNumber: item.lotNumber, raw: item.raw });
    }
  };
  for (const key of PENEIRA_KEYS) push(PENEIRA_LABELS[key], estimate.peneiras[key]);
  for (const fundo of estimate.fundos) push(`Fundo ${fundo.peneira}`, fundo.value);
  push('Catação', estimate.catacao);
  for (const key of DEFEITO_KEYS) push(DEFEITO_LABELS[key], estimate.defeitos[key]);
  return notes;
}

// Ficha estimada do Resultado (PG18/PG27, recontêinerizada na PG52).
//
// Era um `<aside>` próprio com `position: absolute` dentro do `.pg-host`. Passa
// a ser o contêiner institucional de painel lateral: `BottomSheet` +
// `.fv-panel-sheet.side-sheet` (containers §8) — o mesmo de /users, /samples e
// /relatorios. Vem de graça o que o drawer caseiro não tinha: ESC, back do
// Android, focus trap, animação de entrada/saída e a seta `edge-back`.
//
// O `BottomSheet` faz `createPortal` pro `document.body`, então o `fixed` dele
// não é capturado pelo `will-change: transform` do `PageTransition` — a razão
// original do `absolute` some junto com o drawer.
//
// Uma coisa NÃO é padrão e está no CSS: o backdrop deste sheet é atravessável.
// A PG14 recalcula ao vivo, e o ponto de editar sacas COM a ficha aberta é ver
// o número mudar. Backdrop bloqueante mataria isso. Precedente idêntico:
// `.detail-overlay` da "lista viva" (RD4).
export function ResultDrawer({
  open,
  outcome,
  onClose,
}: {
  open: boolean;
  outcome: SimulationOutcome | null;
  onClose: () => void;
}) {
  const estimate = outcome?.kind === 'estimate' ? outcome.estimate : null;
  const exclusions = estimate ? collectExclusions(estimate) : [];

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      ariaLabel="Ficha estimada"
      closeVariant="edge-back"
      className="fv-panel-sheet side-sheet pg-ficha-sheet"
    >
      {/* O `.fv-panel-sheet` não usa o slot de `title` do BottomSheet (a seta
          edge-back se alinha ao topo contando com isso), então o título mora
          no corpo — mesma escolha dos painéis de /users e /relatorios. */}
      <h3 className="pg-ficha-title">
        Ficha estimada <span className="pg-node-badge">estimativa</span>
      </h3>

      {estimate === null ? (
        <p className="pg-drawer-unavailable">
          Estimativa indisponível — corrija o fluxo no canvas e execute novamente.
        </p>
      ) : (
        <div className="pg-drawer-body">
          <dl className="pg-drawer-summary">
            <div>
              <dt>Sacas totais</dt>
              <dd>{estimate.totalSacks} sc</dd>
            </div>
            <div>
              <dt>Safra</dt>
              <dd>{estimate.harvest ?? '—'}</dd>
            </div>
            <div>
              <dt>Dono</dt>
              <dd>{estimate.ownerLabel ?? 'Sem dono'}</dd>
            </div>
          </dl>

          <section>
            <h4>Composição</h4>
            <ul className="pg-drawer-composition">
              {estimate.composition.map((part) => (
                <li key={part.sampleId}>
                  <strong>{part.lotNumber}</strong> — {part.sacks} sc (
                  {formatProportion(part.proportion)})
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4>Peneiras</h4>
            <div className="pg-drawer-grid">
              {PENEIRA_KEYS.map((key) => (
                <div key={key}>
                  <span>{PENEIRA_LABELS[key]}</span>
                  <span>{fieldText(estimate.peneiras[key], '%')}</span>
                </div>
              ))}
            </div>
          </section>

          {/* PG44: quantos rótulos de fundo os componentes trouxerem — pode
              passar dos 2 slots que a ficha de um lote comporta. */}
          {estimate.fundos.length > 0 ? (
            <section>
              <h4>Fundos</h4>
              <div className="pg-drawer-grid">
                {estimate.fundos.map((fundo) => (
                  <div key={fundo.peneira}>
                    <span>Fundo {fundo.peneira}</span>
                    <span>{fieldText(fundo.value, '%')}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h4>Catação</h4>
            <div className="pg-drawer-grid is-single">
              <div>
                <span>Catação</span>
                <span>{fieldText(estimate.catacao, '%')}</span>
              </div>
            </div>
          </section>

          <section>
            <h4>Defeitos</h4>
            <div className="pg-drawer-grid">
              {DEFEITO_KEYS.map((key) => (
                <div key={key}>
                  <span>{DEFEITO_LABELS[key]}</span>
                  {/* PG43: "Defeito" é contagem, então sai sem o %. */}
                  <span>{fieldText(estimate.defeitos[key], DEFEITO_UNITS[key])}</span>
                </div>
              ))}
            </div>
          </section>

          {exclusions.length > 0 ? (
            <section className="pg-drawer-exclusions">
              <h4>Fora da conta</h4>
              <ul>
                {exclusions.map((note, index) => (
                  <li key={`${note.field}-${note.lotNumber}-${index}`}>
                    <strong>{note.field}</strong> não considerou o lote {note.lotNumber}: “
                    {note.raw}” não é um número.
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="pg-drawer-note">
            A média é exata — mistura de café por peso. Mas a liga real é reclassificada por uma
            pessoa, sobre uma amostra nova: isto é uma estimativa, não um laudo.
          </p>
        </div>
      )}
    </BottomSheet>
  );
}
