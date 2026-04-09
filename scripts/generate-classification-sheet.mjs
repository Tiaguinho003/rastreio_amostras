import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.resolve(__dirname, '../assets/Safras-logo-ori.png');

// --- Unit conversion ---
const MM = 2.8346;
function pt(mm) { return mm * MM; }

// --- Card dimensions ---
const CARD_W = 101;
const CARD_H = 95.5;

// --- A4 page ---
const PAGE_W = 210;
const PAGE_H = 297;

// --- Grid: 2 cols x 3 rows = 6 cards per page ---
const COLS = 2;
const ROWS = 3;
const PAGE_MARGIN_H = 3;
const PAGE_MARGIN_V = 3;
const GAP_H = (PAGE_W - 2 * PAGE_MARGIN_H - COLS * CARD_W) / (COLS - 1);
const GAP_V = (PAGE_H - 2 * PAGE_MARGIN_V - ROWS * CARD_H) / (ROWS - 1);

// --- Card internal padding (mm) ---
const PAD = { top: 2, bottom: 1.5, left: 2, right: 2 };
const USABLE_W = CARD_W - PAD.left - PAD.right; // 97mm

// --- Row heights (mm) ---
const HEADER_H = 13;
const ROW_H = 13;
const SECTION_GAP = 0.6;

// --- Standard column width (4-col grid) ---
const COL_W = USABLE_W / 4; // 24.25mm

// --- Colors ---
const DARK = rgb(0.15, 0.15, 0.15);
const LABEL_COLOR = rgb(0.35, 0.35, 0.35);
const BORDER_COLOR = rgb(0.3, 0.3, 0.3);
const LIGHT_BG = rgb(0.96, 0.95, 0.92);

// --- Font sizes (optimized for AI extraction) ---
const LABEL_SIZE = 7;
const LOTE_LABEL_SIZE = 8;
const TYPE_NAME_SIZE = 9;
const OBS_LABEL_SIZE = 6.5;

// --- Border widths (thicker for AI detection) ---
const CELL_BORDER_W = 0.5;
const CARD_BORDER_W = 1.0;
const LOTE_BORDER_W = 0.6;
const LOTE_LINE_W = 0.5;

// ============================================================
// CARD TYPE DEFINITIONS
// ============================================================

const CARD_TYPES = {
  PREPARADO: {
    typeName: 'PREPARADO',
    rows: [
      // Row 1: Common — general classification
      { cells: [
        { label: 'Padr\u00e3o', w: COL_W },
        { label: 'Cata\u00e7\u00e3o', w: COL_W },
        { label: 'Aspecto', w: COL_W },
        { label: 'Bebida', w: COL_W }
      ] },
      // Row 2: Common — defects & harvest (gap after)
      { cells: [
        { label: 'Safra', w: COL_W },
        { label: 'Broca', w: COL_W },
        { label: 'PVA', w: COL_W },
        { label: 'Impureza', w: COL_W }
      ], gapAfter: true },
      // Row 3: Sieves upper
      { cells: [
        { label: 'P.19 %', w: COL_W },
        { label: 'P.18 %', w: COL_W },
        { label: 'P.17 %', w: COL_W },
        { label: 'P.16 %', w: COL_W }
      ] },
      // Row 4: Sieves lower + MK + Defeito
      { cells: [
        { label: 'P.15 %', w: COL_W },
        { label: 'P.14 %', w: COL_W },
        { label: 'MK %', w: COL_W },
        { label: 'Defeito', w: COL_W }
      ] },
      // Row 5: Fundo 1 only (2 wide cells, beige)
      { cells: [
        { label: 'Fundo Pen.', w: USABLE_W / 2 },
        { label: '%', w: USABLE_W / 2 }
      ], bg: LIGHT_BG }
    ]
    // obsHeight: auto (ROW_H)
  },

  LOW_CAFF: {
    typeName: 'LOW CAFF',
    rows: [
      // Row 1: Common
      { cells: [
        { label: 'Padr\u00e3o', w: COL_W },
        { label: 'Cata\u00e7\u00e3o', w: COL_W },
        { label: 'Aspecto', w: COL_W },
        { label: 'Bebida', w: COL_W }
      ] },
      // Row 2: Common (gap after)
      { cells: [
        { label: 'Safra', w: COL_W },
        { label: 'Broca', w: COL_W },
        { label: 'PVA', w: COL_W },
        { label: 'Impureza', w: COL_W }
      ], gapAfter: true },
      // Row 3: 6 sieves (compressed — 6 columns)
      { cells: [
        { label: 'P.15 %', w: USABLE_W / 6 },
        { label: 'P.14 %', w: USABLE_W / 6 },
        { label: 'P.13 %', w: USABLE_W / 6 },
        { label: 'P.12 %', w: USABLE_W / 6 },
        { label: 'P.11 %', w: USABLE_W / 6 },
        { label: 'P.10 %', w: USABLE_W / 6 }
      ] },
      // Row 4: AP, GPI, Defeito (3 equal cells)
      { cells: [
        { label: 'AP %', w: USABLE_W / 3 },
        { label: 'GPI', w: USABLE_W / 3 },
        { label: 'Defeito', w: USABLE_W / 3 }
      ] },
      // Row 5: Fundo 1 + Fundo 2 (4 cols, beige)
      { cells: [
        { label: 'Fundo Pen.', w: COL_W },
        { label: '%', w: COL_W },
        { label: 'Fundo Pen.', w: COL_W },
        { label: '%', w: COL_W }
      ], bg: LIGHT_BG }
    ]
  },

  BICA: {
    typeName: 'BICA',
    rows: [
      // Row 1: Common
      { cells: [
        { label: 'Padr\u00e3o', w: COL_W },
        { label: 'Cata\u00e7\u00e3o', w: COL_W },
        { label: 'Aspecto', w: COL_W },
        { label: 'Bebida', w: COL_W }
      ] },
      // Row 2: Common (gap after)
      { cells: [
        { label: 'Safra', w: COL_W },
        { label: 'Broca', w: COL_W },
        { label: 'PVA', w: COL_W },
        { label: 'Impureza', w: COL_W }
      ], gapAfter: true },
      // Row 3: Only P.17 + MK (2 wide cells)
      { cells: [
        { label: 'P.17 %', w: USABLE_W / 2 },
        { label: 'MK %', w: USABLE_W / 2 }
      ] },
      // Row 4: Fundo 1 + Fundo 2 (4 cols, beige)
      { cells: [
        { label: 'Fundo Pen.', w: COL_W },
        { label: '%', w: COL_W },
        { label: 'Fundo Pen.', w: COL_W },
        { label: '%', w: COL_W }
      ], bg: LIGHT_BG }
    ],
    obsHeight: 26 // Extra tall — Bica has fewer rows
  }
};

// ============================================================
// DRAWING FUNCTIONS
// ============================================================

function drawCell(page, x, y, w, h, label, fonts, opts = {}) {
  const { bg, borderW = CELL_BORDER_W, labelSize = LABEL_SIZE } = opts;
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
      y: yPt + hPt - pt(3.5),
      size: labelSize,
      font: fonts.bold,
      color: LABEL_COLOR
    });
  }
}

function drawCard(page, cardX, cardY, fonts, logoImage, cardType) {
  const bx = cardX;
  const by = cardY;
  const config = CARD_TYPES[cardType];

  // --- Outer card border ---
  page.drawRectangle({
    x: pt(bx), y: pt(by), width: pt(CARD_W), height: pt(CARD_H),
    borderColor: DARK, borderWidth: CARD_BORDER_W
  });

  let cy = 0; // cumulative Y from top

  // === HEADER (13mm): Logo + Lote + Type Name ===
  const headerY = by + CARD_H - PAD.top - HEADER_H;

  // Logo cell
  const logoW = 28;
  const logoX = bx + PAD.left;
  drawCell(page, logoX, headerY, logoW, HEADER_H, null, fonts, { borderW: LOTE_BORDER_W });

  // Logo image
  const logoPadX = 1.5;
  const logoPadY = 2;
  const logoAvailW = logoW - logoPadX * 2;
  const logoAvailH = HEADER_H - logoPadY * 2;
  const logoImgW = Math.min(logoAvailW, logoAvailH * 2.96);
  const logoImgH = logoImgW / 2.96;
  const logoDrawX = logoX + logoPadX + (logoAvailW - logoImgW) / 2;
  const logoDrawY = headerY + logoPadY + (logoAvailH - logoImgH) / 2;
  page.drawImage(logoImage, {
    x: pt(logoDrawX), y: pt(logoDrawY),
    width: pt(logoImgW), height: pt(logoImgH)
  });

  // Lote field
  const loteX = logoX + logoW;
  const loteW = USABLE_W - logoW;
  drawCell(page, loteX, headerY, loteW, HEADER_H, null, fonts, { borderW: LOTE_BORDER_W });

  // LOTE label
  page.drawText('LOTE', {
    x: pt(loteX + 2), y: pt(headerY + HEADER_H - 4.5),
    size: LOTE_LABEL_SIZE, font: fonts.bold, color: DARK
  });

  // LOTE writing line
  const lineStartX = loteX + 13;
  const lineEndX = loteX + loteW - 2;
  const lineY = headerY + 5.5;
  page.drawLine({
    start: { x: pt(lineStartX), y: pt(lineY) },
    end: { x: pt(lineEndX), y: pt(lineY) },
    thickness: LOTE_LINE_W, color: BORDER_COLOR
  });

  // Type name below the writing line
  page.drawText(config.typeName, {
    x: pt(loteX + 2), y: pt(headerY + 1.5),
    size: TYPE_NAME_SIZE, font: fonts.bold, color: DARK
  });

  cy = PAD.top + HEADER_H;

  // === DATA ROWS ===
  const gridStartX = bx + PAD.left;

  for (let r = 0; r < config.rows.length; r++) {
    const row = config.rows[r];
    const rowY = by + CARD_H - cy - ROW_H;

    let cx = 0;
    for (const cell of row.cells) {
      drawCell(
        page,
        gridStartX + cx, rowY,
        cell.w, ROW_H,
        cell.label, fonts,
        { bg: row.bg }
      );
      cx += cell.w;
    }

    cy += ROW_H;

    if (row.gapAfter) {
      cy += SECTION_GAP;
    }
  }

  // === OBSERVACOES ROW (last, full width) ===
  const obsH = config.obsHeight || ROW_H;
  const obsY = by + CARD_H - cy - obsH;
  drawCell(
    page,
    gridStartX, obsY,
    USABLE_W, obsH,
    'Observa\u00e7\u00f5es', fonts,
    { labelSize: OBS_LABEL_SIZE }
  );
}

function drawCutGuides(page) {
  const dash = { dashArray: [pt(2), pt(2)] };
  const color = rgb(0.7, 0.7, 0.7);
  const thickness = 0.3;

  // Vertical cut line between columns
  const cutX = PAGE_MARGIN_H + CARD_W + GAP_H / 2;
  page.drawLine({
    start: { x: pt(cutX), y: 0 },
    end: { x: pt(cutX), y: pt(PAGE_H) },
    thickness, color, ...dash
  });

  // Horizontal cut lines between rows
  for (let row = 1; row < ROWS; row++) {
    const cutY = PAGE_MARGIN_V + row * CARD_H + (row - 0.5) * GAP_V;
    page.drawLine({
      start: { x: 0, y: pt(cutY) },
      end: { x: pt(PAGE_W), y: pt(cutY) },
      thickness, color, ...dash
    });
  }
}

// ============================================================
// MAIN — Generate one PDF per card type
// ============================================================

async function generatePdf(cardType, fonts, logoImage) {
  const doc = await PDFDocument.create();
  const embeddedFonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold)
  };
  const embeddedLogo = await doc.embedPng(logoImage);

  const page = doc.addPage([pt(PAGE_W), pt(PAGE_H)]);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cardX = PAGE_MARGIN_H + col * (CARD_W + GAP_H);
      const cardBottomY = PAGE_H - PAGE_MARGIN_V - (row + 1) * CARD_H - row * GAP_V;
      drawCard(page, cardX, cardBottomY, embeddedFonts, embeddedLogo, cardType);
    }
  }

  drawCutGuides(page);

  return doc.save();
}

async function main() {
  const logoBytes = fs.readFileSync(LOGO_PATH);

  const types = ['PREPARADO', 'LOW_CAFF', 'BICA'];
  const fileNames = {
    PREPARADO: 'ficha-preparado.pdf',
    LOW_CAFF: 'ficha-low-caff.pdf',
    BICA: 'ficha-bica.pdf'
  };

  for (const type of types) {
    const pdfBytes = await generatePdf(type, null, logoBytes);
    const outPath = path.resolve(__dirname, '..', fileNames[type]);
    fs.writeFileSync(outPath, pdfBytes);
    console.log(`Generated: ${outPath}`);
  }
}

main().catch(console.error);
