import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import QRCode from 'qrcode';

import { buildShippingLabelLayout } from '../print-agent/label.js';

// Gera PNGs do preview da ETIQUETA DE ENVIO (fase 5) pra revisao de layout SEM
// deploy/impressao. Le buildShippingLabelLayout (mesma fonte que a impressao),
// desenha o texto com a LARGURA REAL das fontes internas TSPL dentro do canvas
// 800x280 dots, e renderiza o QR real (qrcode) na posicao/tamanho calculados —
// entao o que estoura aqui estoura na impressao. Estouro da margem util OU
// sobreposicao do logo/QR = vermelho. Gera variantes COM e SEM QR.

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOGO_SRC = join(ROOT, 'assets', 'Safras-logo-ori.png');
const OUT_DIR = join(ROOT, 'print-agent');

// Largura x altura (dots) das fontes internas TSPL (multiplicador 1).
const FONT = { 1: [8, 12], 2: [12, 20], 3: [16, 24], 4: [24, 32] };

const SCALE = 2; // px por dot no PNG final
const CAPTION_H = 46;

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

async function render(payload, outName, caption) {
  const layout = buildShippingLabelLayout(payload);
  const W = layout.width;
  const H = layout.height;
  const logo = layout.logo;
  const logoW = logo ? logo.widthBytes * 8 : 0;
  const logoH = logo ? logo.height : 0;
  const qr = layout.qr;

  const els = [];
  els.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" />`);
  els.push(
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#bbbbbb" />`
  );

  for (const d of layout.dividers || []) {
    els.push(
      `<rect x="${d.x}" y="${d.y}" width="${d.width}" height="${d.height}" fill="#222222" />`
    );
  }

  // Bordas (ex: moldura arredondada do "LAUDO").
  for (const b of layout.boxes || []) {
    els.push(
      `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${b.radius || 0}" fill="none" stroke="#222222" stroke-width="${b.thickness || 1}" />`
    );
  }

  if (layout.safeArea) {
    const s = layout.safeArea;
    els.push(
      `<rect x="${s.left}" y="${s.top}" width="${s.right - s.left}" height="${s.bottom - s.top}" fill="none" stroke="#4a90d9" stroke-dasharray="6 5" />`
    );
  }

  if (logo) {
    els.push(
      `<rect x="${logo.x}" y="${logo.y}" width="${logoW}" height="${logoH}" fill="none" stroke="#dddddd" stroke-dasharray="4 4" />`
    );
  }

  // Moldura da area do QR (o QR real entra por composite).
  if (qr) {
    els.push(
      `<rect x="${qr.x}" y="${qr.y}" width="${qr.size}" height="${qr.size}" fill="none" stroke="#dddddd" stroke-dasharray="4 4" />`
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
    const onQr = qr && overlaps(t.x, t.y, width, charH, qr.x, qr.y, qr.size, qr.size);
    const bad = offEdge || onLogo || onQr;
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

  els.push(
    `<text x="0" y="${H + 30}" font-family="sans-serif" font-size="20" fill="#666666">${esc(caption)}</text>`
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${(H + CAPTION_H) * SCALE}" viewBox="0 0 ${W} ${H + CAPTION_H}"><rect width="${W}" height="${H + CAPTION_H}" fill="#f4f4f4"/>${els.join('')}</svg>`;

  let img = sharp(Buffer.from(svg));
  const composites = [];

  if (logo) {
    const logoBuf = await sharp(LOGO_SRC)
      .resize(Math.round(logoW * SCALE), Math.round(logoH * SCALE), {
        fit: 'contain',
        background: '#ffffff',
      })
      .png()
      .toBuffer();
    composites.push({
      input: logoBuf,
      left: Math.round(logo.x * SCALE),
      top: Math.round(logo.y * SCALE),
    });
  }

  if (qr) {
    // QR real (qrcode) na MESMA posicao/tamanho do layout — fiel a densidade.
    const qrBuf = await QRCode.toBuffer(qr.value, {
      errorCorrectionLevel: 'L',
      margin: 1,
      width: Math.round(qr.size * SCALE),
    });
    composites.push({
      input: qrBuf,
      left: Math.round(qr.x * SCALE),
      top: Math.round(qr.y * SCALE),
    });
  }

  if (composites.length > 0) {
    img = sharp(await img.png().toBuffer()).composite(composites);
  }

  const outPng = join(OUT_DIR, outName);
  await img.png().toFile(outPng);
  writeFileSync(outPng.replace(/\.png$/, '.svg'), svg);
  console.log(`Preview gerado: ${outPng}`);
}

// URL REAL de producao (dominio Firebase Hosting + token base64url de 43 chars)
// ~87 chars => QR v5 (37 modulos) — o caso que de fato imprime.
const SAMPLE_QR_URL = `https://safras-negocios-laudo.web.app/laudo/${'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0uvw'}`;

async function main() {
  await render(
    {
      internalLotNumber: '5641',
      sentDate: '2026-06-18',
      harvest: '25/26',
      sacks: 30,
      qrUrl: SAMPLE_QR_URL,
    },
    'shipping-label-preview.png',
    'Envio CLASSIFIED — com QR do laudo.  Azul = margem util.  Vermelho = fora.'
  );

  await render(
    {
      internalLotNumber: '5641',
      sentDate: '2026-06-18',
      harvest: '25/26',
      sacks: 30,
      qrUrl: null,
    },
    'shipping-label-preview-sem-qr.png',
    'Envio nao classificado — etiqueta SEM QR (dados ocupam a largura).'
  );

  await render(
    {
      internalLotNumber: '12345',
      sentDate: '2026-06-18',
      harvest: '24/25',
      sacks: 248,
      qrUrl: SAMPLE_QR_URL,
    },
    'shipping-label-preview-2.png',
    'Envio CLASSIFIED — lote/sacas maiores.'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
