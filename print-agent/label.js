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

  // --- Layout constants ---
  const RX = 280; // right column start x
  const RW = 510; // right column width
  const F3W = 16; // font "3" char width
  const GAP = 10; // gap between text and separator bars

  // Info row: dynamically centered in right column
  const sw = sacks.length * F3W;
  const hw = harvest.length * F3W;
  const dw = date.length * F3W;
  const infoW = sw + GAP + 2 + GAP + hw + GAP + 2 + GAP + dw;
  const ix = RX + Math.floor((RW - infoW) / 2);
  const b1x = ix + sw + GAP;
  const hx = b1x + 2 + GAP;
  const b2x = hx + hw + GAP;
  const dx = b2x + 2 + GAP;

  // Lot number: font "4" at 3x5 (72x160 per char), centered
  const lotCharW = 72;
  const lotW = lotNumber.length * lotCharW;
  const lotX = RX + Math.floor((RW - lotW) / 2);

  const parts = [];

  // Header + logo bitmap (top-left)
  const header = [
    'SET RIBBON ON',
    'DENSITY 10',
    'SIZE 100 mm, 35 mm',
    'GAP 3 mm, 0 mm',
    'DIRECTION 1',
    'CLS',
    '',
    `BITMAP 10,5,${LOGO_WIDTH_BYTES},${LOGO_HEIGHT},0,`,
  ].join('\r\n');
  parts.push(Buffer.from(header, 'ascii'));
  parts.push(LOGO_DATA);

  // Body commands
  const body = [
    '',
    // QR Code — left side, below logo
    `QRCODE 42,100,L,6,A,0,M2,"${qrValue}"`,
    '',
    // Info row — sacas | safra | data
    `TEXT ${ix},21,"3",0,1,1,"${sacks}"`,
    `BAR ${b1x},18,2,30`,
    `TEXT ${hx},21,"3",0,1,1,"${harvest}"`,
    `BAR ${b2x},18,2,30`,
    `TEXT ${dx},21,"3",0,1,1,"${date}"`,
    '',
    // Horizontal separator
    `BAR ${RX},58,${RW},2`,
    '',
    // Lot number — large, dominant
    `TEXT ${lotX},87,"4",0,3,5,"${lotNumber}"`,
    '',
    'PRINT 1,1',
    '',
  ].join('\r\n');
  parts.push(Buffer.from(body, 'ascii'));

  return Buffer.concat(parts);
}
