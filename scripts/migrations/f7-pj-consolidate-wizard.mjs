#!/usr/bin/env node
// F7.2' Consolidate Wizard
//
// Operacao DESTRUTIVA: para cada PJ com mais de uma branch ATIVA,
// preserva apenas a branch primary (matriz) e DELETA todas as
// secundarias. Antes de deletar, re-aima samples e movimentos para a
// primary, e remove audit events vinculados as branches deletadas via
// escape valve `app.allow_audit_mutation = 'wizard_f51'` (mesma chave do
// f5-merge-wizard, ja existente no trigger F5.1A).
//
// Difere do f7-pj-split-wizard.mjs (removido em F7.2'): aqui nao se cria
// novo Client. As samples reapontam para a branch primary, as branches
// secundarias sumem do banco junto com seu historico.
//
// Cada PJ consolidado recebe 1 audit event `CLIENT_BRANCH_CONSOLIDATED`
// na primary, com payload contendo CNPJ, cidade e contagens das branches
// removidas — e a unica memoria duradoura da operacao.
//
// Uso:
//   node scripts/migrations/f7-pj-consolidate-wizard.mjs --dry-run               # padrao
//   node scripts/migrations/f7-pj-consolidate-wizard.mjs --apply
//   node scripts/migrations/f7-pj-consolidate-wizard.mjs --apply --non-interactive
//   node scripts/migrations/f7-pj-consolidate-wizard.mjs --apply --answers=PATH
//
// Idempotente: rodar 2x nao causa estrago — se nenhum PJ tem >1 branch
// ATIVA, o wizard pula. ⚠ ATENCAO: a operacao e IRREVERSIVEL no banco.
// Pos-aplicacao gera tmp/f7-consolidate-undo-*.sql como fallback
// best-effort.

import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const isDryRun = args.includes('--dry-run') || !isApply;
const isNonInteractive = args.includes('--non-interactive');
const verbose = args.includes('--verbose');

const answersFlag = args.find((a) => a.startsWith('--answers='));
const answersPath = answersFlag ? answersFlag.slice('--answers='.length) : null;
const scriptedAnswers = answersPath
  ? readFileSync(answersPath, 'utf8')
      .split('\n')
      .map((l) => l.replace(/\r$/, ''))
  : null;
let scriptedIdx = 0;

function nextScriptedAnswer() {
  if (!scriptedAnswers) return null;
  if (scriptedIdx >= scriptedAnswers.length) {
    throw new Error(`scripted answers exhausted at index ${scriptedIdx} (${answersPath})`);
  }
  return scriptedAnswers[scriptedIdx++];
}

const prisma = new PrismaClient();
const useReadline = !isNonInteractive && !scriptedAnswers;
const rl = useReadline ? readline.createInterface({ input: stdin, output: stdout }) : null;

async function ask(prompt, { defaultYes = true } = {}) {
  if (scriptedAnswers) {
    const a = (nextScriptedAnswer() ?? '').trim().toLowerCase();
    if (a === '') return defaultYes;
    return ['y', 'yes', 's', 'sim'].includes(a);
  }
  if (isNonInteractive) return defaultYes;
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = (await rl.question(`${prompt} ${suffix}: `)).trim().toLowerCase();
  if (answer === '') return defaultYes;
  return ['y', 'yes', 's', 'sim'].includes(answer);
}

function log(...parts) {
  console.log('[wizard]', ...parts);
}

function logVerbose(...parts) {
  if (verbose) console.log('[wizard][verbose]', ...parts);
}

function bigIntReplacer(_key, value) {
  return typeof value === 'bigint' ? Number(value) : value;
}

// ----------------------------------------------------------------------------
// Step 1 — Carrega PJs alvo (com >1 branch ATIVA) e suas branches
// ----------------------------------------------------------------------------

async function loadPjsToConsolidate(client) {
  const rows = await client.$queryRaw`
    SELECT c.id::text   AS id,
           c.code        AS code,
           c.legal_name  AS legal_name,
           c.cnpj_root   AS cnpj_root
    FROM client c
    WHERE c.person_type = 'PJ'
      AND (
        SELECT COUNT(*) FROM client_branch b
         WHERE b.client_id = c.id AND b.status = 'ACTIVE'
      ) > 1
    ORDER BY c.code ASC
  `;
  return rows;
}

async function loadActiveBranches(client, clientId) {
  return client.clientBranch.findMany({
    where: { clientId, status: 'ACTIVE' },
    orderBy: [{ isPrimary: 'desc' }, { code: 'asc' }],
  });
}

async function countSamplesForBranch(client, branchId) {
  const result = await client.sample.count({ where: { ownerBranchId: branchId } });
  return result;
}

async function countMovementsForBranch(client, branchId) {
  const result = await client.sampleMovement.count({ where: { buyerBranchId: branchId } });
  return result;
}

async function countAuditEventsForBranch(client, branchId) {
  const result = await client.clientAuditEvent.count({ where: { targetBranchId: branchId } });
  return result;
}

// ----------------------------------------------------------------------------
// Step 2 — Snapshot completo das branches a deletar (para undo SQL)
// ----------------------------------------------------------------------------

async function snapshotBranchAndDependents(client, branchId) {
  const branch = await client.clientBranch.findUnique({ where: { id: branchId } });
  const samples = await client.sample.findMany({
    where: { ownerBranchId: branchId },
    select: { id: true, ownerBranchId: true },
  });
  const movements = await client.sampleMovement.findMany({
    where: { buyerBranchId: branchId },
    select: { id: true, buyerBranchId: true },
  });
  const auditEvents = await client.clientAuditEvent.findMany({
    where: { targetBranchId: branchId },
  });
  return { branch, samples, movements, auditEvents };
}

// ----------------------------------------------------------------------------
// Step 3 — Constroi o plano com prompts (fora de transacao)
// ----------------------------------------------------------------------------

async function buildConsolidationPlan(client) {
  const pjs = await loadPjsToConsolidate(client);
  const plan = { items: [] };

  if (pjs.length === 0) {
    log('nenhum PJ com >1 branch ativa. nada a consolidar.');
    return plan;
  }

  log(`detectados ${pjs.length} PJ(s) para consolidacao`);

  for (const pj of pjs) {
    const branches = await loadActiveBranches(client, pj.id);
    const primary = branches.find((b) => b.isPrimary) ?? branches[0];
    const secondaries = branches.filter((b) => b.id !== primary.id);

    const counts = await Promise.all(
      secondaries.map(async (b) => ({
        branch: b,
        samples: await countSamplesForBranch(client, b.id),
        movements: await countMovementsForBranch(client, b.id),
        audits: await countAuditEventsForBranch(client, b.id),
      }))
    );

    const totalSamples = counts.reduce((acc, c) => acc + c.samples, 0);
    const totalMovements = counts.reduce((acc, c) => acc + c.movements, 0);
    const totalAudits = counts.reduce((acc, c) => acc + c.audits, 0);

    console.log('');
    console.log(`  PJ code=${pj.code} "${pj.legal_name ?? '(sem nome)'}"`);
    console.log(
      `    matriz fica: branch code=${primary.code} cnpj=${primary.cnpj ?? '-'} ${primary.city ?? '(sem cidade)'}/${primary.state ?? '-'}`
    );
    console.log(`    a DELETAR: ${secondaries.length} branch(es)`);
    for (const c of counts) {
      console.log(
        `      - branch code=${c.branch.code} cnpj=${c.branch.cnpj ?? '-'} ${c.branch.city ?? '(sem cidade)'} | samples=${c.samples} movements=${c.movements} audits=${c.audits}`
      );
    }
    console.log(
      `    -> ${totalSamples} sample(s), ${totalMovements} movement(s) reapontam para branch ${primary.code}; ${totalAudits} audit event(s) deletados`
    );

    const proceed = await ask(`  Consolidar este PJ?`, { defaultYes: true });
    if (!proceed) {
      plan.items.push({ ...pj, skipped: true, reason: 'usuario recusou' });
      continue;
    }

    plan.items.push({
      ...pj,
      primaryId: primary.id,
      primaryCode: primary.code,
      primaryCnpj: primary.cnpj,
      primaryCity: primary.city,
      primaryState: primary.state,
      secondaries: counts.map((c) => ({
        branchId: c.branch.id,
        branchCode: c.branch.code,
        branchCnpj: c.branch.cnpj,
        branchCity: c.branch.city,
        branchState: c.branch.state,
        sampleCount: c.samples,
        movementCount: c.movements,
        auditCount: c.audits,
      })),
    });
  }

  return plan;
}

function summarizePlan(plan) {
  let totalBranches = 0;
  let totalSamples = 0;
  let totalMovements = 0;
  let totalAudits = 0;
  for (const pj of plan.items) {
    if (pj.skipped) {
      console.log(`  - PJ code=${pj.code} pulado (${pj.reason})`);
      continue;
    }
    console.log(
      `  - PJ code=${pj.code} -> mantém branch ${pj.primaryCode}; deleta ${pj.secondaries.length} branch(es)`
    );
    for (const s of pj.secondaries) {
      console.log(
        `      * branch ${s.branchCode} cnpj=${s.branchCnpj ?? '-'} (samples=${s.sampleCount}, movements=${s.movementCount}, audits=${s.auditCount})`
      );
      totalBranches++;
      totalSamples += s.sampleCount;
      totalMovements += s.movementCount;
      totalAudits += s.auditCount;
    }
  }
  return { totalBranches, totalSamples, totalMovements, totalAudits };
}

// ----------------------------------------------------------------------------
// Step 4 — Aplica a consolidacao em transacao atomica
// ----------------------------------------------------------------------------

async function applyConsolidation(tx, plan, snapshots) {
  const stats = {
    branchesDeleted: 0,
    samplesReaimed: 0,
    movementsReaimed: 0,
    auditEventsDeleted: 0,
    consolidationEventsEmitted: 0,
  };

  for (const pj of plan.items) {
    if (pj.skipped || pj.secondaries.length === 0) continue;

    const consolidatedBranchesPayload = [];

    for (const sec of pj.secondaries) {
      // a. Re-aim samples desta branch para a primary
      const samples = await tx.sample.updateMany({
        where: { ownerBranchId: sec.branchId },
        data: { ownerBranchId: pj.primaryId },
      });
      stats.samplesReaimed += samples.count;
      logVerbose(`branch ${sec.branchCode}: ${samples.count} sample(s) reapontadas`);

      // b. Re-aim movimentos desta branch para a primary
      const movements = await tx.sampleMovement.updateMany({
        where: { buyerBranchId: sec.branchId },
        data: { buyerBranchId: pj.primaryId },
      });
      stats.movementsReaimed += movements.count;

      // c. DELETE audit events vinculados a esta branch (precisa escape valve)
      const auditsDeleted = await tx.clientAuditEvent.deleteMany({
        where: { targetBranchId: sec.branchId },
      });
      stats.auditEventsDeleted += auditsDeleted.count;

      // d. DELETE a branch
      await tx.clientBranch.delete({ where: { id: sec.branchId } });
      stats.branchesDeleted++;

      consolidatedBranchesPayload.push({
        branchId: sec.branchId,
        branchCode: sec.branchCode,
        branchCnpj: sec.branchCnpj,
        branchCity: sec.branchCity,
        branchState: sec.branchState,
        samplesReaimed: samples.count,
        movementsReaimed: movements.count,
        auditEventsDeleted: auditsDeleted.count,
      });
    }

    // e. Emite 1 audit event CLIENT_BRANCH_CONSOLIDATED no Client (target_branch_id
    //    aponta para a primary que sobrou — preserva rastreabilidade da operacao)
    await tx.clientAuditEvent.create({
      data: {
        eventId: randomUUID(),
        targetClientId: pj.id,
        targetBranchId: pj.primaryId,
        eventType: 'CLIENT_BRANCH_CONSOLIDATED',
        payload: {
          consolidatedAt: new Date().toISOString(),
          primaryBranchId: pj.primaryId,
          primaryBranchCode: pj.primaryCode,
          primaryBranchCnpj: pj.primaryCnpj,
          deletedBranches: consolidatedBranchesPayload,
        },
        requestId: `wizard-f72p-${Date.now().toString(36)}-${pj.id.slice(0, 8)}`,
        reasonText: `F7.2': consolidacao de ${pj.secondaries.length} branch(es) secundaria(s) na matriz`,
      },
    });
    stats.consolidationEventsEmitted++;
  }

  return stats;
}

// ----------------------------------------------------------------------------
// Step 5 — Validacoes pos-consolidacao
// ----------------------------------------------------------------------------

async function validateInvariants(tx) {
  const issues = [];

  // 1. Cada PJ tem no maximo 1 branch ATIVA
  const pjsWithMultiple = await tx.$queryRaw`
    SELECT c.id::text AS id, c.code AS code,
           COUNT(*)::int AS active_count
    FROM client c JOIN client_branch b ON b.client_id = c.id
    WHERE c.person_type = 'PJ' AND b.status = 'ACTIVE'
    GROUP BY c.id, c.code
    HAVING COUNT(*) > 1
  `;
  if (pjsWithMultiple.length > 0) {
    issues.push(`${pjsWithMultiple.length} PJ(s) ainda com >1 branch ativa`);
  }

  // 2. Sanity FK: nenhum sample com owner_branch_id em branch cujo client_id
  //    diverge de owner_client_id (caso a re-aim tenha falhado)
  const mismatch = await tx.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM sample s
    JOIN client_branch b ON b.id = s.owner_branch_id
    WHERE s.owner_client_id IS NOT NULL
      AND s.owner_client_id <> b.client_id
  `;
  if (mismatch[0]?.count > 0) {
    issues.push(`${mismatch[0].count} sample(s) com owner_client_id != branch.client_id`);
  }

  // 3. Defesa: nenhuma sample apontando para uma branch que nao existe mais
  //    (FK Restrict ja impede DELETE de branch enquanto sample referencia,
  //    mas re-checa explicitamente como safety net)
  const orphans = await tx.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM sample s
    WHERE s.owner_branch_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM client_branch b WHERE b.id = s.owner_branch_id)
  `;
  if (orphans[0]?.count > 0) {
    issues.push(`${orphans[0].count} sample(s) apontando para branch inexistente`);
  }

  return issues;
}

// ----------------------------------------------------------------------------
// Step 6 — Relatorio JSON e SQL undo (best-effort)
// ----------------------------------------------------------------------------

function ensureTmpDir() {
  const dir = path.resolve(process.cwd(), 'tmp');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeReport(plan, stats, totalsBefore, totalsAfter) {
  const dir = ensureTmpDir();
  const fname = `f7-consolidate-report-${Date.now()}.json`;
  const fpath = path.join(dir, fname);
  const body = {
    runAt: new Date().toISOString(),
    mode: isApply ? 'apply' : 'dry-run',
    plan,
    stats,
    totalsBefore,
    totalsAfter,
  };
  writeFileSync(fpath, JSON.stringify(body, bigIntReplacer, 2) + '\n');
  return fpath;
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return `'${value.toISOString()}'::timestamptz`;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function generateUndoScript(plan, snapshots) {
  const dir = ensureTmpDir();
  const fname = `f7-consolidate-undo-${Date.now()}.sql`;
  const fpath = path.join(dir, fname);

  const lines = [
    '-- F7.2 prime UNDO SCRIPT (best-effort)',
    `-- Gerado em ${new Date().toISOString()}`,
    '-- Reverte a consolidacao destrutiva: re-cria branches deletadas, restaura',
    '-- sample.owner_branch_id e sample_movement.buyer_branch_id, e re-emite',
    '-- audit events com novos requestId/eventId.',
    '--',
    '-- LIMITACOES:',
    '--   * Os audit events recriados terao novos eventId/createdAt/requestId.',
    '--     Apenas o conteudo (payload, reasonText) e preservado.',
    '--   * O audit event CLIENT_BRANCH_CONSOLIDATED emitido pela operacao',
    '--     permanece no banco (representa o registro do que foi feito) — voce',
    '--     pode dropar manualmente apos verificar.',
    '--',
    '-- Pre-requisitos:',
    "--   * SET LOCAL app.allow_audit_mutation = 'wizard_f51' (para emitir os",
    '--     audit events recriados — INSERT em append-only e livre, mas algumas',
    '--     sequencias podem requerer).',
    '',
    'BEGIN;',
    "SET LOCAL app.allow_audit_mutation = 'wizard_f51';",
    '',
  ];

  for (const pj of plan.items) {
    if (pj.skipped || pj.secondaries.length === 0) continue;
    lines.push(`-- Reverte PJ code=${pj.code} (${pj.secondaries.length} branch(es))`);
    for (const sec of pj.secondaries) {
      const snap = snapshots[sec.branchId];
      if (!snap || !snap.branch) {
        lines.push(`-- ⚠ snapshot ausente para branch ${sec.branchId}; skip.`);
        continue;
      }
      const b = snap.branch;
      lines.push(`-- branch code=${b.code} cnpj=${b.cnpj ?? '-'}`);
      lines.push(
        `INSERT INTO client_branch (id, client_id, name, is_primary, code, cnpj, cnpj_order, legal_name, trade_name, phone, address_line, district, city, state, postal_code, complement, registration_number, registration_number_canonical, registration_type, status, created_at, updated_at)`
      );
      lines.push(
        `VALUES (${sqlString(b.id)}, ${sqlString(b.clientId)}, ${sqlString(b.name)}, ${sqlString(b.isPrimary)}, ${sqlString(b.code)}, ${sqlString(b.cnpj)}, ${sqlString(b.cnpjOrder)}, ${sqlString(b.legalName)}, ${sqlString(b.tradeName)}, ${sqlString(b.phone)}, ${sqlString(b.addressLine)}, ${sqlString(b.district)}, ${sqlString(b.city)}, ${sqlString(b.state)}, ${sqlString(b.postalCode)}, ${sqlString(b.complement)}, ${sqlString(b.registrationNumber)}, ${sqlString(b.registrationNumberCanonical)}, ${sqlString(b.registrationType)}, ${sqlString(b.status)}, ${sqlString(b.createdAt)}, ${sqlString(b.updatedAt)});`
      );

      // Restaura samples
      const sampleIds = snap.samples.map((s) => `'${s.id}'`).join(', ');
      if (sampleIds) {
        lines.push(
          `UPDATE sample SET owner_branch_id = ${sqlString(b.id)} WHERE id IN (${sampleIds});`
        );
      }
      const movementIds = snap.movements.map((m) => `'${m.id}'`).join(', ');
      if (movementIds) {
        lines.push(
          `UPDATE sample_movement SET buyer_branch_id = ${sqlString(b.id)} WHERE id IN (${movementIds});`
        );
      }

      // Re-emite audit events com novos eventId/createdAt
      for (const ae of snap.auditEvents) {
        lines.push(
          `INSERT INTO client_audit_event (event_id, target_client_id, target_branch_id, actor_user_id, event_type, payload, reason_text, request_id, correlation_id, metadata_ip, metadata_user_agent, created_at)`
        );
        lines.push(
          `VALUES (gen_random_uuid(), ${sqlString(ae.targetClientId)}, ${sqlString(ae.targetBranchId)}, ${sqlString(ae.actorUserId)}, ${sqlString(ae.eventType)}, ${sqlString(ae.payload)}, ${sqlString(ae.reasonText)}, ${sqlString(ae.requestId + '-undo')}, ${sqlString(ae.correlationId)}, ${sqlString(ae.metadataIp)}, ${sqlString(ae.metadataUserAgent)}, NOW());`
        );
      }
      lines.push('');
    }
  }

  lines.push('COMMIT;');
  writeFileSync(fpath, lines.join('\n') + '\n');
  return fpath;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function snapshotTotals(client) {
  return {
    clients: await client.client.count(),
    pjClients: await client.client.count({ where: { personType: 'PJ' } }),
    branches: await client.clientBranch.count(),
    activeBranches: await client.clientBranch.count({ where: { status: 'ACTIVE' } }),
    samples: await client.sample.count(),
  };
}

async function main() {
  log(`mode = ${isApply ? '--apply' : '--dry-run'} interactive=${useReadline}`);

  const plan = await buildConsolidationPlan(prisma);

  console.log('');
  log('--- PLANO ---');
  const summary = summarizePlan(plan);
  console.log('');

  if (summary.totalBranches === 0) {
    log('nada a consolidar. encerrando.');
    return;
  }

  log(
    `total: ${summary.totalBranches} branch(es) deletadas, ${summary.totalSamples} sample(s) reapontadas, ${summary.totalMovements} movement(s) reapontados, ${summary.totalAudits} audit(s) deletados`
  );

  if (isApply) {
    const proceed = await ask(
      '⚠ aplicar consolidacao agora? operacao IRREVERSIVEL no banco (undo SQL gerado em tmp/ e best-effort)',
      { defaultYes: false }
    );
    if (!proceed) {
      log('abortado pelo usuario antes de aplicar.');
      return;
    }
  }

  // Snapshot fora da tx (evita acoplar leituras a tx atomica curta)
  const snapshots = {};
  for (const pj of plan.items) {
    if (pj.skipped) continue;
    for (const sec of pj.secondaries) {
      snapshots[sec.branchId] = await snapshotBranchAndDependents(prisma, sec.branchId);
    }
  }

  const totalsBefore = await snapshotTotals(prisma);
  log('totais ANTES:', totalsBefore);

  let stats = null;
  const TX_TIMEOUT_MS = 120_000;
  const TX_MAX_WAIT_MS = 30_000;

  try {
    await prisma.$transaction(
      async (tx) => {
        // Escape valve necessario para o DELETE em client_audit_event
        // (trigger reject_client_audit_event_mutation, F5.1A).
        await tx.$executeRawUnsafe(`SET LOCAL app.allow_audit_mutation = 'wizard_f51'`);
        // Reservado para o trigger F7.1B (enforce_pj_single_active_branch),
        // que ainda nao esta no banco — idempotente se ausente.
        await tx.$executeRawUnsafe(`SET LOCAL app.allow_split_wizard = 'on'`);

        stats = await applyConsolidation(tx, plan, snapshots);
        log('consolidacao executada:', stats);

        const issues = await validateInvariants(tx);
        if (issues.length > 0) {
          for (const i of issues) console.error('[wizard][INVARIANTE FALHOU]', i);
          throw new Error('invariante pos-consolidacao falhou — transacao revertida');
        }
        log('invariantes OK');

        if (isDryRun) {
          throw new Error('__DRY_RUN_ROLLBACK__');
        }
      },
      { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS }
    );
  } catch (err) {
    if (err.message === '__DRY_RUN_ROLLBACK__') {
      log('dry-run: rollback forcado — nada foi gravado no banco');
    } else {
      throw err;
    }
  }

  const totalsAfter = await snapshotTotals(prisma);
  log('totais DEPOIS:', totalsAfter);

  if (!stats) {
    stats = {
      branchesDeleted: 0,
      samplesReaimed: 0,
      movementsReaimed: 0,
      auditEventsDeleted: 0,
      consolidationEventsEmitted: 0,
    };
  }

  const reportPath = writeReport(plan, stats, totalsBefore, totalsAfter);
  log(`relatorio salvo em ${reportPath}`);

  if (isApply) {
    const undoPath = generateUndoScript(plan, snapshots);
    log(`script de UNDO (best-effort) salvo em ${undoPath}`);
    log('atencao: undo recria audit events com novos eventId/createdAt.');
  }
}

main()
  .catch((err) => {
    console.error('[wizard] ERRO:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (rl) rl.close();
    await prisma.$disconnect();
  });
