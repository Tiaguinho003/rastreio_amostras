import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Fechamento (Fase C): gera o PDF do "Contrato de Compra e Venda de Café" a
// partir do SaleContract (+ snapshots), no estilo do app. Puro pdf-lib (mesmo
// stack do laudo). Regenerável, sem armazenar (D32). LAYOUT EM PÁGINA ÚNICA
// (S52): título no corpo, linha de identificação horizontal, partes/armazéns em
// cards de 2 colunas, blocos de baixo compactados — nunca quebra em 2 páginas.

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 42;

const GREEN = rgb(0.122, 0.365, 0.263);
const INK = rgb(0.14, 0.22, 0.18);
const MUTED = rgb(0.4, 0.46, 0.42);
const LINE = rgb(0.86, 0.84, 0.8);
const WHITE = rgb(1, 1, 1);

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function decimalToNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value?.toNumber === 'function') return value.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatCurrencyBRL(value) {
  const parsed = decimalToNumber(value);
  return parsed === null ? null : BRL.format(parsed);
}

export function formatDateBR(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

export function formatMonthYearExtenso(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${MONTHS[date.getUTCMonth()]} de ${date.getUTCFullYear()}`;
}

export function formatDocument(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return String(value);
}

export function formatCep(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 8) {
    return digits.replace(/(\d{5})(\d{3})/, '$1-$2');
  }
  return String(value);
}

function formatPercent(value) {
  const parsed = decimalToNumber(value);
  if (parsed === null) return null;
  return `${parsed.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

function fitText(text, font, size, maxWidth) {
  const normalized = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || font.widthOfTextAtSize(normalized, size) <= maxWidth) {
    return normalized;
  }
  let low = 0;
  let high = normalized.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${normalized.slice(0, mid).trimEnd()}...`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${normalized.slice(0, low).trimEnd()}...`;
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function tryReadPng(candidate) {
  const paths = Array.isArray(candidate) ? candidate : [candidate];
  for (const filePath of paths) {
    try {
      const bytes = await fs.readFile(filePath);
      if (bytes?.length) return bytes;
    } catch {
      /* tenta o próximo */
    }
  }
  return null;
}

function snapshotName(snap) {
  if (!snap) return null;
  return snap.displayName ?? snap.legalName ?? snap.fullName ?? null;
}

function emptyToDash(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export class SaleContractPdfService {
  constructor({
    logoPath = [
      path.resolve(process.cwd(), 'public/logo-safras-branco.png'),
      path.resolve(process.cwd(), 'public/logo-laudo.png'),
    ],
  } = {}) {
    this.logoPath = logoPath;
  }

  // contract = view de getSaleContract (snapshots como objetos, decimais como
  // number, datas ISO, brokers[]). Devolve { buffer, checksumSha256 }. PÁGINA
  // ÚNICA: o `y` só decresce, sem paginação; alturas determinísticas (fitText
  // trunca cada campo em 1 linha; parágrafos truncados).
  async renderContractPdf(contract, { lotNumber = null, issuer }) {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const logoBytes = await tryReadPng(this.logoPath);
    const logo = logoBytes ? await pdfDoc.embedPng(logoBytes).catch(() => null) : null;

    const contentW = PAGE_W - 2 * MARGIN;
    const COL_GAP = 12;
    const halfW = (contentW - COL_GAP) / 2;
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

    // Título de seção compacto (rótulo + régua fina). Retorna a altura usada.
    const miniSection = (title, top) => {
      page.drawText(title, { x: MARGIN, y: top - 8, size: 9, font: fontBold, color: GREEN });
      page.drawLine({
        start: { x: MARGIN, y: top - 12 },
        end: { x: PAGE_W - MARGIN, y: top - 12 },
        thickness: 0.6,
        color: LINE,
      });
      return 18;
    };

    // Card com borda: título + linhas [label, value] (sempre presentes; "—"
    // quando vazio). Altura determinística. Retorna a altura.
    const drawCard = ({ x, width, top, title, rows }) => {
      const pad = 7;
      const titleH = 12;
      const lineH = 11;
      const height = pad + titleH + rows.length * lineH + pad;
      page.drawRectangle({
        x,
        y: top - height,
        width,
        height,
        borderColor: LINE,
        borderWidth: 0.8,
        color: WHITE,
      });
      page.drawText(fitText(title, fontBold, 9, width - 2 * pad), {
        x: x + pad,
        y: top - pad - 8,
        size: 9,
        font: fontBold,
        color: GREEN,
      });
      let cy = top - pad - titleH - 8;
      for (const [label, value] of rows) {
        const labelText = `${label}: `;
        page.drawText(labelText, { x: x + pad, y: cy, size: 8, font: fontBold, color: MUTED });
        const labelW = fontBold.widthOfTextAtSize(labelText, 8);
        page.drawText(fitText(emptyToDash(value), font, 8, width - 2 * pad - labelW), {
          x: x + pad + labelW,
          y: cy,
          size: 8,
          font,
          color: INK,
        });
        cy -= lineH;
      }
      return height;
    };

    // Faixa horizontal de N células (label pequeno + valor). Identificação,
    // corretagem e valores. Retorna a altura.
    const statRow = ({ top, cells }) => {
      const colW = contentW / cells.length;
      cells.forEach((cell, i) => {
        const cx = MARGIN + i * colW;
        page.drawText(fitText(cell.label, font, 7, colW - 8), {
          x: cx,
          y: top - 7,
          size: 7,
          font,
          color: MUTED,
        });
        page.drawText(fitText(emptyToDash(cell.value), fontBold, 9, colW - 8), {
          x: cx,
          y: top - 19,
          size: 9,
          font: fontBold,
          color: INK,
        });
      });
      return 24;
    };

    // Campos em 2 colunas (label: value, sempre presentes). Retorna a altura.
    const twoColFields = ({ top, pairs }) => {
      const lineH = 11;
      const colW = (contentW - COL_GAP) / 2;
      const rowsCount = Math.ceil(pairs.length / 2);
      pairs.forEach(([label, value], i) => {
        const cx = MARGIN + (i % 2) * (colW + COL_GAP);
        const cy = top - 8 - Math.floor(i / 2) * lineH;
        const labelText = `${label}: `;
        page.drawText(labelText, { x: cx, y: cy, size: 8, font: fontBold, color: MUTED });
        const labelW = fontBold.widthOfTextAtSize(labelText, 8);
        page.drawText(fitText(emptyToDash(value), font, 8, colW - labelW), {
          x: cx + labelW,
          y: cy,
          size: 8,
          font,
          color: INK,
        });
      });
      return 8 + rowsCount * lineH;
    };

    // Parágrafo sempre presente, truncado a maxLines p/ caber em 1 página.
    const truncatedParagraph = ({ top, label, value, maxLines = 2 }) => {
      const lineH = 10;
      page.drawText(`${label}:`, { x: MARGIN, y: top - 8, size: 8, font: fontBold, color: MUTED });
      const text = value && String(value).trim() ? String(value) : '—';
      let lines = wrapText(text, font, 8, contentW);
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\S*$/, '')}...`;
      }
      let cy = top - 18;
      for (const line of lines) {
        page.drawText(line, { x: MARGIN, y: cy, size: 8, font, color: INK });
        cy -= lineH;
      }
      return 18 + lines.length * lineH;
    };

    // Linhas de uma parte (Comprador/Vendedor/Armazém). Consolida Client +
    // fazenda (PF puxa os dados fiscais/endereço da unit); SEM rótulo "Filial".
    const partyRows = (snap) => {
      const unit = snap?.unit ?? {};
      const pick = (key) => snap?.[key] ?? unit?.[key] ?? null;
      const city = pick('city');
      const state = pick('state');
      return [
        ['Nome', snapshotName(snap)],
        ['CNPJ', formatDocument(pick('cnpj'))],
        ['IE', pick('registrationNumber')],
        ['Endereço', pick('addressLine')],
        ['Bairro', pick('district')],
        ['Cidade/UF', city ? `${city}${state ? `/${state}` : ''}` : state],
        ['Número', null], // sem campo próprio por ora — o número fica no Endereço
        ['CEP', formatCep(pick('postalCode'))],
      ];
    };

    // ---------- Cabeçalho (faixa verde) — logo + emissor ----------
    // (título e número saíram daqui p/ o corpo, S52; o status do fluxo NÃO entra
    // no documento — é um contrato, não um rastreador. Redesign do header depois.)
    const headerH = 74;
    page.drawRectangle({ x: 0, y: PAGE_H - headerH, width: PAGE_W, height: headerH, color: GREEN });
    let headerTextX = MARGIN;
    if (logo) {
      const logoH = 40;
      const logoW = (logo.width / logo.height) * logoH;
      page.drawImage(logo, { x: MARGIN, y: PAGE_H - 28 - logoH, width: logoW, height: logoH });
      headerTextX = MARGIN + logoW + 16;
    }
    page.drawText(issuer.name, {
      x: headerTextX,
      y: PAGE_H - 32,
      size: 13,
      font: fontBold,
      color: WHITE,
    });
    page.drawText(
      fitText(`CNPJ ${issuer.cnpj} · ${issuer.cityUf}`, font, 8, PAGE_W - headerTextX - MARGIN),
      { x: headerTextX, y: PAGE_H - 46, size: 8, font, color: WHITE }
    );
    page.drawText(fitText(issuer.address, font, 8, PAGE_W - headerTextX - MARGIN), {
      x: headerTextX,
      y: PAGE_H - 58,
      size: 8,
      font,
      color: WHITE,
    });
    let y = PAGE_H - headerH - 18;

    // ---------- Título (no corpo) ----------
    const titleText = 'Contrato de Compra e Venda de Café';
    const titleSize = 14;
    const titleW = fontBold.widthOfTextAtSize(titleText, titleSize);
    page.drawText(titleText, {
      x: (PAGE_W - titleW) / 2,
      y: y - titleSize,
      size: titleSize,
      font: fontBold,
      color: GREEN,
    });
    y -= titleSize + 12;

    // ---------- Identificação (linha horizontal: 4 campos) ----------
    y -= statRow({
      top: y,
      cells: [
        { label: 'Número do contrato', value: contract.contractNumber },
        { label: 'Número de compra', value: contract.purchaseNumber },
        { label: 'Número do lote', value: lotNumber },
        { label: 'Mês/Ano', value: formatMonthYearExtenso(contract.contractDate) },
      ],
    });
    y -= 10;

    // ---------- Comprador | Armazém do comprador ----------
    y -=
      Math.max(
        drawCard({
          x: MARGIN,
          width: halfW,
          top: y,
          title: 'Comprador',
          rows: partyRows(contract.buyerSnapshot),
        }),
        drawCard({
          x: MARGIN + halfW + COL_GAP,
          width: halfW,
          top: y,
          title: 'Armazém do comprador',
          rows: partyRows(contract.buyerWarehouseSnapshot),
        })
      ) + 8;

    // ---------- Vendedor | Armazém do vendedor ----------
    y -=
      Math.max(
        drawCard({
          x: MARGIN,
          width: halfW,
          top: y,
          title: 'Vendedor',
          rows: partyRows(contract.sellerSnapshot),
        }),
        drawCard({
          x: MARGIN + halfW + COL_GAP,
          width: halfW,
          top: y,
          title: 'Armazém do vendedor',
          rows: partyRows(contract.sellerWarehouseSnapshot),
        })
      ) + 10;

    // ---------- Corretagem (só %) ----------
    y -= miniSection('Corretagem', y);
    y -= statRow({
      top: y,
      cells: [
        { label: 'Corretagem do vendedor', value: formatPercent(contract.sellerBrokeragePct) },
        { label: 'Corretagem do comprador', value: formatPercent(contract.buyerBrokeragePct) },
      ],
    });
    y -= 8;

    // ---------- Quantidade e valores (sem ágio/total — P21/P22) ----------
    y -= miniSection('Quantidade e valores', y);
    y -= statRow({
      top: y,
      cells: [
        {
          label: 'Sacas',
          value: contract.quantitySacks != null ? `${contract.quantitySacks} sc` : null,
        },
        { label: 'Peso (Kg)', value: decimalToNumber(contract.weightKg) },
        { label: 'Preço por saca', value: formatCurrencyBRL(contract.unitPrice) },
      ],
    });
    y -= 8;

    // ---------- Pagamento e logística (2 colunas) ----------
    const bank = contract.sellerBankSnapshot;
    y -= miniSection('Pagamento e logística', y);
    y -= twoColFields({
      top: y,
      pairs: [
        ['Condição de pagamento', contract.paymentCondition],
        ['Forma de pagamento', contract.paymentFormText],
        ['Modalidade', contract.modalityText],
        ['Embalagem', contract.packagingText],
        ['Data de faturamento', formatDateBR(contract.invoiceDate)],
        ['Data de pagamento', formatDateBR(contract.paymentDate)],
        [
          'Banco do vendedor',
          bank
            ? [bank.bankName, bank.compeCode ? `(${bank.compeCode})` : null]
                .filter(Boolean)
                .join(' ')
            : null,
        ],
        [
          'Agência / Conta',
          bank ? [bank.agency, bank.accountNumber].filter(Boolean).join(' / ') || null : null,
        ],
        ['Titular', bank?.holderName],
        ['CPF/CNPJ do titular', formatDocument(bank?.holderTaxId)],
        ['Chave PIX', bank?.pixKey],
      ],
    });
    y -= 10;

    // ---------- Observações (truncadas p/ caber) ----------
    y -= miniSection('Observações', y);
    y -= truncatedParagraph({ top: y, label: 'Observações', value: contract.observations });
    y -= 4;
    y -= truncatedParagraph({ top: y, label: 'Descrição', value: contract.description });
    y -= 14;

    // ---------- Assinaturas ----------
    const sigColW = (contentW - 24) / 2;
    const sigLine = (label, x, sy) => {
      page.drawLine({
        start: { x, y: sy },
        end: { x: x + sigColW, y: sy },
        thickness: 0.8,
        color: rgb(0.3, 0.34, 0.31),
      });
      page.drawText(label, { x, y: sy - 11, size: 8, font, color: MUTED });
    };
    y -= 24;
    sigLine('Vendedor', MARGIN, y);
    sigLine('Comprador', MARGIN + sigColW + 24, y);
    y -= 40;
    sigLine('Corretor / Empresa', MARGIN, y);

    const bytes = await pdfDoc.save();
    const buffer = Buffer.from(bytes);
    const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
    return { buffer, checksumSha256 };
  }
}
