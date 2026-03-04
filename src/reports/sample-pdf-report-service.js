import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { PDFDocument, StandardFonts, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb } from 'pdf-lib';

import { HttpError } from '../contracts/errors.js';
import {
  SAMPLE_EXPORT_FIELDS,
  SAMPLE_EXPORT_TYPES,
  buildSelectedExportFieldEntries,
  normalizeSampleExportType,
  resolveSampleExportFieldsForType
} from './export-fields.js';

const PDF_PAGE_WIDTH = 595.28;
const PDF_PAGE_HEIGHT = 841.89;
const COMPANY_INFO = {
  cityUf: 'Sao Sebastiao do Paraiso/MG',
  phone: '(35) 3531-4046',
  address: 'Av. Oliveira Rezende, 1397 - Jardim Bernadete - Sao Sebastiao do Paraiso - MG'
};

function drawPageBackground(page) {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PDF_PAGE_WIDTH,
    height: PDF_PAGE_HEIGHT,
    color: rgb(0.976, 0.972, 0.954)
  });
}

function formatIssuedAt(isoString) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo'
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
      color
    });
  }
}

function fitTextToWidth(text, font, size, maxWidth) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
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

function wrapTextToWidth(text, font, size, maxWidth, maxLines = 2) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [];
  }

  const words = normalized.split(' ');
  const lines = [];
  let current = '';
  let truncated = false;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(fitTextToWidth(word, font, size, maxWidth));
      current = '';
    }

    if (lines.length === maxLines) {
      truncated = true;
      break;
    }
  }

  if (!truncated && current) {
    lines.push(current);
  } else if (truncated) {
    lines[maxLines - 1] = fitTextToWidth(`${lines[maxLines - 1]}...`, font, size, maxWidth);
  }

  return lines.slice(0, maxLines).filter(Boolean);
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
    height: drawHeight
  });
  page.pushOperators(popGraphicsState());
}

function buildReportFileName(sample) {
  const internalLot = typeof sample?.internalLotNumber === 'string' ? sample.internalLotNumber.trim() : '';
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

  try {
    return await pdfDoc.embedJpg(bytes);
  } catch {
    return pdfDoc.embedPng(bytes);
  }
}

async function renderSamplePdf({
  sample,
  classificationAttachment,
  classificationPhotoBytes,
  selectedFieldEntries,
  issuedAtIso,
  logoPath,
  destination
}) {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = await tryReadLogoBytes(logoPath);
  const logoImage = logoBytes ? await pdfDoc.embedPng(logoBytes).catch(() => null) : null;
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
    color: rgb(1, 1, 1)
  });

  const lineLeft = docX + 24;
  const lineRight = docX + docWidth - 24;
  const headerHeight = 94;
  const headerY = docTop - headerHeight;
  drawHorizontalGradient(page, {
    x: docX + 1,
    y: headerY,
    width: docWidth - 2,
    height: headerHeight - 1,
    leftColor: rgb(1, 1, 1),
    rightColor: rgb(0.14, 0.43, 0.29)
  });

  if (logoImage) {
    const logoMaxWidth = 440;
    const logoMaxHeight = 140;
    const logoScale = Math.min(logoMaxWidth / logoImage.width, logoMaxHeight / logoImage.height);
    const logoWidth = logoImage.width * logoScale;
    const logoHeight = logoImage.height * logoScale;
    page.drawImage(logoImage, {
      x: docX + 40,
      y: headerY + (headerHeight - logoHeight) / 2,
      width: logoWidth,
      height: logoHeight
    });
  }

  const companyRows = [
    { label: 'CIDADE/UF', value: COMPANY_INFO.cityUf, maxLines: 1 },
    { label: 'TELEFONE', value: COMPANY_INFO.phone, maxLines: 1 },
    { label: 'ENDERECO', value: COMPANY_INFO.address, maxLines: 2 }
  ];
  const infoContentWidth = 206;
  const companyInfoX = docX + docWidth - infoContentWidth - 12;
  let companyRowY = headerY + 36;
  for (const row of companyRows) {
    const labelText = `${row.label}:`;
    const labelWidth = fontBold.widthOfTextAtSize(labelText, 7.5);
    page.drawText(labelText, {
      x: companyInfoX,
      y: companyRowY,
      size: 7.5,
      font: fontBold,
      color: rgb(0.93, 0.98, 0.93)
    });

    const wrapped = wrapTextToWidth(row.value, fontRegular, 7.5, infoContentWidth - labelWidth - 4, row.maxLines);
    const lines = wrapped.length > 0 ? wrapped : ['-'];
    let valueY = companyRowY;
    for (const line of lines) {
      page.drawText(line, {
        x: companyInfoX + labelWidth + 4,
        y: valueY,
        size: 7.5,
        font: fontRegular,
        color: rgb(1, 1, 1)
      });
      valueY -= 8.5;
    }

    companyRowY -= Math.max(10, lines.length * 8.5 + 2);
  }

  page.drawLine({
    start: { x: lineLeft, y: headerY },
    end: { x: lineRight, y: headerY },
    thickness: 1,
    color: docLine
  });

  const title = 'LAUDO TECNICO DE AMOSTRA';
  const titleWidth = fontBold.widthOfTextAtSize(title, 16.5);
  const titleY = headerY - 36;
  page.drawText(title, {
    x: docX + (docWidth - titleWidth) / 2,
    y: titleY,
    size: 16.5,
    font: fontBold,
    color: docGreen
  });

  page.drawLine({
    start: { x: lineLeft, y: titleY - 10 },
    end: { x: lineRight, y: titleY - 10 },
    thickness: 1,
    color: docLine
  });

  const metaRows = [
    {
      label: 'Lote Interno',
      value: typeof sample.internalLotNumber === 'string' && sample.internalLotNumber.trim() ? sample.internalLotNumber : '-'
    },
    { label: 'Emitido em', value: formatIssuedAt(issuedAtIso) }
  ];
  if (destination) {
    metaRows.push({ label: 'Destinatario', value: destination });
  }

  const entryById = new Map(selectedFieldEntries.map((entry) => [entry.id, entry]));
  const usedIds = new Set();
  const asValue = (entry) => String(entry?.value ?? '').trim();

  const summaryRows = [];
  for (const [id, label] of [
    ['owner', 'Proprietario'],
    ['harvest', 'Safra'],
    ['sacks', 'Quantidade']
  ]) {
    const entry = entryById.get(id);
    if (entry) {
      summaryRows.push({ label, value: asValue(entry) });
      usedIds.add(id);
    }
  }

  const classificationRows = [];
  for (const [id, label] of [
    ['classificationDate', 'Data Classificacao'],
    ['padrao', 'Padrao'],
    ['catacao', 'Catacao'],
    ['aspecto', 'Aspecto'],
    ['bebida', 'Bebida'],
    ['broca', 'Broca'],
    ['pva', 'PVA'],
    ['imp', 'IMP'],
    ['defeito', 'Defeitos'],
    ['umidade', 'Umidade'],
    ['aspectoCor', 'Aspecto da Cor'],
    ['classificador', 'Classificador'],
    ['observacoes', 'Observacoes']
  ]) {
    const entry = entryById.get(id);
    if (entry) {
      classificationRows.push({ label, value: asValue(entry) });
      usedIds.add(id);
    }
  }

  const technicalRows = [];
  for (const [id, label] of [
    ['technicalType', 'Tipo Tecnico'],
    ['technicalScreen', 'Peneira Tecnica'],
    ['technicalDensity', 'Densidade Tecnica']
  ]) {
    const entry = entryById.get(id);
    if (entry) {
      technicalRows.push({ label, value: asValue(entry) });
      usedIds.add(id);
    }
  }

  const sieveRows = [];
  const sieveEntry = entryById.get('peneirasPercentuais');
  if (sieveEntry) {
    usedIds.add('peneirasPercentuais');
    const parts = asValue(sieveEntry)
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of parts) {
      const separatorIndex = part.indexOf(':');
      if (separatorIndex > 0) {
        sieveRows.push({
          label: part.slice(0, separatorIndex).trim(),
          value: part.slice(separatorIndex + 1).trim()
        });
      } else {
        sieveRows.push({ label: 'Peneira', value: part });
      }
    }
  }

  const extraRows = [];
  for (const entry of selectedFieldEntries) {
    if (!usedIds.has(entry.id)) {
      extraRows.push({ label: entry.label, value: asValue(entry) });
    }
  }

  const drawSection = ({ x, topY, width, height, title, rows }) => {
    if (height <= sectionHeaderHeight + 20) {
      return;
    }

    page.drawRectangle({
      x,
      y: topY - height,
      width,
      height,
      borderWidth: 1,
      borderColor: docLine,
      color: rgb(1, 1, 1)
    });
    page.drawRectangle({
      x,
      y: topY - sectionHeaderHeight,
      width,
      height: sectionHeaderHeight,
      color: docGreen
    });
    page.drawText(title, {
      x: x + 10,
      y: topY - sectionHeaderHeight + 6.5,
      size: 9.8,
      font: fontBold,
      color: rgb(1, 1, 1)
    });

    const contentX = x + 10;
    const contentWidth = width - 20;
    const labelColumnWidth = Math.max(82, Math.min(contentWidth * 0.48, 130));
    const rowHeight = 14;
    const rowTop = topY - sectionHeaderHeight - 12;
    const rowBottom = topY - height + 10;
    const maxRows = Math.max(1, Math.floor((rowTop - rowBottom) / rowHeight));
    const visibleRows = rows.slice(0, maxRows);
    const hiddenRows = rows.length - visibleRows.length;

    let cursorY = rowTop;
    for (let index = 0; index < visibleRows.length; index += 1) {
      const row = visibleRows[index];
      const label = fitTextToWidth(row.label, fontBold, 8.6, labelColumnWidth - 4);
      const value = fitTextToWidth(row.value, fontRegular, 8.6, contentWidth - labelColumnWidth - 2);

      page.drawText(label, {
        x: contentX,
        y: cursorY,
        size: 8.6,
        font: fontBold,
        color: rgb(0.25, 0.29, 0.26)
      });
      page.drawText(value || '-', {
        x: contentX + labelColumnWidth,
        y: cursorY,
        size: 8.6,
        font: fontRegular,
        color: docText
      });

      if (index < visibleRows.length - 1) {
        page.drawLine({
          start: { x: contentX, y: cursorY - 3 },
          end: { x: contentX + contentWidth, y: cursorY - 3 },
          thickness: 0.7,
          color: rgb(0.9, 0.91, 0.92)
        });
      }

      cursorY -= rowHeight;
    }

    if (hiddenRows > 0) {
      page.drawText(`+${hiddenRows} linhas adicionais`, {
        x: contentX,
        y: Math.max(rowBottom, cursorY - 1),
        size: 8.2,
        font: fontRegular,
        color: rgb(0.45, 0.47, 0.44)
      });
    }
  };

  const contentX = docX + 24;
  const contentWidth = docWidth - 48;
  const blockGap = 12;
  const hasSummary = summaryRows.length > 0;
  const topLeftWidth = hasSummary ? Math.round(contentWidth * 0.4) : 0;
  const topRightWidth = hasSummary ? contentWidth - topLeftWidth - blockGap : contentWidth;
  const photoX = hasSummary ? contentX + topLeftWidth + blockGap : contentX;

  const metaWidth = hasSummary ? topLeftWidth : Math.min(320, contentWidth);
  const metaX = contentX;
  let metaY = titleY - 38;
  for (const row of metaRows) {
    const labelText = `${row.label}:`;
    const labelWidth = fontBold.widthOfTextAtSize(labelText, 9);
    const maxLines = row.label === 'Destinatario' ? 2 : 1;
    const lines = wrapTextToWidth(row.value, fontRegular, 9, metaWidth - labelWidth - 6, maxLines);

    page.drawText(labelText, {
      x: metaX,
      y: metaY,
      size: 9,
      font: fontBold,
      color: rgb(0.23, 0.27, 0.25)
    });

    let valueY = metaY;
    const renderedLines = lines.length > 0 ? lines : ['-'];
    for (const line of renderedLines) {
      page.drawText(line, {
        x: metaX + labelWidth + 6,
        y: valueY,
        size: 9,
        font: fontRegular,
        color: docText
      });
      valueY -= 10.5;
    }

    metaY -= Math.max(13, renderedLines.length * 10.5);
  }

  const contentTop = Math.min(docTop - 188, metaY - 10);
  const contentBottom = docBottom + 64;
  const contentHeight = contentTop - contentBottom;
  const topRowHeight = 230;

  let cursorTop = contentTop;

  if (hasSummary) {
    drawSection({
      x: contentX,
      topY: cursorTop,
      width: topLeftWidth,
      height: topRowHeight,
      title: 'Resumo do Lote',
      rows: summaryRows
    });
  }

  page.drawText('Foto da Classificacao', {
    x: photoX + 10,
    y: cursorTop - 14,
    size: 9.8,
    font: fontBold,
    color: docGreen
  });
  page.drawLine({
    start: { x: photoX + 10, y: cursorTop - 17.5 },
    end: { x: photoX + topRightWidth - 10, y: cursorTop - 17.5 },
    thickness: 0.8,
    color: rgb(0.86, 0.89, 0.88)
  });

  const photoInnerX = photoX;
  const photoInnerY = cursorTop - topRowHeight + 2;
  const photoInnerW = topRightWidth;
  const photoInnerH = topRowHeight - 26;

  drawImageCover(page, classificationImage, {
    x: photoInnerX,
    y: photoInnerY,
    width: photoInnerW,
    height: photoInnerH
  });

  cursorTop -= topRowHeight;

  const hasClassification = classificationRows.length > 0;
  const hasSieve = sieveRows.length > 0;
  const hasTechnical = technicalRows.length > 0 || extraRows.length > 0;
  const extraSectionRows = extraRows.length > 0 ? extraRows : [];

  const additionalBlocks = [];
  if (hasClassification || hasSieve) {
    additionalBlocks.push('middle');
  }
  if (hasTechnical) {
    additionalBlocks.push('technical');
  }
  const remainingHeight =
    contentHeight - topRowHeight - Math.max(0, additionalBlocks.length) * blockGap;

  if (additionalBlocks.includes('middle')) {
    cursorTop -= blockGap;
    const middleHeight = additionalBlocks.length === 2 ? Math.round(remainingHeight * 0.62) : remainingHeight;
    const classWidth = hasClassification && hasSieve ? Math.round(contentWidth * 0.6) : contentWidth;
    const sieveWidth = contentWidth - classWidth - (hasClassification && hasSieve ? blockGap : 0);

    if (hasClassification) {
      drawSection({
        x: contentX,
        topY: cursorTop,
        width: classWidth,
        height: middleHeight,
        title: 'Dados de Classificacao',
        rows: classificationRows
      });
    }

    if (hasSieve) {
      drawSection({
        x: hasClassification ? contentX + classWidth + blockGap : contentX,
        topY: cursorTop,
        width: hasClassification ? sieveWidth : contentWidth,
        height: middleHeight,
        title: 'Peneiras Percentuais',
        rows: sieveRows
      });
    }

    cursorTop -= middleHeight;
  }

  if (additionalBlocks.includes('technical')) {
    cursorTop -= blockGap;
    const technicalHeight = cursorTop - contentBottom;
    drawSection({
      x: contentX,
      topY: cursorTop,
      width: contentWidth,
      height: technicalHeight,
      title: 'Dados Tecnicos',
      rows: [...technicalRows, ...extraSectionRows]
    });
    cursorTop -= technicalHeight;
  }

  const footerY = docBottom + 18;
  page.drawLine({
    start: { x: lineLeft, y: footerY + 30 },
    end: { x: lineRight, y: footerY + 30 },
    thickness: 1,
    color: docLine
  });
  const footerYear = new Date(issuedAtIso).getUTCFullYear();
  const footerMain = `(c) ${footerYear} Safras & Negocios. Todos os direitos reservados.`;
  const footerSub = `${COMPANY_INFO.cityUf} | ${COMPANY_INFO.phone} | ${COMPANY_INFO.address}`;
  const footerSubFitted = fitTextToWidth(footerSub, fontRegular, 7.1, docWidth - 56) || footerSub;

  page.drawText(footerMain, {
    x: docX + (docWidth - fontBold.widthOfTextAtSize(footerMain, 8)) / 2,
    y: footerY + 14,
    size: 8,
    font: fontBold,
    color: rgb(0.33, 0.37, 0.35)
  });
  page.drawText(footerSubFitted, {
    x: docX + (docWidth - fontRegular.widthOfTextAtSize(footerSubFitted, 7.1)) / 2,
    y: footerY + 4,
    size: 7.1,
    font: fontRegular,
    color: rgb(0.45, 0.48, 0.45)
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

export class SamplePdfReportService {
  constructor({ queryService, commandService, uploadsBaseDir, logoPath = path.resolve(process.cwd(), 'public/logo-laudo.png') }) {
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
    this.logoFallbackPath = path.resolve(process.cwd(), 'public/logo-safras-branco.png');
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

    const classificationAttachment = detail.attachments.find((attachment) => attachment.kind === 'CLASSIFICATION_PHOTO');
    if (!classificationAttachment) {
      throw new HttpError(409, 'CLASSIFIED sample requires CLASSIFICATION_PHOTO for report export');
    }

    const photoAbsolutePath = sanitizeAttachmentPath(this.uploadsBaseDir, classificationAttachment.storagePath);
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
      excludeEmpty: true
    });
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
      destination
    });

    const checksumSha256 = createHash('sha256').update(pdfBuffer).digest('hex');

    const auditResult = await this.commandService.recordReportExported(
      {
        sampleId: detail.sample.id,
        format: 'PDF',
        exportType,
        fileName,
        destination,
        selectedFields: exportedFields,
        classificationPhotoId: classificationAttachment.id,
        templateVersion: 'v1',
        sizeBytes: pdfBuffer.length,
        checksumSha256
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
      auditEvent: auditResult.event
    };
  }
}

export { SAMPLE_EXPORT_FIELDS, SAMPLE_EXPORT_TYPES };
