import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

// TEMPORARIO: gera um logo PEQUENO (separado do logo-data.js da etiqueta de
// amostra) para a etiqueta avulsa do dashboard admin. Saida:
// print-agent/logo-small-data.js. Espelha scripts/generate-logo-bitmap.mjs
// com caixa menor (fit:contain preserva a proporcao, sobra vira branco).

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, 'assets', 'Safras-logo-ori.png');
const OUTPUT = join(ROOT, 'print-agent', 'logo-small-data.js');

const WIDTH_BYTES = 20;
const WIDTH_PX = WIDTH_BYTES * 8; // 160
const HEIGHT = 48;
const THRESHOLD = 160;

async function main() {
  const { data, info } = await sharp(SOURCE)
    .flatten({ background: '#ffffff' })
    .resize(WIDTH_PX, HEIGHT, {
      fit: 'contain',
      background: '#ffffff',
      kernel: 'lanczos3',
    })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 0.5 })
    .threshold(THRESHOLD)
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== WIDTH_PX || info.height !== HEIGHT) {
    throw new Error(
      `resize inesperado: ${info.width}x${info.height}, esperado ${WIDTH_PX}x${HEIGHT}`
    );
  }

  // TSPL BITMAP packing: 1 bit/pixel, MSB = pixel mais a esquerda, bit 1 =
  // branco (nao imprime), bit 0 = preto (imprime).
  const bytes = Buffer.alloc(WIDTH_BYTES * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let xb = 0; xb < WIDTH_BYTES; xb++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xb * 8 + bit;
        const px = data[y * WIDTH_PX + x];
        if (px >= 128) {
          byte |= 1 << (7 - bit);
        }
      }
      bytes[y * WIDTH_BYTES + xb] = byte;
    }
  }

  const base64 = bytes.toString('base64');
  const content = `// TEMPORARIO: logo pequeno da etiqueta avulsa (gerado por scripts/generate-logo-bitmap-small.mjs).
export const LOGO_SMALL_WIDTH_BYTES = ${WIDTH_BYTES};
export const LOGO_SMALL_HEIGHT = ${HEIGHT};
export const LOGO_SMALL_DATA = Buffer.from(
  '${base64}',
  'base64'
);
`;
  writeFileSync(OUTPUT, content, 'utf-8');

  console.log(
    `Gerado ${OUTPUT}\n  dimensoes: ${WIDTH_PX}x${HEIGHT} (${WIDTH_BYTES} bytes x ${HEIGHT} linhas)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
