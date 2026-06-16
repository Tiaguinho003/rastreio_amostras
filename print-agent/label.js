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

// Etiqueta avulsa do dashboard admin. Mesma 100x35mm (a calibracao de
// SIZE/GAP/DENSITY vive em calibratePrinter() no startup). Sem QR: logo no
// topo direito + os campos em "ROTULO: valor", agrupados conforme o modelo
// aprovado. payload = { lines: [{ label, value }], copies } — as linhas vem
// na ordem fixa do card e sao posicionadas POR INDICE (CUSTOM_SLOTS_Y).
// Ajuste fino do layout: as constantes CUSTOM_* abaixo. O preview
// (scripts/preview-custom-label.mjs) consome buildCustomLabelLayout, entao o
// que aparece la == o que imprime.

// Largura/altura (dots) das fontes internas TSPL usadas aqui (pra calcular
// onde o valor comeca e alinhar valor menor pela base do rotulo).
const TSPL_FONT_W = { 2: 12, 3: 16, 4: 24 };
const TSPL_FONT_H = { 2: 20, 3: 24, 4: 32 };

// Posicao vertical (topo do texto, dots) de cada campo, na ordem do card:
// 0 N° TERMO/COMPRA · 1 N° COMPRA CORRETOR · 2 PRODUTOR · 3 ARMAZEM ·
// 4 LOTE ARMAZEM · 5 TOTAL SACAS. Os gaps formam os 3 grupos do modelo.
const CUSTOM_SLOTS_Y = [24, 56, 140, 172, 204, 246];
const CUSTOM_LABEL_X = 24;
const CUSTOM_LABEL_FONT = '3'; // rotulo: maior, em negrito (overstrike)
const CUSTOM_VALUE_FONT = '2'; // valor: normal, um pouco menor
const CUSTOM_LABEL_VALUE_GAP = 12; // dots entre "ROTULO:" e o valor
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

// Calcula o layout (posicoes/fontes ja resolvidas) SEM serializar TSPL.
// Fonte unica compartilhada por buildCustomLabel (impressao) e pelo preview.
// Retorna { width, height, copies, logo, texts:[{x,y,font,xMul,yMul,text}] }.
export async function buildCustomLabelLayout(payload) {
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  if (lines.length === 0) {
    throw new Error('etiqueta avulsa sem linhas');
  }

  const logo = await loadSmallLogo();
  const logoOp = logo
    ? {
        widthBytes: logo.widthBytes,
        height: logo.height,
        x: 800 - logo.widthBytes * 8 - 16,
        y: 18,
        data: logo.data,
      }
    : null;

  const labelCharW = TSPL_FONT_W[Number(CUSTOM_LABEL_FONT)] ?? 16;
  const labelH = TSPL_FONT_H[Number(CUSTOM_LABEL_FONT)] ?? 24;
  const valueH = TSPL_FONT_H[Number(CUSTOM_VALUE_FONT)] ?? 24;
  // Valor (fonte menor) desce um pouco pra alinhar pela BASE com o rotulo.
  const valueDY = Math.max(0, labelH - valueH);

  const texts = [];
  lines.forEach((line, index) => {
    const y = CUSTOM_SLOTS_Y[index] ?? CUSTOM_SLOTS_Y[CUSTOM_SLOTS_Y.length - 1];

    let label = sanitize(line?.label || '', 40);
    if (!label.endsWith(':')) {
      label += ':';
    }
    // Rotulo em negrito (overstrike na serializacao TSPL).
    texts.push({
      x: CUSTOM_LABEL_X,
      y,
      font: CUSTOM_LABEL_FONT,
      xMul: 1,
      yMul: 1,
      bold: true,
      text: label,
    });

    const rawValue = typeof line?.value === 'string' ? line.value.trim() : '';
    if (rawValue.length > 0) {
      const valueX = CUSTOM_LABEL_X + label.length * labelCharW + CUSTOM_LABEL_VALUE_GAP;
      texts.push({
        x: valueX,
        y: y + valueDY,
        font: CUSTOM_VALUE_FONT,
        xMul: 1,
        yMul: 1,
        bold: false,
        text: sanitize(rawValue, 40),
      });
    }
  });

  return { width: 800, height: 280, copies: 1, logo: logoOp, texts };
}

export async function buildCustomLabel(payload) {
  const layout = await buildCustomLabelLayout(payload);
  const parts = [];

  // CLS + textos primeiro (texto em latin1 pra preservar o "°"); o BITMAP do
  // logo (binario) e o PRINT vao por ultimo. A ordem de desenho nao muda o
  // resultado (campos e logo nao se sobrepoem).
  const head = ['CLS', ''];
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
