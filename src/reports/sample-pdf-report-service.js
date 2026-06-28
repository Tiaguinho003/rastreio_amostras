import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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
    color: rgb(0.945, 0.95, 0.955),
  });
}

// Caminho SVG de um retangulo arredondado (origem no canto SUPERIOR-ESQUERDO,
// eixo y do SVG para BAIXO — combina com page.drawSvgPath). Cantos via curva Q.
function roundedRectPath(w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return [
    `M ${rr} 0`,
    `H ${w - rr}`,
    `Q ${w} 0 ${w} ${rr}`,
    `V ${h - rr}`,
    `Q ${w} ${h} ${w - rr} ${h}`,
    `H ${rr}`,
    `Q 0 ${h} 0 ${h - rr}`,
    `V ${rr}`,
    `Q 0 0 ${rr} 0`,
    'Z',
  ].join(' ');
}

// Card branco arredondado com sombra APROXIMADA (pdf-lib nao tem blur): desenha
// alguns retangulos cinza levemente deslocados/empilhados atras e o card por cima.
// (x, y) = canto SUPERIOR-ESQUERDO em coordenadas do PDF; topY cresce para cima.
function drawRoundedCard(page, { x, topY, w, h, r = 10, fill = rgb(1, 1, 1), borderColor }) {
  const path = roundedRectPath(w, h, r);
  // Sombra: 3 camadas deslocadas pra baixo-direita, do mais claro ao mais escuro.
  const shadow = [
    { dx: 2.4, dy: 2.4, c: rgb(0.9, 0.91, 0.92) },
    { dx: 1.5, dy: 1.5, c: rgb(0.86, 0.87, 0.89) },
    { dx: 0.8, dy: 0.8, c: rgb(0.83, 0.84, 0.86) },
  ];
  for (const s of shadow) {
    page.drawSvgPath(path, { x: x + s.dx, y: topY - s.dy, color: s.c });
  }
  page.drawSvgPath(path, {
    x,
    y: topY,
    color: fill,
    borderColor,
    borderWidth: borderColor ? 0.8 : undefined,
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
  classificationAttachment = null,
  classificationPhotoBytes = null,
  selectedFieldEntries,
  issuedAtIso,
  // Cabecalho = imagem unica (logo + "LAUDO TECNICO" + ornamento + pilula). O
  // sistema so escreve o numero do lote por cima.
  headerImagePath,
  iconPath,
  // Amostra sem classificacao (laudo ao vivo): no lugar da Foto + Dados, um
  // aviso central. Resumo do Lote (Lote/Safra/Sacas) continua aparecendo.
  unclassified = false,
}) {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Cabecalho: imagem unica (degrada se ausente — calibra no preview).
  const headerBytes = await tryReadLogoBytes(headerImagePath);
  const headerImage = headerBytes ? await pdfDoc.embedPng(headerBytes).catch(() => null) : null;

  // Arvore verde do divisor do RODAPE (unico uso restante do iconPath).
  const iconBytes = await tryReadLogoBytes(iconPath);
  let iconGreenImage = null;
  if (iconBytes) {
    try {
      iconGreenImage = await pdfDoc.embedPng(await makeColoredSilhouette(iconBytes, 25, 76, 43));
    } catch {
      iconGreenImage = null;
    }
  }
  // Foto opcional: ausente em amostra sem classificacao (laudo ao vivo) e
  // tolerada ilegivel no caminho publico — degrada para "sem foto" em vez de
  // quebrar a pagina. O caminho estrito (export autenticado) ja validou os bytes.
  const classificationImage =
    classificationPhotoBytes && classificationAttachment
      ? await embedImage(pdfDoc, classificationPhotoBytes, classificationAttachment.mimeType).catch(
          () => null
        )
      : null;

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

  const headerGreen = rgb(0.098, 0.298, 0.169);
  const lineLeft = docX + 24;
  const lineRight = docX + docWidth - 24;

  // ─── Cabecalho: IMAGEM unica sangrando na largura total do topo ───
  // (logo + "LAUDO TECNICO" + ornamento/folhagem + pilula "Lote Interno"). O
  // sistema so escreve o NUMERO do lote por cima, a DIREITA da pilula.
  const HEADER_ASPECT = 2508 / 627; // proporcao da arte enviada (fallback)
  const headerHeight = headerImage
    ? PDF_PAGE_WIDTH / (headerImage.width / headerImage.height)
    : PDF_PAGE_WIDTH / HEADER_ASPECT;
  const headerY = PDF_PAGE_HEIGHT - headerHeight;
  if (headerImage) {
    page.drawImage(headerImage, {
      x: 0,
      y: headerY,
      width: PDF_PAGE_WIDTH,
      height: headerHeight,
    });
  }

  // Numero do lote, a DIREITA da pilula "Lote Interno". Coordenadas como fracao
  // da pagina (calibradas no preview p/ baterem com a arte do cabecalho).
  const lotNumber =
    typeof sample.internalLotNumber === 'string' && sample.internalLotNumber.trim()
      ? sample.internalLotNumber.trim()
      : '-';
  // Numero do lote ABAIXO da pilula "Lote Interno" da arte: a pilula nao tem
  // folga interna p/ o numero, mas ha faixa branca logo abaixo dela no cabecalho.
  // Verde, centralizado no eixo da pilula. Coordenadas calibradas no preview.
  const pillCenterX = PDF_PAGE_WIDTH * 0.62; // centro do texto "Lote Interno" da arte
  const LOT_NUMBER_SIZE = 14;
  const lotNumberBaselineY = PDF_PAGE_HEIGHT - headerHeight * 0.92; // abaixo da pilula
  const lotW = fontBold.widthOfTextAtSize(lotNumber, LOT_NUMBER_SIZE);
  page.drawText(lotNumber, {
    x: pillCenterX - lotW / 2,
    y: lotNumberBaselineY,
    size: LOT_NUMBER_SIZE,
    font: fontBold,
    color: headerGreen,
  });

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
      // Separador PONTILHADO entre campos (nao depois do ultimo).
      if (i < rows.length - 1) {
        page.drawLine({
          start: { x, y: cursor },
          end: { x: x + width, y: cursor },
          thickness: 0.7,
          color: rgb(0.74, 0.77, 0.79),
          dashArray: [0.6, 2.4],
        });
      }
    });
  };

  const contentX = docX + 24;
  const contentWidth = docWidth - 48;
  const blockGap = 14;
  // Cards brancos (Resumo, Foto+Dados) — largura com margem da pagina.
  const cardX = 24;
  const cardW = PDF_PAGE_WIDTH - 48;
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
  // Card branco (com sombra) atras do Resumo do Lote.
  drawRoundedCard(page, {
    x: cardX,
    topY: resumoBandTop + 13,
    w: cardW,
    h: resumoBandH + 24,
    r: 12,
  });
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

  if (unclassified) {
    // Amostra sem classificacao: o QR/laudo abre so com a identificacao (Resumo
    // do Lote acima) + este aviso central no lugar da Foto + Dados, dentro de um
    // card branco (mesmo chrome do laudo classificado).
    const noticeTop = rowTop + 13;
    const noticeBottom = footerLineY + 10;
    drawRoundedCard(page, {
      x: cardX,
      topY: noticeTop,
      w: cardW,
      h: noticeTop - noticeBottom,
      r: 12,
    });
    const noticeMidY = (noticeTop + noticeBottom) / 2;
    const centerX = docX + docWidth / 2;
    const title = 'Amostra ainda não classificada';
    const titleSize = 15;
    const titleW = fontBold.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
      x: centerX - titleW / 2,
      y: noticeMidY + 4,
      size: titleSize,
      font: fontBold,
      color: docGreen,
    });
    const subtitle = 'Este lote ainda não passou por classificação técnica.';
    const subSize = 10.5;
    const subW = fontRegular.widthOfTextAtSize(subtitle, subSize);
    page.drawText(subtitle, {
      x: centerX - subW / 2,
      y: noticeMidY - 16,
      size: subSize,
      font: fontRegular,
      color: docText,
    });
  } else {
    const imgX = contentX + (leftW - imgBoxW) / 2;
    const imgBoxY = rowTop - photoTitleSpace - imgBoxH;
    // Card branco (com sombra) atras da Foto + Dados.
    drawRoundedCard(page, {
      x: cardX,
      topY: rowTop + 13,
      w: cardW,
      h: rowTop + 13 - (imgBoxY - 16),
      r: 12,
    });

    // Titulo "Foto da Classificacao" + regua fina ate a direita. So quando ha
    // foto (classificada com imagem legivel).
    if (classificationImage) {
      const titleX = contentX + 2;
      const fotoTitle = 'Foto da Classificação';
      page.drawText(fotoTitle, {
        x: titleX,
        y: rowTop - 13,
        size: 9.8,
        font: fontBold,
        color: docGreen,
      });
      page.drawLine({
        start: { x: titleX + fontBold.widthOfTextAtSize(fotoTitle, 9.8) + 8, y: rowTop - 9.5 },
        end: { x: contentX + contentWidth - 2, y: rowTop - 9.5 },
        thickness: 0.8,
        color: rgb(0.82, 0.86, 0.85),
      });

      const drawnImg = drawImageContain(page, classificationImage, {
        x: imgX,
        y: imgBoxY,
        width: imgBoxW,
        height: imgBoxH,
      });
      // Borda fina na imagem efetivamente desenhada (nao na caixa).
      page.drawRectangle({
        x: drawnImg.x,
        y: drawnImg.y,
        width: drawnImg.width,
        height: drawnImg.height,
        borderWidth: 0.7,
        borderColor: docLine,
      });
    }

    // Dados de Classificacao: coluna DIREITA (ao lado da foto) ou largura cheia
    // (sem foto), SEM moldura e SEM titulo, alinhado e LIMITADO a altura da foto.
    // Lista de campos com separador pontilhado; valor que nao cabe quebra em 2 linhas.
    if (classificationRows.length > 0) {
      drawFieldList({
        x: classificationImage ? rightX : contentX,
        topY: rowTop - photoTitleSpace,
        width: classificationImage ? rightW : contentWidth,
        height: imgBoxH,
        rows: classificationRows,
        labelRatio: 0.42,
      });
    }
  }

  // ── Rodape: a LINHA com o LOGO (fina e uniforme) define o TOPO do rodape; os
  // textos vem ABAIXO dela. A linha quebra ao redor do logo (gap) e nao encosta
  // nas bordas (margem lineLeft/lineRight). ──
  const footerYear = new Date(issuedAtIso).getUTCFullYear();
  const footerCenter = docX + docWidth / 2;
  const footerLogoGap = 11;
  let footerLogoW = 0;
  if (iconGreenImage) {
    const footerLogoH = 22;
    footerLogoW = (iconGreenImage.width / iconGreenImage.height) * footerLogoH;
    page.drawImage(iconGreenImage, {
      x: footerCenter - footerLogoW / 2,
      y: footerLineY - footerLogoH / 2,
      width: footerLogoW,
      height: footerLogoH,
    });
  }
  // Dois segmentos finos de ESPESSURA UNIFORME, com gap pro logo e margem nas bordas.
  page.drawLine({
    start: { x: lineLeft, y: footerLineY },
    end: { x: footerCenter - footerLogoW / 2 - footerLogoGap, y: footerLineY },
    thickness: 0.8,
    color: headerGreen,
  });
  page.drawLine({
    start: { x: footerCenter + footerLogoW / 2 + footerLogoGap, y: footerLineY },
    end: { x: lineRight, y: footerLineY },
    thickness: 0.8,
    color: headerGreen,
  });

  const footerMain = `© ${footerYear} Safras & Negócios. Todos os direitos reservados.`;
  page.drawText(footerMain, {
    x: docX + (docWidth - fontBold.widthOfTextAtSize(footerMain, 8.5)) / 2,
    y: docBottom + 78,
    size: 8.5,
    font: fontBold,
    color: rgb(0.33, 0.37, 0.35),
  });
  const footerCityPhone = `${COMPANY_INFO.cityUf}   ·   ${COMPANY_INFO.phone}`;
  page.drawText(footerCityPhone, {
    x: docX + (docWidth - fontRegular.widthOfTextAtSize(footerCityPhone, 8)) / 2,
    y: docBottom + 64,
    size: 8,
    font: fontRegular,
    color: rgb(0.45, 0.48, 0.45),
  });
  const footerAddr =
    fitTextToWidth(COMPANY_INFO.address, fontRegular, 8, docWidth - 80) || COMPANY_INFO.address;
  page.drawText(footerAddr, {
    x: docX + (docWidth - fontRegular.widthOfTextAtSize(footerAddr, 8)) / 2,
    y: docBottom + 50,
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
    // Cabecalho = imagem unica (public/laudo-header.png). iconPath = arvore verde
    // do divisor do rodape.
    headerImagePath = path.resolve(process.cwd(), 'public/laudo-header.png'),
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
    this.headerImagePath = headerImagePath;
    this.iconPath = iconPath;
  }

  // Nucleo de geracao do laudo: resolve safra/campos, renderiza o PDF e calcula
  // o checksum. SEM efeitos colaterais (nao registra evento nem grava em disco)
  // — cada consumidor decide o que fazer com o buffer: exportSamplePdf transmite
  // + audita; renderReportPdfLive devolve o buffer pra rota publica do QR.
  // `allowUnclassified` (laudo ao vivo) gera tambem sem classificacao (variante
  // "Amostra ainda nao classificada"); o default estrito so aceita CLASSIFIED.
  async _buildReportArtifacts(input) {
    const sampleId = typeof input?.sampleId === 'string' ? input.sampleId : null;
    if (!sampleId) {
      throw new HttpError(422, 'sampleId is required for export');
    }

    const allowUnclassified = input?.allowUnclassified === true;

    const detail = await this.queryService.getSampleDetail(sampleId, { eventLimit: 1 });
    const isClassified = detail.sample.status === 'CLASSIFIED';
    if (!isClassified && !allowUnclassified) {
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

    // Foto de classificacao: obrigatoria no caminho estrito (CLASSIFIED). No
    // caminho ao vivo, ausente/ilegivel degrada para "sem foto" (renderiza assim
    // mesmo). Amostra sem classificacao nao tem foto — pula a busca.
    let classificationAttachment = null;
    let classificationPhotoBytes = null;
    if (isClassified) {
      classificationAttachment =
        detail.attachments.find((attachment) => attachment.kind === 'CLASSIFICATION_PHOTO') ?? null;
      if (!classificationAttachment) {
        if (!allowUnclassified) {
          throw new HttpError(
            409,
            'CLASSIFIED sample requires CLASSIFICATION_PHOTO for report export'
          );
        }
      } else {
        const photoAbsolutePath = sanitizeAttachmentPath(
          this.uploadsBaseDir,
          classificationAttachment.storagePath
        );
        try {
          classificationPhotoBytes = await fs.readFile(photoAbsolutePath);
        } catch {
          if (!allowUnclassified) {
            throw new HttpError(409, 'CLASSIFICATION_PHOTO file is missing on storage');
          }
          classificationPhotoBytes = null;
        }
        if (
          classificationPhotoBytes &&
          (!Buffer.isBuffer(classificationPhotoBytes) || classificationPhotoBytes.length === 0)
        ) {
          if (!allowUnclassified) {
            throw new HttpError(409, 'CLASSIFICATION_PHOTO file is empty on storage');
          }
          classificationPhotoBytes = null;
        }
      }
      // Foto e attachment andam juntos: se um faltou, renderiza sem foto.
      if (!classificationPhotoBytes) {
        classificationAttachment = null;
      }
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
      headerImagePath: this.headerImagePath,
      iconPath: this.iconPath,
      unclassified: !isClassified,
    });

    const checksumSha256 = createHash('sha256').update(pdfBuffer).digest('hex');

    return {
      sample: detail.sample,
      pdfBuffer,
      fileName,
      checksumSha256,
      destination,
      reportedHarvest,
      classificationPhotoId: classificationAttachment?.id ?? null,
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

  // Etiqueta de Envio (laudo ao vivo): gera o PDF do laudo a partir do estado
  // ATUAL da amostra e devolve { buffer, fileName }. Servido pela rota publica
  // /laudo/[token] a cada escaneamento — nada e congelado em disco, entao
  // classificar a amostra depois do envio passa a refletir no mesmo QR.
  // allowUnclassified aceita amostra ainda sem classificacao (variante com aviso).
  async renderReportPdfLive(input) {
    const artifacts = await this._buildReportArtifacts({ ...input, allowUnclassified: true });
    return { buffer: artifacts.pdfBuffer, fileName: artifacts.fileName };
  }
}

export { SAMPLE_EXPORT_FIELDS };
