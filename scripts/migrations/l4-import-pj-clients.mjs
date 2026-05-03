#!/usr/bin/env node
/**
 * L4 mini-wizard: importa um batch de clientes PJ a partir de planilha
 * XLSX, chamando ClientService.createClient via Prisma local (que pode
 * apontar pra prod via cloud-sql-proxy ou pra DB local de teste).
 *
 * One-shot: usado durante o ciclo L4 e DELETADO no commit final M2
 * (ver docs/Reset-Refatoracao-e-Reimport-Clientes.md §15). Mesmo padrao
 * historico de f5-merge-wizard.mjs e f7-pj-consolidate-wizard.mjs.
 *
 * Uso:
 *   node scripts/migrations/l4-import-pj-clients.mjs                  # dry-run
 *   node scripts/migrations/l4-import-pj-clients.mjs --apply          # grava
 *   node scripts/migrations/l4-import-pj-clients.mjs --xlsx <path>    # custom path
 *   node scripts/migrations/l4-import-pj-clients.mjs --limit 5        # so primeiros 5
 *
 * Env obrigatorios:
 *   DATABASE_URL    — Postgres connection (apontando pro alvo)
 *   ACTOR_USER_ID   — UUID de um app_user existente (audit actor)
 *
 * Comportamento:
 *   - Dry-run (default): valida cada linha, NAO escreve no banco. Imprime
 *     relatorio por linha + sumario. Salva tmp/l4-import-pj-report.json.
 *   - Apply: chama ClientService.createClient(payload, actor) por linha.
 *     Antes de cada chamada, checa se CNPJ ja existe (skip silencioso —
 *     idempotencia natural; permite rerodar com seguranca).
 *   - Erro numa linha NAO aborta o batch. Continuamos pras demais e
 *     reportamos no final.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';
import xlsx from 'xlsx';

import { ClientService } from '../../src/clients/client-service.js';

// =============================================================================
// CLI args
// =============================================================================

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const xlsxFlagIdx = args.indexOf('--xlsx');
const XLSX_PATH =
  xlsxFlagIdx >= 0 && args[xlsxFlagIdx + 1]
    ? args[xlsxFlagIdx + 1]
    : '/mnt/c/Users/flavi/Downloads/PLanilha de clientes para sistema (corrigida v2).xlsx';
const limitFlagIdx = args.indexOf('--limit');
const LIMIT =
  limitFlagIdx >= 0 && args[limitFlagIdx + 1]
    ? Number.parseInt(args[limitFlagIdx + 1], 10)
    : Number.POSITIVE_INFINITY;

const DATABASE_URL = process.env.DATABASE_URL;
const ACTOR_USER_ID = process.env.ACTOR_USER_ID;

if (!DATABASE_URL) {
  console.error('Missing env: DATABASE_URL');
  process.exit(2);
}
if (!ACTOR_USER_ID) {
  console.error('Missing env: ACTOR_USER_ID (UUID de um app_user existente)');
  process.exit(2);
}

// =============================================================================
// Constantes / mapeamento de colunas
// =============================================================================

const COL_NAMES = {
  cnpj: 'CNPJ',
  personType: 'Tipo pessoa',
  cnpjDigits: 'cnpj_digits',
  legalName: 'Nome/Razão',
  tradeName: 'Nome fantasia',
  phone: 'Telefone 1',
  registrationNumber: 'Inscrição estadual',
  addressLine: 'Endereço completo',
  district: 'Bairro',
  city: 'Cidade',
  state: 'UF',
  postalCode: 'CEP',
  isBuyer: 'Comprador cadastro',
  isSeller: 'Vendedor cadastro',
};

// =============================================================================
// Helpers
// =============================================================================

function trimOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function simNaoToBool(value) {
  const s = String(value ?? '')
    .trim()
    .toUpperCase();
  if (s === 'SIM') return true;
  if (s === 'NÃO' || s === 'NAO') return false;
  return null;
}

function buildHeaderIndex(headerRow) {
  const map = {};
  for (const [logicalName, columnLabel] of Object.entries(COL_NAMES)) {
    const idx = headerRow.findIndex((h) => String(h).trim() === columnLabel);
    if (idx < 0) {
      throw new Error(`Coluna nao encontrada na planilha: "${columnLabel}"`);
    }
    map[logicalName] = idx;
  }
  return map;
}

function rowToPayload(row, idx, lineNumber) {
  const errors = [];

  const personType = String(row[idx.personType] ?? '')
    .trim()
    .toUpperCase();
  if (personType !== 'PJ') {
    errors.push(`personType !== 'PJ' (linha PF nao suportada nesta leva)`);
  }

  const legalName = trimOrNull(row[idx.legalName]);
  if (!legalName) errors.push('legalName vazio');

  const tradeName = trimOrNull(row[idx.tradeName]);
  const phone = trimOrNull(row[idx.phone]);
  if (!phone) errors.push('phone vazio (obrigatorio)');

  const cnpj = trimOrNull(row[idx.cnpj]);
  if (!cnpj) errors.push('cnpj vazio (obrigatorio em PJ)');

  const registrationNumber = trimOrNull(row[idx.registrationNumber]);
  const addressLine = trimOrNull(row[idx.addressLine]);
  const district = trimOrNull(row[idx.district]);
  const city = trimOrNull(row[idx.city]);
  const state = trimOrNull(row[idx.state]);
  const postalCode = trimOrNull(row[idx.postalCode]);

  const isBuyer = simNaoToBool(row[idx.isBuyer]);
  const isSeller = simNaoToBool(row[idx.isSeller]);
  if (isBuyer === null) errors.push('isBuyer (Comprador cadastro) deve ser SIM/NAO');
  if (isSeller === null) errors.push('isSeller (Vendedor cadastro) deve ser SIM/NAO');
  if (isBuyer === false && isSeller === false) {
    errors.push('isBuyer OR isSeller deve ser true (CHECK chk_client_role_flags)');
  }

  return {
    lineNumber,
    legalName: legalName ?? null,
    cnpj: cnpj ?? null,
    payload: {
      personType: 'PJ',
      legalName,
      tradeName,
      cnpj,
      phone,
      registrationNumber,
      addressLine,
      district,
      city,
      state,
      postalCode,
      isBuyer: isBuyer === true,
      isSeller: isSeller === true,
    },
    errors,
  };
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log(`L4 import PJ — modo ${APPLY ? 'APPLY (gravando)' : 'DRY-RUN'}`);
  console.log(`XLSX: ${XLSX_PATH}`);
  console.log(`DATABASE_URL: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`ACTOR_USER_ID: ${ACTOR_USER_ID}`);
  console.log(`Limit: ${Number.isFinite(LIMIT) ? LIMIT : 'sem limite'}`);
  console.log('---');

  const wb = xlsx.readFile(XLSX_PATH);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  if (rows.length < 2) {
    throw new Error('Planilha vazia ou sem cabecalho');
  }

  const headerIdx = buildHeaderIndex(rows[0]);
  const dataRows = rows.slice(1).filter((r) => r.some((v) => v != null && String(v).trim() !== ''));
  const limited = Number.isFinite(LIMIT) ? dataRows.slice(0, LIMIT) : dataRows;
  console.log(
    `Linhas com dados: ${dataRows.length}${LIMIT < dataRows.length ? ` (limitado a ${LIMIT})` : ''}`
  );

  // Pre-validacao + duplicatas internas
  const parsed = limited.map((row, i) => rowToPayload(row, headerIdx, i + 2));
  const cnpjSeen = new Map();
  const ieSeen = new Map();
  for (const item of parsed) {
    if (item.cnpj) {
      const norm = item.cnpj.replace(/\D+/g, '');
      if (cnpjSeen.has(norm)) {
        item.errors.push(`CNPJ duplicado entre linhas (tambem em linha ${cnpjSeen.get(norm)})`);
      } else {
        cnpjSeen.set(norm, item.lineNumber);
      }
    }
    const ie = item.payload.registrationNumber;
    if (ie) {
      const canonical = String(ie)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
      if (canonical) {
        if (ieSeen.has(canonical)) {
          item.errors.push(
            `IE canonical duplicada entre linhas (tambem em linha ${ieSeen.get(canonical)})`
          );
        } else {
          ieSeen.set(canonical, item.lineNumber);
        }
      }
    }
  }

  // Conexao
  const prisma = new PrismaClient();
  await prisma.$connect();
  const clientService = new ClientService({ prisma });

  // Pre-flight: actor user existe?
  const actorRow = await prisma.user.findUnique({
    where: { id: ACTOR_USER_ID },
    select: { id: true, username: true, role: true, status: true },
  });
  if (!actorRow) {
    console.error(`ACTOR_USER_ID nao existe em app_user: ${ACTOR_USER_ID}`);
    process.exit(3);
  }
  console.log(`Actor: ${actorRow.username} (${actorRow.role}, ${actorRow.status})`);
  if (actorRow.status !== 'ACTIVE') {
    console.error('Actor user precisa estar ACTIVE');
    process.exit(3);
  }

  const actorContext = {
    actorType: 'USER',
    actorUserId: actorRow.id,
    role: actorRow.role,
    source: 'worker',
    ip: '127.0.0.1',
    userAgent: 'l4-import-pj-clients',
    requestId: randomUUID(),
  };

  // Pre-flight: contagem atual
  const preCount = await prisma.client.count();
  console.log(`Clients no banco antes: ${preCount}`);
  console.log('---');

  const report = {
    mode: APPLY ? 'apply' : 'dry-run',
    xlsxPath: XLSX_PATH,
    timestamp: new Date().toISOString(),
    actor: { id: actorRow.id, username: actorRow.username },
    preCount,
    items: [],
    summary: {
      total: parsed.length,
      validationErrors: 0,
      skipped: 0,
      created: 0,
      runtimeErrors: 0,
    },
  };

  let i = 0;
  for (const item of parsed) {
    i += 1;
    const tag = `[${i}/${parsed.length}]`;
    const desc = `${item.legalName ?? '(sem nome)'} (CNPJ ${item.cnpj ?? '?'})`;

    if (item.errors.length > 0) {
      console.log(`${tag} ${desc} — VALIDATION_ERROR: ${item.errors.join('; ')}`);
      report.items.push({
        lineNumber: item.lineNumber,
        legalName: item.legalName,
        cnpj: item.cnpj,
        outcome: 'validation_error',
        errors: item.errors,
      });
      report.summary.validationErrors += 1;
      continue;
    }

    if (APPLY) {
      // Idempotencia natural: pula se CNPJ ja existe
      const cnpjDigits = item.cnpj.replace(/\D+/g, '');
      const existing = await prisma.client.findFirst({
        where: { cnpj: cnpjDigits },
        select: { id: true, code: true },
      });
      if (existing) {
        console.log(`${tag} ${desc} — SKIPPED (cnpj ja existe: id=${existing.id})`);
        report.items.push({
          lineNumber: item.lineNumber,
          legalName: item.legalName,
          cnpj: item.cnpj,
          outcome: 'skipped_existing',
          existingId: existing.id,
        });
        report.summary.skipped += 1;
        continue;
      }

      try {
        const result = await clientService.createClient(item.payload, actorContext);
        const clientId = result.client.id;
        console.log(`${tag} ${desc} — CREATED (id=${clientId}, code=${result.client.code})`);
        report.items.push({
          lineNumber: item.lineNumber,
          legalName: item.legalName,
          cnpj: item.cnpj,
          outcome: 'created',
          clientId,
          code: result.client.code,
        });
        report.summary.created += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code = err && typeof err === 'object' ? err.code : undefined;
        const details = err && typeof err === 'object' ? err.details : undefined;
        console.log(`${tag} ${desc} — RUNTIME_ERROR: ${code ?? ''} ${message}`);
        report.items.push({
          lineNumber: item.lineNumber,
          legalName: item.legalName,
          cnpj: item.cnpj,
          outcome: 'runtime_error',
          error: { code, message, details },
        });
        report.summary.runtimeErrors += 1;
      }
    } else {
      // Dry-run: so reporta validacao OK
      console.log(`${tag} ${desc} — DRY_OK`);
      report.items.push({
        lineNumber: item.lineNumber,
        legalName: item.legalName,
        cnpj: item.cnpj,
        outcome: 'dry_ok',
      });
    }
  }

  const postCount = APPLY ? await prisma.client.count() : preCount;
  report.postCount = postCount;

  // Salva relatorio
  const reportPath = resolve(process.cwd(), `tmp/l4-import-pj-report-${Date.now()}.json`);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('---');
  console.log(`Sumario:`);
  console.log(`  Total processadas: ${report.summary.total}`);
  console.log(`  ✓ Validas (dry):   ${report.summary.total - report.summary.validationErrors}`);
  console.log(`  ✗ Validation:      ${report.summary.validationErrors}`);
  if (APPLY) {
    console.log(`  + Created:         ${report.summary.created}`);
    console.log(`  ↪ Skipped (exist): ${report.summary.skipped}`);
    console.log(`  ✗ Runtime errors:  ${report.summary.runtimeErrors}`);
    console.log(`  Clients antes:     ${preCount}`);
    console.log(`  Clients depois:    ${postCount}`);
    console.log(`  Delta:             +${postCount - preCount}`);
  }
  console.log(`Relatorio: ${reportPath}`);

  await prisma.$disconnect();

  if (report.summary.validationErrors > 0 || report.summary.runtimeErrors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(99);
});
