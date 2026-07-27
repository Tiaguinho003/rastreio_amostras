'use client';

import { useEffect } from 'react';

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

// Drawer lateral direito (PG18/PG27): ficha estimada completa do Resultado.
// position:absolute DENTRO do .pg-host — nunca fixed (PageTransition tem
// will-change: transform). O canvas segue interativo ao lado: editar sacas
// recalcula a ficha ao vivo (PG14).
export function ResultDrawer({
  outcome,
  onClose,
}: {
  outcome: SimulationOutcome | null;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const estimate = outcome?.kind === 'estimate' ? outcome.estimate : null;
  const exclusions = estimate ? collectExclusions(estimate) : [];

  return (
    <aside className="pg-drawer" role="complementary" aria-label="Ficha estimada">
      <header className="pg-drawer-header">
        <h3>
          Ficha estimada <span className="pg-node-badge">estimativa</span>
        </h3>
        <button
          type="button"
          className="pg-drawer-close"
          aria-label="Fechar ficha"
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

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
    </aside>
  );
}
