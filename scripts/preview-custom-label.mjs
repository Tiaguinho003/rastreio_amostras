import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { buildCustomLabelLayout } from '../print-agent/label.js';

// Gera um PNG do preview da ETIQUETA AVULSA pra revisao de layout SEM deploy.
// Le buildCustomLabelLayout (mesma fonte que a impressao), desenha o texto
// com a LARGURA REAL das fontes internas TSPL (monospace travado por
// caractere) dentro do canvas exato 800x280 dots — entao o que estoura aqui
// estoura na impressao. Estouro da borda OU sobreposicao do logo = vermelho.
// O logo entra do PNG-fonte (assets) so pra dar a nocao de tamanho/posicao;
// no print real ele sai como bitmap 1-bit (logo-small-data.js).

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOGO_SRC = join(ROOT, 'assets', 'Safras-logo-ori.png');
const OUT_PNG = join(ROOT, 'print-agent', 'custom-label-preview.png');

// Largura x altura (dots) das fontes internas TSPL (multiplicador 1).
const FONT = { 1: [8, 12], 2: [12, 20], 3: [16, 24], 4: [24, 32], 5: [32, 48] };

const SCALE = 2; // px por dot no PNG final
const CAPTION_H = 46; // faixa de legenda abaixo da etiqueta (dots)

// PIOR-CASO: valores longos que atingem o maximo de linhas de cada campo, pra
// validar que nem o cenario mais cheio encosta nas margens.
const SAMPLE = {
  lines: [
    { label: 'N° COMPRA', value: 'OC-2025-0001234 / NF-99887766-A' },
    { label: 'N° FECHAMENTO', value: 'FC-2025-554433 / Lote 2025-06-A' },
    { label: 'PRODUT', value: 'Fazenda Boa Esperança do Rio Verde Ltda ME' },
    { label: 'ARMAZ', value: 'Armazém Central Patrocínio MG' },
    { label: 'SACAS', value: '320' },
    {
      label: 'LOTE',
      value: 'A-1234, A-1235, A-1236, A-1237, A-1238, A-1239, A-1240, A-1241, A-1242',
    },
  ],
};

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

async function main() {
  const layout = await buildCustomLabelLayout(SAMPLE);
  const W = layout.width;
  const H = layout.height;
  const logo = layout.logo;
  const logoW = logo ? logo.widthBytes * 8 : 0;
  const logoH = logo ? logo.height : 0;

  const els = [];
  // Fundo + borda fisica da etiqueta.
  els.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" />`);
  els.push(
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#bbbbbb" />`
  );

  // Divisoria vertical entre as colunas.
  if (layout.divider) {
    const d = layout.divider;
    els.push(
      `<rect x="${d.x}" y="${d.y}" width="${d.width}" height="${d.height}" fill="#333333" />`
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
      ? t.x + width > s.right || t.y + charH > s.bottom || t.x < s.left - 1 || t.y < s.top - 1
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
    `<text x="0" y="${H + 30}" font-family="sans-serif" font-size="20" fill="#666666">Etiqueta avulsa — 100 x 35 mm.  Azul tracejado = margem util.  Vermelho = texto fora da margem.</text>`
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

  await img.png().toFile(OUT_PNG);
  writeFileSync(OUT_PNG.replace(/\.png$/, '.svg'), svg);
  console.log(`Preview gerado: ${OUT_PNG}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
