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
// Header novo: apenas a tarja de 3mm com o nome do tipo.
// Lote, Sacas e Certif. passaram a ser celulas comuns do corpo (L1 e L2).
const TYPE_STRIP_H = 3;
const ROW_H = 13;
const SECTION_GAP = 0.6;

// --- Standard column width (4-col grid) ---
const COL_W = USABLE_W / 4; // 24.25mm

// --- L1 (Lote + Sacas) field widths (mm) ---
// LOTE domina (~65%) porque o codigo de lote e o dado mais critico e e escrito
// em tamanho grande; Sacas guarda um numero curto (100, 200, 350...).
const LOTE_W = 63;
const SACAS_W = USABLE_W - LOTE_W; // 34mm

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

// Celulas L1 (Lote larga + Sacas estreita) — destaque visual: label maior e
// borda um pouco mais grossa, pro operador reconhecer como zona de identificacao.
const L1_CELLS = [
  { label: 'LOTE', w: LOTE_W, labelSize: LOTE_LABEL_SIZE, borderW: LOTE_BORDER_W },
  { label: 'Sacas', w: SACAS_W, labelSize: LOTE_LABEL_SIZE, borderW: LOTE_BORDER_W },
];

const CARD_TYPES = {
  PREPARADO: {
    typeName: 'PREPARADO',
    rows: [
      // L1: Lote + Sacas (identificacao)
      { cells: L1_CELLS },
      // L2: Padrao + Safra + Aspecto + Certif.
      {
        cells: [
          { label: 'Padr\u00e3o', w: COL_W },
          { label: 'Safra', w: COL_W },
          { label: 'Aspecto', w: COL_W },
          { label: 'Certif.', w: COL_W },
        ],
      },
      // L3: Catacao + Broca + PVA + Bebida (gap after)
      {
        cells: [
          { label: 'Cata\u00e7\u00e3o', w: COL_W },
          { label: 'Broca', w: COL_W },
          { label: 'PVA', w: COL_W },
          { label: 'Bebida', w: COL_W },
        ],
        gapAfter: true,
      },
      // L4: Peneiras P.19..P.14 (6 colunas compactadas)
      {
        cells: [
          { label: 'P.19 %', w: USABLE_W / 6 },
          { label: 'P.18 %', w: USABLE_W / 6 },
          { label: 'P.17 %', w: USABLE_W / 6 },
          { label: 'P.16 %', w: USABLE_W / 6 },
          { label: 'P.15 %', w: USABLE_W / 6 },
          { label: 'P.14 %', w: USABLE_W / 6 },
        ],
      },
      // L5: MK + Defeito + Impureza (3 cols largas)
      {
        cells: [
          { label: 'MK %', w: USABLE_W / 3 },
          { label: 'Defeito', w: USABLE_W / 3 },
          { label: 'Impureza', w: USABLE_W / 3 },
        ],
      },
      // L6: Fundo 1 apenas (2 cols largas, bege)
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
      // L1: Lote + Sacas
      { cells: L1_CELLS },
      // L2: Padrao + Safra + Aspecto + Certif.
      {
        cells: [
          { label: 'Padr\u00e3o', w: COL_W },
          { label: 'Safra', w: COL_W },
          { label: 'Aspecto', w: COL_W },
          { label: 'Certif.', w: COL_W },
        ],
      },
      // L3: Catacao + Broca + PVA + Bebida (gap after)
      {
        cells: [
          { label: 'Cata\u00e7\u00e3o', w: COL_W },
          { label: 'Broca', w: COL_W },
          { label: 'PVA', w: COL_W },
          { label: 'Bebida', w: COL_W },
        ],
        gapAfter: true,
      },
      // L4: Peneiras P.15..P.10 (6 cols compactadas)
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
      // L5: AP + GPI + Defeito + Impureza (4 cols)
      {
        cells: [
          { label: 'AP %', w: COL_W },
          { label: 'GPI', w: COL_W },
          { label: 'Defeito', w: COL_W },
          { label: 'Impureza', w: COL_W },
        ],
      },
      // L6: Fundo 1 + Fundo 2 (4 cols, bege)
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
      // L1: Lote + Sacas
      { cells: L1_CELLS },
      // L2: Padrao + Safra + Aspecto + Certif.
      {
        cells: [
          { label: 'Padr\u00e3o', w: COL_W },
          { label: 'Safra', w: COL_W },
          { label: 'Aspecto', w: COL_W },
          { label: 'Certif.', w: COL_W },
        ],
      },
      // L3: Catacao + Broca + PVA + Bebida (gap after)
      {
        cells: [
          { label: 'Cata\u00e7\u00e3o', w: COL_W },
          { label: 'Broca', w: COL_W },
          { label: 'PVA', w: COL_W },
          { label: 'Bebida', w: COL_W },
        ],
        gapAfter: true,
      },
      // L4: P.17 + MK + Impureza (3 cols largas)
      {
        cells: [
          { label: 'P.17 %', w: USABLE_W / 3 },
          { label: 'MK %', w: USABLE_W / 3 },
          { label: 'Impureza', w: USABLE_W / 3 },
        ],
      },
      // L5: Fundo 1 + Fundo 2 (4 cols, bege)
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
    obsHeight: 26, // Extra tall — BICA tem menos linhas de dados
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

  // === TARJA (3mm): apenas nome do tipo centralizado, fundo bege ===
  // Lote, Sacas e Certif. agora sao celulas comuns do corpo (L1 e L2).
  const headerX = bx + PAD.left;
  const stripY = by + CARD_H - PAD.top - TYPE_STRIP_H;
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

  let cy = PAD.top + TYPE_STRIP_H;

  // === DATA ROWS ===
  const gridStartX = bx + PAD.left;

  for (let r = 0; r < config.rows.length; r++) {
    const row = config.rows[r];
    const rowY = by + CARD_H - cy - ROW_H;

    let cx = 0;
    for (const cell of row.cells) {
      drawCell(page, gridStartX + cx, rowY, cell.w, ROW_H, cell.label, fonts, {
        bg: row.bg,
        labelSize: cell.labelSize,
        borderW: cell.borderW,
      });
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
