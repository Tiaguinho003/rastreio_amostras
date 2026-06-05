#!/usr/bin/env node
// Backfill de canonicalizacao do campo `padrao` em Sample.latestClassificationData.
//
// Context: o projetor passou a canonizar `padrao` ao folder eventos de
// classificacao (event-contract-db-service.js), pra que o filtro de /samples
// agrupe variacoes de grafia ('L4 P3', 'l4-p3', 'L4P3' -> 'L4-P3'). Amostras
// ja classificadas antes dessa mudanca tem `padrao` cru (so trim) na projecao.
// Este script reescreve latestClassificationData.padrao com o valor canonico.
//
// Event store e imutavel (fn_prevent_sample_event_mutation): NAO mexe em
// SampleEvent, so na projecao denormalizada Sample.latestClassificationData.
// Idempotente: so grava quando o valor canonico difere do atual.
//
// Uso:
//   node scripts/migrations/backfill-padrao-canonical.js [--dry-run]
//
// --dry-run: imprime o que seria atualizado sem gravar.

import { PrismaClient } from '@prisma/client';

import { canonicalizePadrao } from '../../src/samples/classification-canonicalization.js';

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function main() {
  console.log(`[backfill-padrao] dry-run = ${isDryRun}`);

  const samples = await prisma.sample.findMany({
    where: {
      latestClassificationData: { not: null },
    },
    select: {
      id: true,
      internalLotNumber: true,
      latestClassificationData: true,
    },
  });

  console.log(`[backfill-padrao] ${samples.length} samples com latestClassificationData`);

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const sample of samples) {
    const data = sample.latestClassificationData;
    if (!isRecord(data) || !('padrao' in data)) {
      skipped++;
      continue;
    }

    const current = data.padrao;
    const canonical = canonicalizePadrao(current);

    // canonicalize devolve null pra vazio; comparamos com o atual normalizando
    // ausencia (null/undefined sao equivalentes pra fim de "nada a fazer").
    const currentOrNull = current == null ? null : current;
    if (canonical === currentOrNull) {
      unchanged++;
      continue;
    }

    console.log(
      `[backfill-padrao][${isDryRun ? 'DRY' : 'WRITE'}] ${sample.internalLotNumber ?? sample.id}: ${JSON.stringify(current)} -> ${JSON.stringify(canonical)}`
    );

    if (!isDryRun) {
      await prisma.sample.update({
        where: { id: sample.id },
        data: { latestClassificationData: { ...data, padrao: canonical } },
      });
    }
    updated++;
  }

  console.log(
    `[backfill-padrao] done: updated=${updated} unchanged=${unchanged} skipped=${skipped}`
  );
}

main()
  .catch((err) => {
    console.error('[backfill-padrao] erro:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
