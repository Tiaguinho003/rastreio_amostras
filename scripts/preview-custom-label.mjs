import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { buildCustomLabelLayout } from '../print-agent/label.js';

// Gera PNGs do preview da ETIQUETA DE APROVACAO pra revisao de layout SEM
// deploy. Le buildCustomLabelLayout (mesma fonte que a impressao), desenha o
// texto com a LARGURA REAL das fontes internas TSPL (monospace travado por
// caractere) dentro do canvas exato 800x280 dots — entao o que estoura aqui
// estoura na impressao. Estouro da margem OU sobreposicao do logo = vermelho.
// Varias contagens de lotes sao geradas pra validar a responsividade da grade.

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOGO_SRC = join(ROOT, 'assets', 'Safras-logo-ori.png');
const OUT_DIR = join(ROOT, 'print-agent');

// Largura x altura (dots) das fontes internas TSPL (multiplicador 1).
const FONT = { 1: [8, 12], 2: [12, 20], 3: [16, 24], 4: [24, 32] };

const SCALE = 2; // px por dot no PNG final
const CAPTION_H = 46; // faixa de legenda abaixo da etiqueta (dots)

// Lotes de teste: `chars`=3 gera 123,124...; `chars`=6 gera PA-001,PA-002...
function lotsValue(n, chars = 3) {
  return Array.from({ length: n }, (_, i) =>
    chars === 6 ? `PA-${String(1 + i).padStart(3, '0')}` : String(123 + i)
  ).join(', ');
}

function esc(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

async function render(sample, outName, caption) {
  const layout = await buildCustomLabelLayout(sample);
  const W = layout.width;
  const H = layout.height;
  const logo = layout.logo;
  const logoW = logo ? logo.widthBytes * 8 : 0;
  const logoH = logo ? logo.height : 0;

  const els = [];
  els.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" />`);
  els.push(
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#bbbbbb" />`
  );

  // Divisorias (barras solidas: horizontais entre faixas + verticais).
  for (const d of layout.dividers || []) {
    els.push(
      `<rect x="${d.x}" y="${d.y}" width="${d.width}" height="${d.height}" fill="#222222" />`
    );
  }

  // Guia da area util (margens) — azul tracejado; nada de texto deve passar dela.
  if (layout.safeArea) {
    const s = layout.safeArea;
    els.push(
      `<rect x="${s.left}" y="${s.top}" width="${s.right - s.left}" height="${s.bottom - s.top}" fill="none" stroke="#4a90d9" stroke-dasharray="6 5" />`
    );
  }

  // Moldura tracejada da area do logo (o bitmap real entra por composite).
  if (logo) {
    els.push(
      `<rect x="${logo.x}" y="${logo.y}" width="${logoW}" height="${logoH}" fill="none" stroke="#dddddd" stroke-dasharray="4 4" />`
    );
  }

  // Textos: largura travada = len * charW (fiel ao "cabe / nao cabe").
  for (const t of layout.texts) {
    const [cw, ch] = FONT[Number(t.font)] || FONT[3];
    const charW = cw * (t.xMul || 1);
    const charH = ch * (t.yMul || 1);
    const width = t.text.length * charW;

    const s = layout.safeArea;
    const offEdge = s
      ? t.x + width > s.right + 1 ||
        t.y + charH > s.bottom + 1 ||
        t.x < s.left - 1 ||
        t.y < s.top - 1
      : t.x + width > W || t.y + charH > H;
    const onLogo = logo && overlaps(t.x, t.y, width, charH, logo.x, logo.y, logoW, logoH);
    const bad = offEdge || onLogo;
    const fill = bad ? '#cc0000' : '#111111';

    const baseline = t.y + charH * 0.8;
    els.push(
      `<text xml:space="preserve" x="${t.x}" y="${baseline}" font-family="monospace" font-weight="${t.bold ? 'bold' : 'normal'}" font-size="${charH}" textLength="${width}" lengthAdjust="spacingAndGlyphs" fill="${fill}">${esc(t.text)}</text>`
    );
    if (bad) {
      els.push(
        `<rect x="${t.x}" y="${t.y}" width="${width}" height="${charH}" fill="none" stroke="#cc0000" stroke-dasharray="3 3" />`
      );
    }
  }

  // Legenda.
  els.push(
    `<text x="0" y="${H + 30}" font-family="sans-serif" font-size="20" fill="#666666">${esc(caption)}</text>`
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${(H + CAPTION_H) * SCALE}" viewBox="0 0 ${W} ${H + CAPTION_H}"><rect width="${W}" height="${H + CAPTION_H}" fill="#f4f4f4"/>${els.join('')}</svg>`;

  let img = sharp(Buffer.from(svg));
  if (logo) {
    const logoBuf = await sharp(LOGO_SRC)
      .resize(Math.round(logoW * SCALE), Math.round(logoH * SCALE), {
        fit: 'contain',
        background: '#ffffff',
      })
      .png()
      .toBuffer();
    img = sharp(await img.png().toBuffer()).composite([
      { input: logoBuf, left: Math.round(logo.x * SCALE), top: Math.round(logo.y * SCALE) },
    ]);
  }

  const outPng = join(OUT_DIR, outName);
  await img.png().toFile(outPng);
  writeFileSync(outPng.replace(/\.png$/, '.svg'), svg);
  console.log(`Preview gerado: ${outPng}`);
}

const SCENARIOS = [
  {
    name: 'custom-label-preview-1.png',
    cap: '1 - Tipico.  Azul = margem util.  Vermelho = fora.',
    compra: 'C003364',
    fech: '3228/26',
    sacas: '248',
    prod: 'José Aparecido Pereira',
    arm: 'Armazém Peneira Alta',
    lots: lotsValue(6),
  },
  {
    name: 'custom-label-preview-2.png',
    cap: '2 - Numeros grandes (fechamento/compra).',
    compra: '987654/25',
    fech: '123456789',
    sacas: '1200',
    prod: 'José da Silva',
    arm: 'Armazém Central SP',
    lots: lotsValue(3),
  },
  {
    name: 'custom-label-preview-3.png',
    cap: '3 - Nome do produtor grande.',
    compra: 'C003364',
    fech: '3228/26',
    sacas: '248',
    prod: 'José Aparecido da Silva Oliveira Santos Júnior',
    arm: 'Armazém Central SP',
    lots: lotsValue(4),
  },
  {
    name: 'custom-label-preview-4.png',
    cap: '4 - Armazem grande.',
    compra: 'C003364',
    fech: '3228/26',
    sacas: '248',
    prod: 'José da Silva',
    arm: 'Armazéns Gerais de Café do Sul de Minas Ltda',
    lots: lotsValue(2),
  },
  {
    name: 'custom-label-preview-5.png',
    cap: '5 - Poucos lotes (1).',
    compra: 'C003364',
    fech: '3228/26',
    sacas: '80',
    prod: 'José da Silva Oliveira',
    arm: 'Central SP',
    lots: lotsValue(1, 6),
  },
  {
    name: 'custom-label-preview-6.png',
    cap: '6 - Pior caso (tudo grande + 8 lotes de 6).',
    compra: '987654/25',
    fech: '123456789',
    sacas: '12000',
    prod: 'José Aparecido da Silva Oliveira Santos Júnior',
    arm: 'Armazéns Gerais de Café do Sul de Minas Ltda',
    lots: lotsValue(8, 6),
  },
  {
    name: 'custom-label-preview-7.png',
    cap: '7 - Futuro (sem lotes; area reservada vazia).',
    compra: 'C003364',
    fech: '3228/26',
    sacas: '248',
    prod: 'José da Silva Oliveira',
    arm: 'Armazém Central SP',
    lots: '',
  },
];

async function main() {
  for (const s of SCENARIOS) {
    await render(
      {
        lines: [
          { label: 'N° COMPRA', value: s.compra },
          { label: 'N° FECHAMENTO', value: s.fech },
          { label: 'SACAS', value: s.sacas },
          { label: 'PRODUT', value: s.prod },
          { label: 'ARMAZ', value: s.arm },
          { label: 'LOTE', value: s.lots },
        ],
      },
      s.name,
      s.cap
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
