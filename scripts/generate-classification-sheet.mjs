import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.resolve(__dirname, '../assets/Safras-logo-ori.png');

const MM = 2.8346;

// Card dimensions
const CARD_W = 99;
const CARD_H = 95;

// A4 page
const PAGE_W = 210;
const PAGE_H = 297;

// Grid: 2×3 = 6 cards per page
const COLS = 2;
const ROWS = 3;
const H_MARGIN = (PAGE_W - COLS * CARD_W) / (COLS + 1);
const V_MARGIN = (PAGE_H - ROWS * CARD_H) / (ROWS + 1);

// Card internal margins (mm)
const PAD = { top: 2, bottom: 1.5, left: 2.5, right: 2.5 };
const USABLE_W = CARD_W - PAD.left - PAD.right; // 94mm

// Row heights (mm)
const HEADER_H = 14;
const ROW_H = 9.5;
const GAP = 0.5;

// Colors
const DARK = rgb(0.15, 0.15, 0.15);
const LABEL = rgb(0.4, 0.4, 0.4);
const BORDER_COLOR = rgb(0.3, 0.3, 0.3);
const LIGHT_BG = rgb(0.97, 0.96, 0.94);
const GREEN_DARK = rgb(0.15, 0.30, 0.18);
const GREEN_LIGHT = rgb(0.88, 0.93, 0.88);

// Label font size
const LABEL_SIZE = 5.5;
const LOGO_SIZE = 11;
const LOTE_LABEL_SIZE = 8;

function pt(mm) {
  return mm * MM;
}

function drawCell(page, x, y, w, h, label, fonts, opts = {}) {
  const { bg, borderW = 0.3, labelSize = LABEL_SIZE, labelColor = LABEL } = opts;
  const xPt = pt(x);
  const yPt = pt(y);
  const wPt = pt(w);
  const hPt = pt(h);

  if (bg) {
    page.drawRectangle({ x: xPt, y: yPt, width: wPt, height: hPt, color: bg });
  }

  page.drawRectangle({
    x: xPt, y: yPt, width: wPt, height: hPt,
    borderColor: BORDER_COLOR, borderWidth: borderW
  });

  if (label) {
    page.drawText(label, {
      x: xPt + pt(1.2),
      y: yPt + hPt - pt(3.2),
      size: labelSize,
      font: fonts.regular,
      color: labelColor
    });
  }
}

function drawCard(page, cardX, cardY, fonts, logoImage) {
  // cardX, cardY = top-left corner of card in mm (PDF coords: y is bottom of card)
  const bx = cardX; // base x
  const by = cardY; // base y (bottom of card in mm from page bottom)

  // Outer card border
  page.drawRectangle({
    x: pt(bx), y: pt(by), width: pt(CARD_W), height: pt(CARD_H),
    borderColor: DARK, borderWidth: 0.8
  });

  // Current Y position tracking (from top, in mm offset from card top)
  let cy = 0;

  // --- HEADER (14mm): Logo + Lote ---
  const headerY = by + CARD_H - PAD.top - HEADER_H;

  // Logo area (left side, 30mm wide)
  const logoW = 30;
  const logoX = bx + PAD.left;
  drawCell(page, logoX, headerY, logoW, HEADER_H, null, fonts, { borderW: 0.3 });

  // Draw logo image (centered in logo area, with padding)
  const logoPadX = 1.5;
  const logoPadY = 2;
  const logoAvailW = logoW - logoPadX * 2;
  const logoAvailH = HEADER_H - logoPadY * 2;
  // Logo aspect ratio is ~2.96:1 — fit within available area
  const logoImgW = Math.min(logoAvailW, logoAvailH * 2.96);
  const logoImgH = logoImgW / 2.96;
  const logoDrawX = logoX + logoPadX + (logoAvailW - logoImgW) / 2;
  const logoDrawY = headerY + logoPadY + (logoAvailH - logoImgH) / 2;
  page.drawImage(logoImage, {
    x: pt(logoDrawX),
    y: pt(logoDrawY),
    width: pt(logoImgW),
    height: pt(logoImgH)
  });

  // Lote field (remaining width)
  const loteX = logoX + logoW;
  const loteW = USABLE_W - logoW;
  drawCell(page, loteX, headerY, loteW, HEADER_H, null, fonts, { borderW: 0.5 });

  // Lote label
  page.drawText('LOTE', {
    x: pt(loteX + 2),
    y: pt(headerY + HEADER_H - 4.5),
    size: LOTE_LABEL_SIZE,
    font: fonts.bold,
    color: DARK
  });

  // Lote underline for writing
  const lineStartX = loteX + 13;
  const lineEndX = loteX + loteW - 2;
  const lineY = headerY + 4;
  page.drawLine({
    start: { x: pt(lineStartX), y: pt(lineY) },
    end: { x: pt(lineEndX), y: pt(lineY) },
    thickness: 0.4,
    color: BORDER_COLOR
  });

  cy = PAD.top + HEADER_H;

  // --- INFO ROW (9.5mm): Sacas | Safra | Data ---
  const infoY = by + CARD_H - cy - ROW_H;
  const infoColW = USABLE_W / 3;
  const infoLabels = ['Sacas', 'Safra', 'Data'];
  for (let i = 0; i < 3; i++) {
    drawCell(page, bx + PAD.left + i * infoColW, infoY, infoColW, ROW_H, infoLabels[i], fonts, { bg: LIGHT_BG });
  }

  cy += ROW_H + GAP;

  // --- GERAL ROW 1 (9.5mm): Padrao | Catacao ---
  const geralRow1Y = by + CARD_H - cy - ROW_H;
  const halfW = USABLE_W / 2;
  drawCell(page, bx + PAD.left, geralRow1Y, halfW, ROW_H, 'Padrão', fonts);
  drawCell(page, bx + PAD.left + halfW, geralRow1Y, halfW, ROW_H, 'Catação', fonts);

  cy += ROW_H;

  // --- GERAL ROW 2 (9.5mm): Aspecto | Bebida ---
  const geralRow2Y = by + CARD_H - cy - ROW_H;
  drawCell(page, bx + PAD.left, geralRow2Y, halfW, ROW_H, 'Aspecto', fonts);
  drawCell(page, bx + PAD.left + halfW, geralRow2Y, halfW, ROW_H, 'Bebida', fonts);

  cy += ROW_H + GAP;

  // --- PENEIRAS ROW 1 (9.5mm): 18 | 17 | 16 | MK ---
  const quarterW = USABLE_W / 4;
  const penRow1Y = by + CARD_H - cy - ROW_H;
  const penLabels1 = ['P.18 %', 'P.17 %', 'P.16 %', 'MK %'];
  for (let i = 0; i < 4; i++) {
    drawCell(page, bx + PAD.left + i * quarterW, penRow1Y, quarterW, ROW_H, penLabels1[i], fonts);
  }

  cy += ROW_H;

  // --- PENEIRAS ROW 2 (9.5mm): 15 | 14 | 13 | 10 ---
  const penRow2Y = by + CARD_H - cy - ROW_H;
  const penLabels2 = ['P.15 %', 'P.14 %', 'P.13 %', 'P.10 %'];
  for (let i = 0; i < 4; i++) {
    drawCell(page, bx + PAD.left + i * quarterW, penRow2Y, quarterW, ROW_H, penLabels2[i], fonts);
  }

  cy += ROW_H;

  // --- FUNDOS ROW (9.5mm): FD1 Pen | FD1 % | FD2 Pen | FD2 % ---
  const fundosY = by + CARD_H - cy - ROW_H;
  const fundosLabels = ['FD1 Pen.', 'FD1 %', 'FD2 Pen.', 'FD2 %'];
  for (let i = 0; i < 4; i++) {
    drawCell(page, bx + PAD.left + i * quarterW, fundosY, quarterW, ROW_H, fundosLabels[i], fonts, { bg: LIGHT_BG });
  }

  cy += ROW_H + GAP;

  // --- DEFEITOS ROW 1 (9.5mm): DEF | Broca | PVA | IMP ---
  const defRow1Y = by + CARD_H - cy - ROW_H;
  const defLabels1 = ['Defeitos', 'Broca', 'PVA', 'Impureza'];
  for (let i = 0; i < 4; i++) {
    drawCell(page, bx + PAD.left + i * quarterW, defRow1Y, quarterW, ROW_H, defLabels1[i], fonts);
  }

  cy += ROW_H;

  // --- DEFEITOS ROW 2 (9.5mm): PAU | AP | GPI | UM% ---
  const defRow2Y = by + CARD_H - cy - ROW_H;
  const defLabels2 = ['Pau', 'AP', 'GPI', 'Umid. %'];
  for (let i = 0; i < 4; i++) {
    drawCell(page, bx + PAD.left + i * quarterW, defRow2Y, quarterW, ROW_H, defLabels2[i], fonts);
  }
}

function drawCutGuides(page) {
  const dash = { dashArray: [pt(2), pt(2)] };
  const color = rgb(0.7, 0.7, 0.7);
  const thickness = 0.3;

  // Vertical cut lines
  for (let col = 0; col <= COLS; col++) {
    const x = H_MARGIN + col * (CARD_W + H_MARGIN) - H_MARGIN / 2;
    if (col === 0 || col === COLS) continue;
    page.drawLine({
      start: { x: pt(x), y: 0 },
      end: { x: pt(x), y: pt(PAGE_H) },
      thickness, color, ...dash
    });
  }

  // Horizontal cut lines
  for (let row = 0; row <= ROWS; row++) {
    const y = V_MARGIN + row * (CARD_H + V_MARGIN) - V_MARGIN / 2;
    if (row === 0 || row === ROWS) continue;
    page.drawLine({
      start: { x: 0, y: pt(y) },
      end: { x: pt(PAGE_W), y: pt(y) },
      thickness, color, ...dash
    });
  }
}

async function main() {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };

  // Embed logo
  const logoBytes = fs.readFileSync(LOGO_PATH);
  const logoImage = await doc.embedPng(logoBytes);

  const page = doc.addPage([pt(PAGE_W), pt(PAGE_H)]);

  // Draw 6 cards (2×3)
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cardX = H_MARGIN + col * (CARD_W + H_MARGIN);
      // PDF y=0 is bottom, so first row (top) has highest y
      const cardBottomY = PAGE_H - V_MARGIN - (row + 1) * CARD_H - row * V_MARGIN;
      drawCard(page, cardX, cardBottomY, fonts, logoImage);
    }
  }

  drawCutGuides(page);

  const pdfBytes = await doc.save();
  const outPath = new URL('../ficha-classificacao-99x95.pdf', import.meta.url).pathname;
  fs.writeFileSync(outPath, pdfBytes);
  console.log(`Generated: ${outPath}`);
}

main().catch(console.error);
