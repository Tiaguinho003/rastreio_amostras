import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  PDFDocument,
  StandardFonts,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
} from 'pdf-lib';
import sharp from 'sharp';

import { HttpError } from '../contracts/errors.js';
import {
  SAMPLE_EXPORT_FIELDS,
  SAMPLE_EXPORT_FIELDS_FOR_REPORT,
  buildSelectedExportFieldEntries,
  normalizeReportedHarvest,
} from './export-fields.js';

const PDF_PAGE_WIDTH = 595.28;
const PDF_PAGE_HEIGHT = 841.89;
const COMPANY_INFO = {
  cityUf: 'São Sebastião do Paraíso/MG',
  phone: '(35) 3531-4046',
  address: 'Av. Oliveira Rezende, 1397 - Jardim Bernadete - São Sebastião do Paraíso - MG',
};

function drawPageBackground(page) {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PDF_PAGE_WIDTH,
    height: PDF_PAGE_HEIGHT,
    color: rgb(0.976, 0.972, 0.954),
  });
}

function drawHorizontalGradient(page, { x, y, width, height, leftColor, rightColor, steps = 96 }) {
  const safeSteps = Math.max(2, steps);
  const stepWidth = width / safeSteps;

  for (let index = 0; index < safeSteps; index += 1) {
    const ratio = index / (safeSteps - 1);
    const color = rgb(
      leftColor.red + (rightColor.red - leftColor.red) * ratio,
      leftColor.green + (rightColor.green - leftColor.green) * ratio,
      leftColor.blue + (rightColor.blue - leftColor.blue) * ratio
    );
    page.drawRectangle({
      x: x + index * stepWidth,
      y,
      width: stepWidth + 0.2,
      height,
      color,
    });
  }
}

function fitTextToWidth(text, font, size, maxWidth) {
  const normalized = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return '';
  }

  if (font.widthOfTextAtSize(normalized, size) <= maxWidth) {
    return normalized;
  }

  const ellipsis = '...';
  const ellipsisWidth = font.widthOfTextAtSize(ellipsis, size);
  if (ellipsisWidth > maxWidth) {
    return '';
  }

  let low = 0;
  let high = normalized.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${normalized.slice(0, mid).trimEnd()}${ellipsis}`;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return `${normalized.slice(0, low).trimEnd()}${ellipsis}`;
}

// Desenha a imagem CONTIDA na caixa (fit): escala pra caber inteira SEM cortar,
// centralizada. Retorna o retangulo efetivamente desenhado (pra borda fina).
function drawImageContain(page, image, { x, y, width, height }) {
  if (width <= 0 || height <= 0) {
    return { x, y, width: 0, height: 0 };
  }

  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;

  page.drawImage(image, {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight,
  });
  return { x: drawX, y: drawY, width: drawWidth, height: drawHeight };
}

// Segmento de linha AFILADO (cunha): ponta (espessura 0) em pointX e espessura
// `maxThickness` em thickX, centrado verticalmente em `y`. Serve pros dois lados
// do divisor do rodape — fino sumindo na borda, mais grosso perto do logo.
function drawTaperedSegment(page, { pointX, thickX, y, maxThickness, color }) {
  const dx = thickX - pointX;
  const h = maxThickness / 2;
  // drawSvgPath: origem em (pointX, y); +y do path aponta pra BAIXO (PDF y cai).
  const d = `M 0 0 L ${dx.toFixed(2)} ${(-h).toFixed(2)} L ${dx.toFixed(2)} ${h.toFixed(2)} Z`;
  page.drawSvgPath(d, { x: pointX, y, color });
}

function buildReportFileName(sample) {
  const internalLot =
    typeof sample?.internalLotNumber === 'string' ? sample.internalLotNumber.trim() : '';
  if (!internalLot) {
    return 'amostra(sem-lote-interno).pdf';
  }

  return `amostra(${internalLot}).pdf`;
}

function normalizeReportDestination(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new HttpError(422, 'destination must be a string');
  }

  const normalized = value.trim();
  return normalized || null;
}

function sanitizeAttachmentPath(baseDir, relativeStoragePath) {
  const normalizedBase = path.resolve(baseDir);
  const absolutePath = path.resolve(normalizedBase, relativeStoragePath);

  if (absolutePath !== normalizedBase && !absolutePath.startsWith(`${normalizedBase}${path.sep}`)) {
    throw new HttpError(500, 'Invalid attachment storage path');
  }

  return absolutePath;
}

async function tryReadLogoBytes(logoPath) {
  const candidates = Array.isArray(logoPath) ? logoPath : [logoPath];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim() === '') {
      continue;
    }

    try {
      return await fs.readFile(candidate);
    } catch {
      // try next path
    }
  }

  return null;
}

async function embedImage(pdfDoc, bytes, mimeType) {
  const normalizedMime = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';

  if (normalizedMime.includes('png')) {
    return pdfDoc.embedPng(bytes);
  }

  if (normalizedMime.includes('jpg') || normalizedMime.includes('jpeg')) {
    return pdfDoc.embedJpg(bytes);
  }

  // pdf-lib so suporta PNG e JPEG nativamente. Para qualquer outro formato
  // aceito pelo upload service (WebP, e futuramente HEIC/AVIF), convertemos
  // para PNG via sharp antes de embedar. Este fallback tambem cobre o caso
  // de mimeType ausente/desconhecido: sharp auto-detecta o formato real.
  const pngBytes = await sharp(bytes).png().toBuffer();
  return pdfDoc.embedPng(pngBytes);
}

// Silhueta colorida preservando o canal alpha — pinta todo pixel visivel da cor
// (r,g,b 0-255) e mantem a transparencia. Usada pra marca d'agua branca do icone
// no cabecalho e pro logo verde no divisor do rodape.
async function makeColoredSilhouette(bytes, r, g, b) {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();
}

export async function renderSamplePdf({
  sample,
  classificationAttachment,
  classificationPhotoBytes,
  selectedFieldEntries,
  issuedAtIso,
  logoPath,
  iconPath,
  destination,
}) {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = await tryReadLogoBytes(logoPath);
  const logoImage = logoBytes ? await pdfDoc.embedPng(logoBytes).catch(() => null) : null;

  const iconBytes = await tryReadLogoBytes(iconPath);
  let iconWhiteImage = null;
  let iconGreenImage = null;
  if (iconBytes) {
    try {
      iconWhiteImage = await pdfDoc.embedPng(await makeColoredSilhouette(iconBytes, 255, 255, 255));
    } catch {
      iconWhiteImage = null;
    }
    try {
      // Verde da marca (headerGreen ~ rgb 25,76,43) pro logo do divisor do rodape.
      iconGreenImage = await pdfDoc.embedPng(await makeColoredSilhouette(iconBytes, 25, 76, 43));
    } catch {
      iconGreenImage = null;
    }
  }
  const classificationImage = await embedImage(
    pdfDoc,
    classificationPhotoBytes,
    classificationAttachment.mimeType
  ).catch(() => {
    throw new HttpError(422, 'CLASSIFICATION_PHOTO is unreadable for PDF generation');
  });

  const page = pdfDoc.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT]);
  drawPageBackground(page);
  const docX = 22;
  const docY = 22;
  const docWidth = PDF_PAGE_WIDTH - docX * 2;
  const docHeight = PDF_PAGE_HEIGHT - docY * 2;
  const docTop = docY + docHeight;
  const docBottom = docY;
  const docGreen = rgb(0.18, 0.43, 0.31);
  const docLine = rgb(0.82, 0.84, 0.86);
  const docText = rgb(0.18, 0.22, 0.2);

  page.drawRectangle({
    x: docX,
    y: docY,
    width: docWidth,
    height: docHeight,
    borderWidth: 1,
    borderColor: rgb(0.84, 0.84, 0.84),
    color: rgb(1, 1, 1),
  });

  const lineLeft = docX + 24;
  const lineRight = docX + docWidth - 24;

  // ─── Cabecalho: banda verde no topo do card ───
  // Logo (lockup branco) a esquerda | divisoria vertical | titulo "LAUDO
  // TECNICO" + lote interno a direita, sobre marca d'agua do icone (arvore).
  const headerHeight = 116;
  const headerY = docTop - headerHeight;
  const headerGreen = rgb(0.098, 0.298, 0.169);
  page.drawRectangle({
    x: docX + 1,
    y: headerY,
    width: docWidth - 2,
    height: headerHeight - 1,
    color: headerGreen,
  });

  // Marca d'agua: icone claro, grande, recortado nos limites da banda.
  if (iconWhiteImage) {
    const wmHeight = headerHeight * 1.55;
    const wmScale = wmHeight / iconWhiteImage.height;
    const wmWidth = iconWhiteImage.width * wmScale;
    page.pushOperators(
      pushGraphicsState(),
      rectangle(docX + 1, headerY, docWidth - 2, headerHeight - 1),
      clip(),
      endPath()
    );
    page.drawImage(iconWhiteImage, {
      x: docX + docWidth - wmWidth * 0.62,
      y: headerY + (headerHeight - wmHeight) / 2,
      width: wmWidth,
      height: wmHeight,
      opacity: 0.07,
    });
    page.pushOperators(popGraphicsState());
  }

  // Logo a esquerda, centralizado verticalmente.
  if (logoImage) {
    const logoMaxWidth = 200;
    let logoHeight = 50;
    let logoWidth = (logoImage.width / logoImage.height) * logoHeight;
    if (logoWidth > logoMaxWidth) {
      logoHeight *= logoMaxWidth / logoWidth;
      logoWidth = logoMaxWidth;
    }
    page.drawImage(logoImage, {
      // Logo centralizado na metade ESQUERDA da banda.
      x: docX + docWidth / 4 - logoWidth / 2,
      y: headerY + (headerHeight - logoHeight) / 2,
      width: logoWidth,
      height: logoHeight,
    });
  }

  // Divisoria vertical no MEIO da banda: logo na metade esquerda, titulo+meta na
  // metade direita — cada area com metade da largura.
  const dividerX = docX + docWidth / 2;
  page.drawLine({
    start: { x: dividerX, y: headerY + 22 },
    end: { x: dividerX, y: headerY + headerHeight - 22 },
    thickness: 1,
    color: rgb(1, 1, 1),
    opacity: 0.33,
  });

  // Titulo + meta (lote interno) centralizados na metade DIREITA da banda.
  const rightHalfCenter = docX + (docWidth * 3) / 4;
  const headerTitleY = headerY + headerHeight - 44;
  const titleText = 'LAUDO TÉCNICO';
  const titleW = fontBold.widthOfTextAtSize(titleText, 21);
  page.drawText(titleText, {
    x: rightHalfCenter - titleW / 2,
    y: headerTitleY,
    size: 21,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  const headerUnderlineY = headerTitleY - 13;
  const underlineHalf = titleW / 2 + 6;
  page.drawLine({
    start: { x: rightHalfCenter - underlineHalf, y: headerUnderlineY },
    end: { x: rightHalfCenter + underlineHalf, y: headerUnderlineY },
    thickness: 0.8,
    color: rgb(1, 1, 1),
    opacity: 0.45,
  });

  const headerMeta = [
    {
      label: 'Lote Interno',
      value:
        typeof sample.internalLotNumber === 'string' && sample.internalLotNumber.trim()
          ? sample.internalLotNumber
          : '-',
    },
  ];
  if (destination) {
    headerMeta.push({ label: 'Destinatário', value: destination });
  }

  let headerMetaY = headerUnderlineY - 20;
  for (const row of headerMeta) {
    const labelText = `${row.label}: `;
    const labelW = fontRegular.widthOfTextAtSize(labelText, 10.5);
    const value = fitTextToWidth(
      String(row.value ?? '-'),
      fontBold,
      10.5,
      docWidth / 2 - labelW - 24
    );
    const valueW = fontBold.widthOfTextAtSize(value || '-', 10.5);
    // Centraliza o conjunto label+valor na metade direita.
    const metaStartX = rightHalfCenter - (labelW + valueW) / 2;
    page.drawText(labelText, {
      x: metaStartX,
      y: headerMetaY,
      size: 10.5,
      font: fontRegular,
      color: rgb(1, 1, 1),
    });
    page.drawText(value || '-', {
      x: metaStartX + labelW,
      y: headerMetaY,
      size: 10.5,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    headerMetaY -= 16;
  }

  const entryById = new Map(selectedFieldEntries.map((entry) => [entry.id, entry]));
  const asValue = (entry) => String(entry?.value ?? '').trim();

  // ── Resumo do Lote: dados de cabecalho do lote ──
  const resumoRows = [
    {
      label: 'Lote interno',
      value:
        typeof sample.internalLotNumber === 'string' && sample.internalLotNumber.trim()
          ? sample.internalLotNumber
          : '-',
    },
    { label: 'Safra', value: asValue(entryById.get('harvest')) || '-' },
    { label: 'Sacas', value: asValue(entryById.get('sacks')) || '-' },
    // Certificado: dado de classificacao apresentado no Resumo do Lote (decisao de
    // produto). SEMPRE presente (igual aos outros 3) — "-" quando nao registrado.
    { label: 'Certificado', value: asValue(entryById.get('certif')) || '-' },
  ];

  // ── Dados de Classificacao: todos os campos autorizados no laudo, exceto os
  // que ja aparecem no Resumo do Lote. Campos sem valor ja vem filtrados de
  // selectedFieldEntries (excludeEmpty), entao so aparece o que foi registrado.
  const classificationRows = [];
  for (const [id, label] of [
    ['padrao', 'Padrão'],
    ['catacao', 'Catação'],
    ['aspecto', 'Aspecto'],
    ['bebida', 'Bebida'],
    ['broca', 'Broca'],
    ['pva', 'PVA'],
    ['imp', 'IMP'],
    ['ap', 'AP'],
    ['gpi', 'GPI'],
    ['defeito', 'Defeito'],
  ]) {
    const entry = entryById.get(id);
    if (entry) {
      classificationRows.push({ label, value: asValue(entry) });
    }
  }

  // Peneiras percentuais: uma row por peneira ("P18: 5%" -> Peneira 18 | 5%).
  // O "P" das peneiras numeradas e removido do label (P18 -> 18); MK (Moca) fica
  // como esta. Os fundos vem na mesma string como "Fundo 13 = 4%" (sem numeracao,
  // peneira+% juntos) -> row "Fundo" | "13 = 4%".
  const sieveEntry = entryById.get('peneirasPercentuais');
  if (sieveEntry) {
    const parts = asValue(sieveEntry)
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of parts) {
      if (part.startsWith('Fundo ')) {
        classificationRows.push({ label: 'Fundo', value: part.slice('Fundo '.length).trim() });
        continue;
      }
      const sep = part.indexOf(':');
      if (sep > 0) {
        // Numeradas: "P18" -> "Peneira 18" (sem o "P"). Moca: "MK" -> so "MK"
        // (sem o prefixo "Peneira").
        const sieveKey = part
          .slice(0, sep)
          .trim()
          .replace(/^P(?=\d)/, '');
        const label = sieveKey.toUpperCase() === 'MK' ? 'MK' : `Peneira ${sieveKey}`;
        classificationRows.push({
          label,
          value: part.slice(sep + 1).trim(),
        });
      } else {
        classificationRows.push({ label: 'Peneira', value: part });
      }
    }
  }

  // Dados tecnicos autorizados (a area dedicada foi removida): entram aqui se
  // tiverem valor.
  for (const [id, label] of [
    ['technicalType', 'Tipo técnico'],
    ['technicalScreen', 'Peneira técnica'],
    ['technicalDensity', 'Densidade técnica'],
  ]) {
    const entry = entryById.get(id);
    if (entry) {
      classificationRows.push({ label, value: asValue(entry) });
    }
  }

  // Observações por último.
  const observacoesEntry = entryById.get('observacoes');
  if (observacoesEntry) {
    classificationRows.push({ label: 'Observações', value: asValue(observacoesEntry) });
  }

  // Lista de campos SEM moldura e SEM titulo: cada campo = label + valor, com uma
  // LINHA FINA entre eles. Se o valor nao cabe ao lado do label, o campo quebra em
  // 2 LINHAS (label em cima, valor embaixo na largura cheia). Os campos sao
  // distribuidos pra PREENCHER `height` (limitado a altura da foto); a fonte
  // encolhe (piso 6.5) se ficar apertado.
  const drawFieldList = ({ x, topY, width, height, rows, labelRatio = 0.42 }) => {
    if (!rows.length || height <= 8) {
      return;
    }
    const baseFont = 8.8;
    const labelColW = Math.max(58, width * labelRatio);
    const valueColW = width - labelColW - 4;

    // 2 linhas quando o valor nao cabe ao lado do label (na largura da coluna).
    const lineCountAt = (size) =>
      rows.map((r) =>
        fontRegular.widthOfTextAtSize(String(r.value ?? ''), size) > valueColW ? 2 : 1
      );

    let fontSize = baseFont;
    let totalLines = lineCountAt(fontSize).reduce((a, b) => a + b, 0);
    let lineSpace = height / totalLines;
    if (lineSpace < 12) {
      fontSize = Math.max(6.5, baseFont * (lineSpace / 12));
    }
    const lineCounts = lineCountAt(fontSize);
    totalLines = lineCounts.reduce((a, b) => a + b, 0);
    lineSpace = height / totalLines;

    const labelColor = rgb(0.25, 0.29, 0.26);
    let cursor = topY;
    rows.forEach((row, i) => {
      const lines = lineCounts[i];
      const blockH = lines * lineSpace;
      const label = fitTextToWidth(row.label, fontBold, fontSize, labelColW - 4);
      if (lines === 1) {
        const baseY = cursor - blockH / 2 - fontSize * 0.34;
        page.drawText(label, { x, y: baseY, size: fontSize, font: fontBold, color: labelColor });
        const value = fitTextToWidth(String(row.value ?? '-'), fontRegular, fontSize, valueColW);
        page.drawText(value || '-', {
          x: x + labelColW,
          y: baseY,
          size: fontSize,
          font: fontRegular,
          color: docText,
        });
      } else {
        const labelY = cursor - lineSpace / 2 - fontSize * 0.34;
        page.drawText(label, { x, y: labelY, size: fontSize, font: fontBold, color: labelColor });
        const valueY = cursor - 1.5 * lineSpace - fontSize * 0.34;
        const value = fitTextToWidth(String(row.value ?? '-'), fontRegular, fontSize, width);
        page.drawText(value || '-', {
          x,
          y: valueY,
          size: fontSize,
          font: fontRegular,
          color: docText,
        });
      }
      cursor -= blockH;
      // Linha fina entre campos (nao depois do ultimo).
      if (i < rows.length - 1) {
        page.drawLine({
          start: { x, y: cursor },
          end: { x: x + width, y: cursor },
          thickness: 0.5,
          color: rgb(0.9, 0.91, 0.92),
        });
      }
    });
  };

  const contentX = docX + 24;
  const contentWidth = docWidth - 48;
  const blockGap = 14;
  // Rodape mais alto pra acomodar as ondas verdes na borda inferior.
  const footerAreaHeight = 116;
  const footerLineY = docBottom + footerAreaHeight - 12; // linha fina acima do rodape

  // ── Geometria das 2 colunas + foto (tamanho FIXO) ──
  const leftW = (contentWidth - blockGap) / 2;
  const rightW = contentWidth - leftW - blockGap;
  const rightX = contentX + leftW + blockGap;

  const photoTitleSpace = 20;
  // Foto SEMPRE vertical (retrato): caixa de tamanho FIXO 3:4 (largura da coluna x
  // 4/3) — nao varia com a foto. A imagem e CONTIDA (sem corte) mais abaixo.
  const PHOTO_BOX_ASPECT = 3 / 4; // largura/altura (retrato)
  const imgBoxW = leftW;
  const imgBoxH = imgBoxW / PHOTO_BOX_ASPECT;

  // Gap (igual) acima do Resumo (header->Resumo) e entre o Resumo e a Foto/Dados.
  // Menor que antes pra SUBIR os campos; o espaco que sobra fica embaixo (rodape
  // com ondas). gap2 (Resumo->Foto/Dados) = gap1 (mesma proporcao). O conteudo
  // fica ancorado no topo (logo abaixo do header).
  const resumoBandH = 42;
  const topGap = 40;

  // ── Resumo do Lote: FAIXA horizontal de largura cheia, SEM moldura ──
  // Os N campos (3 ou 4, conforme tenha Certificado) ficam em colunas iguais
  // cobrindo toda a largura — label (verde, uppercase) sobre o valor (escuro),
  // centralizados, com separadores verticais sutis entre os campos.
  const resumoBandTop = headerY - topGap;
  const resumoCount = Math.max(resumoRows.length, 1);
  const resumoCellW = contentWidth / resumoCount;
  resumoRows.forEach((row, i) => {
    const cellX = contentX + i * resumoCellW;
    const center = cellX + resumoCellW / 2;
    const labelText = row.label.toUpperCase();
    const labelW = fontBold.widthOfTextAtSize(labelText, 7.5);
    page.drawText(labelText, {
      x: center - labelW / 2,
      y: resumoBandTop - 11,
      size: 7.5,
      font: fontBold,
      color: docGreen,
    });
    const valueText = fitTextToWidth(row.value, fontBold, 11, resumoCellW - 14);
    const valueW = fontBold.widthOfTextAtSize(valueText, 11);
    page.drawText(valueText || '-', {
      x: center - valueW / 2,
      y: resumoBandTop - 29,
      size: 11,
      font: fontBold,
      color: docText,
    });
    // Separador vertical entre campos (nao antes do 1o). Nao e moldura.
    if (i > 0) {
      page.drawLine({
        start: { x: cellX, y: resumoBandTop - 4 },
        end: { x: cellX, y: resumoBandTop - resumoBandH + 4 },
        thickness: 0.6,
        color: docLine,
      });
    }
  });

  // ── Linha abaixo do Resumo: Foto (esq) + Dados de Classificacao (dir) ──
  // Mesma altura; topGap acima (= gap header->Resumo). A foto e CONTIDA na caixa
  // fixa 3:4, sem corte. O espaco que sobra fica embaixo (rodape com ondas).
  const rowTop = resumoBandTop - resumoBandH - topGap;
  const imgX = contentX + (leftW - imgBoxW) / 2;

  page.drawText('Foto da Classificação', {
    x: contentX + 2,
    y: rowTop - 13,
    size: 9.8,
    font: fontBold,
    color: docGreen,
  });
  page.drawLine({
    start: { x: contentX + 2, y: rowTop - 16.5 },
    end: { x: contentX + leftW - 2, y: rowTop - 16.5 },
    thickness: 0.8,
    color: rgb(0.86, 0.89, 0.88),
  });

  const imgBoxY = rowTop - photoTitleSpace - imgBoxH;
  const drawnImg = drawImageContain(page, classificationImage, {
    x: imgX,
    y: imgBoxY,
    width: imgBoxW,
    height: imgBoxH,
  });
  // Borda MUITO FINA, na imagem efetivamente desenhada (nao na caixa) — assim nao
  // sobra espaco vazio dentro da moldura quando a foto nao for exatamente 3:4.
  page.drawRectangle({
    x: drawnImg.x,
    y: drawnImg.y,
    width: drawnImg.width,
    height: drawnImg.height,
    borderWidth: 0.5,
    borderColor: docLine,
  });

  // Dados de Classificacao: coluna DIREITA, SEM moldura e SEM titulo, alinhado e
  // LIMITADO a altura da foto (mesmo topo e base da imagem). Lista de campos com
  // linha fina entre eles; valor que nao cabe ao lado do label quebra em 2 linhas.
  if (classificationRows.length > 0) {
    drawFieldList({
      x: rightX,
      topY: rowTop - photoTitleSpace,
      width: rightW,
      height: imgBoxH,
      rows: classificationRows,
      labelRatio: 0.42,
    });
  }

  // ── Rodape: linha + textos (mais pra cima) + ONDAS VERDES na borda inferior ──
  const footerYear = new Date(issuedAtIso).getUTCFullYear();
  page.drawLine({
    start: { x: lineLeft, y: footerLineY },
    end: { x: lineRight, y: footerLineY },
    thickness: 1,
    color: docLine,
  });
  const footerMain = `© ${footerYear} Safras & Negócios. Todos os direitos reservados.`;
  page.drawText(footerMain, {
    x: docX + (docWidth - fontBold.widthOfTextAtSize(footerMain, 8.5)) / 2,
    y: docBottom + 92,
    size: 8.5,
    font: fontBold,
    color: rgb(0.33, 0.37, 0.35),
  });
  const footerCityPhone = `${COMPANY_INFO.cityUf}   ·   ${COMPANY_INFO.phone}`;
  page.drawText(footerCityPhone, {
    x: docX + (docWidth - fontRegular.widthOfTextAtSize(footerCityPhone, 8)) / 2,
    y: docBottom + 76,
    size: 8,
    font: fontRegular,
    color: rgb(0.45, 0.48, 0.45),
  });
  const footerAddr =
    fitTextToWidth(COMPANY_INFO.address, fontRegular, 8, docWidth - 80) || COMPANY_INFO.address;
  page.drawText(footerAddr, {
    x: docX + (docWidth - fontRegular.widthOfTextAtSize(footerAddr, 8)) / 2,
    y: docBottom + 62,
    size: 8,
    font: fontRegular,
    color: rgb(0.45, 0.48, 0.45),
  });

  // ── Divisor do rodape: linha verde AFILADA (some na borda, mais grossa perto
  // do centro) com o LOGO da Safras no meio. Centralizado entre os textos do
  // rodape e a borda inferior. As duas linhas nao se tocam (logo no meio) nem
  // encostam no logo (gap). ──
  const dividerY = docBottom + 30;
  const dividerCenter = docX + docWidth / 2;
  const logoGap = 11;
  let logoFooterW = 0;
  if (iconGreenImage) {
    const logoFooterH = 24;
    logoFooterW = (iconGreenImage.width / iconGreenImage.height) * logoFooterH;
    page.drawImage(iconGreenImage, {
      x: dividerCenter - logoFooterW / 2,
      y: dividerY - logoFooterH / 2,
      width: logoFooterW,
      height: logoFooterH,
    });
  }
  drawTaperedSegment(page, {
    pointX: lineLeft,
    thickX: dividerCenter - logoFooterW / 2 - logoGap,
    y: dividerY,
    maxThickness: 2.6,
    color: headerGreen,
  });
  drawTaperedSegment(page, {
    pointX: lineRight,
    thickX: dividerCenter + logoFooterW / 2 + logoGap,
    y: dividerY,
    maxThickness: 2.6,
    color: headerGreen,
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

export class SamplePdfReportService {
  constructor({
    queryService,
    commandService,
    uploadsBaseDir,
    logoPath = path.resolve(process.cwd(), 'public/logo-safras-branco.png'),
    iconPath = path.resolve(process.cwd(), 'public/icon-safras.png'),
  }) {
    if (!queryService) {
      throw new Error('SamplePdfReportService requires queryService');
    }

    if (!commandService) {
      throw new Error('SamplePdfReportService requires commandService');
    }

    if (typeof uploadsBaseDir !== 'string' || uploadsBaseDir.length === 0) {
      throw new Error('SamplePdfReportService requires uploadsBaseDir');
    }

    this.queryService = queryService;
    this.commandService = commandService;
    this.uploadsBaseDir = uploadsBaseDir;
    this.logoPath = logoPath;
    this.iconPath = iconPath;
    this.logoFallbackPath = path.resolve(process.cwd(), 'public/logo-laudo.png');
  }

  // Nucleo de geracao do laudo: valida (CLASSIFIED + foto de classificacao),
  // resolve safra/campos, renderiza o PDF e calcula o checksum. SEM efeitos
  // colaterais (nao registra evento nem grava em disco) — cada consumidor
  // decide o que fazer com o buffer: exportSamplePdf transmite + audita;
  // persistSampleReportPdf congela os bytes em UPLOADS_DIR (Etiqueta de Envio).
  async _buildReportArtifacts(input) {
    const sampleId = typeof input?.sampleId === 'string' ? input.sampleId : null;
    if (!sampleId) {
      throw new HttpError(422, 'sampleId is required for export');
    }

    const detail = await this.queryService.getSampleDetail(sampleId, { eventLimit: 1 });
    if (detail.sample.status !== 'CLASSIFIED') {
      throw new HttpError(409, `Sample ${sampleId} must be CLASSIFIED to export report`);
    }

    const destination = normalizeReportDestination(input?.destination);
    // Laudo unico ("Laudo Tecnico"): nao ha mais tipos (COMPLETO/COMPRADOR_PARCIAL).
    // Os campos sao fixos — todos os autorizados menos os internos (inclui owner).
    const selectedFields = SAMPLE_EXPORT_FIELDS_FOR_REPORT;
    // Liga: resolve a safra que sai no laudo. Em amostra de safra multipla
    // (liga), exige a escolha de UMA safra — o laudo nunca imprime a string
    // concatenada (anti-vazamento). Em safra unica, fica null (usa o declarado).
    const reportedHarvest = normalizeReportedHarvest(
      input?.reportedHarvest,
      detail.sample.declared?.harvest ?? null
    );

    const classificationAttachment = detail.attachments.find(
      (attachment) => attachment.kind === 'CLASSIFICATION_PHOTO'
    );
    if (!classificationAttachment) {
      throw new HttpError(409, 'CLASSIFIED sample requires CLASSIFICATION_PHOTO for report export');
    }

    const photoAbsolutePath = sanitizeAttachmentPath(
      this.uploadsBaseDir,
      classificationAttachment.storagePath
    );
    let classificationPhotoBytes;
    try {
      classificationPhotoBytes = await fs.readFile(photoAbsolutePath);
    } catch {
      throw new HttpError(409, 'CLASSIFICATION_PHOTO file is missing on storage');
    }

    if (!Buffer.isBuffer(classificationPhotoBytes) || classificationPhotoBytes.length === 0) {
      throw new HttpError(409, 'CLASSIFICATION_PHOTO file is empty on storage');
    }

    const selectedFieldEntries = buildSelectedExportFieldEntries(detail, selectedFields, {
      excludeEmpty: true,
    });
    // Liga: sobrescreve a safra impressa pela escolhida (so quando ha override).
    if (reportedHarvest) {
      const harvestEntry = selectedFieldEntries.find((entry) => entry.id === 'harvest');
      if (harvestEntry) {
        harvestEntry.value = reportedHarvest;
      }
    }
    const exportedFields = selectedFieldEntries.map((entry) => entry.id);
    const issuedAtIso = new Date().toISOString();
    const fileName = buildReportFileName(detail.sample);

    const pdfBuffer = await renderSamplePdf({
      sample: detail.sample,
      classificationAttachment,
      classificationPhotoBytes,
      selectedFieldEntries,
      issuedAtIso,
      logoPath: [this.logoPath, this.logoFallbackPath],
      iconPath: this.iconPath,
      destination,
    });

    const checksumSha256 = createHash('sha256').update(pdfBuffer).digest('hex');

    return {
      sample: detail.sample,
      pdfBuffer,
      fileName,
      checksumSha256,
      destination,
      reportedHarvest,
      classificationPhotoId: classificationAttachment.id,
      exportedFields,
    };
  }

  // Gera o laudo, registra REPORT_EXPORTED e devolve o buffer para transmissao
  // (download autenticado via POST /export/pdf). Comportamento inalterado — a
  // logica de geracao foi extraida para _buildReportArtifacts.
  async exportSamplePdf(input, actorContext) {
    const artifacts = await this._buildReportArtifacts(input);

    const auditResult = await this.commandService.recordReportExported(
      {
        sampleId: artifacts.sample.id,
        format: 'PDF',
        fileName: artifacts.fileName,
        destination: artifacts.destination,
        recipientClientId: input.recipientClientId ?? null,
        selectedFields: artifacts.exportedFields,
        classificationPhotoId: artifacts.classificationPhotoId,
        templateVersion: 'v1',
        sizeBytes: artifacts.pdfBuffer.length,
        checksumSha256: artifacts.checksumSha256,
        reportedHarvest: artifacts.reportedHarvest,
      },
      actorContext
    );

    return {
      fileName: artifacts.fileName,
      contentType: 'application/pdf',
      sizeBytes: artifacts.pdfBuffer.length,
      checksumSha256: artifacts.checksumSha256,
      destination: artifacts.destination,
      selectedFields: artifacts.exportedFields,
      buffer: artifacts.pdfBuffer,
      auditEvent: auditResult.event,
    };
  }

  // Etiqueta de Envio: gera o laudo e CONGELA os bytes em UPLOADS_DIR (sob
  // samples/<sampleId>/report-shares/<uuid>.pdf), devolvendo o storagePath
  // relativo + metadados para criar o SampleReportShare. NAO registra evento
  // nem stream — a orquestracao do envio (passo 3) cria o share e a etiqueta.
  // O caller continua responsavel por escolher destination/reportedHarvest.
  async persistSampleReportPdf(input) {
    const artifacts = await this._buildReportArtifacts(input);

    const relativeStoragePath = path.join(
      'samples',
      artifacts.sample.id,
      'report-shares',
      `${randomUUID()}.pdf`
    );
    const absolutePath = sanitizeAttachmentPath(this.uploadsBaseDir, relativeStoragePath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, artifacts.pdfBuffer);

    return {
      sampleId: artifacts.sample.id,
      storagePath: relativeStoragePath,
      fileName: artifacts.fileName,
      contentType: 'application/pdf',
      sizeBytes: artifacts.pdfBuffer.length,
      checksumSha256: artifacts.checksumSha256,
      destination: artifacts.destination,
      reportedHarvest: artifacts.reportedHarvest,
      classificationPhotoId: artifacts.classificationPhotoId,
      selectedFields: artifacts.exportedFields,
    };
  }

  // Etiqueta de Envio (fase 4): le os bytes de um laudo ja congelado em
  // UPLOADS_DIR (servido pela rota publica /laudo/[token]). sanitizeAttachmentPath
  // garante que o storagePath nao escapa do baseDir.
  async readPersistedReport(storagePath) {
    const absolutePath = sanitizeAttachmentPath(this.uploadsBaseDir, storagePath);
    return fs.readFile(absolutePath);
  }
}

export { SAMPLE_EXPORT_FIELDS };
