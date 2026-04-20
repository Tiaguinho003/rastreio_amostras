#!/usr/bin/env node
// Backfill de latestClassificationData.classificadores para amostras antigas.
//
// Context: depois da release que aboliu o campo string `classificador` e o
// array legacy `conferidoPor` em favor do array canonico `classificadores`,
// amostras ja classificadas ainda tem projecao sem o novo campo. Este script
// faz UPDATE em Sample.latestClassificationData, preenchendo `classificadores`
// a partir do ator do evento CLASSIFICATION_COMPLETED + conferidoPor (quando
// existir), deduplicando por id.
//
// Event store e imutavel (fn_prevent_sample_event_mutation): NAO mexe em
// SampleEvent, so na projecao denormalizada Sample.latestClassificationData.
//
// Uso:
//   node scripts/migrations/backfill-classifiers-projection.js [--dry-run]
//
// --dry-run: imprime o que seria atualizado sem gravar.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function fetchUserSnapshot(userId) {
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, username: true },
  });
  if (!user) return null;
  const fullName =
    typeof user.fullName === 'string' && user.fullName.trim().length > 0
      ? user.fullName.trim()
      : user.username;
  return { id: user.id, fullName, username: user.username };
}

function deduplicateById(arr) {
  const seen = new Set();
  const out = [];
  for (const entry of arr) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

async function deriveClassifiersForSample(sampleId) {
  // Le eventos CLASSIFICATION_COMPLETED e CLASSIFICATION_UPDATED em ordem.
  // Snapshot final de classifiers = ator do COMPLETED + conferidoPor do
  // ultimo UPDATED com esse campo (ou do proprio COMPLETED se nao houver UPDATED).
  const events = await prisma.sampleEvent.findMany({
    where: {
      sampleId,
      eventType: { in: ['CLASSIFICATION_COMPLETED', 'CLASSIFICATION_UPDATED'] },
    },
    orderBy: [{ occurredAt: 'asc' }, { sequenceNumber: 'asc' }],
    select: {
      eventType: true,
      payload: true,
      actorUserId: true,
    },
  });

  if (events.length === 0) return null;

  const completed = events.find((e) => e.eventType === 'CLASSIFICATION_COMPLETED');
  if (!completed) return null;

  // Se o evento COMPLETED ja tem `classifiers`, usamos direto (idempotencia).
  if (isRecord(completed.payload) && Array.isArray(completed.payload.classifiers)) {
    return deduplicateById(completed.payload.classifiers);
  }

  // Snapshot do ator via user lookup (COMPLETED tem actorUserId).
  const actorSnapshot = await fetchUserSnapshot(completed.actorUserId);

  // conferidoPor inicial vem do COMPLETED payload
  let conferredBy = Array.isArray(completed.payload?.conferredBy)
    ? completed.payload.conferredBy
    : [];

  // UPDATED events podem substituir conferredBy (via after.conferredBy)
  for (const evt of events.filter((e) => e.eventType === 'CLASSIFICATION_UPDATED')) {
    const after = evt.payload?.after;
    if (isRecord(after)) {
      if (Array.isArray(after.classifiers)) {
        // UPDATED ja com schema novo: substitui e retorna.
        return deduplicateById(after.classifiers);
      }
      if (Array.isArray(after.conferredBy)) {
        conferredBy = after.conferredBy;
      }
    }
  }

  // Compor: [actor, ...conferredBy]
  const list = [];
  if (actorSnapshot) list.push(actorSnapshot);
  for (const entry of conferredBy) {
    if (
      isRecord(entry) &&
      typeof entry.id === 'string' &&
      typeof entry.fullName === 'string' &&
      typeof entry.username === 'string'
    ) {
      list.push({ id: entry.id, fullName: entry.fullName, username: entry.username });
    }
  }

  return deduplicateById(list);
}

async function main() {
  console.log(`[backfill] dry-run = ${isDryRun}`);

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

  console.log(`[backfill] ${samples.length} samples com latestClassificationData`);

  let updated = 0;
  let alreadyMigrated = 0;
  let skipped = 0;

  for (const sample of samples) {
    const data = sample.latestClassificationData;
    if (!isRecord(data)) {
      skipped++;
      continue;
    }

    if (Array.isArray(data.classificadores) && data.classificadores.length > 0) {
      alreadyMigrated++;
      continue;
    }

    const classifiers = await deriveClassifiersForSample(sample.id);
    if (!classifiers || classifiers.length === 0) {
      console.warn(
        `[backfill][skip] ${sample.internalLotNumber ?? sample.id}: nao foi possivel derivar classifiers`
      );
      skipped++;
      continue;
    }

    const nextData = { ...data, classificadores: classifiers };
    console.log(
      `[backfill][${isDryRun ? 'DRY' : 'WRITE'}] ${sample.internalLotNumber ?? sample.id}: ${classifiers.length} classificador(es) -> ${classifiers.map((c) => c.fullName).join(', ')}`
    );

    if (!isDryRun) {
      await prisma.sample.update({
        where: { id: sample.id },
        data: { latestClassificationData: nextData },
      });
    }
    updated++;
  }

  console.log(
    `[backfill] done: updated=${updated} alreadyMigrated=${alreadyMigrated} skipped=${skipped}`
  );
}

main()
  .catch((err) => {
    console.error('[backfill] erro:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
