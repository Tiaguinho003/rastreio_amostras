#!/usr/bin/env node
// Backfill: recalcula safra + proprietario das ligas existentes
// (Sample.isBlend=true) a partir das origens atuais e EMITE um
// REGISTRATION_UPDATED por liga stale.
//
// Context: a safra/owner da liga viraram reativos (derivados das origens). Ligas
// criadas antes disso tem esses campos congelados da criacao — podem estar stale.
// Este backfill realinha-os.
//
// POR QUE EVENTO (e nao prisma.sample.update direto): o valor derivado correto
// NAO existe em nenhum evento atual (o REGISTRATION_CONFIRMED da liga guarda o
// snapshot antigo). So um novo REGISTRATION_UPDATED muda a verdade de forma
// duravel e sobrevive a um rebuild da projecao (append-only e a lei do projeto
// para dado declarado). Os backfills de PROJECAO existentes escrevem direto
// porque o dado ja esta nos eventos; aqui nao esta.
//
// Idempotencia ESTRUTURAL: re-derivar e emitir so quando a projecao difere do
// derivado. Rodar de novo apos um apply bem-sucedido = 0 diffs = 0 eventos.
// (O schema de REGISTRATION_UPDATED nao permite idempotencyKey, entao a
// idempotencia e por re-derivacao, nao por chave.)
//
// DEPENDENCIA: rodar SO depois do recurso owner+safra-reativo estar deployado em
// prod — senao edicoes de origem reintroduzem drift logo apos o backfill.
//
// Escopo: exclui ligas INVALIDATED (terminais; o event store recusaria com 409).
// Inclui SOLD/LOST (sao commercialStatus; o lifecycle continua valido). Origens
// INVALIDATED ainda contam na derivacao (fidelidade ao reativo).
//
// Uso:
//   node scripts/migrations/backfill-liga-harvest-owner.js [--dry-run] [--single-batch]
//
// --dry-run: imprime liga a liga o que mudaria; emite NADA.
// --single-batch: um unico appendEventBatch (all-or-nothing) em vez de chunks.

import { pathToFileURL } from 'node:url';

import { PrismaClient } from '@prisma/client';

import { EventContractDbService } from '../../src/events/event-contract-db-service.js';
import { PrismaEventStore } from '../../src/events/prisma-event-store.js';
import { buildEventEnvelope } from '../../src/samples/sample-event-factory.js';
import { SampleQueryService } from '../../src/samples/sample-query-service.js';
import { planBlendBackfill } from '../../src/samples/blend-backfill.js';

// 6 palavras (<= 10, passa no regex de reasonText do schema).
const BACKFILL_REASON_TEXT = 'Liga recalculada em backfill de origem';
const DEFAULT_CHUNK_SIZE = 50;

export async function run({
  prisma,
  eventService,
  queryService,
  dryRun = false,
  singleBatch = false,
  chunkSize = DEFAULT_CHUNK_SIZE,
  log = console.log,
}) {
  const allLigas = await prisma.sample.findMany({
    where: { isBlend: true },
    select: {
      id: true,
      version: true,
      status: true,
      commercialStatus: true,
      internalLotNumber: true,
      declaredHarvest: true,
      ownerClientId: true,
      declaredOwner: true,
    },
  });

  // INVALIDATED e terminal: o event store recusa novos eventos. Exclui de cara.
  const excluded = [];
  const ligas = [];
  for (const liga of allLigas) {
    if (liga.status === 'INVALIDATED') {
      excluded.push({
        sampleId: liga.id,
        internalLotNumber: liga.internalLotNumber,
        reason: 'INVALIDATED',
      });
      continue;
    }
    ligas.push({
      sampleId: liga.id,
      version: liga.version,
      status: liga.status,
      commercialStatus: liga.commercialStatus,
      internalLotNumber: liga.internalLotNumber,
      declaredHarvest: liga.declaredHarvest,
      ownerClientId: liga.ownerClientId,
      declaredOwner: liga.declaredOwner,
    });
  }

  const componentsByBlendId = await queryService.loadDirectOriginsForBlends(
    ligas.map((liga) => liga.sampleId)
  );

  // Estado atual de TODA liga em escopo + TODA origem (origens nao-liga sao o
  // fallback da derivacao). Um findMany pelos ids unicos.
  const stateIds = new Set(ligas.map((liga) => liga.sampleId));
  for (const origins of componentsByBlendId.values()) {
    for (const origin of origins) stateIds.add(origin.originId);
  }
  const stateRows = await prisma.sample.findMany({
    where: { id: { in: Array.from(stateIds) } },
    select: { id: true, declaredHarvest: true, ownerClientId: true, declaredOwner: true },
  });
  const currentStateBySampleId = new Map(
    stateRows.map((row) => [
      row.id,
      {
        harvest: row.declaredHarvest,
        ownerClientId: row.ownerClientId,
        declaredOwner: row.declaredOwner,
      },
    ])
  );

  const { diffs, skipped } = planBlendBackfill({
    ligas,
    componentsByBlendId,
    currentStateBySampleId,
  });
  const noop = ligas.length - diffs.length - skipped.length;

  log(
    `[backfill-liga] ligas=${allLigas.length} inScope=${ligas.length} toUpdate=${diffs.length} ` +
      `noop=${noop} excluded=${excluded.length} skipped=${skipped.length} dryRun=${dryRun}`
  );
  for (const diff of diffs) {
    const parts = [];
    if (diff.harvestChanged)
      parts.push(`safra "${diff.currentHarvest ?? ''}" -> "${diff.newHarvest ?? ''}"`);
    if (diff.ownerChanged)
      parts.push(`owner "${diff.currentOwner ?? ''}" -> "${diff.newOwner ?? ''}"`);
    log(
      `[backfill-liga][${dryRun ? 'DRY' : 'WRITE'}] ${diff.internalLotNumber ?? diff.sampleId}: ${parts.join(' | ')}`
    );
  }
  for (const item of skipped)
    log(`[backfill-liga][SKIP:${item.reason}] ${item.internalLotNumber ?? item.sampleId}`);
  for (const item of excluded)
    log(`[backfill-liga][EXCLUDED:${item.reason}] ${item.internalLotNumber ?? item.sampleId}`);

  const summary = {
    total: allLigas.length,
    toUpdate: diffs.length,
    noop,
    excluded: excluded.length,
    skipped: skipped.length,
    applied: 0,
  };

  if (dryRun || diffs.length === 0) {
    log(`[backfill-liga] done (no writes): ${JSON.stringify(summary)}`);
    return summary;
  }

  // Apply: drafts REGISTRATION_UPDATED, ator SYSTEM, expectedVersion por liga.
  // Diffs ja vem em ordem topo (filho antes do pai).
  const drafts = diffs.map((diff) =>
    buildEventEnvelope({
      eventType: 'REGISTRATION_UPDATED',
      sampleId: diff.sampleId,
      payload: {
        before: diff.before,
        after: diff.after,
        reasonCode: 'DATA_FIX',
        reasonText: BACKFILL_REASON_TEXT,
      },
      fromStatus: null,
      toStatus: null,
      module: 'registration',
      actorContext: { actorType: 'SYSTEM' },
    })
  );
  const optionsByIndex = diffs.map((diff) => ({ expectedVersion: diff.version }));

  if (singleBatch) {
    await eventService.appendEventBatch(drafts, optionsByIndex);
    summary.applied = drafts.length;
  } else {
    for (let i = 0; i < drafts.length; i += chunkSize) {
      const chunk = drafts.slice(i, i + chunkSize);
      const chunkOptions = optionsByIndex.slice(i, i + chunkSize);
      await eventService.appendEventBatch(chunk, chunkOptions);
      summary.applied += chunk.length;
      log(`[backfill-liga] chunk aplicado: ${summary.applied}/${drafts.length}`);
    }
  }

  log(`[backfill-liga] done: ${JSON.stringify(summary)}`);
  return summary;
}

// CLI: roda so quando executado direto (nao quando importado pelo teste).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prisma = new PrismaClient();
  const store = new PrismaEventStore(prisma);
  const eventService = new EventContractDbService({ store });
  const queryService = new SampleQueryService({ prisma });

  run({
    prisma,
    eventService,
    queryService,
    dryRun: process.argv.includes('--dry-run'),
    singleBatch: process.argv.includes('--single-batch'),
  })
    .catch((err) => {
      console.error('[backfill-liga] erro:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
