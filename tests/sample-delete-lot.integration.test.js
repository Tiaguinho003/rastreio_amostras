// Feature "Deletar lote" (antes "Invalidar"): o delete e um soft-delete que
// LIBERA o numero interno pro reuso (nula na projecao; trigger relaxada permite
// nular so no delete) e BLOQUEIA deletar lotes com contrato. Deletados somem das
// listagens. Ver migration 20260702140000_lote_deletar_libera_numero.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { ClientService } from '../src/clients/client-service.js';
import { generateValidCnpj } from './helpers/cnpj-generator.js';
import { EventContractDbService } from '../src/events/event-contract-db-service.js';
import { PrismaEventStore } from '../src/events/prisma-event-store.js';
import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { SampleQueryService } from '../src/samples/sample-query-service.js';
import { LocalUploadService } from '../src/uploads/local-upload-service.js';
import { HttpError } from '../src/contracts/errors.js';

async function canReachDatabase(databaseUrlValue) {
  if (!databaseUrlValue) return false;
  const probe = new PrismaClient();
  try {
    await probe.$connect();
    return true;
  } catch {
    return false;
  } finally {
    await probe.$disconnect().catch(() => {});
  }
}

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('delete-lot integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const eventStore = new PrismaEventStore(prisma);
  const eventService = new EventContractDbService({ store: eventStore });
  const queryService = new SampleQueryService({ prisma });
  const clientService = new ClientService({ prisma });

  const actor = {
    actorType: 'USER',
    actorUserId: randomUUID(),
    role: 'ADMIN',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test',
  };

  const userServiceMock = {
    async findUsersForSnapshotByIds(userIds) {
      const ids = Array.from(new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean)));
      return new Map(
        ids.map((id) => [
          id,
          {
            id,
            fullName: `Test ${id.slice(0, 8)}`,
            username: `u_${id.slice(0, 8)}`,
            status: 'ACTIVE',
          },
        ])
      );
    },
  };

  let uploadDir;
  let uploadService;
  let commandService;
  let sellerSeq = 0;

  async function createSellerClient() {
    sellerSeq += 1;
    return clientService.createClient(
      {
        personType: 'PJ',
        legalName: `Vendedor Delete ${sellerSeq} LTDA`,
        tradeName: `Vendedor Delete ${sellerSeq} LTDA`,
        cnpj: generateValidCnpj(sellerSeq),
        phone: '35 99999-0000',
        isBuyer: true,
        isSeller: true,
      },
      actor
    );
  }

  // Cria um lote (SAMPLE_RECEIVED + REGISTRATION_CONFIRMED). Sem lotNumber -> numero
  // automatico; com { lotNumber, manual } -> numero manual fixo.
  async function createLot({ lotNumber = null, manual = false } = {}) {
    const sampleId = randomUUID();
    const ownerClient = await createSellerClient();
    await commandService.createSample(
      {
        sampleId,
        clientDraftId: `draft-${sampleId.slice(0, 8)}`,
        ownerClientId: ownerClient.client.id,
        owner: ownerClient.client.displayName,
        sacks: 10,
        harvest: '25/26',
        originLot: `ORIG-${sampleId.slice(0, 8)}`,
        receivedChannel: 'in_person',
        idempotencyKey: randomUUID(),
        ...(lotNumber ? { sampleLotNumber: lotNumber, lotNumberManual: manual } : {}),
      },
      actor
    );
    const row = await prisma.sample.findUnique({ where: { id: sampleId } });
    return { sampleId, row };
  }

  function deleteLot(sampleId, expectedVersion = 1) {
    return commandService.invalidateSample(
      {
        sampleId,
        expectedVersion,
        reasonCode: 'DUPLICATE',
        reasonText: 'LOTE REGISTRADO POR ENGANO',
      },
      actor
    );
  }

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE sale_contract, client_audit_event, sample_movement, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  test.before(async () => {
    await prisma.$connect();
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coffee-delete-test-'));
    uploadService = new LocalUploadService({ baseDir: uploadDir });
    commandService = new SampleCommandService({
      eventService,
      queryService,
      uploadService,
      clientService,
      userService: userServiceMock,
    });
  });

  test.beforeEach(async () => {
    await resetDatabase();
  });

  test.after(async () => {
    await prisma.$disconnect().catch(() => {});
    if (uploadDir) await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {});
  });

  test('delete LIBERA o numero: nula internal_lot_number(_int) na linha do lote', async () => {
    const { sampleId, row } = await createLot();
    assert.ok(row.internalLotNumber, 'lote criado deve ter numero');
    assert.equal(row.status, 'REGISTRATION_CONFIRMED');

    const res = await deleteLot(sampleId);
    assert.equal(res.statusCode, 201);

    const after = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(after.status, 'INVALIDATED');
    assert.equal(after.internalLotNumber, null, 'numero deve ser liberado (nulo)');
    assert.equal(after.internalLotNumberInt, null, 'espelho int deve ser nulo');
  });

  test('numero liberado pode ser REUSADO por um novo lote (manual, sem 409)', async () => {
    const first = await createLot();
    const freed = first.row.internalLotNumber;
    await deleteLot(first.sampleId);

    // Reuso manual do mesmo numero -> nao deve dar conflito (409).
    const reused = await createLot({ lotNumber: freed, manual: true });
    assert.equal(reused.row.internalLotNumber, freed);
    assert.equal(reused.row.status, 'REGISTRATION_CONFIRMED');
    assert.notEqual(reused.sampleId, first.sampleId);
  });

  test('gerador automatico reaproveita o numero quando o deletado era o TOPO', async () => {
    const { sampleId, row } = await createLot();
    const n = row.internalLotNumber;
    await deleteLot(sampleId);
    // Deletado o unico/maior lote, o proximo numero automatico volta a ser ele.
    const next = await queryService.getNextInternalLotNumber();
    assert.equal(String(next), String(n));
  });

  test('BLOQUEIA deletar um lote que tem contrato (WASH_OUT) -> 409 SAMPLE_HAS_CONTRACT', async () => {
    const { sampleId } = await createLot();
    // Contrato minimo em WASH_OUT vinculado ao lote (soldSacks=0, mas contrato existe:
    // aparece no Financeiro/Espelho e imprime o nº ao vivo).
    // D147 (CHECK chk_sale_contract_type_lote): a vista exige sample_id + movement_id.
    // O SALE exige buyer_client_id (chk_sample_movement_type_fields): comprador PF
    // mínimo (só full_name satisfaz chk_client_person_type_fields).
    const buyerId = randomUUID();
    await prisma.client.create({
      data: { id: buyerId, personType: 'PF', fullName: 'Comprador Teste', isBuyer: true },
    });
    const movementId = randomUUID();
    await prisma.sampleMovement.create({
      data: {
        id: movementId,
        sampleId,
        movementType: 'SALE',
        // WASH_OUT desfez a venda → movimento CANCELLED (soldSacks=0, como o fixture
        // antigo). Evita o guard de "movimentacoes comerciais ativas" antes do de
        // contrato — o teste isola o SAMPLE_HAS_CONTRACT.
        status: 'CANCELLED',
        cancelledAt: new Date('2026-07-02'),
        buyerClientId: buyerId,
        quantitySacks: 10,
        movementDate: new Date('2026-07-02'),
      },
    });
    await prisma.saleContract.create({
      data: {
        id: randomUUID(),
        type: 'MERCADO_A_VISTA',
        contractSeq: 1,
        contractNumber: '0001/26',
        status: 'WASH_OUT',
        contractDate: new Date('2026-07-02'),
        sampleId,
        movementId,
        quantitySacks: 10,
        unitPrice: '100.00',
        totalValue: '1000.00',
      },
    });

    await assert.rejects(
      () => deleteLot(sampleId),
      (error) =>
        error instanceof HttpError &&
        error.status === 409 &&
        error.details?.code === 'SAMPLE_HAS_CONTRACT'
    );

    // O lote NAO foi deletado e o numero segue registrado.
    const still = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(still.status, 'REGISTRATION_CONFIRMED');
    assert.ok(still.internalLotNumber);
  });

  test('lotes deletados SOMEM do listSamples', async () => {
    const keep = await createLot();
    const drop = await createLot();
    await deleteLot(drop.sampleId);

    const list = await queryService.listSamples({ limit: 100 });
    const ids = list.items.map((s) => s.id);
    assert.ok(ids.includes(keep.sampleId), 'lote vivo deve aparecer');
    assert.ok(!ids.includes(drop.sampleId), 'lote deletado NAO deve aparecer');
  });

  test('imutabilidade do numero preservada: nular fora do delete ainda e bloqueado', async () => {
    const { sampleId } = await createLot();
    // Trocar o numero para outro valor -> sempre bloqueado pela trigger.
    await assert.rejects(
      () =>
        prisma.sample.update({
          where: { id: sampleId },
          data: { internalLotNumber: '9999999' },
        }),
      /immutable/
    );
    // Nular o numero SEM virar INVALIDATED -> bloqueado (so o delete pode nular).
    await assert.rejects(
      () =>
        prisma.sample.update({
          where: { id: sampleId },
          data: { internalLotNumber: null },
        }),
      /immutable/
    );
  });
}
