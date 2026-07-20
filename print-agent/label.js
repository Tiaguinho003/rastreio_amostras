import { LOGO_WIDTH_BYTES, LOGO_HEIGHT, LOGO_DATA } from './logo-data.js';
import {
  LOGO_INTERNAL_WIDTH_BYTES,
  LOGO_INTERNAL_HEIGHT,
  LOGO_INTERNAL_DATA,
} from './logo-internal-data.js';
// NB sobre logos: a etiqueta de amostra/controle interno (buildLabel) usa
// logo-internal-data.js (logo pequeno no topo esq.) e a de Envio
// (buildShippingLabel) usa logo-data.js (logo grande) — ambos hard-imports,
// cada etiqueta com seu logo no tamanho certo. Ja o logo da etiqueta de
// Aprovacao (logo-small-data.js) e carregado SOB DEMANDA dentro de
// buildCustomLabel (loadSmallLogo) DE PROPOSITO: se ele faltar (ex: deploy
// parcial), as demais etiquetas imprimem normalmente e a de Aprovacao so sai
// sem logo.

const ACCENT_MAP = {
  '\u00e0': 'a',
  '\u00e1': 'a',
  '\u00e2': 'a',
  '\u00e3': 'a',
  '\u00e4': 'a',
  '\u00c0': 'A',
  '\u00c1': 'A',
  '\u00c2': 'A',
  '\u00c3': 'A',
  '\u00c4': 'A',
  '\u00e8': 'e',
  '\u00e9': 'e',
  '\u00ea': 'e',
  '\u00eb': 'e',
  '\u00c8': 'E',
  '\u00c9': 'E',
  '\u00ca': 'E',
  '\u00cb': 'E',
  '\u00ec': 'i',
  '\u00ed': 'i',
  '\u00ee': 'i',
  '\u00ef': 'i',
  '\u00cc': 'I',
  '\u00cd': 'I',
  '\u00ce': 'I',
  '\u00cf': 'I',
  '\u00f2': 'o',
  '\u00f3': 'o',
  '\u00f4': 'o',
  '\u00f5': 'o',
  '\u00f6': 'o',
  '\u00d2': 'O',
  '\u00d3': 'O',
  '\u00d4': 'O',
  '\u00d5': 'O',
  '\u00d6': 'O',
  '\u00f9': 'u',
  '\u00fa': 'u',
  '\u00fb': 'u',
  '\u00fc': 'u',
  '\u00d9': 'U',
  '\u00da': 'U',
  '\u00db': 'U',
  '\u00dc': 'U',
  '\u00e7': 'c',
  '\u00c7': 'C',
  '\u00f1': 'n',
  '\u00d1': 'N',
  // Grau (e ordinal masculino) preservados pra "N\u00b0"/"N\u00ba" da etiqueta avulsa.
  // Emitidos como byte 0xB0 (latin1) \u2014 a impressao depende da code page da
  // impressora (verificar no print real; fallback "N." se nao sair).
  '\u00b0': '\u00b0',
  '\u00ba': '\u00b0',
};

function toAscii(text) {
  let result = '';
  for (const ch of text) {
    result += ACCENT_MAP[ch] || (ch.charCodeAt(0) < 128 ? ch : '');
  }
  return result;
}

function sanitize(text, maxLen) {
  let clean = toAscii(text || '---')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, ' ')
    .trim();
  if (clean.length > maxLen) {
    clean = clean.slice(0, maxLen - 3) + '...';
  }
  return clean;
}

function formatDate(isoDate) {
  if (!isoDate) return '---';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '---';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Calcula o layout (posicoes/fontes/divisorias/logo/QR ja resolvidos) SEM
// serializar TSPL. Fonte UNICA compartilhada por buildLabel (impressao) e pelo
// preview (scripts/preview-internal-label.mjs) — o que estoura no preview
// estoura na impressao.
//
// LAYOUT (etiqueta 100x35mm = 800x280 dots, 203dpi):
// - TERCO SUPERIOR: logo pequeno na ponta sup. esquerda + divisorias verticais
//   (mesma altura do logo) separando DATA | SAFRA | SACAS (label em cima, valor
//   embaixo; larguras proporcionais ao conteudo). Abaixo, divisoria horizontal.
// - DOIS TERCOS INFERIORES: LOTE grande centralizado na metade esquerda; na
//   metade direita ASPECTO (rotulo font1 + valor font4 1x) + QR ao lado,
//   centralizado na vertical da regiao. ASPECTO so aparece quando ha
//   classificacao com aspecto (senao a coluna direita fica vazia e o QR centra
//   na regiao). PADRAO foi REMOVIDO da etiqueta (2026-06-23); o ASPECTO mantem a
//   posicao que ocupava antes (2a linha do antigo bloco PADRAO+ASPECTO).
export function buildSampleLabelLayout(job) {
  const s = job.sample || {};
  const fw = (f) => TSPL_FONT_W[Number(f)] ?? 8;
  const fh = (f) => TSPL_FONT_H[Number(f)] ?? 12;

  const W = 800;
  const H = 280;
  const ML = 16;
  const MR = 16;
  const TOP = 10;
  const BOT = 10;

  const lot = sanitize(s.internalLotNumber || s.id, 7);
  const date = formatDate(s.registeredAt);
  const harvest = sanitize(s.declared?.harvest || '---', 10);
  const sacks = s.declared?.sacks != null ? sanitize(String(s.declared.sacks), 6) : '---';
  // Classificacao (so quando ha): cap conservador p/ o valor nunca encostar no
  // QR (ASPECTO font4 1x = 24/char). PADRAO nao e mais lido (removido da etiqueta).
  const aspecto = s.classification?.aspecto ? sanitize(String(s.classification.aspecto), 5) : null;
  const qrValue = sanitize(s.qrValue || s.id || lot, 100);

  const texts = [];
  const dividers = [];

  // ── TERCO SUPERIOR: logo + DATA | SAFRA | SACAS ──
  const LOGO_H = LOGO_INTERNAL_HEIGHT; // 84 (~1/3 de 280)
  const logoW = LOGO_INTERNAL_WIDTH_BYTES * 8; // 248
  const logo = {
    x: ML,
    y: TOP,
    widthBytes: LOGO_INTERNAL_WIDTH_BYTES,
    height: LOGO_INTERNAL_HEIGHT,
    data: LOGO_INTERNAL_DATA,
  };
  const bandTop = TOP;
  const bandBot = TOP + LOGO_H;

  // Divisoria vertical (mesma altura do logo) apos o logo.
  const vdivX = logo.x + logoW + 16;
  dividers.push({ x: vdivX, y: bandTop, width: 3, height: LOGO_H });

  // DATA | SAFRA | SACAS — label (font1) em cima, valor (font3) embaixo; 3
  // celulas separadas por divisoria vertical, larguras proporcionais ao conteudo.
  const infoStart = vdivX + 3 + 18;
  const infoEnd = W - MR;
  const LBL = '1';
  const VAL = '3';
  const blockH = fh(LBL) + 4 + fh(VAL);
  const lblY = bandTop + Math.floor((LOGO_H - blockH) / 2);
  const valY = lblY + fh(LBL) + 4;
  const CELL_PAD = 14;
  const topFields = [
    { label: 'DATA', value: date },
    { label: 'SAFRA', value: harvest },
    { label: 'SACAS', value: sacks },
  ];
  const topContentW = (f) => Math.max(f.value.length * fw(VAL), f.label.length * fw(LBL));
  const topWeights = topFields.map(topContentW);
  const topWsum = topWeights.reduce((a, b) => a + b, 0);
  const topNdiv = topFields.length - 1;
  const topUsable = infoEnd - infoStart - topNdiv * 3 - topFields.length * 2 * CELL_PAD;
  let cx = infoStart;
  topFields.forEach((f, i) => {
    const cw = 2 * CELL_PAD + Math.round((topUsable * topWeights[i]) / topWsum);
    const tx = cx + CELL_PAD;
    texts.push({ x: tx, y: lblY, font: LBL, xMul: 1, yMul: 1, bold: false, text: f.label });
    texts.push({ x: tx, y: valY, font: VAL, xMul: 1, yMul: 1, bold: true, text: f.value });
    cx += cw;
    if (i < topNdiv) {
      dividers.push({ x: cx, y: bandTop, width: 3, height: LOGO_H });
      cx += 3;
    }
  });

  // ── DIVISORIA HORIZONTAL ──
  const hDivY = bandBot + 6;
  dividers.push({ x: ML, y: hDivY, width: W - ML - MR, height: 3 });

  // ── DOIS TERCOS INFERIORES ──
  const regTop = hDivY + 6;
  const regBot = H - BOT;
  const regH = regBot - regTop;
  const regCY = regTop + Math.floor(regH / 2);

  // LOTE grande (font4 2x4 = 48x128/char), centralizado na metade esquerda.
  const LOT_F = '4';
  const lotXMul = 2;
  const lotYMul = 4;
  const lotCharW = fw(LOT_F) * lotXMul;
  const lotH = fh(LOT_F) * lotYMul;
  const halfW = Math.floor(W / 2);
  const lotW = lot.length * lotCharW;
  const lotX = Math.max(ML, Math.floor((halfW - lotW) / 2));
  const lotY = regCY - Math.floor(lotH / 2);
  texts.push({
    x: lotX,
    y: lotY,
    font: LOT_F,
    xMul: lotXMul,
    yMul: lotYMul,
    bold: true,
    text: lot,
  });

  // Metade direita: ASPECTO (so quando classificado) + QR ao lado.
  const rightX = halfW + 10;
  const QR_CELL = 5;
  const QR_MODULES = 21; // v1 (lote curto, alfanumerico ECC L)
  const qrSize = QR_CELL * QR_MODULES; // 105
  const qrX = W - MR - qrSize;

  // ASPECTO fixo na posicao que ocupava no layout anterior (PADRAO em cima +
  // ASPECTO embaixo, bloco centralizado em regH): o ASPECTO ficava na 2a linha.
  // Mantido nesse y EXATO pra o dado nao subir com a remocao do PADRAO. O VALOR
  // agora vai em font4 1x (metade do font4 2x anterior = -50% no tamanho), com a
  // MESMA ancora (canto sup. esq.) — encolhe pra baixo/direita, sem deslocar.
  if (aspecto) {
    const GAP = 18;
    const padBlockH = fh('1') + 3 + fh('4'); // bloco PADRAO antigo (47)
    const aspBlockH = fh('1') + 3 + fh('4') * 2; // bloco ASPECTO antigo, 2x (79)
    const oldStackTop = regTop + Math.floor((regH - (padBlockH + aspBlockH + GAP)) / 2);
    const aspectoY = oldStackTop + padBlockH + GAP; // 181 (2a linha do bloco antigo)
    texts.push({
      x: rightX,
      y: aspectoY,
      font: '1',
      xMul: 1,
      yMul: 1,
      bold: false,
      text: 'ASPECTO',
    });
    texts.push({
      x: rightX,
      y: aspectoY + fh('1') + 3,
      font: '4',
      xMul: 1,
      yMul: 1,
      bold: true,
      text: aspecto,
    });
  }

  // QR centralizado na vertical da regiao (regCY) — mesma posicao de hoje,
  // classificado ou nao (o bloco antigo tambem ficava centrado em regCY).
  const qrY = Math.round(regCY - qrSize / 2);
  const qr = { x: qrX, y: qrY, cell: QR_CELL, modules: QR_MODULES, size: qrSize, value: qrValue };

  return {
    width: W,
    height: H,
    copies: 1,
    logo,
    texts,
    dividers,
    qr,
    safeArea: { left: ML, right: W - MR, top: TOP, bottom: H - BOT },
  };
}

export function buildLabel(job) {
  const layout = buildSampleLabelLayout(job);
  const parts = [];

  // CLS + divisorias + textos (ascii). SIZE/GAP/DENSITY/etc. vivem em
  // calibratePrinter() (index.js), enviados uma unica vez no startup — re-enviar
  // a cada job disparava auto-calibracao esporadica (etiqueta em branco).
  const head = ['CLS', ''];
  for (const d of layout.dividers) {
    head.push(`BAR ${d.x},${d.y},${d.width},${d.height}`);
  }
  for (const t of layout.texts) {
    head.push(`TEXT ${t.x},${t.y},"${t.font}",0,${t.xMul},${t.yMul},"${t.text}"`);
    // Negrito por overstrike (2a passada 1 dot a direita), igual buildCustomLabel.
    if (t.bold) {
      head.push(`TEXT ${t.x + 1},${t.y},"${t.font}",0,${t.xMul},${t.yMul},"${t.text}"`);
    }
  }
  parts.push(Buffer.from(head.join('\r\n') + '\r\n', 'ascii'));

  // Logo bitmap (binario) no topo esquerdo.
  parts.push(
    Buffer.from(
      `BITMAP ${layout.logo.x},${layout.logo.y},${layout.logo.widthBytes},${layout.logo.height},0,`,
      'ascii'
    )
  );
  parts.push(layout.logo.data);
  parts.push(Buffer.from('\r\n', 'ascii'));

  // QR — mode A (alfanumerico: lote curto em digitos/maiusculas); ECC L.
  if (layout.qr) {
    parts.push(
      Buffer.from(
        `QRCODE ${layout.qr.x},${layout.qr.y},L,${layout.qr.cell},A,0,M2,"${layout.qr.value}"\r\n`,
        'ascii'
      )
    );
  }

  parts.push(Buffer.from(`PRINT 1,${layout.copies}\r\n`, 'ascii'));
  return Buffer.concat(parts);
}

// Etiqueta de Aprovacao (ex-avulsa, 100x35mm; calibracao de SIZE/GAP/DENSITY
// vive em calibratePrinter() no startup). Layout em FAIXAS — ver constantes
// abaixo. O preview (scripts/preview-custom-label.mjs) consome
// buildCustomLabelLayout, entao o que aparece la == o que imprime.

// Largura/altura (dots) das fontes internas TSPL usadas aqui.
const TSPL_FONT_W = { 1: 8, 2: 12, 3: 16, 4: 24 };
const TSPL_FONT_H = { 1: 12, 2: 20, 3: 24, 4: 32 };

// --- Layout em 2 COLUNAS (revisao 2026-07, mockup do usuario) ---
// ESQUERDA: logo + Nº FECHAMENTO + Nº COMPRA (numeros GRANDES = info principal).
// DIREITA: PRODUTOR + ARMAZEM + SACAS + LOTES. Cada campo = rotulo pequeno em
// cima + valor embaixo. Valor de 1 LINHA com AUTO-AJUSTE: maior tier que couber
// na largura; se estourar ate o menor, corta com reticencias. Lotes = grade FIXA
// de 4 colunas (fonte responsiva pela contagem/tamanho do codigo); vazio (futuro)
// = area reservada em branco. Geometria em dots (etiqueta 800x280 = 100x35mm).
const LABEL_W = 800;
const LABEL_H = 280;
const M_TOP = 16;
const M_BOTTOM = 16;
const M_LEFT = 20;
const M_RIGHT = 20;
const BAR_W = 3; // espessura da divisoria (BAR)
const COL_DIV_X = 240; // x da divisoria vertical entre as colunas
const COL_PAD = 10; // recuo do conteudo dentro da coluna

const LABEL_FONT = '1'; // rotulos pequenos (8x12)
const NUM_FONTS = ['4', '3', '2']; // fechamento/compra — GRANDES (info principal)
const NAME_FONTS = ['3', '2', '1']; // produtor/armazem — 1 linha, encolhe
const SACAS_FONTS = ['2', '1']; // sacas — menor (secundaria)
const LOT_FONTS = ['3', '2', '1']; // lotes na grade

// Coluna ESQUERDA (y do TOPO de cada elemento, em dots).
const LOGO_Y = 16;
const FECH_LABEL_Y = 118;
const FECH_VALUE_Y = 146;
const COMPRA_LABEL_Y = 200;
const COMPRA_VALUE_Y = 228;

// Coluna DIREITA.
const RIGHT_X = COL_DIV_X + BAR_W + 9; // 252
const PROD_LABEL_Y = 18;
const PROD_VALUE_Y = 38;
const ARM_LABEL_Y = 80;
const ARM_VALUE_Y = 100;
const SACAS_LABEL_Y = 142;
const SACAS_VALUE_Y = 160;
const LOTES_LABEL_Y = 192;
const GRID_TOP = 210;
const GRID_BOT = LABEL_H - M_BOTTOM; // 264
const LOTS_COLS = 4;
const LOTS_GAP = 10;
const LOTS_PAD = 6; // respiro horizontal do numero na celula

// Chaves normalizadas dos campos de valor unico (vindas do printLabel do modal;
// o LOTE e tratado a parte, como grade).
const KEY_COMPRA = 'N COMPRA';
const KEY_FECHAMENTO = 'N FECHAMENTO';
const KEY_SACAS = 'SACAS';
const KEY_PRODUTOR = 'PRODUT';
const KEY_ARMAZEM = 'ARMAZ';
const KEY_LOTE = 'LOTE';
// Carrega o logo pequeno sob demanda. Se logo-small-data.js nao existir,
// retorna null e a etiqueta de Aprovacao sai sem logo (a de amostra nao depende
// disso). Node faz cache do import, entao o custo so existe na 1a chamada.
async function loadSmallLogo() {
  try {
    const mod = await import('./logo-small-data.js');
    return {
      widthBytes: mod.LOGO_SMALL_WIDTH_BYTES,
      height: mod.LOGO_SMALL_HEIGHT,
      data: mod.LOGO_SMALL_DATA,
    };
  } catch {
    return null;
  }
}

// Normaliza o rotulo recebido pra casar com as chaves dos campos (remove
// "°"/"º"/":" e padroniza espacos/caixa). Ex.: "N° COMPRA:" -> "N COMPRA".
// CONTRATO: src/api/v1/backend-api.js reimplementa esta mesma norma pra detectar
// o 'LOTE' (cap/grade de lotes) — manter as duas copias em sincronia.
function normalizeFieldKey(label) {
  return label.replace(/[°º:]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// Maior fonte (de `fonts`, do maior pro menor) cujo texto em 1 linha cabe em
// `maxWidth` e cuja altura cabe em `maxHeight`. Se nem a menor couber, devolve a
// menor (o fitText corta como trava). Responsavel pela "responsividade" da
// fonte: campo/lote mais apertado -> fonte menor.
function pickFont(text, maxWidth, maxHeight, fonts) {
  for (const f of fonts) {
    const w = TSPL_FONT_W[Number(f)] ?? 8;
    const h = TSPL_FONT_H[Number(f)] ?? 12;
    if (text.length * w <= maxWidth && h <= maxHeight) {
      return f;
    }
  }
  return fonts[fonts.length - 1];
}

// Corta `text` pra caber em `maxWidth` na fonte dada (trava de seguranca; raro,
// porque a fonte ja foi escolhida pra caber).
function fitText(text, font, maxWidth) {
  const w = TSPL_FONT_W[Number(font)] ?? 8;
  const maxChars = Math.max(1, Math.floor(maxWidth / w));
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

// Separa o valor do campo LOTE numa lista (virgula ou quebra de linha).
function splitLots(value) {
  return String(value || '')
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Calcula o layout (posicoes/fontes/caixas ja resolvidas) SEM serializar TSPL.
// Fonte unica compartilhada por buildCustomLabel (impressao) e pelo preview.
// Retorna { width, height, copies, logo, texts, dividers, safeArea }.
export async function buildCustomLabelLayout(payload) {
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  if (lines.length === 0) {
    throw new Error('etiqueta avulsa sem linhas');
  }

  // Indexa as linhas recebidas pelo rotulo normalizado (robusto a ordem). O
  // payload so casa o VALOR pela chave; os rotulos impressos sao fixos do layout.
  const byKey = new Map();
  for (const line of lines) {
    byKey.set(normalizeFieldKey(sanitize(line?.label || '', 40)), line);
  }
  function valueOf(key) {
    const line = byKey.get(key);
    if (!line || typeof line.value !== 'string') return '';
    // Vazio retorna '' (campo em branco sai so com o rotulo; LOTE vazio nao
    // desenha grade — splitLots('') = []).
    const trimmed = line.value.trim();
    return trimmed ? sanitize(trimmed, 300) : '';
  }

  const texts = [];
  const dividers = [];

  // Rotulo pequeno (LABEL_FONT), sem ":".
  const pushLabel = (text, x, y) => {
    const t = sanitize(text || '', 40);
    if (t) texts.push({ x, y, font: LABEL_FONT, xMul: 1, yMul: 1, bold: false, text: t });
  };
  // Valor em negrito, 1 LINHA, fonte auto-ajustada (maior tier de `fonts` que
  // couber em `maxWidth`). Se nem o menor couber, corta com "..." (ASCII — o
  // serializador escreve em latin1, que nao tem as reticencias unicode).
  const pushValue = (rawValue, x, y, maxWidth, fonts) => {
    const value = rawValue || '';
    if (!value) return;
    const font = pickFont(value, maxWidth, LABEL_H, fonts);
    const charW = TSPL_FONT_W[Number(font)] ?? 8;
    let text = value;
    if (text.length * charW > maxWidth) {
      const maxChars = Math.max(1, Math.floor(maxWidth / charW) - 3);
      text = text.slice(0, maxChars) + '...';
    }
    texts.push({ x, y, font, xMul: 1, yMul: 1, bold: true, text });
  };

  // Logo no topo-esquerda (fica onde estava — opcional, degrada sem o arquivo).
  const logo = await loadSmallLogo();
  const logoOp = logo
    ? { widthBytes: logo.widthBytes, height: logo.height, x: M_LEFT, y: LOGO_Y, data: logo.data }
    : null;

  // ── COLUNA ESQUERDA: Nº FECHAMENTO + Nº COMPRA (numeros GRANDES) ──
  const leftMaxW = COL_DIV_X - M_LEFT - COL_PAD;
  pushLabel('Nº FECHAMENTO', M_LEFT, FECH_LABEL_Y);
  pushValue(valueOf(KEY_FECHAMENTO), M_LEFT, FECH_VALUE_Y, leftMaxW, NUM_FONTS);
  pushLabel('Nº COMPRA', M_LEFT, COMPRA_LABEL_Y);
  pushValue(valueOf(KEY_COMPRA), M_LEFT, COMPRA_VALUE_Y, leftMaxW, NUM_FONTS);

  // Divisoria vertical entre as colunas.
  dividers.push({ x: COL_DIV_X, y: M_TOP, width: BAR_W, height: LABEL_H - M_TOP - M_BOTTOM });

  // ── COLUNA DIREITA: PRODUTOR + ARMAZEM + SACAS + LOTES ──
  // -COL_PAD dá um respiro na borda direita (valores nao encostam na margem).
  const rightMaxW = LABEL_W - M_RIGHT - RIGHT_X - COL_PAD;
  pushLabel('PRODUTOR', RIGHT_X, PROD_LABEL_Y);
  pushValue(valueOf(KEY_PRODUTOR), RIGHT_X, PROD_VALUE_Y, rightMaxW, NAME_FONTS);
  pushLabel('ARMAZÉM', RIGHT_X, ARM_LABEL_Y);
  pushValue(valueOf(KEY_ARMAZEM), RIGHT_X, ARM_VALUE_Y, rightMaxW, NAME_FONTS);
  pushLabel('SACAS', RIGHT_X, SACAS_LABEL_Y);
  pushValue(valueOf(KEY_SACAS), RIGHT_X, SACAS_VALUE_Y, rightMaxW, SACAS_FONTS);
  pushLabel('LOTES', RIGHT_X, LOTES_LABEL_Y);

  // Grade de LOTES: FIXA de 4 colunas (codigos centralizados na celula). Fonte
  // responsiva pela contagem/tamanho do codigo. Vazio (futuro) = area reservada
  // em branco. O cap de 8 + "+" e aplicado no backend (a linha ja chega pronta).
  const lots = splitLots(valueOf(KEY_LOTE));
  if (lots.length > 0) {
    const cols = LOTS_COLS;
    const rows = Math.ceil(lots.length / cols);
    const gridW = LABEL_W - M_RIGHT - RIGHT_X;
    const cellW = Math.floor((gridW - (cols - 1) * LOTS_GAP) / cols);
    const cellH = Math.floor((GRID_BOT - GRID_TOP - (rows - 1) * LOTS_GAP) / rows);
    const longest = lots.reduce((m, l) => Math.max(m, l.length), 1);
    const lotFont = pickFont('0'.repeat(longest), cellW - 2 * LOTS_PAD, cellH, LOT_FONTS);
    const lotFontW = TSPL_FONT_W[Number(lotFont)] ?? 8;
    const lotFontH = TSPL_FONT_H[Number(lotFont)] ?? 12;
    for (let i = 0; i < lots.length; i += 1) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const cx = RIGHT_X + c * (cellW + LOTS_GAP);
      const cy = GRID_TOP + r * (cellH + LOTS_GAP);
      const lot = fitText(lots[i], lotFont, cellW - 2 * LOTS_PAD);
      texts.push({
        x: cx + Math.max(0, Math.floor((cellW - lot.length * lotFontW) / 2)),
        y: cy + Math.max(0, Math.floor((cellH - lotFontH) / 2)),
        font: lotFont,
        xMul: 1,
        yMul: 1,
        bold: true,
        text: lot,
      });
    }
  }

  const safeArea = {
    left: M_LEFT,
    right: LABEL_W - M_RIGHT,
    top: M_TOP,
    bottom: LABEL_H - M_BOTTOM,
  };

  return {
    width: LABEL_W,
    height: LABEL_H,
    copies: 1,
    logo: logoOp,
    texts,
    dividers,
    safeArea,
  };
}

export async function buildCustomLabel(payload) {
  const layout = await buildCustomLabelLayout(payload);
  const parts = [];

  // CLS + textos primeiro (texto em latin1 pra preservar o "°"); o BITMAP do
  // logo (binario) e o PRINT vao por ultimo. A ordem de desenho nao muda o
  // resultado (campos e logo nao se sobrepoem).
  const head = ['CLS', ''];
  // Divisorias (barras solidas: horizontais entre faixas + verticais nas colunas).
  for (const d of layout.dividers || []) {
    head.push(`BAR ${d.x},${d.y},${d.width},${d.height}`);
  }
  for (const t of layout.texts) {
    head.push(`TEXT ${t.x},${t.y},"${t.font}",0,${t.xMul},${t.yMul},"${t.text}"`);
    // Negrito: a fonte interna nao tem peso — simula com overstrike (2a
    // passada 1 dot a direita engrossa o traco).
    if (t.bold) {
      head.push(`TEXT ${t.x + 1},${t.y},"${t.font}",0,${t.xMul},${t.yMul},"${t.text}"`);
    }
  }
  parts.push(Buffer.from(head.join('\r\n') + '\r\n', 'latin1'));

  if (layout.logo) {
    parts.push(
      Buffer.from(
        `BITMAP ${layout.logo.x},${layout.logo.y},${layout.logo.widthBytes},${layout.logo.height},0,`,
        'latin1'
      )
    );
    parts.push(layout.logo.data);
    parts.push(Buffer.from('\r\n', 'latin1'));
  }

  parts.push(Buffer.from(`PRINT 1,${layout.copies}\r\n`, 'latin1'));
  return Buffer.concat(parts);
}

// ─────────────────────────────────────────────────────────────────────────
// Etiqueta de Envio (fase 5, 100x35mm = 800x280 dots). Layout: logo no topo-
// esquerda; QR do laudo a DIREITA (grande, so quando ha qrUrl = amostra
// CLASSIFIED); lote em destaque + data de envio / safra / sacas embaixo. SEM
// destinatario (decisao de produto). Sem qrUrl, a coluna do QR fica vazia e os
// dados usam a largura toda. Arquitetura espelha buildCustomLabel: o layout e
// calculado em buildShippingLabelLayout (compartilhado com o preview) e
// serializado em buildShippingLabel. O QR usa byte mode (B) porque a URL tem
// minusculas (alphanumeric-QR nao cobre).

// Formata 'YYYY-MM-DD' (date-only, sem fuso) como dd/mm/yyyy. NAO usa new Date()
// (que deslocaria o dia pelo timezone em datas sem hora) — o sentDate do envio
// chega como date-only.
function formatYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '---';
}

const SHIP_W = 800;
const SHIP_H = 280;
const SHIP_M = 20;
const SHIP_QR_CELL = 5; // dots por modulo (maior; QR v5 ~37 mod -> 185 dots)

export function buildShippingLabelLayout(payload) {
  const lot = sanitize(payload?.internalLotNumber || '---', 14);
  const sentDate = formatYmd(payload?.sentDate);
  const harvest = sanitize(payload?.harvest || '---', 12);
  const sacks =
    payload?.sacks !== undefined && payload?.sacks !== null && payload.sacks !== ''
      ? sanitize(String(payload.sacks), 6)
      : '---';
  const qrUrl =
    typeof payload?.qrUrl === 'string' && payload.qrUrl.trim()
      ? sanitize(payload.qrUrl.trim(), 300)
      : null;

  const texts = [];
  const dividers = [];
  const boxes = [];
  let qr = null;

  // Logo grande no topo-esquerda (fica onde estava).
  const logo = {
    widthBytes: LOGO_WIDTH_BYTES,
    height: LOGO_HEIGHT,
    x: SHIP_M,
    y: 16,
    data: LOGO_DATA,
  };
  const logoRight = logo.x + LOGO_WIDTH_BYTES * 8;

  // Borda direita da zona de dados (encosta na divisoria do QR quando ha QR).
  let zoneRight = SHIP_W - SHIP_M;

  // ── QR + "LAUDO" a direita, centralizado na VERTICAL. O "LAUDO" fica ACIMA do
  //    QR, dentro de uma borda arredondada e AFASTADO dele (gap). ──
  if (qrUrl) {
    const modules = qrUrl.length <= 80 ? 33 : 37; // byte mode: v4 ate ~80 bytes, senao v5
    const size = modules * SHIP_QR_CELL;

    const lbl = 'LAUDO';
    const lblFont = '4';
    const lblW = lbl.length * TSPL_FONT_W[Number(lblFont)];
    const lblH = TSPL_FONT_H[Number(lblFont)];
    const padX = 14;
    const padY = 4;
    const boxW = lblW + 2 * padX;
    const boxH = lblH + 2 * padY;
    const gap = 8; // afasta o "LAUDO" do QR

    // Bloco (borda do LAUDO + gap + QR) centralizado na vertical da etiqueta.
    const blockH = boxH + gap + size;
    const top = Math.max(SHIP_M, Math.floor((SHIP_H - blockH) / 2));

    const qrX = SHIP_W - SHIP_M - size; // encostado na margem direita
    const qrY = top + boxH + gap;
    const qrCenterX = qrX + Math.floor(size / 2);
    qr = { x: qrX, y: qrY, cell: SHIP_QR_CELL, modules, size, value: qrUrl };

    // Borda arredondada centrada sobre o QR + texto "LAUDO" dentro dela.
    boxes.push({
      x: qrCenterX - Math.floor(boxW / 2),
      y: top,
      width: boxW,
      height: boxH,
      thickness: 2,
      radius: 10,
    });
    texts.push({
      x: qrCenterX - Math.floor(lblW / 2),
      y: top + padY,
      font: lblFont,
      xMul: 1,
      yMul: 1,
      bold: true,
      text: lbl,
    });

    // Divisoria vertical entre dados e QR — curta (nao encosta nas bordas).
    const divX = qrX - 18;
    dividers.push({ x: divX, y: 44, width: BAR_W, height: SHIP_H - 2 * 44 });
    zoneRight = divX;
  }

  // ── Faixa de cima: LOTE a direita do logo. MAIOR (fonte 4 em 2x), com a BASE
  //    alinhada a borda inferior do logo (y = logo.y + LOGO_HEIGHT). ──
  const loteX = logoRight + 28;
  const loteBottom = logo.y + LOGO_HEIGHT;
  const loteValueY = loteBottom - 2 * TSPL_FONT_H[4]; // fonte 4 em 2x = 64 dots de altura
  texts.push({
    x: loteX,
    y: loteValueY - TSPL_FONT_H[1] - 2,
    font: '1',
    xMul: 1,
    yMul: 1,
    bold: false,
    text: 'LOTE',
  });
  texts.push({
    x: loteX,
    y: loteValueY,
    font: '4',
    xMul: 2,
    yMul: 2,
    bold: true,
    text: fitText(lot, '4', Math.floor((zoneRight - loteX) / 2)),
  });

  // ── Divisoria HORIZONTAL separando a parte de cima (logo+lote) da de baixo
  //    (campos). Curta: nao encosta na borda esquerda nem na divisoria do QR. ──
  const hDivY = 140;
  dividers.push({
    x: SHIP_M + 16,
    y: hDivY,
    width: zoneRight - (SHIP_M + 16) - 14,
    height: BAR_W,
  });

  // ── Faixa de baixo: ENVIO / SAFRA / SACAS em 3 CELULAS (de SHIP_M ate
  //    zoneRight), separadas por divisorias verticais curtas (que nao encostam
  //    na horizontal nem na margem inferior). Em cada celula: ROTULO colado a
  //    ESQUERDA + VALOR CENTRALIZADO (fonte 4). Larguras proporcionais ao
  //    conteudo (a data e larga). ──
  const valFont = '4';
  const valCharW = TSPL_FONT_W[Number(valFont)];
  const lblCharW = TSPL_FONT_W[1];
  const labelY = 175;
  const valueY = 195; // fonte 4 (32) -> base 227
  const cellTop = 154;
  const cellBot = SHIP_H - SHIP_M - 12; // 248
  const fields = [
    { label: 'ENVIO', value: fitText(sentDate, valFont, zoneRight - SHIP_M) },
    { label: 'SAFRA', value: fitText(harvest, valFont, zoneRight - SHIP_M) },
    { label: 'SACAS', value: fitText(sacks, valFont, zoneRight - SHIP_M) },
  ];
  const cellsW = zoneRight - SHIP_M - (fields.length - 1) * BAR_W;
  const weights = fields.map((f) => Math.max(f.value.length * valCharW, f.label.length * lblCharW));
  const wSum = weights.reduce((a, b) => a + b, 0);
  let cx = SHIP_M;
  for (let i = 0; i < fields.length; i += 1) {
    const cw = Math.floor((cellsW * weights[i]) / wSum);
    // Rotulo colado a esquerda da celula.
    texts.push({
      x: cx + 4,
      y: labelY,
      font: '1',
      xMul: 1,
      yMul: 1,
      bold: false,
      text: fields[i].label,
    });
    // Valor centralizado na celula.
    const valW = fields[i].value.length * valCharW;
    texts.push({
      x: cx + Math.max(0, Math.floor((cw - valW) / 2)),
      y: valueY,
      font: valFont,
      xMul: 1,
      yMul: 1,
      bold: true,
      text: fields[i].value,
    });
    cx += cw;
    if (i < fields.length - 1) {
      dividers.push({ x: cx, y: cellTop, width: BAR_W, height: cellBot - cellTop });
      cx += BAR_W;
    }
  }

  return {
    width: SHIP_W,
    height: SHIP_H,
    copies: 1,
    logo,
    texts,
    dividers,
    boxes,
    qr,
    safeArea: { left: SHIP_M, right: SHIP_W - SHIP_M, top: SHIP_M, bottom: SHIP_H - SHIP_M },
  };
}

export function buildShippingLabel(payload) {
  const layout = buildShippingLabelLayout(payload);
  const parts = [];
  const head = ['CLS', ''];

  for (const d of layout.dividers || []) {
    head.push(`BAR ${d.x},${d.y},${d.width},${d.height}`);
  }
  // Bordas (ex: moldura do "LAUDO") via TSPL BOX com raio (TSPL2). Se a firmware
  // da Elgin ignorar o raio, sai um retangulo reto — validar no print real.
  for (const b of layout.boxes || []) {
    const radius = b.radius ? `,${b.radius}` : '';
    head.push(`BOX ${b.x},${b.y},${b.x + b.width},${b.y + b.height},${b.thickness || 1}${radius}`);
  }
  for (const t of layout.texts) {
    head.push(`TEXT ${t.x},${t.y},"${t.font}",0,${t.xMul},${t.yMul},"${t.text}"`);
    // Negrito por overstrike (mesma tecnica do buildCustomLabel).
    if (t.bold) {
      head.push(`TEXT ${t.x + 1},${t.y},"${t.font}",0,${t.xMul},${t.yMul},"${t.text}"`);
    }
  }
  // QR do laudo — byte mode (B) p/ as minusculas da URL; ECC L.
  if (layout.qr) {
    head.push(
      `QRCODE ${layout.qr.x},${layout.qr.y},L,${layout.qr.cell},B,0,M2,"${layout.qr.value}"`
    );
  }
  parts.push(Buffer.from(head.join('\r\n') + '\r\n', 'latin1'));

  if (layout.logo) {
    parts.push(
      Buffer.from(
        `BITMAP ${layout.logo.x},${layout.logo.y},${layout.logo.widthBytes},${layout.logo.height},0,`,
        'latin1'
      )
    );
    parts.push(layout.logo.data);
    parts.push(Buffer.from('\r\n', 'latin1'));
  }

  parts.push(Buffer.from(`PRINT 1,${layout.copies}\r\n`, 'latin1'));
  return Buffer.concat(parts);
}
