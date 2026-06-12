import { createHash } from 'node:crypto';
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
  SAMPLE_EXPORT_TYPES,
  buildSelectedExportFieldEntries,
  normalizeReportedHarvest,
  normalizeSampleExportType,
  resolveSampleExportFieldsForType,
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

function formatIssuedAt(isoString) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(isoString));
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

function drawImageCover(page, image, { x, y, width, height }) {
  if (width <= 0 || height <= 0) {
    return;
  }

  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;

  page.pushOperators(pushGraphicsState(), rectangle(x, y, width, height), clip(), endPath());
  page.drawImage(image, {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight,
  });
  page.pushOperators(popGraphicsState());
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

// Silhueta branca preservando o canal alpha — usada pra marca d'agua clara do
// icone (arvore) sobre a banda verde escura do cabecalho. Pinta todo pixel
// visivel de branco e mantem a transparencia original.
async function makeWhiteSilhouette(bytes) {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
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
  if (iconBytes) {
    try {
      iconWhiteImage = await pdfDoc.embedPng(await makeWhiteSilhouette(iconBytes));
    } catch {
      iconWhiteImage = null;
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
  const sectionHeaderHeight = 22;

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
  // TECNICO" + lote/emissao a direita, sobre marca d'agua do icone (arvore).
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
      x: docX + 26,
      y: headerY + (headerHeight - logoHeight) / 2,
      width: logoWidth,
      height: logoHeight,
    });
  }

  // Divisoria vertical entre logo e titulo.
  const dividerX = docX + 252;
  page.drawLine({
    start: { x: dividerX, y: headerY + 22 },
    end: { x: dividerX, y: headerY + headerHeight - 22 },
    thickness: 1,
    color: rgb(1, 1, 1),
    opacity: 0.33,
  });

  // Titulo + meta (lote/emissao) no lado direito da banda.
  const headerRightX = dividerX + 26;
  const headerRightLimit = docX + docWidth - 150;
  const headerTitleY = headerY + headerHeight - 44;
  page.drawText('LAUDO TÉCNICO', {
    x: headerRightX,
    y: headerTitleY,
    size: 21,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  const headerUnderlineY = headerTitleY - 13;
  page.drawLine({
    start: { x: headerRightX, y: headerUnderlineY },
    end: { x: headerRightLimit, y: headerUnderlineY },
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
    { label: 'Emitido em', value: formatIssuedAt(issuedAtIso) },
  ];
  if (destination) {
    headerMeta.push({ label: 'Destinatário', value: destination });
  }

  let headerMetaY = headerUnderlineY - 20;
  for (const row of headerMeta) {
    const labelText = `${row.label}: `;
    page.drawText(labelText, {
      x: headerRightX,
      y: headerMetaY,
      size: 10.5,
      font: fontRegular,
      color: rgb(1, 1, 1),
    });
    const labelW = fontRegular.widthOfTextAtSize(labelText, 10.5);
    // O valor pode avancar sobre a marca d'agua (texto solido por cima do
    // icone clarinho), entao usa uma margem direita maior que a da divisoria.
    const value = fitTextToWidth(
      String(row.value ?? '-'),
      fontBold,
      10.5,
      docX + docWidth - 30 - (headerRightX + labelW)
    );
    page.drawText(value || '-', {
      x: headerRightX + labelW,
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
    { label: 'Emitido em', value: formatIssuedAt(issuedAtIso) },
    { label: 'Safra', value: asValue(entryById.get('harvest')) || '-' },
    { label: 'Sacas', value: asValue(entryById.get('sacks')) || '-' },
  ];
  // Certificado: dado de classificacao apresentado no Resumo do Lote (decisao de
  // produto). So aparece quando registrado (entry ja vem filtrado por excludeEmpty).
  const certifEntry = entryById.get('certif');
  if (certifEntry) {
    resumoRows.push({ label: 'Certificado', value: asValue(certifEntry) || '-' });
  }

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

  // Classificadores: uma unica row com os nomes na horizontal, separados por
  // " / " (decisao de produto: nao empilhar verticalmente). Aceita o campo novo
  // `classifiers` ou o legacy `conferredBy` (mesma string pipe-separada do
  // export-fields.js). Excesso de nomes e truncado com "..." pelo fitTextToWidth
  // do renderer (largura da coluna de valor).
  const classifiersEntry = entryById.get('classifiers') ?? entryById.get('conferredBy');
  if (classifiersEntry) {
    const names = asValue(classifiersEntry)
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    if (names.length > 0) {
      classificationRows.push({ label: 'Classificadores', value: names.join(' / ') });
    }
  }

  // Peneiras percentuais: uma row por peneira ("P18: 5%" -> Peneira P18 | 5%).
  const sieveEntry = entryById.get('peneirasPercentuais');
  if (sieveEntry) {
    const parts = asValue(sieveEntry)
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of parts) {
      const sep = part.indexOf(':');
      if (sep > 0) {
        classificationRows.push({
          label: `Peneira ${part.slice(0, sep).trim()}`,
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

  const drawSection = ({
    x,
    topY,
    width,
    height,
    title,
    rows,
    labelRatio = 0.46,
    maxColumns = 1,
  }) => {
    if (height <= sectionHeaderHeight + 18) {
      return;
    }

    page.drawRectangle({
      x,
      y: topY - height,
      width,
      height,
      borderWidth: 1,
      borderColor: docLine,
      color: rgb(1, 1, 1),
    });
    page.drawRectangle({
      x,
      y: topY - sectionHeaderHeight,
      width,
      height: sectionHeaderHeight,
      color: docGreen,
    });
    page.drawText(title, {
      x: x + 12,
      y: topY - sectionHeaderHeight + 6.5,
      size: 9.8,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    const sx = x + 12;
    const sWidth = width - 24;
    const rowTop = topY - sectionHeaderHeight - 12;
    const rowBottom = topY - height + 12;
    const avail = rowTop - rowBottom;

    const fontSize = 8.8;
    // Gap vertical moderado: parte de distribuir pra encher, mas com um teto
    // (pra nao espalhar demais quando ha poucas linhas) e um minimo de 17pt (pra
    // caber mais info quando necessario — o excedente vira "+N adicionais").
    const minRowHeight = 17;
    const maxRowHeight = 26;
    // Densidade a partir da qual uma unica coluna deixa de ser confortavel.
    const comfortRowHeight = 22;

    // ── Layout adaptativo de colunas ──
    // Enquanto as linhas cabem confortavelmente numa unica coluna, mantem o
    // padrao de coluna unica. Quando passam do que cabe confortavelmente (e a
    // secao autoriza via maxColumns), divide em 2 colunas — assim o laudo acomoda
    // bem mais informacao sem espremer nem truncar cedo demais.
    const comfortPerColumn = Math.max(1, Math.floor(avail / comfortRowHeight));
    const columns = maxColumns >= 2 && rows.length > comfortPerColumn ? 2 : 1;

    // Capacidade total no pitch mais denso (somando as colunas). O que exceder
    // vira "+N linhas adicionais".
    const maxPerColumn = Math.max(1, Math.floor(avail / minRowHeight));
    let visibleRows = rows.slice(0, Math.min(rows.length, maxPerColumn * columns));
    let hiddenRows = rows.length - visibleRows.length;
    // Reserva um slot pro indicador "+N" quando ha excedente.
    if (hiddenRows > 0 && visibleRows.length > 1) {
      visibleRows = visibleRows.slice(0, visibleRows.length - 1);
      hiddenRows = rows.length - visibleRows.length;
    }

    // Slots = linhas visiveis + (eventual) indicador. Preenchimento coluna-a-
    // coluna, SEMPRE de cima pra baixo: a coluna da esquerda recebe a primeira
    // metade; a da direita, o restante (incluindo o indicador). Nunca a partir
    // do meio.
    const indicatorSlots = hiddenRows > 0 ? 1 : 0;
    const totalSlots = visibleRows.length + indicatorSlots;
    const leftCount = columns === 2 ? Math.ceil(totalSlots / 2) : totalSlots;
    const rightCount = totalSlots - leftCount;

    // Pitch compartilhado pelas duas colunas (parte da coluna mais cheia), preso
    // ao topo: a sobra, quando ha poucas linhas, fica embaixo.
    const bands = Math.max(leftCount, rightCount, 1);
    const step = Math.min(maxRowHeight, avail / bands);

    const colGap = 18;
    const colWidth = columns === 2 ? (sWidth - colGap) / 2 : sWidth;
    const labelColumnWidth = Math.max(64, colWidth * labelRatio);

    // Resolve em qual coluna/linha cada slot cai (e quantas linhas tem a coluna,
    // pra saber onde NAO desenhar separador).
    const placeSlot = (slot) =>
      columns === 2 && slot >= leftCount
        ? { cellX: sx + colWidth + colGap, rowIndex: slot - leftCount, colCount: rightCount }
        : { cellX: sx, rowIndex: slot, colCount: leftCount };

    for (let slot = 0; slot < visibleRows.length; slot += 1) {
      const row = visibleRows[slot];
      const { cellX, rowIndex, colCount } = placeSlot(slot);
      const baselineY = rowTop - (rowIndex + 0.5) * step - 3;
      const label = fitTextToWidth(row.label, fontBold, fontSize, labelColumnWidth - 6);
      const value = fitTextToWidth(
        row.value,
        fontRegular,
        fontSize,
        colWidth - labelColumnWidth - 2
      );

      page.drawText(label, {
        x: cellX,
        y: baselineY,
        size: fontSize,
        font: fontBold,
        color: rgb(0.25, 0.29, 0.26),
      });
      page.drawText(value || '-', {
        x: cellX + labelColumnWidth,
        y: baselineY,
        size: fontSize,
        font: fontRegular,
        color: docText,
      });

      // Separador abaixo da linha, exceto na ultima linha da coluna.
      if (rowIndex < colCount - 1) {
        const sepY = rowTop - (rowIndex + 1) * step;
        page.drawLine({
          start: { x: cellX, y: sepY },
          end: { x: cellX + colWidth, y: sepY },
          thickness: 0.7,
          color: rgb(0.9, 0.91, 0.92),
        });
      }
    }

    if (hiddenRows > 0) {
      const { cellX, rowIndex } = placeSlot(totalSlots - 1);
      page.drawText(`+${hiddenRows} linhas adicionais`, {
        x: cellX,
        y: rowTop - (rowIndex + 0.5) * step - 3,
        size: 8.2,
        font: fontRegular,
        color: rgb(0.45, 0.47, 0.44),
      });
    }
  };

  const contentX = docX + 24;
  const contentWidth = docWidth - 48;
  const blockGap = 14;
  const footerAreaHeight = 77; // rodape (-20% do pico de 96)

  const contentTop = headerY - 22;
  const contentBottom = docBottom + footerAreaHeight;
  const contentHeight = contentTop - contentBottom;

  // ── Linha superior: Resumo do Lote (esq, mais largo) + Foto (dir, retrato) ──
  // A caixa da foto respeita a proporcao real da imagem (foto de celular na
  // vertical): mais alta e mais fina, sem barras. O Resumo ocupa a largura que
  // sobra (mais larga), com os valores afastados dos rotulos (labelRatio).
  const photoTitleSpace = 20;
  const imgAspect =
    classificationImage.height > 0 ? classificationImage.width / classificationImage.height : 0.75;
  const photoMaxImgW = Math.round(contentWidth * 0.46);
  const photoMaxImgH = Math.min(360, contentHeight - 170);
  let imgBoxH = photoMaxImgH;
  let imgBoxW = imgBoxH * imgAspect;
  if (imgBoxW > photoMaxImgW) {
    imgBoxW = photoMaxImgW;
    imgBoxH = imgBoxW / imgAspect;
  }
  const topRowHeight = imgBoxH + photoTitleSpace;
  const resumoWidth = contentWidth - imgBoxW - blockGap;
  const photoX = contentX + resumoWidth + blockGap;

  let cursorTop = contentTop;

  drawSection({
    x: contentX,
    topY: cursorTop,
    width: resumoWidth,
    height: topRowHeight,
    title: 'Resumo do Lote',
    rows: resumoRows,
    labelRatio: 0.52,
  });

  page.drawText('Foto da Classificação', {
    x: photoX + 2,
    y: cursorTop - 13,
    size: 9.8,
    font: fontBold,
    color: docGreen,
  });
  page.drawLine({
    start: { x: photoX + 2, y: cursorTop - 16.5 },
    end: { x: photoX + imgBoxW - 2, y: cursorTop - 16.5 },
    thickness: 0.8,
    color: rgb(0.86, 0.89, 0.88),
  });

  const imgBoxY = cursorTop - topRowHeight;
  drawImageCover(page, classificationImage, {
    x: photoX,
    y: imgBoxY,
    width: imgBoxW,
    height: imgBoxH,
  });
  page.drawRectangle({
    x: photoX,
    y: imgBoxY,
    width: imgBoxW,
    height: imgBoxH,
    borderWidth: 1,
    borderColor: docLine,
  });

  cursorTop -= topRowHeight;

  // ── Dados de Classificacao: largura total, ocupando ate o rodape ──
  if (classificationRows.length > 0) {
    cursorTop -= blockGap;
    const classHeight = cursorTop - contentBottom;
    drawSection({
      x: contentX,
      topY: cursorTop,
      width: contentWidth,
      height: classHeight,
      title: 'Dados de Classificação',
      rows: classificationRows,
      labelRatio: 0.42,
      maxColumns: 2,
    });
  }

  // ── Rodape (area ~50% maior, preenchida) ──
  const footerYear = new Date(issuedAtIso).getUTCFullYear();
  page.drawLine({
    start: { x: lineLeft, y: docBottom + footerAreaHeight - 12 },
    end: { x: lineRight, y: docBottom + footerAreaHeight - 12 },
    thickness: 1,
    color: docLine,
  });
  const footerMain = `© ${footerYear} Safras & Negócios. Todos os direitos reservados.`;
  page.drawText(footerMain, {
    x: docX + (docWidth - fontBold.widthOfTextAtSize(footerMain, 8.5)) / 2,
    y: docBottom + 48,
    size: 8.5,
    font: fontBold,
    color: rgb(0.33, 0.37, 0.35),
  });
  const footerCityPhone = `${COMPANY_INFO.cityUf}   ·   ${COMPANY_INFO.phone}`;
  page.drawText(footerCityPhone, {
    x: docX + (docWidth - fontRegular.widthOfTextAtSize(footerCityPhone, 8)) / 2,
    y: docBottom + 34,
    size: 8,
    font: fontRegular,
    color: rgb(0.45, 0.48, 0.45),
  });
  const footerAddr =
    fitTextToWidth(COMPANY_INFO.address, fontRegular, 8, docWidth - 80) || COMPANY_INFO.address;
  page.drawText(footerAddr, {
    x: docX + (docWidth - fontRegular.widthOfTextAtSize(footerAddr, 8)) / 2,
    y: docBottom + 20,
    size: 8,
    font: fontRegular,
    color: rgb(0.45, 0.48, 0.45),
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

  async exportSamplePdf(input, actorContext) {
    const sampleId = typeof input?.sampleId === 'string' ? input.sampleId : null;
    if (!sampleId) {
      throw new HttpError(422, 'sampleId is required for export');
    }

    const detail = await this.queryService.getSampleDetail(sampleId, { eventLimit: 1 });
    if (detail.sample.status !== 'CLASSIFIED') {
      throw new HttpError(409, `Sample ${sampleId} must be CLASSIFIED to export report`);
    }

    const exportType = normalizeSampleExportType(input?.exportType);
    const destination = normalizeReportDestination(input?.destination);
    const selectedFields = resolveSampleExportFieldsForType(exportType);
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

    const auditResult = await this.commandService.recordReportExported(
      {
        sampleId: detail.sample.id,
        format: 'PDF',
        exportType,
        fileName,
        destination,
        recipientClientId: input.recipientClientId ?? null,
        selectedFields: exportedFields,
        classificationPhotoId: classificationAttachment.id,
        templateVersion: 'v1',
        sizeBytes: pdfBuffer.length,
        checksumSha256,
        reportedHarvest,
      },
      actorContext
    );

    return {
      fileName,
      contentType: 'application/pdf',
      sizeBytes: pdfBuffer.length,
      checksumSha256,
      exportType,
      destination,
      selectedFields: exportedFields,
      buffer: pdfBuffer,
      auditEvent: auditResult.event,
    };
  }
}

export { SAMPLE_EXPORT_FIELDS, SAMPLE_EXPORT_TYPES };
