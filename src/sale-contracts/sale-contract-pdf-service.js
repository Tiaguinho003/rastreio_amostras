import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Fechamento (Fase C): gera o PDF do "Contrato de Compra e Venda de Café" a
// partir do SaleContract (+ snapshots), no estilo do app (cabeçalho verde +
// seções). Puro pdf-lib (mesmo stack do laudo). Regenerável, sem armazenar
// (D32) — cada "Baixar PDF" chama renderContractPdf de novo.

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

const STATUS_LABELS = {
  EM_ABERTO: 'Em aberto',
  CONFERIR: 'A conferir',
  CONFIRMADO: 'Confirmado',
  FATURADO: 'Faturado',
  PAGO: 'Pago',
  WASH_OUT: 'Quebrado',
};

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
  // number, datas ISO, brokers[]). Devolve { buffer, checksumSha256 }.
  async renderContractPdf(contract, { lotNumber = null, issuer }) {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const logoBytes = await tryReadPng(this.logoPath);
    const logo = logoBytes ? await pdfDoc.embedPng(logoBytes).catch(() => null) : null;

    const contentW = PAGE_W - 2 * MARGIN;
    let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H;

    const newPage = () => {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    };
    const ensureSpace = (needed) => {
      if (y - needed < MARGIN) newPage();
    };
    const sectionTitle = (title) => {
      ensureSpace(30);
      y -= 18;
      page.drawText(title, { x: MARGIN, y, size: 10, font: fontBold, color: GREEN });
      y -= 5;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_W - MARGIN, y },
        thickness: 0.6,
        color: LINE,
      });
      y -= 12;
    };
    // Campo SEMPRE presente: rótulo + valor (ou "—" quando vazio). Decisão do
    // Flávio — o documento mostra todos os campos mesmo sem dado preenchido.
    const field = (label, value) => {
      ensureSpace(15);
      const labelText = `${label}: `;
      page.drawText(labelText, { x: MARGIN, y, size: 9, font: fontBold, color: MUTED });
      const labelW = fontBold.widthOfTextAtSize(labelText, 9);
      const display = value === null || value === undefined || value === '' ? '—' : String(value);
      page.drawText(fitText(display, font, 9, contentW - labelW), {
        x: MARGIN + labelW,
        y,
        size: 9,
        font,
        color: INK,
      });
      y -= 15;
    };
    const paragraph = (label, value) => {
      ensureSpace(26);
      page.drawText(`${label}:`, { x: MARGIN, y, size: 9, font: fontBold, color: MUTED });
      y -= 13;
      const text = value && String(value).trim() ? value : '—';
      for (const line of wrapText(text, font, 9, contentW)) {
        ensureSpace(12);
        page.drawText(line, { x: MARGIN, y, size: 9, font, color: INK });
        y -= 12;
      }
    };
    // Parte (comprador/vendedor/armazém). Consolida Client + filial (fazenda):
    // PJ traz tudo no Client; PF tem os dados fiscais/endereço na fazenda (unit)
    // -> fallback. SEM rótulo "Filial" (D: o documento não especifica filial).
    const party = (title, snap) => {
      sectionTitle(title);
      const unit = snap?.unit ?? {};
      const pick = (key) => snap?.[key] ?? unit?.[key] ?? null;
      const city = pick('city');
      const state = pick('state');
      field('Nome', snapshotName(snap));
      field('CNPJ', formatDocument(pick('cnpj')));
      field('IE', pick('registrationNumber'));
      field('Endereço', pick('addressLine'));
      field('Bairro', pick('district'));
      field('Cidade/UF', city ? `${city}${state ? `/${state}` : ''}` : state);
      field('Número', null); // sem campo próprio por ora — o número fica no Endereço
      field('CEP', formatCep(pick('postalCode')));
    };

    // ---------- Cabeçalho (faixa verde) ----------
    const headerH = 92;
    page.drawRectangle({
      x: 0,
      y: PAGE_H - headerH,
      width: PAGE_W,
      height: headerH,
      color: GREEN,
    });
    let headerTextX = MARGIN;
    if (logo) {
      const logoH = 40;
      const logoW = (logo.width / logo.height) * logoH;
      page.drawImage(logo, { x: MARGIN, y: PAGE_H - 30 - logoH, width: logoW, height: logoH });
      headerTextX = MARGIN + logoW + 16;
    }
    page.drawText(issuer.name, {
      x: headerTextX,
      y: PAGE_H - 34,
      size: 13,
      font: fontBold,
      color: WHITE,
    });
    page.drawText(
      fitText(`CNPJ ${issuer.cnpj} · ${issuer.cityUf}`, font, 8, PAGE_W - headerTextX - MARGIN),
      {
        x: headerTextX,
        y: PAGE_H - 48,
        size: 8,
        font,
        color: WHITE,
      }
    );
    page.drawText(fitText(issuer.address, font, 8, PAGE_W - headerTextX - MARGIN), {
      x: headerTextX,
      y: PAGE_H - 60,
      size: 8,
      font,
      color: WHITE,
    });
    page.drawText('CONTRATO DE COMPRA E VENDA DE CAFÉ', {
      x: headerTextX,
      y: PAGE_H - 80,
      size: 10,
      font: fontBold,
      color: WHITE,
    });
    // Número + status à direita
    const numText = contract.contractNumber;
    const numW = fontBold.widthOfTextAtSize(numText, 16);
    page.drawText(numText, {
      x: PAGE_W - MARGIN - numW,
      y: PAGE_H - 36,
      size: 16,
      font: fontBold,
      color: WHITE,
    });
    const statusText = STATUS_LABELS[contract.status] ?? contract.status;
    const statusW = font.widthOfTextAtSize(statusText, 9);
    page.drawText(statusText, {
      x: PAGE_W - MARGIN - statusW,
      y: PAGE_H - 52,
      size: 9,
      font,
      color: WHITE,
    });

    y = PAGE_H - headerH - 6;

    // ---------- B1 Identificação (sem "Tipo") ----------
    sectionTitle('Identificação');
    field('Data do contrato', formatDateBR(contract.contractDate));
    field('Mês/Ano', formatMonthYearExtenso(contract.contractDate));
    field('Número de compra', contract.purchaseNumber);
    field('Número do lote', lotNumber);

    // ---------- B2/B3 Comprador + armazém ----------
    party('Comprador', contract.buyerSnapshot);
    party('Armazém do comprador', contract.buyerWarehouseSnapshot);

    // ---------- B4/B5 Vendedor + armazém ----------
    party('Vendedor', contract.sellerSnapshot);
    party('Armazém do vendedor', contract.sellerWarehouseSnapshot);

    // ---------- B6 Corretagem (só %) ----------
    sectionTitle('Corretagem');
    field('Corretagem do vendedor', formatPercent(contract.sellerBrokeragePct));
    field('Corretagem do comprador', formatPercent(contract.buyerBrokeragePct));

    // ---------- B7 Quantidade & valores (sem ágio/total — P21/P22) ----------
    sectionTitle('Quantidade e valores');
    field('Sacas', contract.quantitySacks != null ? `${contract.quantitySacks} sc` : null);
    field('Peso (Kg)', decimalToNumber(contract.weightKg));
    field('Preço por saca', formatCurrencyBRL(contract.unitPrice));

    // ---------- B8 Pagamento & logística ----------
    sectionTitle('Pagamento e logística');
    field('Condição de pagamento', contract.paymentCondition);
    field('Forma de pagamento', contract.paymentFormText);
    field('Modalidade', contract.modalityText);
    field('Embalagem', contract.packagingText);
    field('Data de faturamento', formatDateBR(contract.invoiceDate));
    field('Data de pagamento', formatDateBR(contract.paymentDate));
    const bank = contract.sellerBankSnapshot;
    field(
      'Banco do vendedor',
      bank
        ? [bank.bankName, bank.compeCode ? `(${bank.compeCode})` : null].filter(Boolean).join(' ')
        : null
    );
    field(
      'Agência / Conta',
      bank ? [bank.agency, bank.accountNumber].filter(Boolean).join(' / ') || null : null
    );
    field('Titular', bank?.holderName);
    field('CPF/CNPJ do titular', formatDocument(bank?.holderTaxId));
    field('Chave PIX', bank?.pixKey);

    // ---------- B9 Textos (sempre presentes) ----------
    sectionTitle('Observações');
    paragraph('Observações', contract.observations);
    paragraph('Descrição', contract.description);

    // ---------- B10 Assinaturas ----------
    const sigBlockH = 90;
    ensureSpace(sigBlockH);
    y -= 36;
    const colW = (contentW - 24) / 2;
    const sigLine = (label, x) => {
      page.drawLine({
        start: { x, y },
        end: { x: x + colW, y },
        thickness: 0.8,
        color: rgb(0.3, 0.34, 0.31),
      });
      page.drawText(label, { x, y: y - 12, size: 8, font, color: MUTED });
    };
    sigLine('Vendedor', MARGIN);
    sigLine('Comprador', MARGIN + colW + 24);
    y -= 44;
    ensureSpace(30);
    sigLine('Corretor / Empresa', MARGIN);

    const bytes = await pdfDoc.save();
    const buffer = Buffer.from(bytes);
    const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
    return { buffer, checksumSha256 };
  }
}
