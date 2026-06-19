'use client';

import type { ClientCommercialSummaryResponse } from '../../lib/types';

// Card de APRESENTACAO (sem botoes/filtros) do resumo comercial do cliente no
// mesmo padrao visual do "Lotes disponiveis" do dashboard (SalesAvailabilityCard):
// donut SVG manual + legenda. As contagens (lotes) vem de
// getClientCommercialSummary. "Comprado" so entra quando o cliente e comprador.

type StatusKey = 'open' | 'sold' | 'lost' | 'bought';

const STATUS_META: Array<{
  key: StatusKey;
  color: string;
  label: string;
  field: keyof ClientCommercialSummaryResponse;
}> = [
  // Cores = cor "start" dos gradientes dos cards comerciais (.sdv-card-commercial-mini.is-*).
  { key: 'open', color: '#4a73b8', label: 'Em aberto', field: 'openCount' },
  { key: 'sold', color: '#4a8a5e', label: 'Vendido', field: 'soldCount' },
  { key: 'lost', color: '#b15454', label: 'Perdido', field: 'lostCount' },
  { key: 'bought', color: '#7a5836', label: 'Comprado', field: 'boughtCount' },
];

type Segment = { key: StatusKey; color: string; label: string; value: number };

// Donut em SVG (sem libs) — mesma mecanica do AgingDonut do dashboard: cada
// segmento e um <circle> com stroke-dasharray proporcional; stroke-dashoffset
// negativo acumula o que ja foi desenhado.
function CommercialDonut({ segments, total }: { segments: Segment[]; total: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeWidth = 11;

  const visibleCount = segments.filter((s) => s.value > 0).length;
  const segmentGap = visibleCount > 1 ? 2 : 0;

  const totalDigits = String(total).length;
  // Numero central: ligeiramente menor que antes e com passo por digito — encolhe
  // a cada digito a mais pra caber confortavelmente no furo do donut.
  const totalFontSize =
    totalDigits <= 1
      ? 30
      : totalDigits === 2
        ? 28
        : totalDigits === 3
          ? 24
          : totalDigits === 4
            ? 20
            : 16;

  let accumulated = 0;
  const rings = segments.map((s) => {
    const fraction = total > 0 ? s.value / total : 0;
    const dash = fraction * circumference;
    const offset = -(accumulated + segmentGap / 2);
    accumulated += dash;
    return { ...s, dash: dash > 0 ? Math.max(dash - segmentGap, 1) : 0, offset };
  });

  return (
    <svg
      className="sales-chart-donut"
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Resumo comercial: ${segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ')}`}
    >
      <circle cx="50" cy="50" r={radius} fill="none" stroke="#edf0ee" strokeWidth={strokeWidth} />
      {total > 0
        ? rings.map(({ key, color, dash, offset }) =>
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

export function ClientCommercialSummaryCard({
  summary,
  isBuyer,
}: {
  summary: ClientCommercialSummaryResponse | null;
  isBuyer: boolean;
}) {
  if (!summary) {
    return (
      <div className="sales-card client-commercial-card sales-card-skeleton" aria-hidden="true" />
    );
  }

  // "Comprado" so entra pra cliente comprador (decisao do usuario).
  const segments: Segment[] = STATUS_META.filter((meta) => meta.key !== 'bought' || isBuyer).map(
    (meta) => ({
      key: meta.key,
      color: meta.color,
      label: meta.label,
      value: summary[meta.field],
    })
  );

  const total = segments.reduce((acc, s) => acc + s.value, 0);

  return (
    <div className="sales-card client-commercial-card">
      <div className="sales-card-header">
        <h3 className="sales-card-title">Resumo comercial</h3>
        <span className="sales-card-chart-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M3 16.5 9 10.5 13 14 20 7" />
            <path d="M15 7 20 7 20 12" />
          </svg>
        </span>
      </div>

      <div className="sales-card-body">
        <CommercialDonut segments={segments} total={total} />

        <ul className="sales-chart-legend">
          {segments.map((s) => (
            <li key={s.key} className="sales-chart-legend-item">
              <span
                className="sales-chart-legend-dot"
                style={{ background: s.color }}
                aria-hidden="true"
              />
              <span className="sales-chart-legend-label">{s.label}</span>
              <span className="sales-chart-legend-count">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
