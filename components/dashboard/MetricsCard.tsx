'use client';

import type { DashboardOperationalMetricsResponse } from '../../lib/types';

type MetricsData = DashboardOperationalMetricsResponse;

function formatValue(hours: number): { value: string; unit: string } {
  if (hours < 1) {
    return { value: String(Math.round(hours * 60)), unit: 'MIN' };
  }
  return { value: hours.toFixed(1), unit: 'HORAS' };
}

function Gauge({ median, meta, color }: { median: number; meta: number; color: string }) {
  const radius = 44;
  const strokeWidth = 7;
  const center = 56;
  const totalAngle = 260;
  const startAngle = 140;

  const ratio = Math.min(median / meta, 1.15);
  const filledAngle = totalAngle * Math.min(ratio, 1);

  function polarToCartesian(angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: center + radius * Math.cos(rad),
      y: center + radius * Math.sin(rad),
    };
  }

  function describeArc(fromDeg: number, toDeg: number) {
    const s = polarToCartesian(fromDeg);
    const e = polarToCartesian(toDeg);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const bgPath = describeArc(startAngle, startAngle + totalAngle);
  const fgPath = filledAngle > 0.5 ? describeArc(startAngle, startAngle + filledAngle) : '';

  const { value, unit } = formatValue(median);

  return (
    <svg viewBox="0 0 112 112" className="dd-gauge">
      <path
        d={bgPath}
        fill="none"
        stroke="#e8e3d5"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {fgPath && (
        <path
          d={fgPath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      )}
      <text x={center} y={center - 2} textAnchor="middle" className="dd-gauge-value">
        {value}
      </text>
      <text x={center} y={center + 14} textAnchor="middle" className="dd-gauge-unit">
        {unit}
      </text>
    </svg>
  );
}

function AreaChart({
  daily,
  overallMedian,
  color,
  id,
}: {
  daily: MetricsData['daily'];
  overallMedian: number;
  color: string;
  id: string;
}) {
  const w = 280;
  const h = 72;
  const px = 2;
  const py = 4;

  if (daily.length < 2) return null;

  const maxVal = Math.max(...daily.map((d) => d.median), overallMedian) * 1.25 || 1;

  const pts = daily.map((d, i) => ({
    x: px + (i / (daily.length - 1)) * (w - px * 2),
    y: py + (1 - d.median / maxVal) * (h - py * 2),
  }));

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].x},${h} L${pts[0].x},${h} Z`;
  const medianY = py + (1 - overallMedian / maxVal) * (h - py * 2);
  const last = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="dd-area-chart" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`dd-area-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.03} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#dd-area-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <line
        x1={px}
        y1={medianY}
        x2={w - px}
        y2={medianY}
        stroke={color}
        strokeWidth="1"
        strokeDasharray="4 3"
        opacity={0.45}
      />
      <circle cx={last.x} cy={last.y} r="3.5" fill={color} />
    </svg>
  );
}

interface MetricsCardProps {
  kicker: string;
  subtitle: string;
  data: MetricsData | null;
  color: string;
  id: string;
}

export function MetricsCard({ kicker, subtitle, data, color, id }: MetricsCardProps) {
  if (!data || data.overallMedian === null) {
    return (
      <div className="dd-metrics-card dd-metrics-skeleton" aria-hidden="true">
        <div className="dd-metrics-header">
          <span className="dd-card-label-placeholder" style={{ width: 80 }} />
          <span className="dd-card-count-placeholder" style={{ width: 140, height: 16 }} />
        </div>
        <div className="dd-metrics-body">
          <span
            className="dd-card-icon-placeholder"
            style={{ width: 100, height: 100, borderRadius: '50%' }}
          />
          <span className="dd-card-label-placeholder" style={{ width: '100%', height: 60 }} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="dd-metrics-card"
      style={{ '--dd-metrics-accent': color } as React.CSSProperties}
    >
      <div className="dd-metrics-header">
        <span className="dd-metrics-kicker" style={{ color }}>
          {kicker}
        </span>
        <span className="dd-metrics-subtitle">{subtitle}</span>
      </div>
      <div className="dd-metrics-body">
        <Gauge median={data.overallMedian} meta={data.meta} color={color} />
        <AreaChart daily={data.daily} overallMedian={data.overallMedian} color={color} id={id} />
      </div>
    </div>
  );
}
