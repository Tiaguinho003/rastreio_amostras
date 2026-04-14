import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Unit conversion ---
const MM = 2.8346;
function pt(mm) {
  return mm * MM;
}

// --- Card dimensions ---
const CARD_W = 101;
const CARD_H = 95.5;

// --- A4 page ---
const PAGE_W = 210;
const PAGE_H = 297;

// --- Grid: 2 cols x 3 rows = 6 cards per page ---
const COLS = 2;
const ROWS = 3;
// Zero gap entre cartoes: fronteiras sao compartilhadas e as linhas de corte
// atravessam a folha A4 em linhas retas de borda a borda, permitindo corte em
// pilha com guillhotina/estilete+regua sem rebarbas assimetricas.
const GAP_H = 0;
const GAP_V = 0;
// Margens centralizam a grade de cartoes na folha A4.
const PAGE_MARGIN_H = (PAGE_W - COLS * CARD_W) / 2; // 4mm
const PAGE_MARGIN_V = (PAGE_H - ROWS * CARD_H) / 2; // 5.25mm

// --- Card internal padding (mm) ---
// Reduzido para acomodar o header de 15mm sem comer espaco de nenhum campo.
const PAD = { top: 1, bottom: 0.5, left: 2, right: 2 };
const USABLE_W = CARD_W - PAD.left - PAD.right; // 97mm

// --- Row heights (mm) ---
const HEADER_H = 15;
// O header e dividido em duas faixas verticais:
// - Tarja superior (TYPE_STRIP_H): bg bege com o nome do tipo centralizado
// - Zona inferior (HEADER_FIELDS_H): celula LOTE (larga) + celula Certif. (estreita)
const TYPE_STRIP_H = 3;
const HEADER_FIELDS_H = HEADER_H - TYPE_STRIP_H; // 12mm
const ROW_H = 13;
const SECTION_GAP = 0.6;

// --- Standard column width (4-col grid) ---
const COL_W = USABLE_W / 4; // 24.25mm

// --- Header field widths (mm) ---
// LOTE domina (~65%) porque o codigo de lote e o dado mais critico; Certif.
// guarda siglas curtas (UTZ, RA, FLO, 4C, ORG...), 34mm cabe ate 2 siglas.
const LOTE_W = 63;
const CERTIF_W = USABLE_W - LOTE_W; // 34mm

// --- Colors ---
const DARK = rgb(0.15, 0.15, 0.15);
const LABEL_COLOR = rgb(0.35, 0.35, 0.35);
const BORDER_COLOR = rgb(0.3, 0.3, 0.3);
const LIGHT_BG = rgb(0.96, 0.95, 0.92);

// --- Font sizes (optimized for AI extraction) ---
const LABEL_SIZE = 7;
const LOTE_LABEL_SIZE = 8; // usado tambem pelo label "Certif."
const TYPE_NAME_SIZE = 8; // reduzido de 9 para caber na tarja de 3mm
const OBS_LABEL_SIZE = 6.5;

// --- Border widths (thicker for AI detection) ---
const CELL_BORDER_W = 0.5;
const CARD_BORDER_W = 1.0;
const LOTE_BORDER_W = 0.6;

// ============================================================
// CARD TYPE DEFINITIONS
// ============================================================

const CARD_TYPES = {
  PREPARADO: {
    typeName: 'PREPARADO',
    rows: [
      // Row 1: Common — general classification
      {
        cells: [
          { label: 'Padr\u00e3o', w: COL_W },
          { label: 'Cata\u00e7\u00e3o', w: COL_W },
          { label: 'Aspecto', w: COL_W },
          { label: 'Bebida', w: COL_W },
        ],
      },
      // Row 2: Common — defects & harvest (gap after)
      {
        cells: [
          { label: 'Safra', w: COL_W },
          { label: 'Broca', w: COL_W },
          { label: 'PVA', w: COL_W },
          { label: 'Impureza', w: COL_W },
        ],
        gapAfter: true,
      },
      // Row 3: Sieves upper
      {
        cells: [
          { label: 'P.19 %', w: COL_W },
          { label: 'P.18 %', w: COL_W },
          { label: 'P.17 %', w: COL_W },
          { label: 'P.16 %', w: COL_W },
        ],
      },
      // Row 4: Sieves lower + MK + Defeito
      {
        cells: [
          { label: 'P.15 %', w: COL_W },
          { label: 'P.14 %', w: COL_W },
          { label: 'MK %', w: COL_W },
          { label: 'Defeito', w: COL_W },
        ],
      },
      // Row 5: Fundo 1 only (2 wide cells, beige)
      {
        cells: [
          { label: 'Fundo Pen.', w: USABLE_W / 2 },
          { label: '%', w: USABLE_W / 2 },
        ],
        bg: LIGHT_BG,
      },
    ],
    // obsHeight: auto (ROW_H)
  },

  LOW_CAFF: {
    typeName: 'CAF\u00c9 BAIXO',
    rows: [
      // Row 1: Common
      {
        cells: [
          { label: 'Padr\u00e3o', w: COL_W },
          { label: 'Cata\u00e7\u00e3o', w: COL_W },
          { label: 'Aspecto', w: COL_W },
          { label: 'Bebida', w: COL_W },
        ],
      },
      // Row 2: Common (gap after)
      {
        cells: [
          { label: 'Safra', w: COL_W },
          { label: 'Broca', w: COL_W },
          { label: 'PVA', w: COL_W },
          { label: 'Impureza', w: COL_W },
        ],
        gapAfter: true,
      },
      // Row 3: 6 sieves (compressed — 6 columns)
      {
        cells: [
          { label: 'P.15 %', w: USABLE_W / 6 },
          { label: 'P.14 %', w: USABLE_W / 6 },
          { label: 'P.13 %', w: USABLE_W / 6 },
          { label: 'P.12 %', w: USABLE_W / 6 },
          { label: 'P.11 %', w: USABLE_W / 6 },
          { label: 'P.10 %', w: USABLE_W / 6 },
        ],
      },
      // Row 4: AP, GPI, Defeito (3 equal cells)
      {
        cells: [
          { label: 'AP %', w: USABLE_W / 3 },
          { label: 'GPI', w: USABLE_W / 3 },
          { label: 'Defeito', w: USABLE_W / 3 },
        ],
      },
      // Row 5: Fundo 1 + Fundo 2 (4 cols, beige)
      {
        cells: [
          { label: 'Fundo Pen.', w: COL_W },
          { label: '%', w: COL_W },
          { label: 'Fundo Pen.', w: COL_W },
          { label: '%', w: COL_W },
        ],
        bg: LIGHT_BG,
      },
    ],
  },

  BICA: {
    typeName: 'BICA',
    rows: [
      // Row 1: Common
      {
        cells: [
          { label: 'Padr\u00e3o', w: COL_W },
          { label: 'Cata\u00e7\u00e3o', w: COL_W },
          { label: 'Aspecto', w: COL_W },
          { label: 'Bebida', w: COL_W },
        ],
      },
      // Row 2: Common (gap after)
      {
        cells: [
          { label: 'Safra', w: COL_W },
          { label: 'Broca', w: COL_W },
          { label: 'PVA', w: COL_W },
          { label: 'Impureza', w: COL_W },
        ],
        gapAfter: true,
      },
      // Row 3: Only P.17 + MK (2 wide cells)
      {
        cells: [
          { label: 'P.17 %', w: USABLE_W / 2 },
          { label: 'MK %', w: USABLE_W / 2 },
        ],
      },
      // Row 4: Fundo 1 + Fundo 2 (4 cols, beige)
      {
        cells: [
          { label: 'Fundo Pen.', w: COL_W },
          { label: '%', w: COL_W },
          { label: 'Fundo Pen.', w: COL_W },
          { label: '%', w: COL_W },
        ],
        bg: LIGHT_BG,
      },
    ],
    obsHeight: 26, // Extra tall — Bica has fewer rows
  },
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
    x: xPt,
    y: yPt,
    width: wPt,
    height: hPt,
    borderColor: BORDER_COLOR,
    borderWidth: borderW,
  });

  if (label) {
    page.drawText(label, {
      x: xPt + pt(1.2),
      y: yPt + hPt - pt(3.5),
      size: labelSize,
      font: fonts.bold,
      color: LABEL_COLOR,
    });
  }
}

function drawCard(page, cardX, cardY, fonts, cardType) {
  const bx = cardX;
  const by = cardY;
  const config = CARD_TYPES[cardType];

  // --- Outer card border ---
  page.drawRectangle({
    x: pt(bx),
    y: pt(by),
    width: pt(CARD_W),
    height: pt(CARD_H),
    borderColor: DARK,
    borderWidth: CARD_BORDER_W,
  });

  // === HEADER (15mm): Type strip (bg bege) + LOTE + Certif. ===
  const headerX = bx + PAD.left;
  const headerY = by + CARD_H - PAD.top - HEADER_H;

  // --- Tarja do tipo (3mm, fundo bege, texto centralizado) ---
  const stripY = headerY + HEADER_FIELDS_H;
  drawCell(page, headerX, stripY, USABLE_W, TYPE_STRIP_H, null, fonts, {
    bg: LIGHT_BG,
    borderW: LOTE_BORDER_W,
  });

  const typeTextWidthPt = fonts.bold.widthOfTextAtSize(config.typeName, TYPE_NAME_SIZE);
  const stripCenterXPt = pt(headerX + USABLE_W / 2);
  const typeCapHeightPt = TYPE_NAME_SIZE * 0.7; // Helvetica-Bold cap height aproximada
  const stripCenterYPt = pt(stripY + TYPE_STRIP_H / 2);
  page.drawText(config.typeName, {
    x: stripCenterXPt - typeTextWidthPt / 2,
    y: stripCenterYPt - typeCapHeightPt / 2,
    size: TYPE_NAME_SIZE,
    font: fonts.bold,
    color: DARK,
  });

  // --- Celula LOTE (esquerda, 63mm x 12mm) ---
  const loteX = headerX;
  drawCell(page, loteX, headerY, LOTE_W, HEADER_FIELDS_H, null, fonts, {
    borderW: LOTE_BORDER_W,
  });
  page.drawText('LOTE', {
    x: pt(loteX + 1.2),
    y: pt(headerY + HEADER_FIELDS_H - 3.5),
    size: LOTE_LABEL_SIZE,
    font: fonts.bold,
    color: DARK,
  });

  // --- Celula Certif. (direita, 34mm x 12mm) ---
  const certifX = loteX + LOTE_W;
  drawCell(page, certifX, headerY, CERTIF_W, HEADER_FIELDS_H, null, fonts, {
    borderW: LOTE_BORDER_W,
  });
  page.drawText('Certif.', {
    x: pt(certifX + 1.2),
    y: pt(headerY + HEADER_FIELDS_H - 3.5),
    size: LOTE_LABEL_SIZE,
    font: fonts.bold,
    color: DARK,
  });

  let cy = PAD.top + HEADER_H;

  // === DATA ROWS ===
  const gridStartX = bx + PAD.left;

  for (let r = 0; r < config.rows.length; r++) {
    const row = config.rows[r];
    const rowY = by + CARD_H - cy - ROW_H;

    let cx = 0;
    for (const cell of row.cells) {
      drawCell(page, gridStartX + cx, rowY, cell.w, ROW_H, cell.label, fonts, { bg: row.bg });
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
  drawCell(page, gridStartX, obsY, USABLE_W, obsH, 'Observa\u00e7\u00f5es', fonts, {
    labelSize: OBS_LABEL_SIZE,
  });
}

function drawCutGuides(page) {
  // Linhas solidas finas cinza-escuro, atravessando a folha inteira de borda a
  // borda. Desenhadas por ultimo para ficar por cima das bordas dos cartoes,
  // garantindo uma guia visual continua para alinhar a regua no corte em pilha.
  const color = rgb(0.15, 0.15, 0.15);
  const thickness = 0.3;

  // Linhas verticais: borda esquerda externa, entre colunas, borda direita externa
  for (let col = 0; col <= COLS; col++) {
    const cutX = PAGE_MARGIN_H + col * CARD_W;
    page.drawLine({
      start: { x: pt(cutX), y: 0 },
      end: { x: pt(cutX), y: pt(PAGE_H) },
      thickness,
      color,
    });
  }

  // Linhas horizontais: borda inferior externa, entre linhas, borda superior externa
  for (let row = 0; row <= ROWS; row++) {
    const cutY = PAGE_MARGIN_V + row * CARD_H;
    page.drawLine({
      start: { x: 0, y: pt(cutY) },
      end: { x: pt(PAGE_W), y: pt(cutY) },
      thickness,
      color,
    });
  }
}

// ============================================================
// MAIN — Generate one PDF per card type
// ============================================================

async function generatePdf(cardType) {
  const doc = await PDFDocument.create();
  const embeddedFonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const page = doc.addPage([pt(PAGE_W), pt(PAGE_H)]);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cardX = PAGE_MARGIN_H + col * (CARD_W + GAP_H);
      const cardBottomY = PAGE_H - PAGE_MARGIN_V - (row + 1) * CARD_H - row * GAP_V;
      drawCard(page, cardX, cardBottomY, embeddedFonts, cardType);
    }
  }

  drawCutGuides(page);

  return doc.save();
}

async function main() {
  const types = ['PREPARADO', 'LOW_CAFF', 'BICA'];
  const fileNames = {
    PREPARADO: 'ficha-preparado.pdf',
    LOW_CAFF: 'ficha-cafe-baixo.pdf',
    BICA: 'ficha-bica.pdf',
  };

  for (const type of types) {
    const pdfBytes = await generatePdf(type);
    const outPath = path.resolve(__dirname, '..', fileNames[type]);
    fs.writeFileSync(outPath, pdfBytes);
    console.log(`Generated: ${outPath}`);
  }
}

main().catch(console.error);
