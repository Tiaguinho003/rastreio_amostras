import { LOGO_WIDTH_BYTES, LOGO_HEIGHT, LOGO_DATA } from './logo-data.js';

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
  // Tres colunas: logo+lote | info (DATA/SAFRA/SACAS) | QR.
  // Gap padrao de 20 dots (2.5mm) nas bordas superior e inferior.
  //
  // Logo e lote sao centralizados horizontalmente na coluna esquerda
  // (x=0 a x=335). Logo em cima, lote em baixo.
  //
  // Lote em font "4" multiplier 2x4 (48x128 por char). Ate 7 chars caberiam
  // (336 dots); lote padrao de 6 chars (ex: "A-0000") ocupa 288 dots.
  const LEFT_COLUMN_W = 335;
  const LOT_CHAR_W = 48;
  const lotWidth = lotNumber.length * LOT_CHAR_W;
  const lotX = Math.max(0, Math.floor((LEFT_COLUMN_W - lotWidth) / 2));
  const logoPixelWidth = LOGO_WIDTH_BYTES * 8;
  const logoX = Math.max(0, Math.floor((LEFT_COLUMN_W - logoPixelWidth) / 2));

  const copies = 1;

  const parts = [];

  // Header + logo bitmap. SIZE/GAP/DIRECTION/REFERENCE/OFFSET/SHIFT/DENSITY/
  // SET TEAR/SET RIBBON/GAPDETECT vivem em calibratePrinter() (index.js),
  // enviados uma unica vez no startup — re-enviar a cada job disparava
  // auto-calibracao esporadica (etiqueta em branco intermitente).
  const header = ['CLS', '', `BITMAP ${logoX},20,${LOGO_WIDTH_BYTES},${LOGO_HEIGHT},0,`].join(
    '\r\n'
  );
  parts.push(Buffer.from(header, 'ascii'));
  parts.push(LOGO_DATA);

  // Body commands
  const body = [
    '',
    // Separador vertical entre coluna esquerda (logo+lote) e coluna meio (info)
    `BAR 335,20,3,240`,
    '',
    // Coluna meio — DATA/SAFRA/SACAS (nessa ordem, de cima pra baixo).
    // Gap uniforme de 55 dots entre linhas, concentrando as infos na metade
    // inferior da etiqueta. Valores alinhados em x=456.
    `TEXT 360,130,"3",0,1,1,"DATA:"`,
    `TEXT 456,130,"3",0,1,1,"${date}"`,
    `TEXT 360,185,"3",0,1,1,"SAFRA:"`,
    `TEXT 456,185,"3",0,1,1,"${harvest}"`,
    `TEXT 360,240,"3",0,1,1,"SACAS:"`,
    `TEXT 456,240,"3",0,1,1,"${sacks}"`,
    '',
    // QR code — coluna direita, centralizado verticalmente (cell size 6, ~170x170)
    `QRCODE 612,55,L,6,A,0,M2,"${qrValue}"`,
    '',
    // Lote grande — dominante na coluna esquerda, abaixo do logo
    `TEXT ${lotX},132,"4",0,2,4,"${lotNumber}"`,
    '',
    `PRINT 1,${copies}`,
    '',
  ].join('\r\n');
  parts.push(Buffer.from(body, 'ascii'));

  return Buffer.concat(parts);
}
