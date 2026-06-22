'use client';

import Link from 'next/link';

import type { DashboardSalesAvailabilityResponse } from '../lib/types';

type AgingKey = 'over30' | 'from15to30' | 'under15';

const SEGMENT_ORDER: Array<{ key: AgingKey; color: string; label: string }> = [
  { key: 'over30', color: '#c0392b', label: '+30 dias' },
  { key: 'from15to30', color: '#e5a100', label: '+15 dias' },
  { key: 'under15', color: '#27ae60', label: '-15 dias' },
];

// Donut em SVG (sem libs). Cada segmento e um <circle> com
// stroke-dasharray proporcional ao percentual da band; o stroke-dashoffset
// negativo desloca o inicio do segmento acumulando o que ja foi desenhado.
function AgingDonut({
  bands,
  total,
}: {
  bands: DashboardSalesAvailabilityResponse['bands'];
  total: number;
}) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeWidth = 11;

  // Fresta visual entre segmentos (unidades do viewBox 100), como no
  // mockup — o track claro aparece no vao. So quando ha 2+ segmentos com
  // valor; com 1 segmento o anel fecha sem emenda.
  const visibleCount = SEGMENT_ORDER.filter(({ key }) => bands[key] > 0).length;
  const segmentGap = visibleCount > 1 ? 2 : 0;

  // O numero central encolhe conforme cresce a quantidade de digitos pra
  // caber confortavelmente dentro do furo do donut (diametro ~69 unidades
  // no viewBox 100: r=40, stroke=11 -> borda interna em r=34.5). Ate 2
  // digitos no tamanho cheio; 3+ reduz progressivo pra nao encostar no anel.
  const totalDigits = String(total).length;
  const totalFontSize =
    totalDigits <= 2 ? 33 : totalDigits === 3 ? 29 : totalDigits === 4 ? 23 : 19;

  let accumulated = 0;
  const segments = SEGMENT_ORDER.map(({ key, color }) => {
    const value = bands[key];
    const fraction = total > 0 ? value / total : 0;
    const dash = fraction * circumference;
    const offset = -(accumulated + segmentGap / 2);
    accumulated += dash;
    // Segmento minimo de 1 unidade: band pequena nao some atras do gap.
    return { key, color, dash: dash > 0 ? Math.max(dash - segmentGap, 1) : 0, offset };
  });

  return (
    <svg
      className="sales-chart-donut"
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Distribuicao por tempo: ${bands.over30} mais de 30 dias, ${bands.from15to30} entre 15 e 30 dias, ${bands.under15} menos de 15 dias`}
    >
      <circle cx="50" cy="50" r={radius} fill="none" stroke="#edf0ee" strokeWidth={strokeWidth} />
      {total > 0
        ? segments.map(({ key, color, dash, offset }) =>
            dash > 0 ? (
              <circle
                key={key}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                transform="rotate(-90 50 50)"
              />
            ) : null
          )
        : null}
      {/* Total grande + label "lotes" menor. Ambos com y=44 pra que o
          conjunto (total no topo + label embaixo via dy) fique
          visualmente centralizado no donut (sem o numero parecer
          subido e a label puxar pra baixo). */}
      <text
        x="50"
        y="44"
        textAnchor="middle"
        dominantBaseline="central"
        className="sales-chart-donut-total"
        fontSize={totalFontSize}
      >
        {total}
      </text>
      <text
        x="50"
        y="44"
        dy="1.9em"
        textAnchor="middle"
        dominantBaseline="central"
        className="sales-chart-donut-label"
      >
        lotes
      </text>
    </svg>
  );
}

// `compact` (usado no dashboard DESKTOP): legenda + botao "Ver disponiveis"
// ficam juntos ao lado do donut (coluna `.sales-card-aside`), pra o card
// caber numa altura menor. Sem `compact` (mobile): layout vertical padrao —
// donut + legenda no corpo e botao full-width no rodape.
export function SalesAvailabilityCard({
  data,
  compact = false,
}: {
  data: DashboardSalesAvailabilityResponse;
  compact?: boolean;
}) {
  const total = data.bands.over30 + data.bands.from15to30 + data.bands.under15;

  const legend = (
    <ul className="sales-chart-legend">
      {SEGMENT_ORDER.map(({ key, color, label }) => (
        <li key={key} className="sales-chart-legend-item">
          <span
            className="sales-chart-legend-dot"
            style={{ background: color }}
            aria-hidden="true"
          />
          <span className="sales-chart-legend-label">{label}</span>
          <span className="sales-chart-legend-count">{data.bands[key]}</span>
        </li>
      ))}
    </ul>
  );

  // Unica acao do card: leva pra lista de amostras disponiveis (em aberto).
  const detailButton = (
    <Link href="/samples?displayStatus=OPEN" className="sales-card-detail-button">
      <span className="sales-card-detail-label">Ver disponíveis</span>
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </Link>
  );

  return (
    <div className={`sales-card${compact ? ' is-compact' : ''}`}>
      <div className="sales-card-header">
        <h3 className="sales-card-title">Lotes disponíveis</h3>
        <span className="sales-card-chart-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M3 16.5 9 10.5 13 14 20 7" />
            <path d="M15 7 20 7 20 12" />
          </svg>
        </span>
      </div>

      <div className="sales-card-body">
        <AgingDonut bands={data.bands} total={total} />
        {compact ? <div className="sales-card-aside">{legend}</div> : legend}
      </div>

      {/* Botao "Ver disponiveis" no rodape, largura total do card — tanto no
          mobile (non-compact) quanto no desktop compacto. */}
      {detailButton}
    </div>
  );
}
