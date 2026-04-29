#!/usr/bin/env node
// L2: backup estruturado das amostras existentes em prod (read-only).
//
// Gera 4 arquivos em tmp/ (gitignored):
//   - tmp/samples-backup.json — array completo (auditoria, navegacao)
//   - tmp/samples-backup.csv — flat CSV (abrir no Excel)
//   - tmp/samples-backup-attachments.csv — 1 linha por foto
//   - tmp/gsutil-download-script.sh — comandos para baixar fotos do GCS
//
// Uso (com cloud-sql-proxy ja up + DATABASE_URL apontando para prod):
//   DATABASE_URL=... node scripts/audits/samples-export.mjs
//
// Nao realiza nenhuma escrita no banco. Pode ser executado em prod
// com seguranca (sob aprovacao explicita do usuario por se tratar de
// dump de dados de producao).

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

const BUCKET = 'safras-amostras-prod-runtime';
const BUCKET_PREFIX = 'uploads/';

const prisma = new PrismaClient();

function bigIntReplacer(_key, value) {
  return typeof value === 'bigint' ? Number(value) : value;
}

function ensureTmpDir() {
  const dir = path.resolve(process.cwd(), 'tmp');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function buildClientDisplayName(client) {
  if (!client) return null;
  if (client.personType === 'PF') return client.fullName;
  return client.legalName ?? client.tradeName;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsv(values) {
  return values.map(csvEscape).join(',');
}

async function loadAllSamples() {
  return prisma.sample.findMany({
    orderBy: [{ createdAt: 'asc' }],
    include: {
      attachments: {
        orderBy: [{ createdAt: 'asc' }],
      },
      ownerClient: true,
      ownerBranch: true,
    },
  });
}

function projectSample(sample) {
  const client = sample.ownerClient;
  const branch = sample.ownerBranch;
  return {
    id: sample.id,
    internalLotNumber: sample.internalLotNumber,
    status: sample.status,
    version: sample.version,
    declared: {
      owner: sample.declaredOwner,
      sacks: sample.declaredSacks,
      harvest: sample.declaredHarvest,
      originLot: sample.declaredOriginLot,
      location: sample.declaredLocation,
    },
    classification: {
      type: sample.classificationType,
      latestType: sample.latestType,
      latestScreen: sample.latestScreen,
      latestDefectsCount: sample.latestDefectsCount,
      latestDensity:
        sample.latestDensity !== null && sample.latestDensity !== undefined
          ? sample.latestDensity.toString()
          : null,
      latestColorAspect: sample.latestColorAspect,
      latestNotes: sample.latestNotes,
      latestData: sample.latestClassificationData,
      latestVersion: sample.latestClassificationVersion,
    },
    commercial: {
      status: sample.commercialStatus,
      soldSacks: sample.soldSacks,
      lostSacks: sample.lostSacks,
      classifiedAt: sample.classifiedAt ? sample.classifiedAt.toISOString() : null,
    },
    owner: client
      ? {
          clientId: client.id,
          personType: client.personType,
          displayName: buildClientDisplayName(client),
          cpf: client.cpf,
          cnpjRoot: client.cnpjRoot,
          phone: client.phone,
          isBuyer: client.isBuyer,
          isSeller: client.isSeller,
          status: client.status,
        }
      : null,
    ownerBranch: branch
      ? {
          id: branch.id,
          clientId: branch.clientId,
          isPrimary: branch.isPrimary,
          code: branch.code,
          cnpj: branch.cnpj,
          name: branch.name,
          legalName: branch.legalName,
          tradeName: branch.tradeName,
          phone: branch.phone,
          addressLine: branch.addressLine,
          district: branch.district,
          city: branch.city,
          state: branch.state,
          postalCode: branch.postalCode,
          complement: branch.complement,
          registrationNumber: branch.registrationNumber,
          registrationType: branch.registrationType,
          status: branch.status,
        }
      : null,
    attachments: sample.attachments.map((a) => ({
      id: a.id,
      kind: a.kind,
      storagePath: a.storagePath,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      checksumSha256: a.checksumSha256,
      createdAt: a.createdAt.toISOString(),
      gcsUri: `gs://${BUCKET}/${BUCKET_PREFIX}${a.storagePath}`,
    })),
    createdAt: sample.createdAt.toISOString(),
    updatedAt: sample.updatedAt.toISOString(),
  };
}

function buildSamplesCsv(projected) {
  const header = [
    'internalLotNumber',
    'status',
    'declaredOwner',
    'declaredHarvest',
    'declaredSacks',
    'declaredOriginLot',
    'declaredLocation',
    'ownerClientName',
    'ownerPersonType',
    'ownerCpf',
    'ownerCnpjRoot',
    'branchCnpj',
    'branchCity',
    'branchState',
    'branchRegistrationNumber',
    'commercialStatus',
    'soldSacks',
    'lostSacks',
    'classifiedAt',
    'classificationType',
    'latestType',
    'latestScreen',
    'latestDefectsCount',
    'latestDensity',
    'latestColorAspect',
    'latestNotes',
    'attachmentCount',
    'createdAt',
    'updatedAt',
  ];
  const rows = projected.map((s) => [
    s.internalLotNumber,
    s.status,
    s.declared.owner,
    s.declared.harvest,
    s.declared.sacks,
    s.declared.originLot,
    s.declared.location,
    s.owner?.displayName,
    s.owner?.personType,
    s.owner?.cpf,
    s.owner?.cnpjRoot,
    s.ownerBranch?.cnpj,
    s.ownerBranch?.city,
    s.ownerBranch?.state,
    s.ownerBranch?.registrationNumber,
    s.commercial.status,
    s.commercial.soldSacks,
    s.commercial.lostSacks,
    s.commercial.classifiedAt,
    s.classification.type,
    s.classification.latestType,
    s.classification.latestScreen,
    s.classification.latestDefectsCount,
    s.classification.latestDensity,
    s.classification.latestColorAspect,
    s.classification.latestNotes,
    s.attachments.length,
    s.createdAt,
    s.updatedAt,
  ]);
  return [header.join(','), ...rows.map(rowToCsv)].join('\n') + '\n';
}

function buildAttachmentsCsv(projected) {
  const header = [
    'internalLotNumber',
    'sampleId',
    'attachmentId',
    'kind',
    'storagePath',
    'gcsUri',
    'mimeType',
    'sizeBytes',
    'checksumSha256',
    'createdAt',
  ];
  const rows = [];
  for (const s of projected) {
    for (const a of s.attachments) {
      rows.push([
        s.internalLotNumber,
        s.id,
        a.id,
        a.kind,
        a.storagePath,
        a.gcsUri,
        a.mimeType,
        a.sizeBytes,
        a.checksumSha256,
        a.createdAt,
      ]);
    }
  }
  return [header.join(','), ...rows.map(rowToCsv)].join('\n') + '\n';
}

function buildGsutilScript(projected, runAt) {
  const lines = [
    '#!/usr/bin/env bash',
    '# L2: download de todas as fotos do backup de amostras (geradas pelo',
    '# script samples-export.mjs).',
    `# Gerado em ${runAt}`,
    `# Bucket: gs://${BUCKET}/${BUCKET_PREFIX}`,
    '#',
    '# Pre-requisitos:',
    '#   - gsutil instalado (gcloud CLI)',
    '#   - login ativo na conta com leitura no bucket de prod',
    '#',
    '# Saida: ~/amostras-backup/<lote>/<arquivo>',
    '#',
    '# Idempotente: re-rodar pula arquivos ja baixados (gsutil -n).',
    '',
    'set -euo pipefail',
    'DEST_DIR="${HOME}/amostras-backup"',
    'mkdir -p "$DEST_DIR"',
    `echo "[L2] baixando fotos para $DEST_DIR"`,
    '',
  ];

  let total = 0;
  for (const s of projected) {
    if (s.attachments.length === 0) continue;
    lines.push(`# === ${s.internalLotNumber ?? s.id} ===`);
    const lotDir = `\${DEST_DIR}/${s.internalLotNumber ?? s.id}`;
    lines.push(`mkdir -p "${lotDir}"`);
    for (const a of s.attachments) {
      const filename = path.basename(a.storagePath);
      lines.push(
        `gsutil -q -m cp -n "${a.gcsUri}" "${lotDir}/${filename}" && echo "  ok ${filename}"`
      );
      total++;
    }
    lines.push('');
  }

  lines.push(`echo "[L2] download concluido — ${total} foto(s)"`);
  return lines.join('\n') + '\n';
}

async function main() {
  console.log('[L2] carregando amostras de prod...');
  const samples = await loadAllSamples();
  console.log(`[L2] ${samples.length} amostras encontradas`);

  const projected = samples.map(projectSample);
  const totalAttachments = projected.reduce((acc, s) => acc + s.attachments.length, 0);
  console.log(`[L2] ${totalAttachments} attachment(s) referenciados`);

  const tmpDir = ensureTmpDir();
  const runAt = new Date().toISOString();

  // 1) JSON completo
  const jsonPath = path.join(tmpDir, 'samples-backup.json');
  writeFileSync(
    jsonPath,
    JSON.stringify(
      { runAt, totalSamples: samples.length, totalAttachments, samples: projected },
      bigIntReplacer,
      2
    ) + '\n'
  );
  console.log(`[L2] JSON salvo: ${jsonPath}`);

  // 2) CSV plano (1 linha por sample)
  const csvPath = path.join(tmpDir, 'samples-backup.csv');
  writeFileSync(csvPath, buildSamplesCsv(projected));
  console.log(`[L2] CSV samples salvo: ${csvPath}`);

  // 3) CSV de attachments (1 linha por foto)
  const attCsvPath = path.join(tmpDir, 'samples-backup-attachments.csv');
  writeFileSync(attCsvPath, buildAttachmentsCsv(projected));
  console.log(`[L2] CSV attachments salvo: ${attCsvPath}`);

  // 4) Script gsutil
  const shPath = path.join(tmpDir, 'gsutil-download-script.sh');
  writeFileSync(shPath, buildGsutilScript(projected, runAt));
  console.log(`[L2] script gsutil salvo: ${shPath}`);

  console.log('');
  console.log('[L2] resumo:');
  console.log(`   - amostras: ${samples.length}`);
  console.log(`   - attachments: ${totalAttachments}`);
  console.log(`   - bucket: gs://${BUCKET}/${BUCKET_PREFIX}`);
  console.log('');
  console.log(
    '[L2] verifique tmp/ e rode bash tmp/gsutil-download-script.sh para baixar as fotos.'
  );
}

main()
  .catch((err) => {
    console.error('[L2] ERRO:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
