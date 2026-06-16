import { LOGO_WIDTH_BYTES, LOGO_HEIGHT, LOGO_DATA } from './logo-data.js';
// NB: o logo pequeno da etiqueta avulsa (logo-small-data.js) e carregado SOB
// DEMANDA dentro de buildCustomLabel (loadSmallLogo) DE PROPOSITO: assim este
// modulo — usado tambem pela etiqueta de amostra (buildLabel) — NAO depende
// daquele arquivo. Se ele faltar (ex: deploy parcial), a etiqueta de amostra
// imprime normalmente e a avulsa apenas sai sem logo.

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

// Etiqueta avulsa do dashboard admin (100x35mm; calibracao de SIZE/GAP/DENSITY
// vive em calibratePrinter() no startup). Layout em 2 colunas — detalhes nas
// constantes/funcoes abaixo. O preview (scripts/preview-custom-label.mjs)
// consome buildCustomLabelLayout, entao o que aparece la == o que imprime.

// Largura/altura (dots) das fontes internas TSPL usadas aqui.
const TSPL_FONT_W = { 1: 8, 2: 12, 3: 16, 4: 24 };
const TSPL_FONT_H = { 1: 12, 2: 20, 3: 24, 4: 32 };

// --- Layout em 2 colunas (modelo aprovado 2026-06-16) ---
// Geometria em dots (etiqueta 800x280). Ajuste fino destes numeros aqui; o
// preview (scripts/preview-custom-label.mjs) consome buildCustomLabelLayout,
// entao o que aparece la == o que imprime.
const LABEL_W = 800;
const LABEL_H = 280;
const M_TOP = 18; // margens (respiro com a borda — prioridade do usuario)
const M_BOTTOM = 24;
const M_LEFT = 22;
const M_RIGHT = 22;
const DIVIDER_X = 300; // linha vertical entre as 2 colunas
const DIVIDER_GAP = 14; // respiro de cada lado da divisoria
const LINE_PITCH = 22; // topo-a-topo entre linhas de texto
const FIELD_GAP = 12; // espaco vertical entre campos
const LABEL_VALUE_GAP = 10; // entre "ROTULO:" e o valor (modo inline)

const CUSTOM_FONT = '2'; // rotulo e valor no MESMO tamanho (12x20)
const CUSTOM_DEGREE_FONT = '1'; // "°"/"º" pequeno e sobrescrito (tipo "N°")
const CUSTOM_SHRINK_FONT = '1'; // valor cai pra ca quando nao cabe na fonte padrao

// Campos por ROTULO normalizado (sem "°"/":"), NAO por ordem do card (robusto
// a reordenacao). mode 'below' = valor abaixo do rotulo; 'inline' = ao lado.
const CUSTOM_FIELDS = {
  'N COMPRA': { mode: 'below', maxLines: 2 },
  'N FECHAMENTO': { mode: 'below', maxLines: 2 },
  PRODUT: { mode: 'inline', maxLines: 2 },
  ARMAZ: { mode: 'inline', maxLines: 1 },
  SACAS: { mode: 'inline', maxLines: 1 },
  LOTE: { mode: 'inline', maxLines: 3 },
};
const CUSTOM_LEFT_ORDER = ['N COMPRA', 'N FECHAMENTO'];
const CUSTOM_RIGHT_ORDER = ['PRODUT', 'ARMAZ', 'SACAS', 'LOTE'];
// Carrega o logo pequeno sob demanda. Se logo-small-data.js nao existir,
// retorna null e a etiqueta avulsa sai sem logo (a de amostra nao depende
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

// Quebra o rotulo em segmentos pra desenhar "°"/"º" como um sobrescrito
// pequeno (fonte 1, tipo "N°") e o resto na fonte do rotulo. Retorna os
// segmentos (cada um com offset dx relativo ao inicio do rotulo) + o avanco
// total (largura "real" do rotulo, pra posicionar o valor depois).
function buildLabelSegments(label) {
  const bigW = TSPL_FONT_W[Number(CUSTOM_FONT)] ?? 12;
  const smallW = TSPL_FONT_W[Number(CUSTOM_DEGREE_FONT)] ?? 8;
  const segments = [];
  let dx = 0;
  let run = '';
  function flushRun() {
    if (run.length > 0) {
      segments.push({ dx, font: CUSTOM_FONT, bold: true, text: run });
      dx += run.length * bigW;
      run = '';
    }
  }
  for (const ch of label) {
    if (ch === '°' || ch === 'º') {
      flushRun();
      segments.push({ dx, font: CUSTOM_DEGREE_FONT, bold: false, text: '°' });
      dx += smallW;
    } else {
      run += ch;
    }
  }
  flushRun();
  return { segments, advance: dx };
}

// Normaliza o rotulo recebido pra casar com as chaves de CUSTOM_FIELDS
// (remove "°"/"º"/":" e padroniza espacos/caixa). Ex.: "N° COMPRA:" -> "N COMPRA".
function normalizeFieldKey(label) {
  return label.replace(/[°º:]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// Word-wrap greedy: quebra `text` em linhas de no maximo `maxChars` (palavra
// maior que a linha e quebrada na forca).
function wrapWords(text, maxChars) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (let word of words) {
    while (word.length > maxChars) {
      if (cur) {
        lines.push(cur);
        cur = '';
      }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (cur === '') {
      cur = word;
    } else if (cur.length + 1 + word.length <= maxChars) {
      cur += ' ' + word;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) {
    lines.push(cur);
  }
  return lines.length > 0 ? lines : [''];
}

// Quebra o valor pra caber em `maxLines` dentro de `maxWidth` (dots). Tenta a
// fonte padrao; se passar, reduz pra fonte menor; se ainda passar, corta a
// ultima linha com "..." (trava de seguranca da borda). Retorna { font, lines }.
function wrapValue(text, maxWidth, maxLines) {
  for (const font of [CUSTOM_FONT, CUSTOM_SHRINK_FONT]) {
    const charW = TSPL_FONT_W[Number(font)] ?? 12;
    const maxChars = Math.max(1, Math.floor(maxWidth / charW));
    const wrapped = wrapWords(text, maxChars);
    if (wrapped.length <= maxLines) {
      return { font, lines: wrapped };
    }
  }
  const charW = TSPL_FONT_W[Number(CUSTOM_SHRINK_FONT)] ?? 8;
  const maxChars = Math.max(1, Math.floor(maxWidth / charW));
  const wrapped = wrapWords(text, maxChars).slice(0, maxLines);
  let last = wrapped[wrapped.length - 1] ?? '';
  if (last.length > maxChars - 3) {
    last = last.slice(0, Math.max(0, maxChars - 3));
  }
  wrapped[wrapped.length - 1] = `${last}...`;
  return { font: CUSTOM_SHRINK_FONT, lines: wrapped };
}

// Calcula o layout (posicoes/fontes/quebras ja resolvidas) SEM serializar
// TSPL. Fonte unica compartilhada por buildCustomLabel (impressao) e pelo
// preview. Layout por FLUXO (cursor que avanca pela altura real de cada campo)
// em 2 colunas. Retorna { width, height, copies, logo, texts, divider, safeArea }.
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

  const texts = [];

  // Desenha o rotulo (com "°" sobrescrito) em (x,y); retorna o avanco do rotulo.
  function pushLabel(rawLabel, x, y) {
    let label = sanitize(rawLabel || '', 40);
    if (!label.endsWith(':')) {
      label += ':';
    }
    const { segments, advance } = buildLabelSegments(label);
    for (const seg of segments) {
      texts.push({
        x: x + seg.dx,
        y,
        font: seg.font,
        xMul: 1,
        yMul: 1,
        bold: seg.bold,
        text: seg.text,
      });
    }
    return advance;
  }

  // Empilha as linhas (ja quebradas) do valor a partir de (x, startY); retorna
  // o y logo abaixo da ultima linha.
  function pushValue(vlines, font, x, startY) {
    let y = startY;
    for (const vl of vlines) {
      texts.push({ x, y, font, xMul: 1, yMul: 1, bold: false, text: vl });
      y += LINE_PITCH;
    }
    return y;
  }

  function readValue(line) {
    return typeof line?.value === 'string' ? line.value.trim() : '';
  }

  // Logo no topo-ESQUERDA (opcional — degrada sem o arquivo).
  const logo = await loadSmallLogo();
  const logoOp = logo
    ? { widthBytes: logo.widthBytes, height: logo.height, x: M_LEFT, y: M_TOP, data: logo.data }
    : null;

  // Coluna ESQUERDA: logo + campos com valor ABAIXO do rotulo.
  const leftW = DIVIDER_X - DIVIDER_GAP - M_LEFT;
  let yL = M_TOP + (logoOp ? logoOp.height + FIELD_GAP : 0);
  for (const key of CUSTOM_LEFT_ORDER) {
    const line = byKey.get(key);
    if (!line) continue;
    pushLabel(line.label, M_LEFT, yL);
    let y = yL + LINE_PITCH;
    const rawValue = readValue(line);
    if (rawValue) {
      const { font, lines: vlines } = wrapValue(
        sanitize(rawValue, 300),
        leftW,
        CUSTOM_FIELDS[key].maxLines
      );
      y = pushValue(vlines, font, M_LEFT, y);
    }
    yL = y + FIELD_GAP;
  }

  // Coluna DIREITA: campos com valor INLINE (ao lado), quebra com recuo
  // pendurado (continuacao alinha sob o inicio do valor).
  const rightX = DIVIDER_X + DIVIDER_GAP;
  let yR = M_TOP;
  for (const key of CUSTOM_RIGHT_ORDER) {
    const line = byKey.get(key);
    if (!line) continue;
    const advance = pushLabel(line.label, rightX, yR);
    const rawValue = readValue(line);
    if (rawValue) {
      const valueX = rightX + advance + LABEL_VALUE_GAP;
      const valueW = LABEL_W - M_RIGHT - valueX;
      const { font, lines: vlines } = wrapValue(
        sanitize(rawValue, 300),
        valueW,
        CUSTOM_FIELDS[key].maxLines
      );
      yR = pushValue(vlines, font, valueX, yR) + FIELD_GAP;
    } else {
      yR += LINE_PITCH + FIELD_GAP;
    }
  }

  const divider = { x: DIVIDER_X, y: M_TOP, width: 3, height: LABEL_H - M_BOTTOM - M_TOP };
  const safeArea = {
    left: M_LEFT,
    right: LABEL_W - M_RIGHT,
    top: M_TOP,
    bottom: LABEL_H - M_BOTTOM,
  };

  return { width: LABEL_W, height: LABEL_H, copies: 1, logo: logoOp, texts, divider, safeArea };
}

export async function buildCustomLabel(payload) {
  const layout = await buildCustomLabelLayout(payload);
  const parts = [];

  // CLS + textos primeiro (texto em latin1 pra preservar o "°"); o BITMAP do
  // logo (binario) e o PRINT vao por ultimo. A ordem de desenho nao muda o
  // resultado (campos e logo nao se sobrepoem).
  const head = ['CLS', ''];
  // Divisoria vertical entre as 2 colunas.
  if (layout.divider) {
    const d = layout.divider;
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
