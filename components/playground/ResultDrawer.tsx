'use client';

import { useEffect } from 'react';

import {
  DEFEITO_KEYS,
  PENEIRA_KEYS,
  type DefeitoKey,
  type EstimateFieldValue,
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

function numericFieldText(field: EstimateFieldValue): string {
  if (field.kind === 'value') return `${formatNumberBr(field.value)}%${field.partial ? ' *' : ''}`;
  return '—';
}

function CompositionParts({ field }: { field: EstimateFieldValue }) {
  if (field.kind !== 'composition') return <span>—</span>;
  return (
    <span className="pg-drawer-parts">
      {field.parts.map((part, index) => (
        <span key={`${part.lotNumber}-${index}`}>
          {part.lotNumber} = {part.raw ?? '—'} ({formatProportion(part.proportion)})
        </span>
      ))}
    </span>
  );
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
  const hasPartial =
    estimate !== null &&
    PENEIRA_KEYS.some((key) => {
      const field = estimate.peneiras[key];
      return field.kind === 'value' && field.partial;
    });

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
                  <span>{numericFieldText(estimate.peneiras[key])}</span>
                </div>
              ))}
            </div>
            {hasPartial ? (
              <p className="pg-drawer-note">
                * estimativa parcial — nem todos os componentes têm o campo
              </p>
            ) : null}
          </section>

          <section>
            <h4>Catação</h4>
            <CompositionParts field={estimate.catacao} />
          </section>

          <section>
            <h4>Defeitos</h4>
            <div className="pg-drawer-defects">
              {DEFEITO_KEYS.map((key) => (
                <div key={key}>
                  <span>{DEFEITO_LABELS[key]}</span>
                  <CompositionParts field={estimate.defeitos[key]} />
                </div>
              ))}
            </div>
          </section>

          <p className="pg-drawer-note">
            Protótipo: valores do motor stub — a estimativa real chega na F2. Isto não é um laudo.
          </p>
        </div>
      )}
    </aside>
  );
}
