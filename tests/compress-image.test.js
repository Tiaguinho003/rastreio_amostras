import test from 'node:test';
import assert from 'node:assert/strict';

import { pickMaxDimensionFromEnv, pickQualityFromEnv } from '../lib/compress-image.ts';

// --- pickMaxDimensionFromEnv ---

test('pickMaxDimensionFromEnv: high-end device returns 3072', () => {
  assert.equal(
    pickMaxDimensionFromEnv({
      deviceMemory: 8,
      hardwareConcurrency: 8,
      highQualityEnabled: true,
    }),
    3072
  );
});

test('pickMaxDimensionFromEnv: 2 GB RAM falls to 2048', () => {
  assert.equal(
    pickMaxDimensionFromEnv({
      deviceMemory: 2,
      hardwareConcurrency: 8,
      highQualityEnabled: true,
    }),
    2048
  );
});

test('pickMaxDimensionFromEnv: 1 GB RAM falls to 2048', () => {
  assert.equal(
    pickMaxDimensionFromEnv({
      deviceMemory: 1,
      hardwareConcurrency: 4,
      highQualityEnabled: true,
    }),
    2048
  );
});

test('pickMaxDimensionFromEnv: 4 GB RAM + 4 cores falls to 2560', () => {
  assert.equal(
    pickMaxDimensionFromEnv({
      deviceMemory: 4,
      hardwareConcurrency: 4,
      highQualityEnabled: true,
    }),
    2560
  );
});

test('pickMaxDimensionFromEnv: 4 GB RAM + 8 cores stays at 3072', () => {
  assert.equal(
    pickMaxDimensionFromEnv({
      deviceMemory: 4,
      hardwareConcurrency: 8,
      highQualityEnabled: true,
    }),
    3072
  );
});

test('pickMaxDimensionFromEnv: feature flag disabled returns legacy 1920', () => {
  assert.equal(
    pickMaxDimensionFromEnv({
      deviceMemory: 8,
      hardwareConcurrency: 8,
      highQualityEnabled: false,
    }),
    1920
  );
});

test('pickMaxDimensionFromEnv: feature flag disabled overrides low-memory path', () => {
  assert.equal(
    pickMaxDimensionFromEnv({
      deviceMemory: 2,
      hardwareConcurrency: 4,
      highQualityEnabled: false,
    }),
    1920
  );
});

test('pickMaxDimensionFromEnv: undefined caps default to 3072 when HQ enabled', () => {
  assert.equal(pickMaxDimensionFromEnv({ highQualityEnabled: true }), 3072);
});

test('pickMaxDimensionFromEnv: undefined highQualityEnabled defaults to HQ', () => {
  assert.equal(pickMaxDimensionFromEnv({ deviceMemory: 8, hardwareConcurrency: 8 }), 3072);
});

// --- pickQualityFromEnv ---

test('pickQualityFromEnv: HQ enabled returns 0.95', () => {
  assert.equal(pickQualityFromEnv({ highQualityEnabled: true }), 0.95);
});

test('pickQualityFromEnv: HQ disabled returns legacy 0.88', () => {
  assert.equal(pickQualityFromEnv({ highQualityEnabled: false }), 0.88);
});

test('pickQualityFromEnv: undefined defaults to HQ 0.95', () => {
  assert.equal(pickQualityFromEnv({}), 0.95);
});
