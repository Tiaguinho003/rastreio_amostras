const ACCENT_MAP = {
  '\u00e0': 'a', '\u00e1': 'a', '\u00e2': 'a', '\u00e3': 'a', '\u00e4': 'a',
  '\u00c0': 'A', '\u00c1': 'A', '\u00c2': 'A', '\u00c3': 'A', '\u00c4': 'A',
  '\u00e8': 'e', '\u00e9': 'e', '\u00ea': 'e', '\u00eb': 'e',
  '\u00c8': 'E', '\u00c9': 'E', '\u00ca': 'E', '\u00cb': 'E',
  '\u00ec': 'i', '\u00ed': 'i', '\u00ee': 'i', '\u00ef': 'i',
  '\u00cc': 'I', '\u00cd': 'I', '\u00ce': 'I', '\u00cf': 'I',
  '\u00f2': 'o', '\u00f3': 'o', '\u00f4': 'o', '\u00f5': 'o', '\u00f6': 'o',
  '\u00d2': 'O', '\u00d3': 'O', '\u00d4': 'O', '\u00d5': 'O', '\u00d6': 'O',
  '\u00f9': 'u', '\u00fa': 'u', '\u00fb': 'u', '\u00fc': 'u',
  '\u00d9': 'U', '\u00da': 'U', '\u00db': 'U', '\u00dc': 'U',
  '\u00e7': 'c', '\u00c7': 'C',
  '\u00f1': 'n', '\u00d1': 'N',
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

export function buildLabel(job) {
  const qrValue = sanitize(job.sample.qrValue || job.sample.id, 100);
  const lotNumber = sanitize(job.sample.internalLotNumber || job.sample.id, 22);
  const owner = sanitize(job.sample.declared?.owner, 33);

  const lines = [
    'SET RIBBON ON',
    'DENSITY 10',
    'SIZE 100 mm, 35 mm',
    'GAP 3 mm, 0 mm',
    'DIRECTION 1',
    'CLS',
    `QRCODE 24,28,L,6,A,0,M2,"${qrValue}"`,
    `TEXT 248,48,"4",0,1,1,"${lotNumber}"`,
    `TEXT 248,112,"3",0,1,1,"${owner}"`,
    'PRINT 1,1',
  ];

  return lines.join('\r\n') + '\r\n';
}
