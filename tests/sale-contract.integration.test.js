import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

import { EventContractDbService } from '../src/events/event-contract-db-service.js';
import { PrismaEventStore } from '../src/events/prisma-event-store.js';
import { SampleQueryService } from '../src/samples/sample-query-service.js';
import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { SaleContractService } from '../src/sale-contracts/sale-contract-service.js';
import { registrationConfirmedEvent } from './helpers/event-builders.js';
import { TEST_BROKER_ID, seedTestBroker } from './helpers/sale-contract-fixtures.js';

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

const currentYear2 = String(new Date().getFullYear() % 100).padStart(2, '0');

if (!databaseUrl || !databaseReachable) {
  test.skip('integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const store = new PrismaEventStore(prisma);
  const eventService = new EventContractDbService({ store });
  const queryService = new SampleQueryService({ prisma });

  const clientServiceMock = {
    async resolveOwnerBinding({ ownerClientId, ownerUnitId }) {
      return { ownerClientId, ownerUnitId: ownerUnitId ?? null, displayName: 'Vendedor' };
    },
    async resolveBuyerBinding({ buyerClientId }) {
      return {
        buyerClientId,
        buyerUnitId: null,
        buyerClient: { id: buyerClientId, displayName: 'Comprador' },
        buyerUnit: null,
      };
    },
  };
  const userServiceMock = {
    async findUserOrNull(userId) {
      return { id: userId, fullName: 'Usuario', username: 't', status: 'ACTIVE' };
    },
  };

  const commandService = new SampleCommandService({
    eventService,
    queryService,
    clientService: clientServiceMock,
    userService: userServiceMock,
  });
  const saleContractService = new SaleContractService({ prisma });

  const commercialActor = {
    actorType: 'USER',
    actorUserId: randomUUID(),
    role: 'COMMERCIAL',
    source: 'api',
    requestId: randomUUID(),
  };
  const adminActor = { ...commercialActor, role: 'ADMIN', actorUserId: randomUUID() };

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, sample_blend_component, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  async function createBuyerClient(id) {
    await prisma.client.create({
      data: { id, personType: 'PF', fullName: 'Comprador', status: 'INACTIVE', isBuyer: true },
    });
  }

  async function createClassifiedSample({ id, lotNumber, declaredSacks = 10 }) {
    await eventService.appendEvent(
      registrationConfirmedEvent(id, {
        payload: {
          sampleLotNumber: lotNumber,
          declared: { owner: 'Produtor', sacks: declaredSacks, harvest: '24/25', originLot: 'L1' },
        },
      })
    );
    await prisma.sample.update({ where: { id }, data: { status: 'CLASSIFIED' } });
  }

  async function sell(sampleId, version, buyerId, overrides = {}) {
    return commandService.createSampleMovement(
      {
        sampleId,
        movementType: 'SALE',
        quantitySacks: 10,
        movementDate: '2026-06-26',
        buyerClientId: buyerId,
        expectedVersion: version,
        unitPrice: 100,
        sellerBrokeragePct: 2,
        buyerBrokeragePct: 1,
        brokerIds: [TEST_BROKER_ID],
        ...overrides,
      },
      commercialActor
    );
  }

  test.before(async () => {
    await prisma.$connect();
  });
  test.after(async () => {
    await prisma.$disconnect();
  });
  test.beforeEach(async () => {
    await resetDatabase();
    await seedTestBroker(prisma);
  });

  test('venda a vista cria 1 contrato EM_ABERTO com numero, total, corretagens e corretor', async () => {
    const sampleId = randomUUID();
    const buyerId = randomUUID();
    await createClassifiedSample({ id: sampleId, lotNumber: '20001', declaredSacks: 10 });
    await createBuyerClient(buyerId);
    const sample = await queryService.requireSample(sampleId);

    const result = await sell(sampleId, sample.version, buyerId);

    assert.equal(result.saleContract.contractNumber, `0001/${currentYear2}`);

    const contracts = await prisma.saleContract.findMany();
    assert.equal(contracts.length, 1);
    const contract = contracts[0];
    assert.equal(contract.status, 'EM_ABERTO');
    assert.equal(contract.type, 'MERCADO_A_VISTA');
    assert.equal(contract.contractSeq, 1);
    assert.equal(contract.sampleId, sampleId);
    assert.ok(contract.movementId);
    assert.equal(Number(contract.unitPrice), 100);
    assert.equal(Number(contract.totalValue), 1000);
    assert.equal(Number(contract.sellerBrokerageValue), 20);
    assert.equal(Number(contract.buyerBrokerageValue), 10);

    const brokers = await prisma.saleContractBroker.findMany({
      where: { saleContractId: contract.id },
    });
    assert.equal(brokers.length, 1);
    assert.equal(brokers[0].brokerId, TEST_BROKER_ID);
    assert.equal(brokers[0].brokerNameSnapshot, 'Corretor Teste');

    // o contrato aponta pro movimento da venda
    const movement = await prisma.sampleMovement.findFirst({ where: { sampleId } });
    assert.equal(contract.movementId, movement.id);
  });

  test('numeracao continua: 2 vendas => 0001 e 0002', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);

    const s1 = randomUUID();
    await createClassifiedSample({ id: s1, lotNumber: '20002', declaredSacks: 10 });
    const sample1 = await queryService.requireSample(s1);
    const r1 = await sell(s1, sample1.version, buyerId);

    const s2 = randomUUID();
    await createClassifiedSample({ id: s2, lotNumber: '20003', declaredSacks: 10 });
    const sample2 = await queryService.requireSample(s2);
    const r2 = await sell(s2, sample2.version, buyerId);

    assert.equal(r1.saleContract.contractNumber, `0001/${currentYear2}`);
    assert.equal(r2.saleContract.contractNumber, `0002/${currentYear2}`);
  });

  test('perda (LOSS) nao cria contrato', async () => {
    const sampleId = randomUUID();
    await createClassifiedSample({ id: sampleId, lotNumber: '20004', declaredSacks: 10 });
    const sample = await queryService.requireSample(sampleId);

    await commandService.createSampleMovement(
      {
        sampleId,
        movementType: 'LOSS',
        quantitySacks: 3,
        movementDate: '2026-06-26',
        lossReasonText: 'AVARIA',
        expectedVersion: sample.version,
      },
      commercialActor
    );

    const contracts = await prisma.saleContract.findMany();
    assert.equal(contracts.length, 0);
  });

  test('cancelar a venda remove o contrato EM_ABERTO (e o corretor)', async () => {
    const sampleId = randomUUID();
    const buyerId = randomUUID();
    await createClassifiedSample({ id: sampleId, lotNumber: '20005', declaredSacks: 10 });
    await createBuyerClient(buyerId);
    const sample = await queryService.requireSample(sampleId);

    await sell(sampleId, sample.version, buyerId);
    assert.equal((await prisma.saleContract.findMany()).length, 1);

    const movement = await prisma.sampleMovement.findFirst({ where: { sampleId } });
    const afterSale = await queryService.requireSample(sampleId);
    await commandService.cancelSampleMovement(
      {
        sampleId,
        movementId: movement.id,
        reasonText: 'Venda cancelada no teste',
        expectedVersion: afterSale.version,
      },
      commercialActor
    );

    assert.equal((await prisma.saleContract.findMany()).length, 0);
    assert.equal((await prisma.saleContractBroker.findMany()).length, 0);
  });

  test('gestao de contratos: COMMERCIAL 403, ADMIN lista e detalha', async () => {
    const sampleId = randomUUID();
    const buyerId = randomUUID();
    await createClassifiedSample({ id: sampleId, lotNumber: '20006', declaredSacks: 10 });
    await createBuyerClient(buyerId);
    const sample = await queryService.requireSample(sampleId);
    const result = await sell(sampleId, sample.version, buyerId);

    await assert.rejects(
      () => saleContractService.listSaleContracts({}, commercialActor),
      (err) => err.status === 403
    );

    const list = await saleContractService.listSaleContracts({}, adminActor);
    assert.equal(list.items.length, 1);

    const detail = await saleContractService.getSaleContract(result.saleContract.id, adminActor);
    assert.equal(detail.contract.contractNumber, `0001/${currentYear2}`);
    assert.equal(detail.contract.brokers.length, 1);
  });
}

async function canReachDatabase(databaseUrlValue) {
  if (!databaseUrlValue) {
    return false;
  }
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
