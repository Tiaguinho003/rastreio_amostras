import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

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
const BLACK = rgb(0.13, 0.13, 0.13);
const MUTED = rgb(0.4, 0.46, 0.42);
const LINE = rgb(0.7, 0.7, 0.7);
const LABEL_BG = rgb(0.82, 0.82, 0.82);
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
const DEC2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Peso (Kg) com 2 casas no padrão BR: "19.200,00 Kg" (espelha o legado).
function formatKg(value) {
  const parsed = decimalToNumber(value);
  return `${DEC2.format(parsed ?? 0)} Kg`;
}

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

// "Mês" (só o nome) e "Ano" do contrato — a linha de identificação separa os dois.
export function formatMonthExtenso(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return MONTHS[date.getUTCMonth()];
}

export function formatYear(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return String(date.getUTCFullYear());
}

// Data por extenso: "22 de maio de 2026" (local/data do contrato no rodapé).
export function formatDateExtenso(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCDate()} de ${MONTHS[date.getUTCMonth()]} de ${date.getUTCFullYear()}`;
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
      path.resolve(process.cwd(), 'public/logo-safras-color.png'),
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

    // Faixa de rótulo (cinza) full-width — ex.: "QUANTIDADES E VALORES". Altura 14.
    const grayLabel = (title, top) => {
      const h = 14;
      page.drawRectangle({
        x: MARGIN,
        y: top - h,
        width: contentW,
        height: h,
        color: LABEL_BG,
        borderColor: LINE,
        borderWidth: 0.5,
      });
      page.drawText(fitText(title, fontBold, 8, contentW - 12), {
        x: MARGIN + 6,
        y: top - 10,
        size: 8,
        font: fontBold,
        color: BLACK,
      });
      return h;
    };

    // Linha de identificação: rótulos inline "Label: value", distribuídos. Altura 16.
    const idRow = (top, fields) => {
      const colW = contentW / fields.length;
      fields.forEach(([label, value], i) => {
        const cx = MARGIN + i * colW;
        const labelText = `${label}: `;
        page.drawText(labelText, { x: cx, y: top - 9, size: 8, font: fontBold, color: BLACK });
        const lw = fontBold.widthOfTextAtSize(labelText, 8);
        page.drawText(fitText(emptyToDash(value), font, 8, colW - lw - 4), {
          x: cx + lw,
          y: top - 9,
          size: 8,
          font,
          color: BLACK,
        });
      });
      return 16;
    };

    // Fila de N caixas (rótulo cinza em cima + valor centralizado embaixo).
    const boxRow = (top, boxes) => {
      const colW = contentW / boxes.length;
      const hdrH = 14;
      const valH = 16;
      boxes.forEach(([label, value], i) => {
        const bx = MARGIN + i * colW;
        const w = colW - 3;
        page.drawRectangle({
          x: bx,
          y: top - hdrH,
          width: w,
          height: hdrH,
          color: LABEL_BG,
          borderColor: LINE,
          borderWidth: 0.5,
        });
        page.drawText(fitText(label.toUpperCase(), fontBold, 6.5, w - 6), {
          x: bx + 3,
          y: top - 10,
          size: 6.5,
          font: fontBold,
          color: BLACK,
        });
        page.drawRectangle({
          x: bx,
          y: top - hdrH - valH,
          width: w,
          height: valH,
          borderColor: LINE,
          borderWidth: 0.5,
          color: WHITE,
        });
        const vt = fitText(emptyToDash(value), font, 8, w - 6);
        const vw = font.widthOfTextAtSize(vt, 8);
        page.drawText(vt, {
          x: bx + (w - vw) / 2,
          y: top - hdrH - 11,
          size: 8,
          font,
          color: BLACK,
        });
      });
      return hdrH + valH;
    };

    // Caixa com borda + campos inline "Label: value" (1+ linhas). Altura determinística.
    const inlineBox = (top, fieldRows) => {
      const pad = 6;
      const lineH = 12;
      const height = pad + fieldRows.length * lineH + pad - 4;
      page.drawRectangle({
        x: MARGIN,
        y: top - height,
        width: contentW,
        height,
        borderColor: LINE,
        borderWidth: 0.5,
        color: WHITE,
      });
      fieldRows.forEach((fields, r) => {
        const colW = contentW / fields.length;
        const cy = top - pad - 8 - r * lineH;
        fields.forEach(([label, value], i) => {
          const cx = MARGIN + pad + i * colW;
          const labelText = `${label}: `;
          page.drawText(labelText, { x: cx, y: cy, size: 8, font: fontBold, color: BLACK });
          const lw = fontBold.widthOfTextAtSize(labelText, 8);
          page.drawText(fitText(emptyToDash(value), font, 8, colW - lw - 8), {
            x: cx + lw,
            y: cy,
            size: 8,
            font,
            color: BLACK,
          });
        });
      });
      return height;
    };

    // Caixa com rótulo VERTICAL à esquerda (Observação/Descrição) + texto (wrap).
    const verticalLabelBox = (top, label, value) => {
      const labelW = 16;
      const pad = 6;
      const lineH = 10;
      const innerW = contentW - labelW - 2 * pad;
      const text = value && String(value).trim() ? String(value) : '—';
      let lines = wrapText(text, font, 8, innerW);
      if (lines.length > 3) {
        lines = lines.slice(0, 3);
        lines[2] = `${lines[2].replace(/\s*\S*$/, '')}...`;
      }
      // Altura cabe o conteúdo E o rótulo vertical (que ocupa labelTextW na vertical).
      const labelTextW = fontBold.widthOfTextAtSize(label, 7);
      const height = Math.max(labelTextW + 12, pad + lines.length * lineH + pad);
      page.drawRectangle({
        x: MARGIN,
        y: top - height,
        width: contentW,
        height,
        borderColor: LINE,
        borderWidth: 0.5,
        color: WHITE,
      });
      page.drawLine({
        start: { x: MARGIN + labelW, y: top },
        end: { x: MARGIN + labelW, y: top - height },
        thickness: 0.5,
        color: LINE,
      });
      // Rótulo girado 90° e CENTRALIZADO na vertical da caixa.
      page.drawText(label, {
        x: MARGIN + 11,
        y: top - height + (height - labelTextW) / 2,
        size: 7,
        font: fontBold,
        color: BLACK,
        rotate: degrees(90),
      });
      let cy = top - pad - 8;
      for (const line of lines) {
        page.drawText(line, { x: MARGIN + labelW + pad, y: cy, size: 8, font, color: BLACK });
        cy -= lineH;
      }
      return height;
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

    // ---------- Cabeçalho (branco) — logo à esquerda + emissor à direita ----------
    // Espelha o contrato legado (S60): sem faixa verde; o status NÃO entra (D63).
    if (logo) {
      const logoH = 38;
      const logoW = (logo.width / logo.height) * logoH;
      page.drawImage(logo, { x: MARGIN, y: PAGE_H - 26 - logoH, width: logoW, height: logoH });
    }
    const rightX = PAGE_W - MARGIN;
    const drawRight = (text, ty, size, bold) => {
      const f = bold ? fontBold : font;
      const t = fitText(text, f, size, contentW - 130);
      const w = f.widthOfTextAtSize(t, size);
      page.drawText(t, { x: rightX - w, y: ty, size, font: f, color: BLACK });
    };
    drawRight(issuer.name, PAGE_H - 30, 11, true);
    drawRight(issuer.addressStreet ?? '', PAGE_H - 42, 8, false);
    drawRight(issuer.cityUf ?? '', PAGE_H - 52, 8, false);
    drawRight(`Bairro: ${issuer.district ?? ''}`, PAGE_H - 62, 8, false);
    drawRight(`CNPJ: ${issuer.cnpj ?? ''}`, PAGE_H - 72, 8, false);
    drawRight(`Telefone: ${issuer.phone ?? ''}`, PAGE_H - 82, 8, false);
    let y = PAGE_H - 96;

    // ---------- Título (faixa cinza) ----------
    const titleBarH = 18;
    page.drawRectangle({
      x: MARGIN,
      y: y - titleBarH,
      width: contentW,
      height: titleBarH,
      color: LABEL_BG,
      borderColor: LINE,
      borderWidth: 0.5,
    });
    const titleText = 'CONTRATO DE COMPRA E VENDA DE CAFÉ';
    const titleW = fontBold.widthOfTextAtSize(titleText, 11);
    page.drawText(titleText, {
      x: (PAGE_W - titleW) / 2,
      y: y - 13,
      size: 11,
      font: fontBold,
      color: BLACK,
    });
    y -= titleBarH + 6;

    // ---------- Identificação (rótulos inline) ----------
    y -= idRow(y, [
      ['Nº. Contrato', contract.contractNumber],
      ['Nº. Compra', contract.purchaseNumber],
      ['Nº. Lote', lotNumber],
      ['Mês', formatMonthExtenso(contract.contractDate)],
      ['Ano', formatYear(contract.contractDate)],
    ]);
    y -= 6;

    // ---------- Comprador | Armazém do comprador (LAYOUT MANTIDO) ----------
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

    // ---------- Vendedor | Armazém do vendedor (LAYOUT MANTIDO) ----------
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
      ) + 8;

    // ---------- Forma | Modalidade | Embalagem | Faturamento | Pagamento ----------
    y -= boxRow(y, [
      ['Forma de pagamento', contract.paymentFormText],
      ['Modalidade', contract.modalityText],
      ['Embalagem', contract.packagingText],
      ['Faturamento', formatDateBR(contract.invoiceDate)],
      ['Pagamento', formatDateBR(contract.paymentDate)],
    ]);
    y -= 8;

    // ---------- Quantidades e valores (corretagem impressa em %) ----------
    y -= grayLabel('QUANTIDADES E VALORES', y);
    y -= inlineBox(y, [
      [
        ['Qtd.', contract.quantitySacks != null ? `${contract.quantitySacks} sacas` : null],
        ['Vlr. Saca', formatCurrencyBRL(contract.unitPrice)],
        ['Peso', formatKg(contract.weightKg)],
        ['C. Vend.', formatPercent(contract.sellerBrokeragePct)],
        ['C. Comp.', formatPercent(contract.buyerBrokeragePct)],
      ],
    ]);
    y -= 8;

    // ---------- Banco do vendedor ----------
    const bank = contract.sellerBankSnapshot;
    y -= grayLabel('BANCO DO VENDEDOR', y);
    y -= inlineBox(y, [
      [
        [
          'Banco',
          bank
            ? [bank.bankName, bank.compeCode ? `(${bank.compeCode})` : null]
                .filter(Boolean)
                .join(' ')
            : null,
        ],
        ['Agência', bank?.agency],
        ['Conta', bank?.accountNumber],
        ['Chave PIX', bank?.pixKey],
      ],
      [
        ['Titular', bank?.holderName],
        ['CNPJ/CPF', formatDocument(bank?.holderTaxId)],
      ],
    ]);
    y -= 10;

    // ---------- Observação / Descrição (rótulo vertical) ----------
    y -= verticalLabelBox(y, 'OBSERVAÇÃO', contract.observations);
    y -= 6;
    y -= verticalLabelBox(y, 'DESCRIÇÃO', contract.description);

    // ---------- Local + data + assinaturas (empurrados p/ o rodapé) ----------
    // Sem cláusula (decisão do usuário). Empurra o bloco pro fundo quando sobra
    // espaço (como no legado); se o conteúdo descer demais, flui logo abaixo.
    const dateLine = `${issuer.city ?? ''}, ${formatDateExtenso(contract.contractDate) ?? ''}.`;
    const footerDateY = Math.min(y - 14, 170);
    page.drawText(dateLine, { x: MARGIN, y: footerDateY, size: 9, font, color: BLACK });

    const sigColW = (contentW - 40) / 2;
    const sigY = footerDateY - 48;
    const sigLine = (label, x, sy) => {
      page.drawLine({
        start: { x, y: sy },
        end: { x: x + sigColW, y: sy },
        thickness: 0.7,
        color: rgb(0.3, 0.3, 0.3),
      });
      const lw = font.widthOfTextAtSize(label, 8);
      page.drawText(label, { x: x + (sigColW - lw) / 2, y: sy - 11, size: 8, font, color: MUTED });
    };
    sigLine('Comprador', MARGIN, sigY);
    sigLine('Corretor', MARGIN + sigColW + 40, sigY);

    const bytes = await pdfDoc.save();
    const buffer = Buffer.from(bytes);
    const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
    return { buffer, checksumSha256 };
  }
}
