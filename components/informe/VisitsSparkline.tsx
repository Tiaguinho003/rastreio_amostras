// Sparkline (mini gráfico de linha, sem eixos/labels) das visitas por dia do
// mês corrente — do dia 1 até hoje (BRT). Alimenta a métrica do card "Visitas
// esta semana" de /relatorios: o número grande fica à esquerda e este gráfico dá
// a leitura visual de quando as visitas aconteceram no mês. `data[0]` = dia 1;
// `data[último]` = hoje (série já vem zero-preenchida do backend, dailyThisMonth).
//
// Linha bezier suave (mesmo molde do SalesLineChart de
// ClientCommercialSummaryCard) + área tênue embaixo + ponto no dia de hoje.
// viewBox fixo escala por CSS (width:100%); cores em .rsm-spark* no globals.css.

// Caminho suave por bezier cúbica: cada segmento usa o ponto médio em x como as
// duas alças, o que arredonda os vértices sem overshoot.
function buildLinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const cx = (prev.x + curr.x) / 2;
    d += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

export function VisitsSparkline({ data }: { data: number[] }) {
  const W = 240;
  const H = 56;
  const PAD = 5;

  // Guarda: série vazia vira [0] (um ponto no fundo); um único dia (count<=1)
  // ancora no meio pra não colar na borda esquerda.
  const series = data.length > 0 ? data : [0];
  const count = series.length;
  const max = Math.max(1, ...series);
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;
  const toX = (i: number) => (count <= 1 ? W / 2 : PAD + (i * plotW) / (count - 1));
  const toY = (v: number) => PAD + plotH - (v / max) * plotH;

  const pts = series.map((v, i) => ({ x: toX(i), y: toY(v) }));
  const line = buildLinePath(pts);
  const area = `${line} L ${toX(count - 1)} ${H - PAD} L ${toX(0)} ${H - PAD} Z`;
  const last = pts[pts.length - 1];
  const total = series.reduce((sum, v) => sum + v, 0);

  return (
    <svg
      className="rsm-spark"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Visitas por dia no mês (dia 1 a hoje): ${total} no total, ${series[count - 1]} hoje`}
    >
      <path className="rsm-spark-area" d={area} />
      <path className="rsm-spark-line" d={line} />
      <circle className="rsm-spark-dot" cx={last.x} cy={last.y} r={2.6} />
    </svg>
  );
}
