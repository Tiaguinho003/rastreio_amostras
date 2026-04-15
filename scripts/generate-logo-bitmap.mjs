import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, 'assets', 'Safras-logo-ori.png');
const OUTPUT = join(ROOT, 'print-agent', 'logo-data.js');
const PREVIEW = join(ROOT, 'print-agent', 'logo-preview.png');

const WIDTH_BYTES = 32;
const WIDTH_PX = WIDTH_BYTES * 8;
const HEIGHT = 86;
const THRESHOLD = 160;
const PREVIEW_ZOOM = 4;

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

  // TSPL BITMAP packing: 1 bit por pixel, MSB = pixel mais à esquerda,
  // bit 1 = branco (não imprime), bit 0 = preto (imprime).
  const bytes = Buffer.alloc(WIDTH_BYTES * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let xb = 0; xb < WIDTH_BYTES; xb++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xb * 8 + bit;
        const idx = y * WIDTH_PX + x;
        const px = data[idx];
        if (px >= 128) {
          byte |= 1 << (7 - bit);
        }
      }
      bytes[y * WIDTH_BYTES + xb] = byte;
    }
  }

  const base64 = bytes.toString('base64');
  const content = `export const LOGO_WIDTH_BYTES = ${WIDTH_BYTES};
export const LOGO_HEIGHT = ${HEIGHT};
export const LOGO_DATA = Buffer.from(
  '${base64}',
  'base64'
);
`;
  writeFileSync(OUTPUT, content, 'utf-8');

  await sharp(data, {
    raw: { width: WIDTH_PX, height: HEIGHT, channels: 1 },
  })
    .resize(WIDTH_PX * PREVIEW_ZOOM, HEIGHT * PREVIEW_ZOOM, { kernel: 'nearest' })
    .png()
    .toFile(PREVIEW);

  console.log(
    `Gerado ${OUTPUT}\n  dimensões: ${WIDTH_PX}x${HEIGHT} (${WIDTH_BYTES} bytes × ${HEIGHT} linhas)\n  threshold: ${THRESHOLD}\n  preview: ${PREVIEW} (${PREVIEW_ZOOM}x zoom, artefato local — não comitar)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
