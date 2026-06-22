import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { buildSampleLabelLayout } from '../print-agent/label.js';

// PREVIEW da ETIQUETA DE CONTROLE INTERNO (impressa auto pos-classificacao). Le
// buildSampleLabelLayout (MESMA fonte que a impressao em print-agent/label.js),
// desenha o texto com a LARGURA REAL das fontes internas TSPL dentro do canvas
// 800x280 dots e renderiza o QR real (qrcode) — entao o que estoura aqui estoura
// na impressao. Estouro da margem util OU sobreposicao do logo/QR = vermelho.
//
// Saidas (print-agent/): PNG+SVG por variante (com guias) + um PDF unico em
// TAMANHO REAL (100x35mm por pagina) pra revisao/impressao teste.

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOGO_SRC = join(ROOT, 'assets', 'Safras-logo-ori.png');
const OUT_DIR = join(ROOT, 'print-agent');

// Largura x altura (dots) das fontes internas TSPL (multiplicador 1).
const FONT = { 1: [8, 12], 2: [12, 20], 3: [16, 24], 4: [24, 32] };
const fw = (f) => FONT[Number(f)][0];
const fh = (f) => FONT[Number(f)][1];

const SCALE = 4; // px por dot (PNG de alta resolucao p/ o PDF)
const CAPTION_H = 46;
const MONO_ADV = 0.6; // avanco/em do monospace (DejaVu Sans Mono no librsvg)

function esc(t) {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

async function renderPng(job, caption) {
  const layout = buildSampleLabelLayout(job);
  const W = layout.width;
  const H = layout.height;
  const logo = layout.logo;
  const logoW = logo.widthBytes * 8;
  const logoH = logo.height;
  const qr = layout.qr;

  const els = [];
  els.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" />`);
  els.push(
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#bbbbbb" />`
  );

  for (const d of layout.dividers) {
    els.push(
      `<rect x="${d.x}" y="${d.y}" width="${d.width}" height="${d.height}" fill="#222222" />`
    );
  }

  const sa = layout.safeArea;
  els.push(
    `<rect x="${sa.left}" y="${sa.top}" width="${sa.right - sa.left}" height="${sa.bottom - sa.top}" fill="none" stroke="#4a90d9" stroke-dasharray="6 5" />`
  );
  els.push(
    `<rect x="${logo.x}" y="${logo.y}" width="${logoW}" height="${logoH}" fill="none" stroke="#dddddd" stroke-dasharray="4 4" />`
  );
  if (qr) {
    els.push(
      `<rect x="${qr.x}" y="${qr.y}" width="${qr.size}" height="${qr.size}" fill="none" stroke="#dddddd" stroke-dasharray="4 4" />`
    );
  }

  // Largura travada pela CELULA TSPL (charW/char). O librsvg ignora a compressao
  // de glifos por textLength em multiplicadores altos (ex: LOTE 2x4), entao
  // usamos transform scaleX = celula/larguraNatural-monospace pra forcar a
  // largura exata — fiel ao que a impressora desenha.
  for (const t of layout.texts) {
    const charW = fw(t.font) * (t.xMul || 1);
    const charH = fh(t.font) * (t.yMul || 1);
    const width = t.text.length * charW;
    const offEdge =
      t.x + width > sa.right + 1 ||
      t.y + charH > sa.bottom + 1 ||
      t.x < sa.left - 1 ||
      t.y < sa.top - 1;
    const onLogo = overlaps(t.x, t.y, width, charH, logo.x, logo.y, logoW, logoH);
    const onQr = qr && overlaps(t.x, t.y, width, charH, qr.x, qr.y, qr.size, qr.size);
    const bad = offEdge || onLogo || onQr;
    const fill = bad ? '#cc0000' : '#111111';
    const baseline = t.y + charH * 0.8;
    const scaleX = charW / (charH * MONO_ADV);
    els.push(
      `<g transform="translate(${t.x},0) scale(${scaleX.toFixed(4)},1)"><text xml:space="preserve" x="0" y="${baseline}" font-family="monospace" font-weight="${t.bold ? 'bold' : 'normal'}" font-size="${charH}" fill="${fill}">${esc(t.text)}</text></g>`
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

  const composites = [];
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
  if (qr) {
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

  const baseBuf = await sharp(Buffer.from(svg)).png().toBuffer();
  const fullBuf = await sharp(baseBuf).composite(composites).png().toBuffer();
  // PNG so do retangulo da etiqueta (sem a faixa de legenda) p/ embutir no PDF.
  const labelBuf = await sharp(fullBuf)
    .extract({ left: 0, top: 0, width: W * SCALE, height: H * SCALE })
    .png()
    .toBuffer();

  return { svg, fullBuf, labelBuf };
}

const MM = 72 / 25.4; // pt por mm

async function main() {
  const baseISO = '2026-06-22T12:00:00.000Z';
  const variants = [
    {
      name: 'classificada',
      caption: 'Classificada — DATA/SAFRA/SACAS no topo; LOTE | PADRAO/ASPECTO + QR.',
      job: {
        sample: {
          internalLotNumber: '5689',
          registeredAt: baseISO,
          qrValue: '5689',
          declared: { harvest: '26/27', sacks: 250 },
          classification: { padrao: 'L3-P3', aspecto: 'GC' },
        },
      },
    },
    {
      name: 'classificada-valores-longos',
      caption: 'Classificada — lote 5 dig, padrao ESPECIAL, aspecto BD.',
      job: {
        sample: {
          internalLotNumber: '12345',
          registeredAt: baseISO,
          qrValue: '12345',
          declared: { harvest: '24/25', sacks: 248 },
          classification: { padrao: 'ESPECIAL', aspecto: 'BD' },
        },
      },
    },
    {
      name: 'nao-classificada',
      caption: 'NAO classificada — sem PADRAO/ASPECTO (coluna direita vazia). QR continua.',
      job: {
        sample: {
          internalLotNumber: '5701',
          registeredAt: baseISO,
          qrValue: '5701',
          declared: { harvest: '26/27', sacks: 120 },
          classification: null,
        },
      },
    },
    {
      name: 'lote-longo',
      caption: 'Lote 7 digitos (teste de largura do LOTE na metade esquerda).',
      job: {
        sample: {
          internalLotNumber: '1234567',
          registeredAt: baseISO,
          qrValue: '1234567',
          declared: { harvest: '26/27', sacks: 90 },
          classification: { padrao: 'L4-P3B', aspecto: 'GC' },
        },
      },
    },
  ];

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const v of variants) {
    const { svg, fullBuf, labelBuf } = await renderPng(v.job, v.caption);
    const pngPath = join(OUT_DIR, `internal-label-preview-${v.name}.png`);
    await sharp(fullBuf).png().toFile(pngPath);
    writeFileSync(pngPath.replace(/\.png$/, '.svg'), svg);
    console.log(`Preview gerado: ${pngPath}`);

    // Pagina do PDF: etiqueta em TAMANHO REAL (100x35mm) + legenda embaixo.
    const labelW = 100 * MM;
    const labelH = 35 * MM;
    const margin = 24;
    const captionH = 24;
    const page = pdf.addPage([labelW + margin * 2, labelH + margin * 2 + captionH]);
    const img = await pdf.embedPng(labelBuf);
    const x = margin;
    const yImg = margin + captionH;
    page.drawRectangle({
      x: x - 1,
      y: yImg - 1,
      width: labelW + 2,
      height: labelH + 2,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1,
    });
    page.drawImage(img, { x, y: yImg, width: labelW, height: labelH });
    page.drawText(v.caption, { x, y: margin, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
    page.drawText('Etiqueta de Controle Interno — 100 x 35 mm (tamanho real)', {
      x,
      y: yImg + labelH + 8,
      size: 9,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  const pdfPath = join(OUT_DIR, 'internal-label-preview.pdf');
  writeFileSync(pdfPath, await pdf.save());
  console.log(`\nPDF gerado: ${pdfPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
