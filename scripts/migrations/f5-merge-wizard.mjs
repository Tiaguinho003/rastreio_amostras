#!/usr/bin/env node
// F5.1 Merge Wizard
//
// Consolida clients duplicados por raiz de CNPJ (8 primeiros digitos)
// alem de candidatos manuais detectados por similaridade de razao social.
// Resultado: 1 Client por empresa, com N branches preservadas.
//
// Uso:
//   node scripts/migrations/f5-merge-wizard.mjs --dry-run               # padrao
//   node scripts/migrations/f5-merge-wizard.mjs --apply
//   node scripts/migrations/f5-merge-wizard.mjs --apply --non-interactive
//
// Idempotente: rodar 2x nao causa estrago — se grupos ja foram fundidos,
// detecta count = 1 e pula.

import { randomUUID } from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const isDryRun = args.includes('--dry-run') || !isApply;
const isNonInteractive = args.includes('--non-interactive');
const verbose = args.includes('--verbose');

const prisma = new PrismaClient();
const rl = isNonInteractive ? null : readline.createInterface({ input: stdin, output: stdout });

async function ask(prompt, { defaultYes = true } = {}) {
  if (isNonInteractive) return defaultYes;
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = (await rl.question(`${prompt} ${suffix}: `)).trim().toLowerCase();
  if (answer === '') return defaultYes;
  return ['y', 'yes', 's', 'sim'].includes(answer);
}

async function askText(prompt) {
  if (isNonInteractive) return '';
  return (await rl.question(`${prompt} `)).trim();
}

function log(...parts) {
  console.log('[wizard]', ...parts);
}

function logVerbose(...parts) {
  if (verbose) console.log('[wizard][verbose]', ...parts);
}

function deriveCnpjOrder(documentCanonical) {
  if (typeof documentCanonical !== 'string' || documentCanonical.length !== 14) return null;
  return documentCanonical.slice(8, 12);
}

// ----------------------------------------------------------------------------
// Step 1 — Re-backfill defensivo: garante que cada Client tem >=1 branch
// ----------------------------------------------------------------------------

async function rebackfillBranches(tx) {
  const clientsWithoutBranch = await tx.client.findMany({
    where: { branches: { none: {} } },
    select: {
      id: true,
      code: true,
      cnpj: true,
      documentCanonical: true,
      phone: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (clientsWithoutBranch.length === 0) return 0;

  log(`re-backfill: ${clientsWithoutBranch.length} clients sem branch detectados`);

  for (const client of clientsWithoutBranch) {
    await tx.clientBranch.create({
      data: {
        id: randomUUID(),
        clientId: client.id,
        isPrimary: true,
        code: 1,
        cnpj: client.cnpj ?? null,
        cnpjOrder: deriveCnpjOrder(client.documentCanonical),
        phone: client.phone ?? null,
        status: 'ACTIVE',
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
      },
    });
    logVerbose(`re-backfill criou branch para client code ${client.code}`);
  }

  return clientsWithoutBranch.length;
}

// ----------------------------------------------------------------------------
// Step 2 — Detecta grupos automaticos por raiz de CNPJ
// ----------------------------------------------------------------------------

async function detectAutoGroups(tx) {
  const clients = await tx.client.findMany({
    where: {
      personType: 'PJ',
      documentCanonical: { not: null },
    },
    select: {
      id: true,
      code: true,
      legalName: true,
      tradeName: true,
      cnpj: true,
      documentCanonical: true,
      cnpjRoot: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const byRoot = new Map();
  for (const c of clients) {
    const root = c.cnpjRoot ?? (c.documentCanonical ? c.documentCanonical.slice(0, 8) : null);
    if (!root) continue;
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(c);
  }

  const groups = [];
  for (const [root, members] of byRoot.entries()) {
    if (members.length < 2) continue;
    members.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    groups.push({
      root,
      kind: 'auto',
      members,
    });
  }

  return groups;
}

// ----------------------------------------------------------------------------
// Step 3 — Detecta candidatos manuais por similaridade de razao social
// ----------------------------------------------------------------------------

function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstWord(name) {
  const parts = normalizeName(name).split(' ');
  return parts[0] ?? '';
}

async function detectManualCandidates(tx, autoGroups) {
  // Para cada grupo auto, identifica clients com a mesma "primeira palavra"
  // de razao social mas com cnpj root diferente. Cobre casos como
  // COOPERCITRUS Filial 148 (CNPJ placeholder fora do root oficial).
  const candidatesByGroup = new Map();
  if (autoGroups.length === 0) return candidatesByGroup;

  const allClients = await tx.client.findMany({
    select: {
      id: true,
      code: true,
      legalName: true,
      tradeName: true,
      cnpj: true,
      documentCanonical: true,
      cnpjRoot: true,
      createdAt: true,
    },
  });

  for (const group of autoGroups) {
    const groupRoot = group.root;
    const seedName = group.members[0]?.legalName ?? group.members[0]?.tradeName ?? '';
    const seedKey = firstWord(seedName);
    if (!seedKey || seedKey.length < 4) continue;
    const groupMemberIds = new Set(group.members.map((m) => m.id));

    const candidates = [];
    for (const c of allClients) {
      if (groupMemberIds.has(c.id)) continue;
      if (c.cnpjRoot === groupRoot) continue;
      const cKey = firstWord(c.legalName ?? c.tradeName ?? '');
      if (cKey && cKey === seedKey) {
        candidates.push(c);
      }
    }

    if (candidates.length > 0) {
      candidatesByGroup.set(groupRoot, candidates);
    }
  }

  return candidatesByGroup;
}

// ----------------------------------------------------------------------------
// Step 4 — Apresenta e confirma o plano
// ----------------------------------------------------------------------------

function describeClient(c) {
  const name = c.legalName ?? c.tradeName ?? c.fullName ?? '(sem nome)';
  return `code ${c.code} "${name}" cnpj=${c.cnpj ?? '-'} doc=${c.documentCanonical ?? '-'}`;
}

// Coleta auto-groups + candidatos manuais. So leitura — pode rodar fora de tx.
async function gatherGroupsAndCandidates(client) {
  const autoGroups = await detectAutoGroups(client);
  const manualCandidates = await detectManualCandidates(client, autoGroups);
  return { autoGroups, manualCandidates };
}

// Constroi o plano com prompts interativos. Nao toca o banco — recebe os
// dados ja carregados via gatherGroupsAndCandidates(). Mantido separado da
// transacao mutacional para nao consumir o timeout enquanto o usuario digita.
async function confirmPlanInteractive({ autoGroups, manualCandidates }) {
  const plan = { groups: [], skipped: [] };

  if (autoGroups.length === 0) {
    log('nenhum grupo automatico detectado (raizes ja sao unicas)');
    return plan;
  }

  log(`grupos automaticos detectados: ${autoGroups.length}`);

  let groupIndex = 0;
  for (const group of autoGroups) {
    groupIndex++;
    const seedName = group.members[0]?.legalName ?? group.members[0]?.tradeName ?? '(sem nome)';
    console.log('');
    console.log(
      `  [${groupIndex}] Raiz ${group.root} — "${seedName}": ${group.members.length} clients`
    );
    for (const m of group.members) {
      console.log(`        - ${describeClient(m)}`);
    }

    const candidates = manualCandidates.get(group.root) ?? [];
    if (candidates.length > 0) {
      console.log(`        Candidatos manuais por similaridade de nome:`);
      for (const c of candidates) {
        console.log(`        > ${describeClient(c)}`);
      }
    }

    const fuse = await ask(`        Fundir grupo [${groupIndex}]?`, { defaultYes: true });
    if (!fuse) {
      plan.skipped.push({ root: group.root, reason: 'usuario recusou' });
      continue;
    }

    const representative = group.members[0];
    const absorbedAuto = group.members.slice(1);

    const absorbedManual = [];
    for (const cand of candidates) {
      const include = await ask(`          Incluir candidato manual ${describeClient(cand)}?`, {
        defaultYes: false,
      });
      if (include) absorbedManual.push(cand);
    }

    plan.groups.push({
      root: group.root,
      representative,
      absorbed: [...absorbedAuto, ...absorbedManual],
    });
  }

  return plan;
}

function summarizePlan(plan) {
  if (plan.groups.length === 0) {
    log('plano vazio — nenhuma fusao a executar');
    return { totalAbsorbed: 0 };
  }

  let totalAbsorbed = 0;
  for (const g of plan.groups) {
    console.log(
      `  - Raiz ${g.root}: representante ${describeClient(g.representative)}, absorve ${g.absorbed.length} client(s)`
    );
    for (const a of g.absorbed) {
      console.log(`      * ${describeClient(a)}`);
    }
    totalAbsorbed += g.absorbed.length;
  }
  return { totalAbsorbed };
}

// ----------------------------------------------------------------------------
// Step 5 — Executa a fusao em transacao atomica
// ----------------------------------------------------------------------------

async function applyFusion(tx, plan) {
  let totalSamplesReaimed = 0;
  let totalMovementsReaimed = 0;
  let totalRegistrationsMoved = 0;
  let totalBranchesMoved = 0;
  let totalAuditsMoved = 0;
  let totalCommercialDeduped = 0;

  // Habilita o bypass do trigger append-only de client_audit_event SOMENTE
  // dentro desta transacao (SET LOCAL). Permite re-aim de targetClientId.
  await tx.$executeRawUnsafe(`SET LOCAL app.allow_audit_mutation = 'wizard_f51'`);

  for (const group of plan.groups) {
    const repId = group.representative.id;
    const absorbedIds = group.absorbed.map((c) => c.id);
    if (absorbedIds.length === 0) continue;

    // a. Re-aim FKs
    const samplesUpdated = await tx.sample.updateMany({
      where: { ownerClientId: { in: absorbedIds } },
      data: { ownerClientId: repId },
    });
    totalSamplesReaimed += samplesUpdated.count;

    const movementsUpdated = await tx.sampleMovement.updateMany({
      where: { buyerClientId: { in: absorbedIds } },
      data: { buyerClientId: repId },
    });
    totalMovementsReaimed += movementsUpdated.count;

    const regsUpdated = await tx.clientRegistration.updateMany({
      where: { clientId: { in: absorbedIds } },
      data: { clientId: repId },
    });
    totalRegistrationsMoved += regsUpdated.count;

    // b. Branches: re-numerar code para evitar colisao em (clientId, code)
    //    e demote isPrimary das absorvidas (so 1 primary por client).
    const repMaxAggregate = await tx.clientBranch.aggregate({
      where: { clientId: repId },
      _max: { code: true },
    });
    let nextCode = (repMaxAggregate._max?.code ?? 0) + 1;

    const absorbedBranches = await tx.clientBranch.findMany({
      where: { clientId: { in: absorbedIds } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });

    for (const branch of absorbedBranches) {
      await tx.clientBranch.update({
        where: { id: branch.id },
        data: {
          clientId: repId,
          isPrimary: false,
          code: nextCode,
        },
      });
      nextCode++;
      totalBranchesMoved++;
    }

    // c. ClientCommercialUser dedupe
    const repExisting = await tx.clientCommercialUser.findMany({
      where: { clientId: repId },
      select: { userId: true },
    });
    const repUserIds = new Set(repExisting.map((e) => e.userId));

    const absorbedJoins = await tx.clientCommercialUser.findMany({
      where: { clientId: { in: absorbedIds } },
      select: { userId: true },
    });

    for (const join of absorbedJoins) {
      if (!repUserIds.has(join.userId)) {
        await tx.clientCommercialUser.create({
          data: { clientId: repId, userId: join.userId },
        });
        repUserIds.add(join.userId);
      }
    }

    const cuDeleted = await tx.clientCommercialUser.deleteMany({
      where: { clientId: { in: absorbedIds } },
    });
    totalCommercialDeduped += cuDeleted.count;

    // d. Audit events: re-aim para representante (preserva historia)
    const auditsUpdated = await tx.clientAuditEvent.updateMany({
      where: { targetClientId: { in: absorbedIds } },
      data: { targetClientId: repId },
    });
    totalAuditsMoved += auditsUpdated.count;

    // e. Por fim, deleta os clients absorvidos (FKs ja foram movidas)
    await tx.client.deleteMany({ where: { id: { in: absorbedIds } } });
  }

  return {
    totalSamplesReaimed,
    totalMovementsReaimed,
    totalRegistrationsMoved,
    totalBranchesMoved,
    totalAuditsMoved,
    totalCommercialDeduped,
  };
}

// ----------------------------------------------------------------------------
// Step 6 — Validacoes pos-fusao
// ----------------------------------------------------------------------------

async function validateInvariants(tx) {
  const issues = [];

  // 1 primary por client
  const primaries = await tx.clientBranch.groupBy({
    by: ['clientId'],
    where: { isPrimary: true },
    _count: { _all: true },
  });
  const tooMany = primaries.filter((p) => p._count._all !== 1);
  if (tooMany.length > 0) {
    issues.push(`${tooMany.length} client(s) com !=1 primary branch`);
  }

  // Cada client tem >=1 branch
  const clientsWithoutBranch = await tx.client.count({
    where: { branches: { none: {} } },
  });
  if (clientsWithoutBranch > 0) {
    issues.push(`${clientsWithoutBranch} client(s) sem nenhum branch`);
  }

  // CNPJ root unico (se houver)
  const rootGroups = await tx.client.groupBy({
    by: ['cnpjRoot'],
    where: { cnpjRoot: { not: null } },
    _count: { _all: true },
  });
  const duplicatedRoots = rootGroups.filter((g) => g._count._all > 1);
  if (duplicatedRoots.length > 0) {
    issues.push(
      `${duplicatedRoots.length} raiz(es) de CNPJ ainda duplicadas — UNIQUE em cnpj_root falhara`
    );
  }

  return issues;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  log(`mode = ${isApply ? '--apply' : '--dry-run'} interactive=${!isNonInteractive}`);

  if (isApply) {
    const totalsBefore = {
      clients: await prisma.client.count(),
      branches: await prisma.clientBranch.count(),
      registrations: await prisma.clientRegistration.count(),
      samples: await prisma.sample.count(),
    };
    log('totais ANTES:', totalsBefore);
  }

  // Prompts interativos NAO podem rodar dentro de prisma.$transaction (timeout
  // default 5s). Fluxo: snapshot fora -> prompts fora -> mutacao dentro da tx.
  // Timeout da tx mutacional e bumpado para 2min, suficiente para fundir
  // dezenas de clients + ~400 samples.
  const TX_TIMEOUT_MS = 120_000;
  const TX_MAX_WAIT_MS = 30_000;

  if (isApply) {
    const snapshot = await gatherGroupsAndCandidates(prisma);
    const plan = await confirmPlanInteractive(snapshot);

    console.log('');
    log('--- PLANO ---');
    const summary = summarizePlan(plan);
    console.log('');

    if (plan.groups.length === 0) {
      log('nada a fundir. encerrando.');
      return;
    }

    const proceed = await ask('aplicar fusao agora?', { defaultYes: false });
    if (!proceed) {
      log('abortado pelo usuario antes de aplicar.');
      return;
    }

    await prisma.$transaction(
      async (tx) => {
        const rebackfilled = await rebackfillBranches(tx);
        log(`re-backfill criou ${rebackfilled} branch(es) defensivos`);

        const stats = await applyFusion(tx, plan);
        log('fusao executada:', stats);

        const issues = await validateInvariants(tx);
        if (issues.length > 0) {
          for (const i of issues) console.error('[wizard][INVARIANTE FALHOU]', i);
          throw new Error('invariante pos-fusao falhou — transacao revertida');
        }
        log(
          `invariantes OK — ${plan.groups.length} grupo(s) fundido(s), ${summary.totalAbsorbed} client(s) absorvido(s)`
        );
      },
      { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS }
    );

    const totalsAfter = {
      clients: await prisma.client.count(),
      branches: await prisma.clientBranch.count(),
      registrations: await prisma.clientRegistration.count(),
      samples: await prisma.sample.count(),
    };
    log('totais DEPOIS:', totalsAfter);
  } else {
    // dry-run: prompts fora da tx; mutacao + validacao dentro com rollback forcado
    const snapshot = await gatherGroupsAndCandidates(prisma);
    const plan = await confirmPlanInteractive(snapshot);

    console.log('');
    log('--- PLANO (dry-run) ---');
    summarizePlan(plan);
    console.log('');

    await prisma
      .$transaction(
        async (tx) => {
          const rebackfilled = await rebackfillBranches(tx);
          log(`re-backfill criaria ${rebackfilled} branch(es) defensivos`);

          if (plan.groups.length > 0) {
            await applyFusion(tx, plan);
            const issues = await validateInvariants(tx);
            if (issues.length > 0) {
              for (const i of issues) console.error('[wizard][INVARIANTE FALHARIA]', i);
            } else {
              log('invariantes OK em simulacao');
            }
          }

          // forca rollback
          throw new Error('__DRY_RUN_ROLLBACK__');
        },
        { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS }
      )
      .catch((err) => {
        if (err && err.message === '__DRY_RUN_ROLLBACK__') {
          log('dry-run completado (rollback forcado)');
          return;
        }
        throw err;
      });
  }
}

main()
  .catch((err) => {
    console.error('[wizard] erro:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (rl) rl.close();
    await prisma.$disconnect();
  });
