#!/usr/bin/env node
// ---------------------------------------------------------------------------
// build-cost-report.mjs — PDF ENXUTO de custo para o cliente (regenerável).
//
// A FONTE DE VERDADE detalhada é docs/Custo-Operacional-Analise.md (o mestre).
// Este script gera a versão simples (1–2 páginas) que vai para o cliente:
// infra (nuvem) + materiais (impressão) + custo total (TCO). Modelo de custo
// como dados → HTML self-contained (CSS + SVG inline) → PDF via headless Chrome.
//
//   node scripts/cost-report/build-cost-report.mjs
//
// Ao atualizar o custo: edite o MESTRE (.md) primeiro, alinhe os dados abaixo e
// re-rode este script. Números conferidos contra a produção real (gcloud) e os
// parâmetros de operação do cliente.
// ---------------------------------------------------------------------------

import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');
const OUT_DIR = resolve(REPO, 'docs/assets');
const HTML_PATH = resolve(OUT_DIR, 'Custo-Operacional-Analise.html');
const PDF_PATH = resolve(OUT_DIR, 'Custo-Operacional-Analise.pdf');

// ===========================================================================
// 1) INPUTS — o modelo de custo
// ===========================================================================

const GENERATED_AT = '2026-07-12';
const USD_BRL = 5.12;
const WEEKS_PER_MONTH = 52 / 12;

const params = {
  users: 10,
  samplesPerDay: 30,
  samplesPerYear: 10950,
  clients: 1000,
  shipmentsPerWeek: 40,
  approvalsPerWeek: 20,
};

const C = {
  blue: '#2a78d6',
  aqua: '#1baf7a',
  yellow: '#eda100',
  green: '#008300',
  violet: '#4a3aa7',
  red: '#e34948',
};

// Infra de nuvem (US$/mês). Composição atual — detalhe e projeção no .md mestre.
const INFRA = [
  { label: 'OpenAI (classificação)', usd: 16.3 },
  { label: 'Cloud SQL', usd: 11.2 },
  { label: 'Artifact Registry', usd: 4.3 },
  { label: 'Storage + egress', usd: 3.0 },
  { label: 'Cloud Run', usd: 1.0 },
  { label: 'Outros', usd: 1.8 },
];
const infraUsd = INFRA.reduce((s, x) => s + x.usd, 0); // ~37,6

// Materiais de impressão (R$ nativo). Etiqueta 100×35mm, ribbon p/ todas (SET RIBBON ON).
const materials = {
  labelUnit: 220 / (10 * 800), // R$ 0,0275 (R$220 / 10 rolos × 800 etiq.)
  ribbonPrice: 60 / 12, // R$ 5 / rolo
  labelsPerRibbon: 800, // estimativa: rolo de ribbon ~= rolo de etiqueta (ver .md)
  printerCapex: 1300,
  consumption: [
    { label: 'Classificação', perWeek: 200, note: '30 boas + 10 desperdício × 5 dias' },
    { label: 'Envio', perWeek: params.shipmentsPerWeek, note: '40 envios/semana' },
    { label: 'Aprovação', perWeek: params.approvalsPerWeek, note: '20 aprovações/semana' },
  ],
  wasteLabelsPerWeek: 50, // 10/dia × 5 dias (só classificação)
};

// ===========================================================================
// 2) CÁLCULO (tudo consolidado em R$)
// ===========================================================================

const brl = (usd) => usd * USD_BRL;
const fBRL = (v) => `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
const fBRL2 = (v) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const labelsPerWeek = materials.consumption.reduce((s, c) => s + c.perWeek, 0); // 260
const labelsPerMonth = labelsPerWeek * WEEKS_PER_MONTH; // ~1127
const labelsPerYear = labelsPerWeek * 52; // 13520

const labelCostMonth = labelsPerMonth * materials.labelUnit; // ~R$31
const ribbonsPerYear = labelsPerYear / materials.labelsPerRibbon; // ~16,9
const ribbonCostMonth = (ribbonsPerYear * materials.ribbonPrice) / 12; // ~R$7
const materialsMonth = labelCostMonth + ribbonCostMonth; // ~R$38

const wasteLabelsYear = materials.wasteLabelsPerWeek * 52; // 2600
const wasteCostYear =
  wasteLabelsYear * materials.labelUnit +
  (wasteLabelsYear / materials.labelsPerRibbon) * materials.ribbonPrice; // ~R$88

const infraMonth = brl(infraUsd); // ~R$193
const tcoMonth = infraMonth + materialsMonth; // ~R$231

const samplesPerMonth = params.samplesPerYear / 12;
const tcoPerSample = tcoMonth / samplesPerMonth; // ~R$0,25
const tcoPerUser = tcoMonth / params.users; // ~R$23

// Linha de transparência da infra (maiores itens, %)
const infraBreakdown = [...INFRA]
  .sort((a, b) => b.usd - a.usd)
  .map((x) => `${x.label} ${Math.round((x.usd / infraUsd) * 100)}%`)
  .join(' · ');

// Donut do custo recorrente mensal (3 fatias, R$)
const donutSlices = [
  { label: 'Nuvem / software', value: infraMonth, color: C.blue },
  { label: 'Etiquetas', value: labelCostMonth, color: C.yellow },
  { label: 'Ribbon', value: ribbonCostMonth, color: C.violet },
];

// ===========================================================================
// 3) SVG — donut (dataviz: gap 2px, labels diretos + tabela = relief)
// ===========================================================================

const INK = '#0b0b0b',
  INK2 = '#52514e',
  SURF = '#fcfcfb';

function polar(cx, cy, r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function sector(cx, cy, rO, rI, a0, a1) {
  const [x0o, y0o] = polar(cx, cy, rO, a0);
  const [x1o, y1o] = polar(cx, cy, rO, a1);
  const [x1i, y1i] = polar(cx, cy, rI, a1);
  const [x0i, y0i] = polar(cx, cy, rI, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return (
    `M${x0o.toFixed(2)} ${y0o.toFixed(2)} A${rO} ${rO} 0 ${large} 1 ${x1o.toFixed(2)} ${y1o.toFixed(2)} ` +
    `L${x1i.toFixed(2)} ${y1i.toFixed(2)} A${rI} ${rI} 0 ${large} 0 ${x0i.toFixed(2)} ${y0i.toFixed(2)} Z`
  );
}
function donutSVG(slices, centerTop, centerBot) {
  const size = 184,
    cx = size / 2,
    cy = size / 2,
    rO = 86,
    rI = 51;
  const total = slices.reduce((s, x) => s + x.value, 0);
  let a = 0;
  const paths = slices
    .map((s) => {
      const a1 = a + (s.value / total) * 360;
      const d = sector(cx, cy, rO, rI, a + 0.9, a1 - 0.9);
      a = a1;
      return `<path d="${d}" fill="${s.color}" stroke="${SURF}" stroke-width="2"/>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">
    ${paths}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="27" font-weight="700" fill="${INK}">${centerTop}</text>
    <text x="${cx}" y="${cy + 17}" text-anchor="middle" font-size="12" fill="${INK2}">${centerBot}</text>
  </svg>`;
}
function legend(items) {
  return `<div class="legend">${items
    .map(
      (it) =>
        `<span class="lg"><span class="sw" style="background:${it.color}"></span>${it.label} — ${fBRL(it.value)}</span>`
    )
    .join('')}</div>`;
}

// ===========================================================================
// 4) HTML (enxuto — 1 a 2 páginas)
// ===========================================================================

const consumptionRows = materials.consumption
  .map(
    (c) =>
      `<tr><td>${c.label}<div class="sub">${c.note}</div></td>
       <td class="num">${c.perWeek}</td>
       <td class="num">${Math.round(c.perWeek * WEEKS_PER_MONTH)}</td>
       <td class="num">${(c.perWeek * 52).toLocaleString('pt-BR')}</td></tr>`
  )
  .join('');

const CSS = `
  :root{ --brand:#1b4332; --brand2:#2d6a4f; --ink:${INK}; --ink2:${INK2};
         --line:rgba(11,11,11,.10); --good:#006300; }
  *{ box-sizing:border-box; }
  html{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body{ font-family:system-ui,-apple-system,"Segoe UI",sans-serif; color:var(--ink);
        margin:0; font-size:13px; line-height:1.5; background:#fff; }
  .wrap{ padding:8mm 14mm; }
  h2{ font-size:15px; color:var(--brand); margin:11px 0 5px; }
  .num{ text-align:right; font-variant-numeric:tabular-nums; }
  .sub{ color:var(--ink2); font-size:10px; }
  .mono{ font-family:ui-monospace,Menlo,monospace; font-size:11px; }

  .head{ background:var(--brand); color:#fff; margin:0; padding:14px 14mm; }
  .head .kick{ font-size:11px; letter-spacing:.16em; text-transform:uppercase; opacity:.75; }
  .head h1{ font-size:23px; margin:5px 0 4px; }
  .head .p{ font-size:12px; opacity:.9; }

  .hero{ display:flex; align-items:center; gap:18px; border:1px solid var(--line);
         border-radius:12px; padding:11px 18px; margin:10px 0; background:#f6f8f6; }
  .hero .big{ font-size:33px; font-weight:800; color:var(--brand); line-height:1; }
  .hero .lab{ font-size:12px; color:var(--ink2); }
  .hero .cap{ margin-left:auto; text-align:right; font-size:12px; color:var(--ink2); }
  .hero .cap b{ font-size:15px; color:var(--ink); }

  .blocks{ display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin:9px 0; }
  .blk{ border:1px solid var(--line); border-radius:10px; padding:10px 14px; }
  .blk .k{ font-size:11px; color:var(--ink2); text-transform:uppercase; letter-spacing:.04em; }
  .blk .v{ font-size:20px; font-weight:700; margin-top:3px; }
  .blk.tot{ background:var(--brand); color:#fff; border:none; }
  .blk.tot .k{ color:rgba(255,255,255,.8); }

  .cols{ display:grid; grid-template-columns:196px 1fr; gap:18px; align-items:center; margin-top:2px; }
  table{ width:100%; border-collapse:collapse; font-size:12px; }
  th,td{ text-align:left; padding:4px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
  th{ font-size:10px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink2); background:#f6f6f4; }
  tr.total td{ font-weight:700; border-top:2px solid var(--brand); }
  .legend{ display:flex; flex-wrap:wrap; gap:5px 14px; margin-top:8px; font-size:11px; color:var(--ink2); }
  .lg{ display:inline-flex; align-items:center; } .sw{ width:11px; height:11px; border-radius:3px; margin-right:6px; }
  .callout{ background:#e8f0eb; border-left:4px solid var(--brand2); padding:8px 12px; border-radius:0 8px 8px 0; margin:7px 0; font-size:11.5px; }
  .callout.warn{ background:#fdf4e3; border-color:${C.yellow}; }
  .foot{ color:#898781; font-size:10px; border-top:1px solid var(--line); padding-top:6px; margin-top:9px; }
`;

const HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Custo do Sistema — Rastreio de Amostras</title>
<style>@page{ size:A4; margin:0; } ${CSS}</style></head><body>

<div class="head">
  <div class="kick">Custo do Sistema</div>
  <h1>Rastreio de Amostras — quanto custa por mês</h1>
  <div class="p">${params.users} usuários · ${params.samplesPerDay} amostras/dia · ${params.clients.toLocaleString('pt-BR')} clientes · ${params.shipmentsPerWeek} envios + ${params.approvalsPerWeek} aprovações/semana · valores em R$ (câmbio R$ ${USD_BRL.toFixed(2)}/US$) · ${GENERATED_AT}</div>
</div>

<div class="wrap">
  <div class="hero">
    <div>
      <div class="big">${fBRL(tcoMonth)}<span style="font-size:16px;font-weight:500">/mês</span></div>
      <div class="lab">custo total recorrente (nuvem + impressão)</div>
    </div>
    <div class="cap">
      <b>+ ${fBRL(materials.printerCapex)}</b><br>impressora Elgin L42 Pro<br>(compra única)
    </div>
  </div>

  <div class="blocks">
    <div class="blk"><div class="k">Nuvem / software</div><div class="v">${fBRL(infraMonth)}</div></div>
    <div class="blk"><div class="k">Materiais (impressão)</div><div class="v">${fBRL(materialsMonth)}</div></div>
    <div class="blk tot"><div class="k">Total por mês</div><div class="v">${fBRL(tcoMonth)}</div></div>
  </div>

  <div class="cols">
    <div>${donutSVG(donutSlices, fBRL(tcoMonth), '/mês')}</div>
    <div>
      ${legend(donutSlices)}
      <div class="callout" style="margin-top:6px">
        <strong>Por amostra: ${fBRL2(tcoPerSample)}</strong> · por usuário: ${fBRL(tcoPerUser)}/mês.
        O rastreio digital completo de cada amostra custa centavos.
      </div>
    </div>
  </div>

  <h2>Materiais de impressão</h2>
  <table>
    <thead><tr><th>Uso</th><th class="num">Etiq./semana</th><th class="num">/mês</th><th class="num">/ano</th></tr></thead>
    <tbody>${consumptionRows}
      <tr class="total"><td>Total de etiquetas</td><td class="num">${labelsPerWeek}</td><td class="num">${Math.round(labelsPerMonth).toLocaleString('pt-BR')}</td><td class="num">${labelsPerYear.toLocaleString('pt-BR')}</td></tr>
    </tbody>
  </table>
  <table style="margin-top:10px">
    <thead><tr><th>Item</th><th>Base</th><th class="num">Custo/mês</th></tr></thead>
    <tbody>
      <tr><td>Etiquetas</td><td class="sub">${labelsPerYear.toLocaleString('pt-BR')}/ano × ${fBRL2(materials.labelUnit)}</td><td class="num">${fBRL(labelCostMonth)}</td></tr>
      <tr><td>Ribbon</td><td class="sub">~${Math.round(ribbonsPerYear)} rolos/ano × ${fBRL(materials.ribbonPrice)} (~${materials.labelsPerRibbon} etiq./rolo)</td><td class="num">${fBRL(ribbonCostMonth)}</td></tr>
      <tr><td>Impressora Elgin L42 Pro</td><td class="sub">compra única (não recorrente)</td><td class="num">${fBRL(materials.printerCapex)}*</td></tr>
      <tr class="total"><td>Materiais recorrentes</td><td></td><td class="num">${fBRL(materialsMonth)}/mês</td></tr>
    </tbody>
  </table>
  <div class="callout warn">
    ⚠️ <strong>Desperdício:</strong> as ~${materials.wasteLabelsPerWeek}/semana jogadas fora por má leitura
    (só na classificação) custam <strong>~${fBRL(wasteCostYear / 12)}/mês (${fBRL(wasteCostYear)}/ano)</strong> —
    reduzir a taxa de erro de impressão é economia direta.
  </div>

  <div class="callout">
    <strong>Nuvem / software (${fBRL(infraMonth)}/mês)</strong> = ${infraBreakdown}. Detalhe, projeção de 3 anos
    e recomendações de economia no documento técnico completo.
  </div>

  <div class="foot">
    * Impressora = investimento único, fora do custo mensal. Análise detalhada, metodologia, projeção de 3 anos
    e recomendações: documento mestre <span class="mono">docs/Custo-Operacional-Analise.md</span>.
    Preparado para Flavio · Measy · ${GENERATED_AT}.
  </div>
</div>

</body></html>`;

// ===========================================================================
// 5) ESCRITA + PDF
// ===========================================================================

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(HTML_PATH, HTML, 'utf8');
console.log(`[cost-report] HTML  → ${HTML_PATH}`);

const profileDir = mkdtempSync(resolve(tmpdir(), 'chrome-costreport-'));
const chromeArgs = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--no-pdf-header-footer',
  `--user-data-dir=${profileDir}`,
  `--print-to-pdf=${PDF_PATH}`,
  `file://${HTML_PATH}`,
];
const bin = process.env.CHROME_BIN || 'google-chrome';
const res = spawnSync(bin, chromeArgs, { stdio: 'inherit' });
if (res.error || res.status !== 0) {
  console.error(
    `[cost-report] Chrome falhou (${bin}). Tente CHROME_BIN=/usr/bin/google-chrome-stable.`
  );
  process.exit(1);
}
console.log(`[cost-report] PDF   → ${PDF_PATH}`);
