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

// Quebra `text` em até `maxLines` linhas por LARGURA, no nível de CARACTERE —
// serve p/ valores sem espaços (chave PIX/UUID/e-mail), que o wrapText (por
// palavra) não quebraria. Cada posição de `widths` é a largura útil da linha; se
// ainda sobrar texto na última linha, ela é truncada com "...".
function breakToWidth(text, font, size, widths, maxLines = widths.length) {
  const s = String(text ?? '');
  const lines = [];
  let i = 0;
  for (let line = 0; line < maxLines && i < s.length; line++) {
    const w = widths[Math.min(line, widths.length - 1)];
    let count = 0;
    while (i + count < s.length && font.widthOfTextAtSize(s.slice(i, i + count + 1), size) <= w) {
      count++;
    }
    if (count === 0) count = 1; // garante progresso mesmo em coluna muito estreita
    if (line === maxLines - 1 && i + count < s.length) {
      let sub = s.slice(i, i + count);
      while (sub.length > 1 && font.widthOfTextAtSize(`${sub}...`, size) > w) {
        sub = sub.slice(0, -1);
      }
      lines.push(`${sub}...`);
      i = s.length;
    } else {
      lines.push(s.slice(i, i + count));
      i += count;
    }
  }
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

// Valor de campo em CAIXA ALTA (S74): os VALORES do contrato não têm minúsculas
// (rótulos/títulos dos campos permanecem como definidos). "—" quando vazio.
function dashUpper(value) {
  return emptyToDash(value).toUpperCase();
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

    // Card com borda: cabeçalho CINZA (título CENTRALIZADO, escuro, maiúsculas —
    // mesmo formato das caixas Forma/Modalidade e das faixas de seção, S74) +
    // linhas [label, value] (sempre presentes; "—" quando vazio). Altura
    // determinística. Retorna a altura.
    const drawCard = ({ x, width, top, title, rows }) => {
      const pad = 7;
      const headerH = 16;
      const lineH = 11;
      const height = headerH + pad + rows.length * lineH + pad;
      // corpo branco (card inteiro)
      page.drawRectangle({
        x,
        y: top - height,
        width,
        height,
        borderColor: LINE,
        borderWidth: 0.8,
        color: WHITE,
      });
      // cabeçalho cinza no topo do card
      page.drawRectangle({
        x,
        y: top - headerH,
        width,
        height: headerH,
        color: LABEL_BG,
        borderColor: LINE,
        borderWidth: 0.5,
      });
      // título centralizado
      const titleText = fitText(title.toUpperCase(), fontBold, 8, width - 10);
      const titleW = fontBold.widthOfTextAtSize(titleText, 8);
      page.drawText(titleText, {
        x: x + (width - titleW) / 2,
        y: top - 11,
        size: 8,
        font: fontBold,
        color: BLACK,
      });
      let cy = top - headerH - pad - 6;
      for (const [label, value] of rows) {
        const labelText = `${label}: `;
        page.drawText(labelText, { x: x + pad, y: cy, size: 8, font: fontBold, color: BLACK });
        const labelW = fontBold.widthOfTextAtSize(labelText, 8);
        page.drawText(fitText(dashUpper(value), font, 8, width - 2 * pad - labelW), {
          x: x + pad + labelW,
          y: cy,
          size: 8,
          font,
          color: BLACK,
        });
        cy -= lineH;
      }
      return height;
    };

    // Faixa de rótulo (cinza) full-width — ex.: "QUANTIDADES E VALORES".
    const grayLabel = (title, top) => {
      const h = 16;
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
        x: MARGIN + 7,
        y: top - 11,
        size: 8,
        font: fontBold,
        color: BLACK,
      });
      return h;
    };

    // Linha de identificação (S74). O 1º campo (Nº Contrato, formato fixo) cola à
    // esquerda; o 2º (Nº Compra) vem logo em seguida, PRÓXIMO, e recebe o MIOLO da
    // linha como área de valor (o Nº de Compra pode ser grande); os demais
    // (Lote/Mês/Ano) ficam agrupados à direita, o último na margem direita.
    // Altura 16.
    const GAP_CC = 12; // Nº Contrato -> Nº Compra (aproximar)
    const GAP_R = 16; // gaps do grupo da direita (e antes dele)
    const idRow = (top, fields) => {
      const ty = top - 9;
      const measure = ([label, value], valueCap) => {
        const labelText = `${label}: `;
        const lw = fontBold.widthOfTextAtSize(labelText, 8);
        const valueText = fitText(dashUpper(value), font, 8, Math.max(20, valueCap));
        const vw = font.widthOfTextAtSize(valueText, 8);
        return { labelText, lw, valueText, width: lw + vw };
      };
      const draw = (m, x) => {
        page.drawText(m.labelText, { x, y: ty, size: 8, font: fontBold, color: BLACK });
        page.drawText(m.valueText, { x: x + m.lw, y: ty, size: 8, font, color: BLACK });
      };

      const [contrato, compra, ...right] = fields;
      // Grupo da direita (Lote/Mês/Ano): larguras naturais, colado à direita.
      const rightM = right.map((f) => measure(f, contentW * 0.22));
      const rightW = rightM.reduce((acc, m) => acc + m.width, 0) + GAP_R * (rightM.length - 1);
      const rightStartX = MARGIN + contentW - rightW;

      const contratoM = measure(contrato, contentW * 0.25);
      draw(contratoM, MARGIN);
      // Compra logo após o Contrato, ocupando o miolo até o grupo da direita.
      const compraX = MARGIN + contratoM.width + GAP_CC;
      const compraM = measure(compra, rightStartX - GAP_R - compraX);
      draw(compraM, compraX);

      let rx = rightStartX;
      for (const m of rightM) {
        draw(m, rx);
        rx += m.width + GAP_R;
      }
      return 16;
    };

    // Fila de N caixas (rótulo cinza CENTRALIZADO em cima + valor centralizado embaixo).
    const boxRow = (top, boxes) => {
      const colW = contentW / boxes.length;
      const hdrH = 16;
      const valH = 20;
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
        const lt = fitText(label.toUpperCase(), fontBold, 6.5, w - 6);
        const ltw = fontBold.widthOfTextAtSize(lt, 6.5);
        page.drawText(lt, {
          x: bx + (w - ltw) / 2,
          y: top - 11,
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
        const vt = fitText(dashUpper(value), font, 8, w - 6);
        const vw = font.widthOfTextAtSize(vt, 8);
        page.drawText(vt, {
          x: bx + (w - vw) / 2,
          y: top - hdrH - 13,
          size: 8,
          font,
          color: BLACK,
        });
      });
      return hdrH + valH;
    };

    // Caixa com borda + campos inline "Label: value" (1+ linhas). Altura
    // determinística. Uma célula `null` fica em branco mas PRESERVA a coluna —
    // permite grids com célula final vazia mantendo o alinhamento vertical.
    // `colWeights` (opcional) = pesos das colunas (mesmos p/ todas as linhas →
    // colunas alinhadas); sem pesos, colunas iguais.
    const inlineBox = (top, fieldRows, colWeights = null) => {
      const pad = 9;
      const lineH = 15;
      const height = pad + fieldRows.length * lineH + pad - 6;
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
        const weights = colWeights ?? fields.map(() => 1);
        const totalWeight = weights.reduce((acc, w) => acc + w, 0);
        // x inicial + largura de cada coluna (somam contentW).
        let acc = 0;
        const cols = weights.map((w) => {
          const col = {
            x: MARGIN + pad + (acc / totalWeight) * contentW,
            w: (w / totalWeight) * contentW,
          };
          acc += w;
          return col;
        });
        const cy = top - pad - 8 - r * lineH;
        fields.forEach((field, i) => {
          if (!field) return; // célula vazia — mantém a coluna alinhada, sem desenhar
          const [label, value, opts] = field;
          const { x: cx, w: colW } = cols[i];
          const labelText = `${label}: `;
          page.drawText(labelText, { x: cx, y: cy, size: 8, font: fontBold, color: BLACK });
          const lw = fontBold.widthOfTextAtSize(labelText, 8);
          const availW = colW - lw - 8;
          // valor em CAIXA ALTA, EXCETO com keepCase (ex.: chave PIX, cujas
          // letras podem ser sensíveis a maiúsculas/minúsculas — S74).
          const valueText = opts?.keepCase ? emptyToDash(value) : dashUpper(value);
          const wrapDown = opts?.wrapDown ?? 1;
          if (wrapDown > 1) {
            // valor longo (ex.: chave PIX) quebra por caractere em até `wrapDown`
            // linhas, descendo pela coluna — ocupa a(s) célula(s) vazia(s) abaixo.
            const parts = breakToWidth(valueText, font, 8, Array(wrapDown).fill(availW));
            parts.forEach((part, k) => {
              page.drawText(part, { x: cx + lw, y: cy - k * lineH, size: 8, font, color: BLACK });
            });
          } else {
            page.drawText(fitText(valueText, font, 8, availW), {
              x: cx + lw,
              y: cy,
              size: 8,
              font,
              color: BLACK,
            });
          }
        });
      });
      return height;
    };

    // Caixa com rótulo VERTICAL à esquerda (Observação/Descrição) + texto em
    // CAIXA ALTA (S74). Altura FIXA (comporta o rótulo vertical + ~3 linhas no
    // tamanho padrão 8). O texto SE ADAPTA: mantém 8 quando cabe e ENCOLHE a
    // fonte (até um mínimo) pra caber todo o conteúdo sem truncar (S74).
    const verticalLabelBox = (top, label, value) => {
      const labelW = 18;
      const pad = 9;
      const DEFAULT_SIZE = 8;
      const MIN_SIZE = 5.5;
      const LH = 1.5; // entrelinha proporcional (8 -> 12, como antes)
      const innerW = contentW - labelW - 2 * pad;
      const labelTextW = fontBold.widthOfTextAtSize(label, 7);
      // Altura fixa: rótulo vertical vs. ~3 linhas no tamanho padrão.
      const height = Math.max(labelTextW + 16, pad + 3 * (DEFAULT_SIZE * LH) + pad);
      const innerH = height - 2 * pad;

      const text = value && String(value).trim() ? String(value).toUpperCase() : '—';

      // Maior tamanho (<= padrão) cujo texto quebrado caiba em innerH.
      let size = DEFAULT_SIZE;
      let lines = wrapText(text, font, size, innerW);
      while (size > MIN_SIZE && lines.length * (size * LH) > innerH) {
        size = Math.max(MIN_SIZE, size - 0.5);
        lines = wrapText(text, font, size, innerW);
      }
      // Rede de segurança: se nem no mínimo couber, trunca o excedente.
      const maxLines = Math.max(1, Math.floor(innerH / (size * LH)));
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\S*$/, '')}...`;
      }

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
      let cy = top - pad - size;
      for (const line of lines) {
        page.drawText(line, { x: MARGIN + labelW + pad, y: cy, size, font, color: BLACK });
        cy -= size * LH;
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
    // Logo à MESMA ALTURA do bloco de emissor à direita (S74): topo alinhado ao
    // topo do nome (PAGE_H-22) e base alinhada à baseline da última linha
    // (Telefone, PAGE_H-84) → 62pt de altura.
    if (logo) {
      const logoH = 62;
      const logoW = (logo.width / logo.height) * logoH;
      page.drawImage(logo, { x: MARGIN, y: PAGE_H - 22 - logoH, width: logoW, height: logoH });
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
    y -= titleBarH + 12;

    // ---------- Identificação (rótulos inline) ----------
    y -= idRow(y, [
      ['Nº. Contrato', contract.contractNumber],
      ['Nº. Compra', contract.purchaseNumber],
      ['Nº. Lote', lotNumber],
      ['Mês', formatMonthExtenso(contract.contractDate)],
      ['Ano', formatYear(contract.contractDate)],
    ]);
    y -= 14;

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
      ) + 14;

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
      ) + 14;

    // ---------- Forma | Modalidade | Embalagem | Faturamento | Pagamento ----------
    y -= boxRow(y, [
      ['Forma de pagamento', contract.paymentFormText],
      ['Modalidade', contract.modalityText],
      ['Embalagem', contract.packagingText],
      ['Faturamento', formatDateBR(contract.invoiceDate)],
      ['Pagamento', formatDateBR(contract.paymentDate)],
    ]);
    y -= 16;

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
    y -= 16;

    // ---------- Banco do vendedor ----------
    // Sem "Titular" (S74). Grid 3 colunas × 2 linhas: [Banco | Agência | Chave
    // PIX] / [CNPJ-CPF | Conta | —]. Colunas: Banco+CNPJ, Agência+Conta, Chave
    // PIX. Pesos 2/1/2: Banco e Chave PIX (longos) ganham largura. A Chave PIX
    // longa (ex.: UUID) quebra em 2 linhas ocupando a célula vazia abaixo dela
    // (wrapDown), em vez de truncar (S74). Valores em CAIXA ALTA, MENOS a chave
    // PIX (keepCase — pode ter letras sensíveis a maiúsc/minúsc).
    const bank = contract.sellerBankSnapshot;
    y -= grayLabel('BANCO DO VENDEDOR', y);
    y -= inlineBox(
      y,
      [
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
          ['Chave PIX', bank?.pixKey, { wrapDown: 2, keepCase: true }],
        ],
        [['CNPJ/CPF', formatDocument(bank?.holderTaxId)], ['Conta', bank?.accountNumber], null],
      ],
      [2, 1, 2]
    );
    y -= 16;

    // ---------- Observação / Descrição (rótulo vertical) ----------
    y -= verticalLabelBox(y, 'OBSERVAÇÃO', contract.observations);
    y -= 10;
    y -= verticalLabelBox(y, 'DESCRIÇÃO', contract.description);

    // ---------- Local + data + assinaturas (3 numa linha, empurrados p/ o rodapé) ----------
    // Sem cláusula (decisão do usuário). Empurra o bloco pro fundo quando sobra
    // espaço (como no legado); se o conteúdo descer demais, flui logo abaixo.
    const dateLine = `${issuer.city ?? ''}, ${formatDateExtenso(contract.contractDate) ?? ''}.`;
    const footerDateY = Math.min(y - 18, 150);
    page.drawText(dateLine, { x: MARGIN, y: footerDateY, size: 9, font, color: BLACK });

    // 3 assinaturas na MESMA linha: Comprador · Vendedor · Corretor.
    const sigGap = 22;
    const sigColW = (contentW - 2 * sigGap) / 3;
    const sigY = footerDateY - 52;
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
    sigLine('Vendedor', MARGIN + sigColW + sigGap, sigY);
    sigLine('Corretor', MARGIN + 2 * (sigColW + sigGap), sigY);

    const bytes = await pdfDoc.save();
    const buffer = Buffer.from(bytes);
    const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
    return { buffer, checksumSha256 };
  }

  // Espelho de Corretagem (Fase E): demonstrativo de comissao DERIVADO de UM
  // contrato (D70), on-demand. `side` = 'seller' | 'buyer' = a parte a quem o
  // espelho e enderecado (D72): define o CLIENTE (topo) e a comissao impressa
  // (sellerBrokerageValue/buyerBrokerageValue). Layout do legado: cabecalho do
  // emissor + faixa-titulo + CLIENTE + tabela de 1 linha + TOTAL + dados
  // bancarios da corretora (rodape, D74). Pagina unica. contract = view de
  // getSaleContract (decimais como number, datas ISO, snapshots como objetos).
  async renderEspelhoPdf(contract, { side, issuer }) {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const logoBytes = await tryReadPng(this.logoPath);
    const logo = logoBytes ? await pdfDoc.embedPng(logoBytes).catch(() => null) : null;

    const contentW = PAGE_W - 2 * MARGIN;
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

    const isSeller = side === 'seller';
    const partySnap = isSeller ? contract.sellerSnapshot : contract.buyerSnapshot;
    const clientName = snapshotName(partySnap) ?? '—';
    const commission = isSeller ? contract.sellerBrokerageValue : contract.buyerBrokerageValue;
    const agioLabel =
      contract.agioDesagioType === 'AGIO'
        ? 'Ágio'
        : contract.agioDesagioType === 'DESAGIO'
          ? 'Deságio'
          : '';
    // Numero BR com 2 casas, SEM "R$" (como no legado); null -> vazio.
    const dec = (value) => {
      const n = decimalToNumber(value);
      return n === null ? '' : DEC2.format(n);
    };

    // ---------- Cabecalho (logo a esquerda + emissor a direita) — igual ao contrato ----------
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

    // ---------- Titulo (faixa cinza) ----------
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
    const titleText = 'ESPELHO DE CORRETAGEM';
    const titleW = fontBold.widthOfTextAtSize(titleText, 11);
    page.drawText(titleText, {
      x: (PAGE_W - titleW) / 2,
      y: y - 13,
      size: 11,
      font: fontBold,
      color: BLACK,
    });
    y -= titleBarH + 16;

    // ---------- CLIENTE ----------
    const clienteLabel = 'CLIENTE: ';
    page.drawText(clienteLabel, { x: MARGIN, y, size: 9, font: fontBold, color: BLACK });
    const clw = fontBold.widthOfTextAtSize(clienteLabel, 9);
    page.drawText(fitText(clientName, font, 9, contentW - clw), {
      x: MARGIN + clw,
      y,
      size: 9,
      font,
      color: BLACK,
    });
    y -= 18;

    // ---------- Tabela (cabecalho + 1 linha de dados) ----------
    // 10 colunas finas (pesos -> larguras). Valores BR sem "R$" (como o legado).
    const columns = [
      { label: 'N.º Contrato', value: contract.contractNumber, weight: 8.5 },
      { label: 'Data', value: formatDateBR(contract.contractDate), weight: 8 },
      { label: 'Pagamento', value: formatDateBR(contract.paymentDate), weight: 8 },
      { label: 'Preço', value: dec(contract.unitPrice), weight: 7.5 },
      { label: 'Sacas', value: dec(contract.quantitySacks), weight: 7 },
      { label: 'Ágio/Deságio', value: agioLabel, weight: 9 },
      { label: 'Valor', value: dec(contract.agioDesagioValue ?? 0), weight: 6.5 },
      { label: 'Valor Comissão', value: dec(commission), weight: 9.5 },
      { label: 'Nº Compra', value: contract.purchaseNumber, weight: 7.5 },
      { label: 'Comprador / Vendedor', value: clientName, weight: 19 },
    ];
    const totalWeight = columns.reduce((sum, c) => sum + c.weight, 0);
    let cx = MARGIN;
    const colX = columns.map((c) => {
      const w = (c.weight / totalWeight) * contentW;
      const x = cx;
      cx += w;
      return { x, w };
    });
    const hLine = (ly) =>
      page.drawLine({
        start: { x: MARGIN, y: ly },
        end: { x: MARGIN + contentW, y: ly },
        thickness: 0.6,
        color: LINE,
      });
    const headerY = y;
    hLine(headerY + 4);
    columns.forEach((c, i) => {
      const { x, w } = colX[i];
      page.drawText(fitText(c.label, fontBold, 6.5, w - 4), {
        x: x + 2,
        y: headerY - 6,
        size: 6.5,
        font: fontBold,
        color: BLACK,
      });
    });
    hLine(headerY - 11);
    const rowY = headerY - 14;
    columns.forEach((c, i) => {
      const { x, w } = colX[i];
      page.drawText(fitText(c.value, font, 7, w - 4), {
        x: x + 2,
        y: rowY - 3,
        size: 7,
        font,
        color: BLACK,
      });
    });
    hLine(rowY - 9);
    y = rowY - 9 - 18;

    // ---------- TOTAL (alinhado a direita) ----------
    const totalText = `TOTAL: ${formatCurrencyBRL(commission) ?? 'R$ 0,00'}`;
    const totalW = fontBold.widthOfTextAtSize(totalText, 10);
    page.drawText(totalText, {
      x: MARGIN + contentW - totalW,
      y,
      size: 10,
      font: fontBold,
      color: BLACK,
    });
    y -= 36;

    // ---------- Dados bancarios da corretora (centralizado, D74) ----------
    const center = (text, ty, size, bold) => {
      const f = bold ? fontBold : font;
      const t = fitText(text, f, size, contentW);
      const w = f.widthOfTextAtSize(t, size);
      page.drawText(t, { x: (PAGE_W - w) / 2, y: ty, size, font: f, color: BLACK });
      return w;
    };
    const centerPair = (label, value, ty, size) => {
      const lt = `${label} `;
      const lw = fontBold.widthOfTextAtSize(lt, size);
      const vt = fitText(value ?? '', font, size, contentW - lw);
      const vw = font.widthOfTextAtSize(vt, size);
      const startX = (PAGE_W - (lw + vw)) / 2;
      page.drawText(lt, { x: startX, y: ty, size, font: fontBold, color: BLACK });
      page.drawText(vt, { x: startX + lw, y: ty, size, font, color: BLACK });
    };
    const headW = center('DADOS BANCÁRIOS PARA PAGAMENTO:', y, 9, true);
    page.drawLine({
      start: { x: (PAGE_W - headW) / 2, y: y - 2 },
      end: { x: (PAGE_W + headW) / 2, y: y - 2 },
      thickness: 0.6,
      color: BLACK,
    });
    y -= 16;
    center(issuer.name, y, 8, false);
    y -= 12;
    center(issuer.bankName ?? '', y, 8, true);
    y -= 12;
    centerPair('Agência:', issuer.bankAgency, y, 8);
    y -= 12;
    centerPair('Conta Corrente:', issuer.bankAccount, y, 8);
    y -= 12;
    centerPair('CNPJ:', issuer.cnpj, y, 8);

    const bytes = await pdfDoc.save();
    const buffer = Buffer.from(bytes);
    const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
    return { buffer, checksumSha256 };
  }
}
