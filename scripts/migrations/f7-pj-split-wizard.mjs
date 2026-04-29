#!/usr/bin/env node
// F7.2 Split Wizard
//
// Faz a operacao OPOSTA do f5-merge-wizard: para cada PJ que hoje tem mais de
// uma branch ATIVA (heranca da fusao F5.1), separa cada branch secundaria em
// um Client distinto, preservando samples, movimentos e historico.
//
// Regra de negocio (F7):
//   - PJ admite EXATAMENTE uma branch ativa.
//   - PF pode ter 0..N branches (fazendas).
// O wizard so toca em PJ. PFs sao ignorados.
//
// Estrategia:
//   - Para cada PJ com >1 branch ativa, a primary fica no Client original.
//   - Cada branch secundaria ATIVA vira a matriz (isPrimary=true, code=1) de
//     um novo Client com personType=PJ.
//   - cnpjRoot do novo Client = primeiros 8 digitos do cnpj da branch.
//   - Samples/movimentos atrelados a branch movida tem owner_client_id /
//     buyer_client_id reapontados para o novo Client (FKs ja apontavam para
//     a branch, que viajou junto).
//   - commercial_users sao COPIADOS do original para o novo (cliente recente
//     herda o time).
//   - Snapshots (buyer_client_snapshot, buyer_branch_snapshot) NAO sao
//     tocados — sao historicos imutaveis.
//   - Audit event CLIENT_SPLIT registra o vinculo origem -> destino.
//
// D6 (politica de nomes): hibrida — auto quando a branch tem cidade/UF
// preenchidas; senao prompt interativo (igual f5-merge-wizard).
//
// Uso:
//   node scripts/migrations/f7-pj-split-wizard.mjs --dry-run               # padrao
//   node scripts/migrations/f7-pj-split-wizard.mjs --apply
//   node scripts/migrations/f7-pj-split-wizard.mjs --apply --non-interactive
//
// Idempotente: rodar 2x nao causa estrago — se o PJ ja tem 1 branch ativa,
// o wizard pula. Saida garante que a tabela `client_branch` continua
// consistente.

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
// --answers=path: 1 resposta por linha (vazio = default; 'y/yes/sim' = true;
// qualquer outra string = texto literal). Util para reproducoes e dry-run
// automatizado sem TTY.
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

async function askText(prompt) {
  if (scriptedAnswers) {
    return (nextScriptedAnswer() ?? '').trim();
  }
  if (isNonInteractive) return '';
  return (await rl.question(`${prompt} `)).trim();
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
// Step 1 — Carrega PJs alvo da fissao (com >1 branch ATIVA)
// ----------------------------------------------------------------------------

async function loadPjsToSplit(client) {
  const rows = await client.$queryRaw`
    SELECT c.id::text       AS id,
           c.code            AS code,
           c.legal_name      AS legal_name,
           c.trade_name      AS trade_name,
           c.cnpj_root       AS cnpj_root,
           c.is_buyer        AS is_buyer,
           c.is_seller       AS is_seller,
           c.status          AS status
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

// ----------------------------------------------------------------------------
// Step 2 — D6 (c) hibrida: auto quando ha cidade/UF; senao prompt
// ----------------------------------------------------------------------------

function deriveAutoLegalName(originalLegalName, branch) {
  const base = String(originalLegalName ?? '')
    .replace(/\s*\(FILIAL[^)]*\)\s*$/i, '')
    .trim();
  if (!base) return null;
  if (branch.city && branch.state) {
    return `${base} (${branch.city}/${branch.state})`;
  }
  return null;
}

function describeBranch(b) {
  const place = b.city && b.state ? `${b.city}/${b.state}` : '(sem endereco)';
  return `branch code=${b.code} cnpj=${b.cnpj ?? '-'} ${place}`;
}

// ----------------------------------------------------------------------------
// Step 3 — Constroi o plano de fissao com prompts (fora de tx)
// ----------------------------------------------------------------------------

async function buildSplitPlan(client) {
  const pjs = await loadPjsToSplit(client);
  const plan = { items: [] };

  if (pjs.length === 0) {
    log('nenhum PJ com >1 branch ativa. nada a fissar.');
    return plan;
  }

  log(`detectados ${pjs.length} PJ(s) para fissao`);

  for (const pj of pjs) {
    const branches = await loadActiveBranches(client, pj.id);
    const primary = branches.find((b) => b.isPrimary) ?? branches[0];
    const secondaries = branches.filter((b) => b.id !== primary.id);

    console.log('');
    console.log(`  PJ code=${pj.code} "${pj.legal_name ?? '(sem nome)'}"`);
    console.log(`    matriz fica no Client original: ${describeBranch(primary)}`);
    console.log(`    a fissionar: ${secondaries.length} branch(es)`);
    for (const b of secondaries) {
      console.log(`      - ${describeBranch(b)}`);
    }

    const proceed = await ask(`  Fissionar este PJ?`, { defaultYes: true });
    if (!proceed) {
      plan.items.push({ ...pj, skipped: true, reason: 'usuario recusou' });
      continue;
    }

    const splits = [];
    for (const branch of secondaries) {
      const autoName = deriveAutoLegalName(pj.legal_name, branch);
      let newLegalName = null;

      if (autoName) {
        const useAuto = await ask(`    branch code=${branch.code}: usar nome "${autoName}"?`, {
          defaultYes: true,
        });
        if (useAuto) {
          newLegalName = autoName;
        }
      }

      if (!newLegalName) {
        const reason = autoName ? 'auto recusado' : `sem cidade/UF — ${describeBranch(branch)}`;
        log(`    ${reason}, perguntando legalName manualmente...`);
        newLegalName = await askText(`    legalName para branch code=${branch.code}:`);
      }

      if (!newLegalName) {
        log(
          `    ⚠ legalName vazio para branch code=${branch.code}; ela sera deixada no PJ original.`
        );
        continue;
      }

      const cnpjRoot = (branch.cnpj ?? '').slice(0, 8) || null;
      splits.push({
        branchId: branch.id,
        branchCode: branch.code,
        branchCnpj: branch.cnpj,
        branchCity: branch.city,
        branchState: branch.state,
        cnpjRoot,
        newClientId: randomUUID(),
        newLegalName,
        sourceTradeName: pj.trade_name ?? null,
      });
    }

    if (splits.length === 0) {
      plan.items.push({ ...pj, skipped: true, reason: 'nenhuma branch confirmada para fissao' });
      continue;
    }

    plan.items.push({ ...pj, splits });
  }

  return plan;
}

function summarizePlan(plan) {
  let totalSplits = 0;
  if (plan.items.length === 0) return { totalSplits };
  for (const pj of plan.items) {
    if (pj.skipped) {
      console.log(`  - PJ code=${pj.code} pulado (${pj.reason})`);
      continue;
    }
    console.log(
      `  - PJ code=${pj.code} "${pj.legal_name ?? '(sem nome)'}" -> ${pj.splits.length} novo(s) Client(s):`
    );
    for (const s of pj.splits) {
      console.log(
        `      * "${s.newLegalName}" (cnpj=${s.branchCnpj} root=${s.cnpjRoot}, vem da branch code=${s.branchCode})`
      );
    }
    totalSplits += pj.splits.length;
  }
  return { totalSplits };
}

// ----------------------------------------------------------------------------
// Step 4 — Aplicacao em transacao atomica
// ----------------------------------------------------------------------------

async function applySplit(tx, plan) {
  const stats = {
    newClientsCreated: 0,
    branchesMoved: 0,
    samplesReaimed: 0,
    movementsReaimed: 0,
    commercialUsersCopied: 0,
    auditEventsEmitted: 0,
  };

  for (const pj of plan.items) {
    if (pj.skipped || !pj.splits || pj.splits.length === 0) continue;

    const sourceCommercialUsers = await tx.clientCommercialUser.findMany({
      where: { clientId: pj.id },
      select: { userId: true },
    });
    logVerbose(
      `PJ code=${pj.code} tem ${sourceCommercialUsers.length} commercial_user(s) para copiar`
    );

    for (const split of pj.splits) {
      // a. Cria o novo Client (PJ, ACTIVE, mesmas flags isBuyer/isSeller)
      await tx.client.create({
        data: {
          id: split.newClientId,
          personType: 'PJ',
          legalName: split.newLegalName,
          tradeName: split.sourceTradeName,
          cnpjRoot: split.cnpjRoot,
          isBuyer: pj.is_buyer,
          isSeller: pj.is_seller,
          status: 'ACTIVE',
        },
      });
      stats.newClientsCreated++;

      // b. Move a branch para o novo Client como matriz (code=1, isPrimary=true)
      await tx.clientBranch.update({
        where: { id: split.branchId },
        data: {
          clientId: split.newClientId,
          isPrimary: true,
          code: 1,
        },
      });
      stats.branchesMoved++;

      // c. Re-aim samples atrelados a essa branch
      const samples = await tx.sample.updateMany({
        where: { ownerBranchId: split.branchId },
        data: { ownerClientId: split.newClientId },
      });
      stats.samplesReaimed += samples.count;
      logVerbose(`branch ${split.branchId}: ${samples.count} sample(s) re-aimadas`);

      // d. Re-aim movimentos onde essa branch e a compradora
      const movements = await tx.sampleMovement.updateMany({
        where: { buyerBranchId: split.branchId },
        data: { buyerClientId: split.newClientId },
      });
      stats.movementsReaimed += movements.count;

      // e. Copia commercial_users (cliente novo herda time do original)
      for (const cu of sourceCommercialUsers) {
        await tx.clientCommercialUser.create({
          data: { clientId: split.newClientId, userId: cu.userId },
        });
        stats.commercialUsersCopied++;
      }

      // f. Audit event CLIENT_SPLIT
      await tx.clientAuditEvent.create({
        data: {
          eventId: randomUUID(),
          targetClientId: split.newClientId,
          targetBranchId: split.branchId,
          eventType: 'CLIENT_SPLIT',
          payload: {
            sourceClientId: pj.id,
            sourceClientCode: pj.code,
            sourceLegalName: pj.legal_name,
            branchId: split.branchId,
            branchCode: split.branchCode,
            branchCnpj: split.branchCnpj,
            newClientId: split.newClientId,
            newClientCnpjRoot: split.cnpjRoot,
            newLegalName: split.newLegalName,
            samplesReaimed: samples.count,
            movementsReaimed: movements.count,
          },
          requestId: `wizard-f72-${Date.now().toString(36)}-${split.branchId.slice(0, 8)}`,
          reasonText: 'F7.2: fissao de PJ com multiplas filiais em Clients distintos',
        },
      });
      stats.auditEventsEmitted++;
    }
  }

  return stats;
}

// ----------------------------------------------------------------------------
// Step 5 — Validacoes pos-fissao (invariantes que F7 promete)
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

  // 2. Cada Client criado pelo wizard tem exatamente 1 branch primary
  const primaries = await tx.clientBranch.groupBy({
    by: ['clientId'],
    where: { isPrimary: true },
    _count: { _all: true },
  });
  const tooMany = primaries.filter((p) => p._count._all > 1);
  if (tooMany.length > 0) {
    issues.push(`${tooMany.length} client(s) com >1 primary branch`);
  }

  // 3. CNPJ unico em branches ativas (defesa em profundidade contra @unique)
  const dupes = await tx.$queryRaw`
    SELECT cnpj, COUNT(*)::int AS count
    FROM client_branch
    WHERE cnpj IS NOT NULL AND status = 'ACTIVE'
    GROUP BY cnpj
    HAVING COUNT(*) > 1
  `;
  if (dupes.length > 0) {
    issues.push(`${dupes.length} CNPJ(s) duplicado(s) entre branches ativas`);
  }

  // 4. Sanity FK: nenhum sample com owner_branch_id em branch cujo client_id
  //    diverge de owner_client_id
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

  return issues;
}

// ----------------------------------------------------------------------------
// Step 6 — Relatorio JSON e script SQL de undo (pos-apply)
// ----------------------------------------------------------------------------

function ensureTmpDir() {
  const dir = path.resolve(process.cwd(), 'tmp');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeReport(plan, stats, totalsBefore, totalsAfter) {
  const dir = ensureTmpDir();
  const fname = `f7-split-report-${Date.now()}.json`;
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

function generateUndoScript(plan, stats) {
  const dir = ensureTmpDir();
  const fname = `f7-split-undo-${Date.now()}.sql`;
  const fpath = path.join(dir, fname);

  const lines = [
    '-- F7.2 UNDO SCRIPT',
    `-- Gerado em ${new Date().toISOString()}`,
    `-- Reverte fissao de ${stats.newClientsCreated} novo(s) Client(s).`,
    '-- Pre-requisitos:',
    '--   * trigger F7.1B enforce_pj_single_active_branch (se ja aplicado)',
    "--     precisa de SET LOCAL app.allow_split_wizard='on' senao o UPDATE",
    '--     em client_branch.client_id e bloqueado pela regra.',
    '--   * trigger reject_client_audit_event_mutation (F5.1A) bloqueia DELETE',
    "--     em client_audit_event; SET LOCAL app.allow_audit_mutation='wizard_f51'",
    '--     reaproveita a escape valve existente.',
    '--   * UNIQUE em client.cnpj_root precisa NAO existir (drop em F7.1A).',
    '',
    'BEGIN;',
    "SET LOCAL app.allow_split_wizard = 'on';",
    "SET LOCAL app.allow_audit_mutation = 'wizard_f51';",
    '',
  ];

  for (const pj of plan.items) {
    if (pj.skipped || !pj.splits) continue;
    lines.push(`-- Reverte PJ code=${pj.code} (${pj.splits.length} branch(es))`);
    for (const split of pj.splits) {
      lines.push(`-- branch code=${split.branchCode} cnpj=${split.branchCnpj}`);
      lines.push(
        `UPDATE sample SET owner_client_id = '${pj.id}' WHERE owner_branch_id = '${split.branchId}';`
      );
      lines.push(
        `UPDATE sample_movement SET buyer_client_id = '${pj.id}' WHERE buyer_branch_id = '${split.branchId}';`
      );
      lines.push(
        `UPDATE client_branch SET client_id = '${pj.id}', is_primary = FALSE, code = ${split.branchCode} WHERE id = '${split.branchId}';`
      );
      lines.push(`DELETE FROM client_commercial_user WHERE client_id = '${split.newClientId}';`);
      lines.push(
        `DELETE FROM client_audit_event WHERE target_client_id = '${split.newClientId}' AND event_type = 'CLIENT_SPLIT';`
      );
      lines.push(`DELETE FROM client WHERE id = '${split.newClientId}';`);
      lines.push('');
    }
  }

  lines.push('-- Recalcular code das branches reabsorvidas exige inspecao manual.');
  lines.push('-- Voce pode rodar: SELECT id, code FROM client_branch WHERE client_id = ...');
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
  log(`mode = ${isApply ? '--apply' : '--dry-run'} interactive=${!isNonInteractive}`);

  const plan = await buildSplitPlan(prisma);

  console.log('');
  log('--- PLANO ---');
  const summary = summarizePlan(plan);
  console.log('');

  if (summary.totalSplits === 0) {
    log('nada a fissar. encerrando.');
    return;
  }

  log(`total: ${summary.totalSplits} novo(s) Client(s) a criar`);

  if (isApply) {
    const proceed = await ask('aplicar fissao agora?', { defaultYes: false });
    if (!proceed) {
      log('abortado pelo usuario antes de aplicar.');
      return;
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
        // F7.1 escape valve: permite que a transacao do wizard mexa em
        // client_branch.client_id sem ser bloqueada pelo trigger
        // enforce_pj_single_active_branch (introduzido em F7.1). Idempotente
        // se a F7.1 ainda nao foi aplicada.
        await tx.$executeRawUnsafe(`SET LOCAL app.allow_split_wizard = 'on'`);

        stats = await applySplit(tx, plan);
        log('fissao executada:', stats);

        const issues = await validateInvariants(tx);
        if (issues.length > 0) {
          for (const i of issues) console.error('[wizard][INVARIANTE FALHOU]', i);
          throw new Error('invariante pos-fissao falhou — transacao revertida');
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
      log('dry-run: rollback forcado — nada foi gravado em disco');
    } else {
      throw err;
    }
  }

  const totalsAfter = await snapshotTotals(prisma);
  log('totais DEPOIS:', totalsAfter);

  if (!stats) {
    stats = {
      newClientsCreated: 0,
      branchesMoved: 0,
      samplesReaimed: 0,
      movementsReaimed: 0,
      commercialUsersCopied: 0,
      auditEventsEmitted: 0,
    };
  }

  const reportPath = writeReport(plan, stats, totalsBefore, totalsAfter);
  log(`relatorio salvo em ${reportPath}`);

  if (isApply) {
    const undoPath = generateUndoScript(plan, stats);
    log(`script de UNDO salvo em ${undoPath}`);
    log('verifique o relatorio e mantenha o undo a mao por 24h.');
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
