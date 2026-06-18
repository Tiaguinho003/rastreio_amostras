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
// (grade responsiva, SEM caixa — so os numeros centralizados). Fonte do VALOR
// AUTO-AJUSTADA: a faixa 2 (produtor/armazem) mantem a MAIOR fonte que couber em
// ate 2 linhas (quebra o nome quando preciso, so reduz se nem assim couber); a
// faixa 1 fica em 1 linha. Os lotes saem do valor do campo LOTE (separado por
// virgula), com nº de colunas / fonte variando pela quantidade. Geometria em
// dots (etiqueta 800x280).
const LABEL_W = 800;
const LABEL_H = 280;
const M_TOP = 14;
const M_BOTTOM = 14;
const M_LEFT = 20;
const M_RIGHT = 20;
const BAR_W = 3; // espessura das divisorias (BAR)

// Faixas: y de topo/base de cada banda + y das divisorias horizontais. A faixa
// CENTRAL (2: produtor/armazem) e mais alta pra caber 2 linhas de nome em fonte
// grande; como os lotes nao tem mais caixa, a faixa 3 encolheu na MESMA medida
// (~30 dots passaram da faixa 3 pra faixa 2: DIV2_Y 158->190).
const BAND1_TOP = M_TOP;
const BAND1_BOT = 82;
const DIV1_Y = 84;
const BAND2_TOP = 92;
const BAND2_BOT = 186;
const DIV2_Y = 190;
const BAND3_TOP = 196;
const BAND3_BOT = LABEL_H - M_BOTTOM;

const LABEL_FONT = '1'; // rotulos pequenos (8x12)
const LABEL_GAP_Y = 6; // gap vertical entre rotulo e valor
const COL_PAD = 10; // recuo do conteudo dentro da coluna
const LOGO_SEP_GAP = 16; // respiro dos dois lados da divisoria apos o logo
const VALUE_FONTS = ['4', '3', '2', '1']; // tiers do valor (maior -> menor)
const VALUE_LINE_GAP = 2; // gap vertical entre as linhas de um valor de 2 linhas
const BAND1_MAX_LINES = 1; // header (compra/fechamento/sacas) sempre 1 linha
const BAND2_MAX_LINES = 2; // produtor/armazem podem quebrar em 2 linhas

// Lotes: grade responsiva SEM caixa (so o numero centralizado na celula). Ate
// LOTS_ONE_ROW_MAX em 1 linha; acima, 2 linhas (colunas = ceil(n / linhas)).
// A fonte encolhe conforme a quantidade.
const LOTS_ONE_ROW_MAX = 4;
const LOTS_GAP = 10;
const LOTS_PAD = 4; // respiro horizontal do numero na celula

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

// Word-wrap greedy por espacos; palavra unica maior que `maxChars` e quebrada na
// forca. Sempre devolve ao menos 1 linha.
function wrapWords(text, maxChars) {
  const lines = [];
  let cur = '';
  for (let word of String(text).split(/\s+/).filter(Boolean)) {
    while (word.length > maxChars) {
      if (cur) {
        lines.push(cur);
        cur = '';
      }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= maxChars) cur += ' ' + word;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// Maior fonte (de `fonts`) em que o texto cabe em ATE `maxLines` linhas de
// `maxWidth`, com as linhas cabendo em `maxHeight`. Mantem a fonte e quebra em
// linha quando precisa; so reduz a fonte se nem assim couber. Fallback: menor
// fonte, cortado em maxLines.
function pickFontWrap(text, maxWidth, maxHeight, maxLines, fonts) {
  for (const f of fonts) {
    const charW = TSPL_FONT_W[Number(f)] ?? 8;
    const lineH = TSPL_FONT_H[Number(f)] ?? 12;
    const lines = wrapWords(text, Math.max(1, Math.floor(maxWidth / charW)));
    if (lines.length <= maxLines && lines.length * lineH <= maxHeight) {
      return { font: f, lines };
    }
  }
  const f = fonts[fonts.length - 1];
  const charW = TSPL_FONT_W[Number(f)] ?? 8;
  return {
    font: f,
    lines: wrapWords(text, Math.max(1, Math.floor(maxWidth / charW))).slice(0, maxLines),
  };
}

// Calcula o layout (posicoes/fontes/caixas ja resolvidas) SEM serializar TSPL.
// Fonte unica compartilhada por buildCustomLabel (impressao) e pelo preview.
// Retorna { width, height, copies, logo, texts, dividers, safeArea }.
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

  // Rotulo pequeno (LABEL_FONT) em (x, y) — sem ":" (segue o mockup). Com
  // `maxWidth`, corta pra nao estourar a coluna (rotulo longo via API direta).
  function pushLabel(rawLabel, x, y, maxWidth) {
    let text = sanitize(rawLabel || '', 40);
    if (!text) return;
    if (maxWidth) text = fitText(text, LABEL_FONT, maxWidth);
    texts.push({ x, y, font: LABEL_FONT, xMul: 1, yMul: 1, bold: false, text });
  }

  // Valor em negrito, fonte AUTO-AJUSTADA: mantem a maior fonte que cabe o texto
  // em ATE `maxLines` linhas de `maxWidth` (quebra o nome quando precisa); so
  // reduz a fonte se nem assim couber na altura util da faixa (`maxHeight`).
  function pushValue(rawValue, x, y, maxWidth, maxLines, maxHeight) {
    const value = rawValue || '';
    if (!value) return;
    const { font, lines } = pickFontWrap(value, maxWidth, maxHeight, maxLines, VALUE_FONTS);
    const lineH = (TSPL_FONT_H[Number(font)] ?? 12) + VALUE_LINE_GAP;
    for (let i = 0; i < lines.length; i += 1) {
      texts.push({ x, y: y + i * lineH, font, xMul: 1, yMul: 1, bold: true, text: lines[i] });
    }
  }

  // Campo "rotulo em cima + valor embaixo" numa coluna [x, x+w].
  function pushField(key, fallbackLabel, x, w, labelY, valueY, maxLines, valueMaxH) {
    pushLabel(labelOf(key, fallbackLabel), x + COL_PAD, labelY, w - 2 * COL_PAD);
    pushValue(valueOf(key), x + COL_PAD, valueY, w - 2 * COL_PAD, maxLines, valueMaxH);
  }

  // Distribui colunas (com pesos) em [start, end], com divisoria vertical entre
  // elas, e desenha cada campo. `maxLines` = linhas permitidas no valor.
  function layoutColumns(start, end, fields, bandTop, bandBot, labelY, valueY, maxLines) {
    const wsum = fields.reduce((a, f) => a + f.weight, 0);
    const usableW = end - start - (fields.length - 1) * BAR_W;
    const valueMaxH = bandBot - valueY;
    let x = start;
    for (let i = 0; i < fields.length; i += 1) {
      const colW = Math.floor((usableW * fields[i].weight) / wsum);
      pushField(fields[i].key, fields[i].fallback, x, colW, labelY, valueY, maxLines, valueMaxH);
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
    b1ValueY,
    BAND1_MAX_LINES
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
    b2ValueY,
    BAND2_MAX_LINES
  );

  // Divisorias horizontais entre as faixas.
  const innerLeft = M_LEFT;
  const innerRight = LABEL_W - M_RIGHT;
  dividers.push({ x: innerLeft, y: DIV1_Y, width: innerRight - innerLeft, height: BAR_W });
  dividers.push({ x: innerLeft, y: DIV2_Y, width: innerRight - innerLeft, height: BAR_W });

  // Faixa 3: rotulo "LOTES" (sempre plural) + grade responsiva SEM caixa (so os
  // numeros, centralizados na celula da grade).
  pushLabel('LOTES', innerLeft, BAND3_TOP + 2);
  const lots = splitLots(valueOf(KEY_LOTE));
  if (lots.length > 0) {
    const gridTop = BAND3_TOP + TSPL_FONT_H[Number(LABEL_FONT)] + 8;
    const gridH = BAND3_BOT - gridTop;
    const gridW = innerRight - innerLeft;

    const rows = lots.length <= LOTS_ONE_ROW_MAX ? 1 : 2;
    const cols = Math.ceil(lots.length / rows);
    const cellW = Math.floor((gridW - (cols - 1) * LOTS_GAP) / cols);
    const cellH = Math.floor((gridH - (rows - 1) * LOTS_GAP) / rows);

    // Fonte UNICA pra todos os lotes: a maior que cabe o maior numero na celula
    // (mais colunas -> celula menor -> fonte menor = a "responsividade").
    const longest = lots.reduce((m, l) => Math.max(m, l.length), 1);
    const lotFont = pickFont('0'.repeat(longest), cellW - 2 * LOTS_PAD, cellH, VALUE_FONTS);
    const lotFontW = TSPL_FONT_W[Number(lotFont)] ?? 8;
    const lotFontH = TSPL_FONT_H[Number(lotFont)] ?? 12;

    for (let i = 0; i < lots.length; i += 1) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const cx = innerLeft + c * (cellW + LOTS_GAP);
      const cy = gridTop + r * (cellH + LOTS_GAP);
      const lot = fitText(lots[i], lotFont, cellW - 2 * LOTS_PAD);
      texts.push({
        x: cx + Math.max(LOTS_PAD, Math.floor((cellW - lot.length * lotFontW) / 2)),
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
const SHIP_QR_CELL = 4; // dots por modulo (QR v4 ~33 mod -> 132 dots)

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
  let qr = null;

  // Logo grande no topo-esquerda.
  const logo = {
    widthBytes: LOGO_WIDTH_BYTES,
    height: LOGO_HEIGHT,
    x: SHIP_M,
    y: 16,
    data: LOGO_DATA,
  };

  // Limite direito da area de dados (encolhe quando ha QR a direita).
  let dataRight = SHIP_W - SHIP_M;

  if (qrUrl) {
    // Versao do QR pela quantidade de bytes (byte mode): v4 ate ~80, senao v5.
    const modules = qrUrl.length <= 80 ? 33 : 37;
    const size = modules * SHIP_QR_CELL;
    const x = SHIP_W - SHIP_M - size;
    const y = 26;
    qr = { x, y, cell: SHIP_QR_CELL, modules, size, value: qrUrl };

    // Rotulo "LAUDO" centralizado sob o QR.
    const lbl = 'LAUDO';
    const lblW = lbl.length * TSPL_FONT_W[3];
    texts.push({
      x: x + Math.max(0, Math.floor((size - lblW) / 2)),
      y: y + size + 6,
      font: '3',
      xMul: 1,
      yMul: 1,
      bold: true,
      text: lbl,
    });

    // Divisoria vertical entre os dados e o QR.
    const divX = x - 16;
    dividers.push({ x: divX, y: SHIP_M, width: BAR_W, height: SHIP_H - 2 * SHIP_M });
    dataRight = divX - 14;
  }

  // ── Coluna esquerda: lote em destaque + envio/safra/sacas ──
  const x0 = SHIP_M;
  const dataW = dataRight - x0;

  // Lote: rotulo pequeno (fonte 1) + valor grande (fonte 4, 2x).
  texts.push({ x: x0, y: 120, font: '1', xMul: 1, yMul: 1, bold: false, text: 'LOTE' });
  texts.push({
    x: x0,
    y: 142,
    font: '4',
    xMul: 2,
    yMul: 2,
    bold: false,
    text: fitText(lot, '4', Math.floor(dataW / 2)),
  });

  // Envio / Safra / Sacas — rotulo (fonte 1) + valor (fonte 3, negrito), em 3
  // colunas lado a lado na largura de dados.
  const rowLabelY = 216;
  const rowValueY = rowLabelY + TSPL_FONT_H[1] + 4;
  const colGap = 16;
  const colW = Math.floor((dataW - 2 * colGap) / 3);
  const fields = [
    { label: 'ENVIO', value: sentDate },
    { label: 'SAFRA', value: harvest },
    { label: 'SACAS', value: sacks },
  ];
  for (let i = 0; i < fields.length; i += 1) {
    const fx = x0 + i * (colW + colGap);
    texts.push({
      x: fx,
      y: rowLabelY,
      font: '1',
      xMul: 1,
      yMul: 1,
      bold: false,
      text: fields[i].label,
    });
    texts.push({
      x: fx,
      y: rowValueY,
      font: '3',
      xMul: 1,
      yMul: 1,
      bold: true,
      text: fitText(fields[i].value, '3', colW),
    });
  }

  return {
    width: SHIP_W,
    height: SHIP_H,
    copies: 1,
    logo,
    texts,
    dividers,
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
