import { LOGO_WIDTH_BYTES, LOGO_HEIGHT, LOGO_DATA } from './logo-data.js';
// NB: o logo pequeno da etiqueta de Aprovacao (logo-small-data.js) e carregado
// SOB DEMANDA dentro de buildCustomLabel (loadSmallLogo) DE PROPOSITO: assim
// este modulo — usado tambem pela etiqueta de amostra (buildLabel) — NAO depende
// daquele arquivo. Se ele faltar (ex: deploy parcial), a etiqueta de amostra
// imprime normalmente e a de Aprovacao apenas sai sem logo.

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

export function buildLabel(job) {
  const qrValue = sanitize(job.sample.qrValue || job.sample.id, 100);
  const lotNumber = sanitize(job.sample.internalLotNumber || job.sample.id, 7);
  const sacks = job.sample.declared?.sacks != null ? String(job.sample.declared.sacks) : '---';
  const harvest = sanitize(job.sample.declared?.harvest || '---', 10);
  const date = formatDate(job.sample.registeredAt);

  // --- Layout (etiqueta 100x35mm = 800x280 dots, 203dpi) ---
  //
  // Esquerda (x=0-335): apenas o lote, centralizado horizontal e verticalmente.
  // Direita (x=335-800): logo no topo + infos (DATA/SAFRA/SACAS) em baixo + QR
  // mais a direita, com centro vertical alinhado ao centro das infos.
  //
  // Gap superior padrao de 20 dots, mas o logo pode comecar em y=10 (passa
  // um pouco do gap) pra ganhar mais respiro entre logo e infos.
  //
  // Lote em font "4" multiplier 2x4 (48x128 por char).
  const LEFT_COLUMN_W = 335;
  const RIGHT_COLUMN_X = 335;
  const RIGHT_COLUMN_W = 800 - RIGHT_COLUMN_X; // 465
  const LOT_CHAR_W = 48;
  const LOT_HEIGHT = 128;

  const lotWidth = lotNumber.length * LOT_CHAR_W;
  const lotX = Math.max(0, Math.floor((LEFT_COLUMN_W - lotWidth) / 2));
  // Lote centralizado verticalmente na area util (y=20 a y=260, altura 240)
  const lotY = 20 + Math.floor((240 - LOT_HEIGHT) / 2);

  const logoPixelWidth = LOGO_WIDTH_BYTES * 8;
  // Logo centralizado horizontalmente no lado direito
  const logoX = RIGHT_COLUMN_X + Math.floor((RIGHT_COLUMN_W - logoPixelWidth) / 2);

  const copies = 1;

  const parts = [];

  // Header + logo bitmap no topo direito (y=10, um pouco acima do gap padrao
  // de 20 pra dar respiro entre logo e infos que comecam em y=130).
  // SIZE/GAP/DIRECTION/REFERENCE/OFFSET/SHIFT/DENSITY/SET TEAR/SET RIBBON/
  // GAPDETECT vivem em calibratePrinter() (index.js), enviados uma unica
  // vez no startup — re-enviar a cada job disparava auto-calibracao
  // esporadica (etiqueta em branco intermitente).
  const header = ['CLS', '', `BITMAP ${logoX},10,${LOGO_WIDTH_BYTES},${LOGO_HEIGHT},0,`].join(
    '\r\n'
  );
  parts.push(Buffer.from(header, 'ascii'));
  parts.push(LOGO_DATA);

  // Body commands
  const body = [
    '',
    // Separador vertical entre coluna esquerda (lote) e coluna direita (logo+infos+QR)
    `BAR 335,20,3,240`,
    '',
    // Lote grande — centralizado na coluna esquerda
    `TEXT ${lotX},${lotY},"4",0,2,4,"${lotNumber}"`,
    '',
    // Coluna meio — DATA/SAFRA/SACAS (ordem de cima pra baixo).
    // Gap de 55 dots entre linhas, valores alinhados em x=456.
    `TEXT 360,130,"3",0,1,1,"DATA:"`,
    `TEXT 456,130,"3",0,1,1,"${date}"`,
    `TEXT 360,185,"3",0,1,1,"SAFRA:"`,
    `TEXT 456,185,"3",0,1,1,"${harvest}"`,
    `TEXT 360,240,"3",0,1,1,"SACAS:"`,
    `TEXT 456,240,"3",0,1,1,"${sacks}"`,
    '',
    // QR code — mais a direita, centro vertical alinhado ao centro das infos
    // (~y=195). Cell size 4 reduz o QR pra caber na area vertical das infos
    // (y=130 a y=260, ~130 dots de altura). x=650 deixa ~10-20 dots da borda.
    `QRCODE 650,130,L,4,A,0,M2,"${qrValue}"`,
    '',
    `PRINT 1,${copies}`,
    '',
  ].join('\r\n');
  parts.push(Buffer.from(body, 'ascii'));

  return Buffer.concat(parts);
}

// Etiqueta de Aprovacao (ex-avulsa, 100x35mm; calibracao de SIZE/GAP/DENSITY
// vive em calibratePrinter() no startup). Layout em FAIXAS — ver constantes
// abaixo. O preview (scripts/preview-custom-label.mjs) consome
// buildCustomLabelLayout, entao o que aparece la == o que imprime.

// Largura/altura (dots) das fontes internas TSPL usadas aqui.
const TSPL_FONT_W = { 1: 8, 2: 12, 3: 16, 4: 24 };
const TSPL_FONT_H = { 1: 12, 2: 20, 3: 24, 4: 32 };

// --- Layout em 3 FAIXAS (revisao 2026-06-17, mockup do usuario) ---
// (1) logo + Nº COMPRA + FECHAMENTO + SACAS; (2) PRODUTOR + ARMAZEM; (3) LOTES
// (grade responsiva de caixas). Cada VALOR tem fonte AUTO-AJUSTADA a largura da
// coluna (1 linha) — campo longo encolhe a fonte em vez de quebrar. Os lotes
// saem do valor do campo LOTE (separado por virgula): cada um vira uma caixa,
// com tamanho / nº de colunas / fonte variando pela quantidade. Geometria em
// dots (etiqueta 800x280).
const LABEL_W = 800;
const LABEL_H = 280;
const M_TOP = 14;
const M_BOTTOM = 14;
const M_LEFT = 20;
const M_RIGHT = 20;
const BAR_W = 3; // espessura das divisorias (BAR)

// Faixas: y de topo/base de cada banda + y das divisorias horizontais.
const BAND1_TOP = M_TOP;
const BAND1_BOT = 82;
const DIV1_Y = 84;
const BAND2_TOP = 92;
const BAND2_BOT = 156;
const DIV2_Y = 158;
const BAND3_TOP = 166;
const BAND3_BOT = LABEL_H - M_BOTTOM;

const LABEL_FONT = '1'; // rotulos pequenos (8x12)
const LABEL_GAP_Y = 6; // gap vertical entre rotulo e valor
const COL_PAD = 10; // recuo do conteudo dentro da coluna
const LOGO_SEP_GAP = 16; // respiro dos dois lados da divisoria apos o logo
const VALUE_FONTS = ['4', '3', '2', '1']; // tiers do valor (maior -> menor)
const VALUE_BAND_H = 34; // altura util do valor numa faixa (cabe a fonte 4)

// Lotes: grade responsiva. Ate LOTS_ONE_ROW_MAX em 1 linha; acima, 2 linhas
// (colunas = ceil(n / linhas)). Caixa e fonte encolhem conforme a quantidade.
const LOTS_ONE_ROW_MAX = 4;
const LOTS_GAP = 10;
const LOTS_BOX_PAD = 8; // respiro horizontal do numero dentro da caixa
const LOTS_BOX_THICK = 2; // espessura da linha da caixa (BOX)
const LOTS_BOX_RADIUS = 6; // cantos arredondados (TSPL2 BOX radius; 0 = reto)

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
// Retorna { width, height, copies, logo, texts, dividers, boxes, safeArea }.
export async function buildCustomLabelLayout(payload) {
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  if (lines.length === 0) {
    throw new Error('etiqueta avulsa sem linhas');
  }

  // Indexa as linhas recebidas pelo rotulo normalizado (robusto a ordem).
  const byKey = new Map();
  for (const line of lines) {
    byKey.set(normalizeFieldKey(sanitize(line?.label || '', 40)), line);
  }
  function labelOf(key, fallback) {
    const line = byKey.get(key);
    const raw = line && typeof line.label === 'string' ? line.label : fallback;
    return sanitize(raw, 40);
  }
  function valueOf(key) {
    const line = byKey.get(key);
    if (!line || typeof line.value !== 'string') return '';
    // Vazio retorna '' e NAO passa pelo sanitize (cujo fallback '---' e da
    // etiqueta de amostra): campo em branco sai so com o rotulo, e LOTE vazio
    // nao desenha caixa (splitLots('') = []).
    const trimmed = line.value.trim();
    return trimmed ? sanitize(trimmed, 300) : '';
  }

  const texts = [];
  const dividers = [];
  const boxes = [];

  // Rotulo pequeno (LABEL_FONT) em (x, y) — sem ":" (segue o mockup). Com
  // `maxWidth`, corta pra nao estourar a coluna (rotulo longo via API direta).
  function pushLabel(rawLabel, x, y, maxWidth) {
    let text = sanitize(rawLabel || '', 40);
    if (!text) return;
    if (maxWidth) text = fitText(text, LABEL_FONT, maxWidth);
    texts.push({ x, y, font: LABEL_FONT, xMul: 1, yMul: 1, bold: false, text });
  }

  // Valor com fonte AUTO-AJUSTADA a `maxWidth` (1 linha), em negrito.
  function pushValue(rawValue, x, y, maxWidth) {
    const value = rawValue || '';
    if (!value) return;
    const font = pickFont(value, maxWidth, VALUE_BAND_H, VALUE_FONTS);
    texts.push({ x, y, font, xMul: 1, yMul: 1, bold: true, text: fitText(value, font, maxWidth) });
  }

  // Campo "rotulo em cima + valor embaixo" numa coluna [x, x+w].
  function pushField(key, fallbackLabel, x, w, labelY, valueY) {
    pushLabel(labelOf(key, fallbackLabel), x + COL_PAD, labelY, w - 2 * COL_PAD);
    pushValue(valueOf(key), x + COL_PAD, valueY, w - 2 * COL_PAD);
  }

  // Distribui colunas (com pesos) em [start, end], com divisoria vertical entre
  // elas, e desenha cada campo.
  function layoutColumns(start, end, fields, bandTop, bandBot, labelY, valueY) {
    const wsum = fields.reduce((a, f) => a + f.weight, 0);
    const usableW = end - start - (fields.length - 1) * BAR_W;
    let x = start;
    for (let i = 0; i < fields.length; i += 1) {
      const colW = Math.floor((usableW * fields[i].weight) / wsum);
      pushField(fields[i].key, fields[i].fallback, x, colW, labelY, valueY);
      x += colW;
      if (i < fields.length - 1) {
        dividers.push({ x, y: bandTop, width: BAR_W, height: bandBot - bandTop });
        x += BAR_W;
      }
    }
  }

  // Logo no topo-esquerda da faixa 1 (opcional — degrada sem o arquivo).
  const logo = await loadSmallLogo();
  const logoOp = logo
    ? {
        widthBytes: logo.widthBytes,
        height: logo.height,
        x: M_LEFT,
        y: BAND1_TOP + Math.max(0, Math.floor((BAND1_BOT - BAND1_TOP - logo.height) / 2)),
        data: logo.data,
      }
    : null;
  const logoRight = logoOp ? logoOp.x + logoOp.widthBytes * 8 : M_LEFT;

  // Faixa 1: divisoria apos o logo + COMPRA | FECHAMENTO | SACAS.
  const sepX = logoRight + LOGO_SEP_GAP;
  dividers.push({ x: sepX, y: BAND1_TOP, width: BAR_W, height: BAND1_BOT - BAND1_TOP });
  const b1LabelY = BAND1_TOP + 8;
  const b1ValueY = b1LabelY + TSPL_FONT_H[Number(LABEL_FONT)] + LABEL_GAP_Y;
  layoutColumns(
    sepX + BAR_W + LOGO_SEP_GAP,
    LABEL_W - M_RIGHT,
    [
      { key: KEY_COMPRA, fallback: 'N° COMPRA', weight: 1 },
      { key: KEY_FECHAMENTO, fallback: 'N° FECHAMENTO', weight: 1 },
      { key: KEY_SACAS, fallback: 'SACAS', weight: 0.62 },
    ],
    BAND1_TOP,
    BAND1_BOT,
    b1LabelY,
    b1ValueY
  );

  // Faixa 2: PRODUTOR | ARMAZEM (produtor mais largo).
  const b2LabelY = BAND2_TOP + 8;
  const b2ValueY = b2LabelY + TSPL_FONT_H[Number(LABEL_FONT)] + LABEL_GAP_Y;
  layoutColumns(
    M_LEFT,
    LABEL_W - M_RIGHT,
    [
      { key: KEY_PRODUTOR, fallback: 'PRODUT', weight: 1.5 },
      { key: KEY_ARMAZEM, fallback: 'ARMAZ', weight: 1 },
    ],
    BAND2_TOP,
    BAND2_BOT,
    b2LabelY,
    b2ValueY
  );

  // Divisorias horizontais entre as faixas.
  const innerLeft = M_LEFT;
  const innerRight = LABEL_W - M_RIGHT;
  dividers.push({ x: innerLeft, y: DIV1_Y, width: innerRight - innerLeft, height: BAR_W });
  dividers.push({ x: innerLeft, y: DIV2_Y, width: innerRight - innerLeft, height: BAR_W });

  // Faixa 3: rotulo "LOTES" (sempre plural) + grade responsiva de caixas.
  pushLabel('LOTES', innerLeft, BAND3_TOP + 2);
  const lots = splitLots(valueOf(KEY_LOTE));
  if (lots.length > 0) {
    const gridTop = BAND3_TOP + TSPL_FONT_H[Number(LABEL_FONT)] + 8;
    const gridH = BAND3_BOT - gridTop;
    const gridW = innerRight - innerLeft;

    const rows = lots.length <= LOTS_ONE_ROW_MAX ? 1 : 2;
    const cols = Math.ceil(lots.length / rows);
    const boxW = Math.floor((gridW - (cols - 1) * LOTS_GAP) / cols);
    const boxH = Math.floor((gridH - (rows - 1) * LOTS_GAP) / rows);

    // Fonte UNICA pra todos os lotes: a maior que cabe o maior numero na caixa
    // (mais colunas -> caixa menor -> fonte menor = a "responsividade").
    const longest = lots.reduce((m, l) => Math.max(m, l.length), 1);
    const lotFont = pickFont('0'.repeat(longest), boxW - 2 * LOTS_BOX_PAD, boxH - 8, VALUE_FONTS);
    const lotFontW = TSPL_FONT_W[Number(lotFont)] ?? 8;
    const lotFontH = TSPL_FONT_H[Number(lotFont)] ?? 12;

    for (let i = 0; i < lots.length; i += 1) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const bx = innerLeft + c * (boxW + LOTS_GAP);
      const by = gridTop + r * (boxH + LOTS_GAP);
      boxes.push({
        x: bx,
        y: by,
        w: boxW,
        h: boxH,
        thickness: LOTS_BOX_THICK,
        radius: LOTS_BOX_RADIUS,
      });
      const lot = fitText(lots[i], lotFont, boxW - 2 * LOTS_BOX_PAD);
      texts.push({
        x: bx + Math.max(LOTS_BOX_PAD, Math.floor((boxW - lot.length * lotFontW) / 2)),
        y: by + Math.max(0, Math.floor((boxH - lotFontH) / 2)),
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
    boxes,
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
  // Caixas dos lotes (BOX; radius p/ cantos arredondados em TSPL2 — 0 = reto).
  for (const b of layout.boxes || []) {
    const radius = b.radius ? `,${b.radius}` : '';
    head.push(`BOX ${b.x},${b.y},${b.x + b.w},${b.y + b.h},${b.thickness}${radius}`);
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
