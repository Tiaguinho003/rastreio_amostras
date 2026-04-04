import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const MM = 2.83465;
const CARD_W = 99 * MM;
const CARD_H = 95 * MM;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN_X = (PAGE_W - 2 * CARD_W) / 3;
const MARGIN_Y = (PAGE_H - 3 * CARD_H) / 4;

const DARK = rgb(0.15, 0.15, 0.15);
const MID = rgb(0.4, 0.4, 0.4);
const LIGHT_LINE = rgb(0.78, 0.78, 0.78);
const BOX_BG = rgb(0.98, 0.97, 0.95);
const WHITE = rgb(1, 1, 1);
const GREEN_DARK = rgb(0.18, 0.35, 0.22);

const BOX_H = 6.5 * MM;
const LABEL_SIZE = 7;
const SECTION_SIZE = 6.5;

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = fs.readFileSync(path.resolve('public/logo-safras-color.png'));
  const logoImage = await doc.embedPng(logoBytes);
  const logoAspect = logoImage.width / logoImage.height;

  const page = doc.addPage([PAGE_W, PAGE_H]);

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const ox = MARGIN_X + col * (CARD_W + MARGIN_X);
      const oy = PAGE_H - MARGIN_Y - (row + 1) * CARD_H - row * MARGIN_Y;
      drawCard(page, ox, oy, font, fontBold, logoImage, logoAspect);
    }
  }

  // Cut guides
  const centerX = PAGE_W / 2;
  drawDashedLine(page, centerX, 0, centerX, PAGE_H, LIGHT_LINE, 0.25);
  for (let row = 1; row < 3; row++) {
    const y = PAGE_H - MARGIN_Y - row * CARD_H - (row - 0.5) * MARGIN_Y;
    drawDashedLine(page, 0, y, PAGE_W, y, LIGHT_LINE, 0.25);
  }

  const outputPath = path.resolve('ficha-classificacao-99x95.pdf');
  fs.writeFileSync(outputPath, await doc.save());
  console.log(`PDF gerado: ${outputPath}`);
}

function drawDashedLine(page, x1, y1, x2, y2, color, width) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len;
  const uy = dy / len;
  let d = 0;
  while (d < len) {
    const end = Math.min(d + 3, len);
    page.drawLine({
      start: { x: x1 + ux * d, y: y1 + uy * d },
      end: { x: x1 + ux * end, y: y1 + uy * end },
      thickness: width, color
    });
    d += 6;
  }
}

function box(page, x, y, w, h) {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: LIGHT_LINE, borderWidth: 0.5, color: BOX_BG });
}

function sep(page, x, y, w) {
  page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: 0.3, color: LIGHT_LINE });
}

function drawCard(page, ox, oy, font, fontBold, logo, logoAspect) {
  const pad = 3 * MM;
  const innerW = CARD_W - 2 * pad;
  const colGap = 2.5 * MM;

  // Card border
  page.drawRectangle({ x: ox, y: oy, width: CARD_W, height: CARD_H, borderColor: LIGHT_LINE, borderWidth: 0.5, color: WHITE });

  let cy = oy + CARD_H - pad;

  // ── HEADER: logo left + LOTE right ──
  const logoH = 5.5 * MM;
  const logoW = logoH * logoAspect;
  page.drawImage(logo, { x: ox + pad, y: cy - logoH, width: logoW, height: logoH });

  const loteBoxW = 20 * MM;
  const loteBoxH = BOX_H;
  const loteX = ox + CARD_W - pad - loteBoxW;
  page.drawText('LOTE', { x: loteX - fontBold.widthOfTextAtSize('LOTE', 8) - 1.5 * MM, y: cy - logoH + 1.5 * MM, size: 8, font: fontBold, color: DARK });
  box(page, loteX, cy - logoH - 0.8 * MM, loteBoxW, loteBoxH);

  cy -= logoH + 3 * MM;
  sep(page, ox + pad, cy, innerW);
  cy -= 1.2 * MM;

  // ── GERAL ──
  page.drawText('GERAL', { x: ox + pad, y: cy - 2.5 * MM, size: SECTION_SIZE, font: fontBold, color: GREEN_DARK });
  cy -= 4 * MM;

  // 2 rows x 2 cols: Padrao, Cert, Aspecto, Bebida
  const halfW = (innerW - colGap) / 2;
  const geralFields = [['Padrao', 'Cert'], ['Aspecto', 'Bebida']];
  for (const [left, right] of geralFields) {
    const lx = ox + pad;
    const rx = ox + pad + halfW + colGap;
    page.drawText(left, { x: lx, y: cy - 2.5 * MM, size: LABEL_SIZE, font, color: MID });
    box(page, lx + fontBold.widthOfTextAtSize(left, LABEL_SIZE) + 1.5 * MM, cy - BOX_H + 0.8 * MM, halfW - fontBold.widthOfTextAtSize(left, LABEL_SIZE) - 1.5 * MM, BOX_H);
    page.drawText(right, { x: rx, y: cy - 2.5 * MM, size: LABEL_SIZE, font, color: MID });
    box(page, rx + fontBold.widthOfTextAtSize(right, LABEL_SIZE) + 1.5 * MM, cy - BOX_H + 0.8 * MM, halfW - fontBold.widthOfTextAtSize(right, LABEL_SIZE) - 1.5 * MM, BOX_H);
    cy -= BOX_H + 1.5 * MM;
  }

  cy -= 0.5 * MM;
  sep(page, ox + pad, cy, innerW);
  cy -= 1.2 * MM;

  // ── PENEIRAS (%) ──
  page.drawText('PENEIRAS (%)', { x: ox + pad, y: cy - 2.5 * MM, size: SECTION_SIZE, font: fontBold, color: GREEN_DARK });
  cy -= 4 * MM;

  // 2 rows of 5: [18,17,16,MK,CAT] [15,14,13,10]
  cy = drawPeneiraRow(page, ox + pad, cy, innerW, fontBold, ['18', '17', '16', 'MK', 'CAT']);
  cy = drawPeneiraRow(page, ox + pad, cy, innerW, fontBold, ['15', '14', '13', '10']);

  cy -= 0.5 * MM;
  sep(page, ox + pad, cy, innerW);
  cy -= 1.2 * MM;

  // ── FUNDOS ──
  page.drawText('FUNDOS', { x: ox + pad, y: cy - 2.5 * MM, size: SECTION_SIZE, font: fontBold, color: GREEN_DARK });
  cy -= 4 * MM;

  for (let i = 1; i <= 2; i++) {
    const lx = ox + pad;
    const fdLabel = `FD${i}`;
    const fdLabelW = fontBold.widthOfTextAtSize(fdLabel, LABEL_SIZE);

    page.drawText(fdLabel, { x: lx, y: cy - 2.8 * MM, size: LABEL_SIZE, font: fontBold, color: MID });

    const afterFd = lx + fdLabelW + 2 * MM;
    page.drawText('Pen:', { x: afterFd, y: cy - 2.8 * MM, size: LABEL_SIZE, font, color: MID });
    const penLW = font.widthOfTextAtSize('Pen:', LABEL_SIZE);
    const penBoxX = afterFd + penLW + 1 * MM;
    const penBoxW = 16 * MM;
    box(page, penBoxX, cy - BOX_H + 1 * MM, penBoxW, BOX_H);

    const pctX = penBoxX + penBoxW + 3 * MM;
    page.drawText('%:', { x: pctX, y: cy - 2.8 * MM, size: LABEL_SIZE, font, color: MID });
    const pctLW = font.widthOfTextAtSize('%:', LABEL_SIZE);
    const pctBoxX = pctX + pctLW + 1 * MM;
    const pctBoxW = ox + CARD_W - pad - pctBoxX;
    box(page, pctBoxX, cy - BOX_H + 1 * MM, pctBoxW, BOX_H);

    cy -= BOX_H + 1.5 * MM;
  }

  cy -= 0.3 * MM;
  sep(page, ox + pad, cy, innerW);
  cy -= 1.2 * MM;

  // ── DEFEITOS ──
  page.drawText('DEFEITOS', { x: ox + pad, y: cy - 2.5 * MM, size: SECTION_SIZE, font: fontBold, color: GREEN_DARK });
  cy -= 4 * MM;

  cy = drawPeneiraRow(page, ox + pad, cy, innerW, fontBold, ['DEF', 'Broca', 'PVA', 'IMP']);
  cy = drawPeneiraRow(page, ox + pad, cy, innerW, fontBold, ['PAU', 'AP', 'GPI']);
}

function drawPeneiraRow(page, x, y, totalW, fontBold, labels) {
  const count = labels.length;
  const gap = 2 * MM;
  const totalGaps = (count - 1) * gap;
  const cellW = (totalW - totalGaps) / count;

  for (let i = 0; i < count; i++) {
    const cx = x + i * (cellW + gap);
    const labelW = fontBold.widthOfTextAtSize(labels[i], LABEL_SIZE);

    page.drawText(labels[i], { x: cx, y: y - 2.8 * MM, size: LABEL_SIZE, font: fontBold, color: MID });
    const boxX = cx + labelW + 1 * MM;
    const boxW = cellW - labelW - 1 * MM;
    box(page, boxX, y - BOX_H + 1 * MM, boxW, BOX_H);
  }

  return y - BOX_H - 1.5 * MM;
}

main().catch(console.error);
