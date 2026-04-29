#!/usr/bin/env node
// F7.0 — Auditoria de produção (read-only)
//
// Objetivo: dimensionar a fissão de PJs com mais de uma branch ativa e
// validar invariantes do schema antes de aplicar F7.1/F7.2.
//
// Uso:
//   DATABASE_URL=... node scripts/audits/f7-prod-audit.mjs
//   node scripts/audits/f7-prod-audit.mjs --json > tmp/f7-audit.json
//
// Não realiza nenhuma escrita. Pode ser executado em prod com segurança.

import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const verbose = args.includes('--verbose');

const prisma = new PrismaClient({
  log: verbose ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

function header(text) {
  if (asJson) return;
  const bar = '─'.repeat(text.length + 4);
  console.log('');
  console.log(bar);
  console.log(`  ${text}  `);
  console.log(bar);
}

function info(...parts) {
  if (asJson) return;
  console.log('  ', ...parts);
}

async function q1_pjsWithMultipleActiveBranches() {
  const rows = await prisma.$queryRaw`
    SELECT c.id::text         AS client_id,
           c.code              AS client_code,
           c.legal_name        AS legal_name,
           c.trade_name        AS trade_name,
           c.cnpj_root         AS cnpj_root,
           c.status            AS client_status,
           COUNT(*) FILTER (WHERE b.status = 'ACTIVE')   AS active_branches,
           COUNT(*) FILTER (WHERE b.status = 'INACTIVE') AS inactive_branches
    FROM client c
    JOIN client_branch b ON b.client_id = c.id
    WHERE c.person_type = 'PJ'
    GROUP BY c.id, c.code, c.legal_name, c.trade_name, c.cnpj_root, c.status
    HAVING COUNT(*) FILTER (WHERE b.status = 'ACTIVE') > 1
    ORDER BY active_branches DESC, c.code ASC
  `;
  return rows.map((r) => ({
    ...r,
    active_branches: Number(r.active_branches),
    inactive_branches: Number(r.inactive_branches),
  }));
}

async function q2_impactPerClient(clientIds) {
  if (clientIds.length === 0) return [];
  const rows = await prisma.$queryRaw`
    SELECT c.id::text          AS client_id,
           c.code               AS client_code,
           c.legal_name         AS legal_name,
           COUNT(DISTINCT s.id) AS sample_count,
           COUNT(DISTINCT m.id) AS movement_count
    FROM client c
    LEFT JOIN sample s          ON s.owner_client_id = c.id
    LEFT JOIN sample_movement m ON m.buyer_client_id = c.id
    WHERE c.id::text = ANY(${clientIds}::text[])
    GROUP BY c.id, c.code, c.legal_name
    ORDER BY c.code ASC
  `;
  return rows.map((r) => ({
    ...r,
    sample_count: Number(r.sample_count),
    movement_count: Number(r.movement_count),
  }));
}

async function q3_personTypeCheckConstraint() {
  const rows = await prisma.$queryRaw`
    SELECT conname                            AS constraint_name,
           pg_get_constraintdef(oid)          AS definition,
           contype                            AS contype
    FROM pg_constraint
    WHERE conrelid = 'client'::regclass
      AND contype  = 'c'
    ORDER BY conname
  `;
  return rows;
}

async function q4_pfWithBranches() {
  const totals = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT c.id) FILTER (WHERE c.person_type = 'PF')                        AS pf_total,
           COUNT(DISTINCT c.id) FILTER (
             WHERE c.person_type = 'PF'
               AND EXISTS (SELECT 1 FROM client_branch b WHERE b.client_id = c.id)
           )                                                                                AS pf_with_any_branch,
           COUNT(DISTINCT c.id) FILTER (
             WHERE c.person_type = 'PF'
               AND EXISTS (
                 SELECT 1 FROM client_branch b
                 WHERE b.client_id = c.id AND b.status = 'ACTIVE'
                 GROUP BY b.client_id HAVING COUNT(*) > 1
               )
           )                                                                                AS pf_with_multiple_active,
           COUNT(DISTINCT c.id) FILTER (WHERE c.person_type = 'PJ')                        AS pj_total,
           COUNT(*)             FILTER (WHERE TRUE)                                         AS clients_total
    FROM client c
  `;
  return totals[0];
}

async function q5_branchesPerClientHistogram() {
  const rows = await prisma.$queryRaw`
    SELECT c.person_type                                         AS person_type,
           COUNT(*) FILTER (WHERE b.status = 'ACTIVE')           AS active_branches,
           COUNT(DISTINCT c.id)                                   AS client_count
    FROM client c
    LEFT JOIN client_branch b ON b.client_id = c.id
    GROUP BY c.person_type, c.id
  `;
  const histogram = {};
  for (const row of rows) {
    const bucket = `${row.person_type}-${row.active_branches}`;
    histogram[bucket] = (histogram[bucket] || 0) + 1;
  }
  return histogram;
}

async function q6_orphanRelations() {
  const orphanSamples = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM sample s
    WHERE s.owner_branch_id IS NOT NULL
      AND s.owner_client_id IS NULL
  `;
  const orphanMovements = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM sample_movement m
    WHERE m.buyer_branch_id IS NOT NULL
      AND m.buyer_client_id IS NULL
  `;
  const branchClientMismatch = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM sample s
    JOIN client_branch b ON b.id = s.owner_branch_id
    WHERE s.owner_client_id IS NOT NULL
      AND s.owner_client_id <> b.client_id
  `;
  return {
    samplesWithBranchButNoClient: orphanSamples[0].count,
    movementsWithBranchButNoClient: orphanMovements[0].count,
    samplesWithBranchClientMismatch: branchClientMismatch[0].count,
  };
}

async function q7_legacyDeprecatedColumns() {
  const rows = await prisma.$queryRaw`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (column_name LIKE '%_deprecated_2026q2'
           OR table_name LIKE '%_deprecated_2026q2')
    ORDER BY table_name, column_name
  `;
  return rows;
}

async function main() {
  const result = {
    runAt: new Date().toISOString(),
    pjsWithMultipleActiveBranches: [],
    impactPerTargetClient: [],
    clientCheckConstraints: [],
    aggregateTotals: null,
    branchHistogram: null,
    orphanRelations: null,
    legacyDeprecatedColumns: [],
  };

  header('1) PJs com >1 branch ATIVA (alvos da fissão)');
  result.pjsWithMultipleActiveBranches = await q1_pjsWithMultipleActiveBranches();
  if (!asJson) {
    if (result.pjsWithMultipleActiveBranches.length === 0) {
      info('OK — nenhum PJ com múltiplas branches ativas. F7.2 (wizard) não é necessário.');
    } else {
      info(`Encontrados ${result.pjsWithMultipleActiveBranches.length} PJ(s):`);
      for (const r of result.pjsWithMultipleActiveBranches) {
        info(
          `  - code=${r.client_code} ${r.legal_name ?? '(sem nome)'} | active=${r.active_branches} | inactive=${r.inactive_branches} | cnpj_root=${r.cnpj_root ?? '-'}`
        );
      }
    }
  }

  header('2) Impacto: samples e movements por client-alvo');
  const targetIds = result.pjsWithMultipleActiveBranches.map((r) => r.client_id);
  result.impactPerTargetClient = await q2_impactPerClient(targetIds);
  if (!asJson) {
    if (result.impactPerTargetClient.length === 0) {
      info('Nenhum client-alvo (consequência da query 1).');
    } else {
      let totalSamples = 0;
      let totalMovements = 0;
      for (const r of result.impactPerTargetClient) {
        info(
          `  - code=${r.client_code} ${r.legal_name ?? '(sem nome)'} | samples=${r.sample_count} | movements=${r.movement_count}`
        );
        totalSamples += r.sample_count;
        totalMovements += r.movement_count;
      }
      info(`  TOTAL: ${totalSamples} samples, ${totalMovements} movements a re-aimar.`);
    }
  }

  header('3) CHECK constraints atuais em "client"');
  result.clientCheckConstraints = await q3_personTypeCheckConstraint();
  if (!asJson) {
    if (result.clientCheckConstraints.length === 0) {
      info(
        '⚠ Nenhum CHECK constraint em "client". Esperado: chk_client_person_type_fields, chk_client_role_flags.'
      );
    } else {
      for (const r of result.clientCheckConstraints) {
        info(`  - ${r.constraint_name}`);
        info(`      ${r.definition}`);
      }
    }
  }

  header('4) Totais agregados');
  result.aggregateTotals = await q4_pfWithBranches();
  if (!asJson) {
    const t = result.aggregateTotals;
    info(`  Clients total: ${t.clients_total}`);
    info(
      `  PF total: ${t.pf_total} (com ≥1 branch: ${t.pf_with_any_branch}, com >1 ATIVA: ${t.pf_with_multiple_active})`
    );
    info(`  PJ total: ${t.pj_total}`);
  }

  header('5) Histograma de branches ativas por client');
  result.branchHistogram = await q5_branchesPerClientHistogram();
  if (!asJson) {
    for (const [bucket, count] of Object.entries(result.branchHistogram).sort()) {
      info(`  ${bucket} branches ativas → ${count} client(s)`);
    }
  }

  header('6) Relações órfãs (sanity check)');
  result.orphanRelations = await q6_orphanRelations();
  if (!asJson) {
    const o = result.orphanRelations;
    const ok =
      o.samplesWithBranchButNoClient === 0 &&
      o.movementsWithBranchButNoClient === 0 &&
      o.samplesWithBranchClientMismatch === 0;
    info(
      `  samples com branch mas sem client: ${o.samplesWithBranchButNoClient} ${o.samplesWithBranchButNoClient === 0 ? '✓' : '⚠'}`
    );
    info(
      `  movements com branch mas sem client: ${o.movementsWithBranchButNoClient} ${o.movementsWithBranchButNoClient === 0 ? '✓' : '⚠'}`
    );
    info(
      `  samples com branch.client_id ≠ owner_client_id: ${o.samplesWithBranchClientMismatch} ${o.samplesWithBranchClientMismatch === 0 ? '✓' : '⚠'}`
    );
    info(
      ok
        ? '  Resultado: sem inconsistências.'
        : '  Resultado: inconsistências detectadas — revisar antes de F7.2.'
    );
  }

  header('7) Schema legado (*_deprecated_2026q2)');
  result.legacyDeprecatedColumns = await q7_legacyDeprecatedColumns();
  if (!asJson) {
    if (result.legacyDeprecatedColumns.length === 0) {
      info('Nenhum vestígio (já dropado em alguma Phase 10?).');
    } else {
      for (const r of result.legacyDeprecatedColumns) {
        info(`  - ${r.table_name}.${r.column_name}`);
      }
    }
  }

  if (asJson) {
    const replacer = (_key, value) => (typeof value === 'bigint' ? Number(value) : value);
    process.stdout.write(JSON.stringify(result, replacer, 2) + '\n');
  } else {
    header('Resumo executivo');
    const wizardNeeded = result.pjsWithMultipleActiveBranches.length > 0;
    const cnpjRootIsUnique = result.clientCheckConstraints.some((c) =>
      /uq_client_cnpj_root/.test(c.definition)
    );
    info(`Wizard de fissão (F7.2) necessário? ${wizardNeeded ? 'SIM' : 'não'}`);
    info(`PJs a fissar: ${result.pjsWithMultipleActiveBranches.length}`);
    info(`PFs com >1 branch ativa hoje: ${result.aggregateTotals.pf_with_multiple_active ?? 0}`);
    info(`Pronto para F7.1? ${wizardNeeded ? 'apenas após F7.2' : 'sim, pular para F7.1'}`);
  }
}

main()
  .catch((err) => {
    console.error('[f7-audit] ERRO:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
