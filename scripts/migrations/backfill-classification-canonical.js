#!/usr/bin/env node
// Backfill de canonicalizacao dos campos de classificacao em
// Sample.latestClassificationData: padrao, aspecto, catacao, certif.
//
// Context: o projetor passou a canonizar esses campos ao folder eventos de
// classificacao (event-contract-db-service.js), pra que os filtros de /samples
// agrupem variacoes de grafia ('L4 P3' -> 'L4-P3', 'g.c.' -> 'GC', etc.).
// Amostras classificadas antes dessa mudanca tem valores crus (so trim) na
// projecao. Este script reescreve cada campo com o valor canonico.
//
// Event store e imutavel (fn_prevent_sample_event_mutation): NAO mexe em
// SampleEvent, so na projecao denormalizada Sample.latestClassificationData.
// Idempotente: so grava quando algum campo difere do canonico.
//
// Uso:
//   node scripts/migrations/backfill-classification-canonical.js [--dry-run]
//
// --dry-run: imprime o que seria atualizado sem gravar.

import { PrismaClient } from '@prisma/client';

import {
  canonicalizeAspecto,
  canonicalizeCatacao,
  canonicalizeCertif,
  canonicalizePadrao,
} from '../../src/samples/classification-canonicalization.js';

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');

const FIELDS = [
  { key: 'padrao', canon: canonicalizePadrao },
  { key: 'aspecto', canon: canonicalizeAspecto },
  { key: 'catacao', canon: canonicalizeCatacao },
  { key: 'certif', canon: canonicalizeCertif },
];

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function main() {
  console.log(`[backfill-classification] dry-run = ${isDryRun}`);

  const samples = await prisma.sample.findMany({
    where: { latestClassificationData: { not: null } },
    select: { id: true, internalLotNumber: true, latestClassificationData: true },
  });

  console.log(`[backfill-classification] ${samples.length} samples com latestClassificationData`);

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const sample of samples) {
    const data = sample.latestClassificationData;
    if (!isRecord(data)) {
      skipped++;
      continue;
    }

    const next = { ...data };
    const changes = [];
    for (const { key, canon } of FIELDS) {
      if (!(key in data)) continue;
      const current = data[key];
      const canonical = canon(current);
      // canon devolve null pra vazio; normaliza ausencia pra comparar.
      const currentOrNull = current == null ? null : current;
      if (canonical !== currentOrNull) {
        next[key] = canonical;
        changes.push(`${key}: ${JSON.stringify(current)} -> ${JSON.stringify(canonical)}`);
      }
    }

    if (changes.length === 0) {
      unchanged++;
      continue;
    }

    console.log(
      `[backfill-classification][${isDryRun ? 'DRY' : 'WRITE'}] ${sample.internalLotNumber ?? sample.id}: ${changes.join(' | ')}`
    );

    if (!isDryRun) {
      await prisma.sample.update({
        where: { id: sample.id },
        data: { latestClassificationData: next },
      });
    }
    updated++;
  }

  console.log(
    `[backfill-classification] done: updated=${updated} unchanged=${unchanged} skipped=${skipped}`
  );
}

main()
  .catch((err) => {
    console.error('[backfill-classification] erro:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
