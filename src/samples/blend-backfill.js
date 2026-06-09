// Liga: backfill PURO de safra + proprietario das ligas existentes.
//
// Context: ligas criadas antes do modelo reativo tem declaredHarvest /
// ownerClientId / declaredOwner congelados da criacao — podem estar stale em
// relacao as origens atuais. Esta funcao recalcula cada liga a partir das
// origens (mesma derivacao canonica do reativo) e devolve, para as ligas stale,
// os diffs prontos pra virar eventos REGISTRATION_UPDATED.
//
// Funcao PURA (sem IO, sem Prisma): recebe os dados ja carregados e devolve
// { diffs, skipped }. O script scripts/migrations/backfill-liga-harvest-owner.js
// faz o IO (load + emit). Separar assim deixa a logica 100% testavel sem banco.
//
// Espelha _buildBlendPropagation (sample-command-service.js), mas GLOBAL (toda
// liga, nao os ancestrais de UMA origem editada): ordena as ligas bottom-up
// (sub-ligas antes dos pais), threada um mapa de estado (le origem do mapa
// primeiro, sempre reescreve o estado recalculado), e emite diff so quando safra
// OU owner mudam (owner comparado por id). before/after seguem a shape que o
// projetor entende (harvest em declared.harvest; owner top-level ownerClientId +
// declared.owner).

import { deriveBlendHarvest, deriveBlendOwner } from './blend-harvest.js';

// Espelha MAX_BLEND_DEPTH de sample-query-service.js (os loaders cortam em
// depth < 10). Ligas mais fundas que isso ficam fora da cobertura reativa, entao
// o backfill tambem as pula (consistencia).
const MAX_BLEND_DEPTH = 10;

/**
 * Recalcula safra+owner de todas as ligas e devolve os diffs das stale.
 *
 * @param {Object} input
 * @param {Array<{sampleId, version, status, commercialStatus, internalLotNumber, declaredHarvest, ownerClientId, declaredOwner}>} input.ligas
 *   Toda liga em escopo (ja sem INVALIDATED — a exclusao e do chamador).
 * @param {Map<string, Array<{originId, declaredHarvest, ownerClientId, declaredOwner}>>} input.componentsByBlendId
 *   Origens diretas por liga (saida de loadDirectOriginsForBlends).
 * @param {Map<string, {harvest, ownerClientId, declaredOwner}>} input.currentStateBySampleId
 *   Projecao atual de toda liga + toda origem (origens nao-liga sao o fallback).
 * @returns {{ diffs: Array, skipped: Array<{sampleId, internalLotNumber, reason}> }}
 */
export function planBlendBackfill({ ligas, componentsByBlendId, currentStateBySampleId }) {
  const ligaIds = new Set(ligas.map((liga) => liga.sampleId));
  const ligaById = new Map(ligas.map((liga) => [liga.sampleId, liga]));

  // --- Ordenacao topologica bottom-up (Kahn) sobre o subgrafo de ligas ---
  // Aresta origem(liga) -> liga: uma liga so e processada depois das ligas que
  // ela contem como origem (pra ler o valor recalculado da sub-liga). in-degree
  // de uma liga = numero de origens que tambem sao ligas.
  const ligaOriginsByBlend = new Map();
  const dependents = new Map();
  const inDegree = new Map();
  for (const liga of ligas) {
    const origins = componentsByBlendId.get(liga.sampleId) ?? [];
    const ligaOrigins = origins.map((o) => o.originId).filter((originId) => ligaIds.has(originId));
    ligaOriginsByBlend.set(liga.sampleId, ligaOrigins);
    inDegree.set(liga.sampleId, ligaOrigins.length);
    for (const originId of ligaOrigins) {
      if (!dependents.has(originId)) dependents.set(originId, []);
      dependents.get(originId).push(liga.sampleId);
    }
  }

  const queue = [];
  for (const liga of ligas) {
    if ((inDegree.get(liga.sampleId) ?? 0) === 0) queue.push(liga.sampleId);
  }
  const ordered = [];
  while (queue.length > 0) {
    const id = queue.shift();
    ordered.push(id);
    for (const dependent of dependents.get(id) ?? []) {
      const next = inDegree.get(dependent) - 1;
      inDegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }

  const skipped = [];

  // Ciclo (inclui self-origin = 1-ciclo): ligas com in-degree residual nunca
  // entraram em `ordered`. Pula-as sem nunca loopar (Kahn nao recursa).
  const orderedSet = new Set(ordered);
  for (const liga of ligas) {
    if (!orderedSet.has(liga.sampleId)) {
      skipped.push({
        sampleId: liga.sampleId,
        internalLotNumber: liga.internalLotNumber,
        reason: 'CYCLE',
      });
    }
  }

  // Profundidade: depth(liga) = 1 + max(depth das origens-liga). Calculada na
  // ordem topo (origens antes), entao a leitura ja esta pronta. Pula >= MAX.
  const depthById = new Map();
  const overDepth = new Set();
  for (const id of ordered) {
    const ligaOrigins = ligaOriginsByBlend.get(id) ?? [];
    let depth = 0;
    for (const originId of ligaOrigins) {
      depth = Math.max(depth, (depthById.get(originId) ?? 0) + 1);
    }
    depthById.set(id, depth);
    if (depth >= MAX_BLEND_DEPTH) {
      overDepth.add(id);
      skipped.push({
        sampleId: id,
        internalLotNumber: ligaById.get(id)?.internalLotNumber ?? null,
        reason: 'DEPTH_EXCEEDED',
      });
    }
  }

  // --- Recalculo em ordem topo, threading uma copia do mapa de estado ---
  const state = new Map(currentStateBySampleId);
  const diffs = [];
  for (const id of ordered) {
    if (overDepth.has(id)) continue;
    const liga = ligaById.get(id);
    const origins = componentsByBlendId.get(id) ?? [];

    const recalcHarvest = deriveBlendHarvest(
      origins.map((origin) => state.get(origin.originId)?.harvest ?? origin.declaredHarvest)
    );
    const recalcOwner = deriveBlendOwner(
      origins.map((origin) => {
        const originState = state.get(origin.originId);
        return originState
          ? { ownerClientId: originState.ownerClientId, declaredOwner: originState.declaredOwner }
          : { ownerClientId: origin.ownerClientId, declaredOwner: origin.declaredOwner };
      })
    );

    // Registra SEMPRE (mesmo no no-op) pra ligas-pai lerem o valor certo.
    state.set(id, {
      harvest: recalcHarvest,
      ownerClientId: recalcOwner.ownerClientId,
      declaredOwner: recalcOwner.declaredOwner,
    });

    const harvestChanged = recalcHarvest !== liga.declaredHarvest;
    const ownerChanged = recalcOwner.ownerClientId !== liga.ownerClientId;
    // No-op: nem safra nem owner mudam -> nao emite (idempotencia estrutural).
    if (!harvestChanged && !ownerChanged) continue;

    // before/after so com os campos que mudam (schema exige minProperties:1;
    // owner em after.ownerClientId top-level + after.declared.owner — formato
    // que o projetor entende, igual ao reativo).
    const before = { declared: {} };
    const after = { declared: {} };
    if (harvestChanged) {
      before.declared.harvest = liga.declaredHarvest;
      after.declared.harvest = recalcHarvest;
    }
    if (ownerChanged) {
      before.ownerClientId = liga.ownerClientId;
      after.ownerClientId = recalcOwner.ownerClientId;
      before.declared.owner = liga.declaredOwner;
      after.declared.owner = recalcOwner.declaredOwner;
    }

    diffs.push({
      sampleId: id,
      version: liga.version,
      internalLotNumber: liga.internalLotNumber,
      status: liga.status,
      commercialStatus: liga.commercialStatus,
      currentHarvest: liga.declaredHarvest,
      newHarvest: recalcHarvest,
      currentOwner: liga.declaredOwner,
      newOwner: recalcOwner.declaredOwner,
      harvestChanged,
      ownerChanged,
      before,
      after,
    });
  }

  return { diffs, skipped };
}
