import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

// Gera o logo da ETIQUETA DE CONTROLE INTERNO (impressa auto pos-classificacao),
// no tamanho do NOVO layout: ~1/3 da altura da etiqueta, ponta sup. esquerda.
// Saida: print-agent/logo-internal-data.js. Espelha generate-logo-bitmap-small.mjs
// com a caixa 248x84 (widthBytes 31). Separado do logo grande (logo-data.js, que
// segue na etiqueta de Envio) pra cada etiqueta ter seu logo no tamanho certo.

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, 'assets', 'Safras-logo-ori.png');
const OUTPUT = join(ROOT, 'print-agent', 'logo-internal-data.js');

const WIDTH_BYTES = 31;
const WIDTH_PX = WIDTH_BYTES * 8; // 248
const HEIGHT = 84; // ~1/3 de 280 dots
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
  const content = `// Logo da etiqueta de controle interno (gerado por scripts/generate-logo-bitmap-internal.mjs).
export const LOGO_INTERNAL_WIDTH_BYTES = ${WIDTH_BYTES};
export const LOGO_INTERNAL_HEIGHT = ${HEIGHT};
export const LOGO_INTERNAL_DATA = Buffer.from(
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
