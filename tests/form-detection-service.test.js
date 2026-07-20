import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { FormDetectionService } from '../src/samples/form-detection-service.js';

// EXT (rodada 1): primeira suite dedicada do FormDetectionService (antes so
// coberto de raspao pela integracao). Caso critico: CLOSE-UP — ficha
// preenchendo o quadro caia em detect-failed com MAX_AREA_RATIO 0.65
// (a melhor foto possivel gerava o modal de friccao "Ficha nao detectada").

const FIXTURE_PATH = fileURLToPath(
  new URL('../src/samples/fixtures/extraction-example.jpg', import.meta.url)
);

const service = new FormDetectionService();

test('cena completa (fixture): detecta e cropa a ficha', async () => {
  const original = fs.readFileSync(FIXTURE_PATH);
  const result = await service.detectAndCrop(original);

  assert.equal(result.detected, true);
  assert.ok(result.croppedBuffer);

  const originalMeta = await sharp(original).metadata();
  const cropMeta = await sharp(result.croppedBuffer).metadata();
  assert.ok(cropMeta.width < originalMeta.width);
  assert.ok(cropMeta.height < originalMeta.height);
});

test('close-up (ficha preenchendo o quadro): detecta em vez de falhar', async () => {
  const original = fs.readFileSync(FIXTURE_PATH);
  const scene = await service.detectAndCrop(original);
  assert.equal(scene.detected, true);

  // O proprio crop da fixture E o caso close-up (~0.85 de area apos o blur).
  const closeUp = await service.detectAndCrop(scene.croppedBuffer);
  assert.equal(closeUp.detected, true);
});

test('imagem escura sem cartao: nao detecta', async () => {
  const dark = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 25, g: 25, b: 25 } },
  })
    .jpeg()
    .toBuffer();

  const result = await service.detectAndCrop(dark);
  assert.equal(result.detected, false);
  assert.equal(result.croppedBuffer, null);
});

test('cartao branco sintetico (~50% da area) sobre fundo escuro: detecta', async () => {
  const card = await sharp({
    create: { width: 560, height: 560, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();

  const photo = await sharp({
    create: { width: 800, height: 800, channels: 3, background: { r: 60, g: 60, b: 60 } },
  })
    .composite([{ input: card, left: 120, top: 120 }])
    .jpeg()
    .toBuffer();

  const result = await service.detectAndCrop(photo);
  assert.equal(result.detected, true);

  // O crop deve ficar proximo do cartao (560px + padding), nao do frame todo.
  const cropMeta = await sharp(result.croppedBuffer).metadata();
  assert.ok(cropMeta.width < 720, `crop largo demais: ${cropMeta.width}px`);
  assert.ok(cropMeta.width > 500, `crop estreito demais: ${cropMeta.width}px`);
});
