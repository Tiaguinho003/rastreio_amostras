import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

import { EventContractDbService } from '../src/events/event-contract-db-service.js';
import { PrismaEventStore } from '../src/events/prisma-event-store.js';
import { SampleQueryService } from '../src/samples/sample-query-service.js';
import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { SaleContractService } from '../src/sale-contracts/sale-contract-service.js';
import { SaleContractPdfService } from '../src/sale-contracts/sale-contract-pdf-service.js';
import { getContractIssuer } from '../src/sale-contracts/issuer-config.js';
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
      return {
        ownerClientId,
        ownerUnitId: ownerUnitId ?? null,
        displayName: `Vendedor ${ownerClientId.slice(0, 8)}`,
        ownerClient: { id: ownerClientId, displayName: `Vendedor ${ownerClientId.slice(0, 8)}` },
        ownerUnit: null,
      };
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
  const saleContractService = new SaleContractService({ prisma, commandService, queryService });
  const saleContractPdfService = new SaleContractPdfService();

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

  // PJ (legal_name + cnpj) evita o requisito de filial da etapa 2 (PF exige
  // filial). cnpj e @unique → contador por processo (sem checksum no banco).
  let cnpjCounter = 0;
  function nextCnpj() {
    cnpjCounter += 1;
    return String(20000000000000 + cnpjCounter);
  }

  async function createBuyerClient(id) {
    await prisma.client.create({
      data: {
        id,
        personType: 'PJ',
        legalName: 'Comprador PJ',
        cnpj: nextCnpj(),
        status: 'INACTIVE',
        isBuyer: true,
      },
    });
  }

  async function createSellerClient(id) {
    await prisma.client.create({
      data: {
        id,
        personType: 'PJ',
        legalName: 'Vendedor PJ',
        cnpj: nextCnpj(),
        status: 'INACTIVE',
        isSeller: true,
      },
    });
  }

  const TEST_BANK_ID = '0000ba0c-0000-4000-8000-00000000ba0c';
  async function createSellerBankAccount(sellerId) {
    await prisma.bank.upsert({
      where: { id: TEST_BANK_ID },
      update: {},
      create: { id: TEST_BANK_ID, name: 'Banco Teste', compeCode: '001' },
    });
    const accountId = randomUUID();
    await prisma.clientBankAccount.create({
      data: {
        id: accountId,
        clientId: sellerId,
        bankId: TEST_BANK_ID,
        agency: '0001',
        accountNumber: '12345-6',
        holderName: 'Vendedor PJ',
        holderTaxId: '12345678000199',
      },
    });
    return accountId;
  }

  // SaleContractExport.generatedByUserId -> app_user (FK). app_user nao e
  // truncado pelo resetDatabase, entao o upsert por id basta.
  async function seedAdminUser() {
    const suffix = adminActor.actorUserId.slice(0, 8);
    await prisma.user.upsert({
      where: { id: adminActor.actorUserId },
      update: {},
      create: {
        id: adminActor.actorUserId,
        fullName: `Admin ${suffix}`,
        username: `admin-${suffix}`,
        usernameCanonical: `admin-${suffix}`,
        email: `admin-${suffix}@example.com`,
        emailCanonical: `admin-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'ADMIN',
      },
    });
  }

  async function fetchLookups() {
    const [paymentForm, modality, packaging] = await Promise.all([
      prisma.contractPaymentForm.findFirst({ where: { status: 'ACTIVE' } }),
      prisma.contractModality.findFirst({ where: { status: 'ACTIVE' } }),
      prisma.contractPackaging.findFirst({ where: { status: 'ACTIVE' } }),
    ]);
    return { paymentForm, modality, packaging };
  }

  // Cria amostra (com dono=vendedor) + registra a venda; devolve refs do contrato.
  async function setupEmittableContract({ lotNumber }) {
    const sellerId = randomUUID();
    await createSellerClient(sellerId);
    const bankAccountId = await createSellerBankAccount(sellerId);
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const sampleId = randomUUID();
    await createClassifiedSample({ id: sampleId, lotNumber, declaredSacks: 10 });
    await prisma.sample.update({ where: { id: sampleId }, data: { ownerClientId: sellerId } });
    const sample = await queryService.requireSample(sampleId);
    const sale = await sell(sampleId, sample.version, buyerId);
    return { contractId: sale.saleContract.id, sampleId, sellerId, buyerId, bankAccountId };
  }

  function etapa2Payload({ bankAccountId, lookups, expectedVersion = 0, overrides = {} }) {
    return {
      expectedVersion,
      sellerBankAccountId: bankAccountId,
      paymentFormId: lookups.paymentForm.id,
      modalityId: lookups.modality.id,
      packagingId: lookups.packaging.id,
      invoiceDate: '2026-07-10',
      paymentDate: '2026-07-20',
      purchaseNumber: 'NF-123',
      observations: 'OBS',
      ...overrides,
    };
  }

  // Bloco "fase 1" (venda) do "Editar" — espelha os valores da venda padrao do
  // setupEmittableContract (10 sc, R$100, 2%/1%, 26/06, corretor de teste).
  function saleFields(overrides = {}) {
    return {
      quantitySacks: 10,
      unitPrice: 100,
      sellerBrokeragePct: 2,
      buyerBrokeragePct: 1,
      contractDate: '2026-06-26',
      brokerIds: [TEST_BROKER_ID],
      ...overrides,
    };
  }

  // Emite + confirma -> contrato CONFIRMADO; devolve refs + a version atual.
  async function setupConfirmedContract({ lotNumber }) {
    const refs = await setupEmittableContract({ lotNumber });
    const lookups = await fetchLookups();
    const emitted = await saleContractService.emitSaleContract(
      refs.contractId,
      etapa2Payload({ bankAccountId: refs.bankAccountId, lookups }),
      adminActor
    );
    const confirmed = await saleContractService.confirmSaleContract(
      refs.contractId,
      { expectedVersion: emitted.contract.version },
      adminActor
    );
    return { ...refs, version: confirmed.contract.version };
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
    await seedAdminUser();
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

  test('emitir: EM_ABERTO -> CONFERIR com campos, snapshots e auditoria', async () => {
    const { contractId, bankAccountId } = await setupEmittableContract({ lotNumber: '21001' });
    const lookups = await fetchLookups();

    const emitted = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({ bankAccountId, lookups }),
      adminActor
    );

    assert.equal(emitted.contract.status, 'CONFERIR');
    assert.equal(emitted.contract.paymentFormText, lookups.paymentForm.name);
    assert.equal(emitted.contract.modalityText, lookups.modality.name);
    assert.equal(emitted.contract.packagingText, lookups.packaging.name);
    assert.equal(emitted.contract.purchaseNumber, 'NF-123');
    assert.ok(emitted.contract.sellerBankSnapshot);
    assert.equal(emitted.contract.sellerBankSnapshot.accountId, bankAccountId);
    assert.equal(emitted.contract.version, 1);

    const exports = await prisma.saleContractExport.findMany({
      where: { saleContractId: contractId },
    });
    assert.equal(exports.length, 1);
  });

  test('emitir trocando o comprador: atualiza o contrato E a venda (P20)', async () => {
    const { contractId, sampleId, buyerId, bankAccountId } = await setupEmittableContract({
      lotNumber: '21020',
    });
    const lookups = await fetchLookups();

    const newBuyerId = randomUUID();
    await createBuyerClient(newBuyerId);
    assert.notEqual(newBuyerId, buyerId);

    const emitted = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({ bankAccountId, lookups, overrides: { buyerClientId: newBuyerId } }),
      adminActor
    );

    // o contrato passa a referenciar o novo comprador
    assert.equal(emitted.contract.buyerClientId, newBuyerId);

    // a venda (movimento) tambem mudou -> "pra quem foi vendido" no lote
    const movement = await prisma.sampleMovement.findFirst({
      where: { sampleId, movementType: 'SALE' },
    });
    assert.equal(movement.buyerClientId, newBuyerId);
  });

  test('emitir sem trocar o comprador: nao mexe na venda', async () => {
    const { contractId, sampleId, buyerId, bankAccountId } = await setupEmittableContract({
      lotNumber: '21021',
    });
    const lookups = await fetchLookups();

    await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({ bankAccountId, lookups }),
      adminActor
    );

    const movement = await prisma.sampleMovement.findFirst({
      where: { sampleId, movementType: 'SALE' },
    });
    assert.equal(movement.buyerClientId, buyerId);
  });

  test('editar fase 1: reduzir sacas ajusta o saldo do lote e recomputa o total', async () => {
    const { contractId, sampleId, bankAccountId } = await setupEmittableContract({
      lotNumber: '21030',
    });
    const lookups = await fetchLookups();

    const emitted = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({
        bankAccountId,
        lookups,
        overrides: { saleFields: saleFields({ quantitySacks: 6 }) },
      }),
      adminActor
    );

    // contrato: sacas + money recomputado (6 x 100 = 600; 2% = 12; 1% = 6)
    assert.equal(emitted.contract.quantitySacks, 6);
    assert.equal(Number(emitted.contract.totalValue), 600);
    assert.equal(Number(emitted.contract.sellerBrokerageValue), 12);
    assert.equal(Number(emitted.contract.buyerBrokerageValue), 6);

    // saldo do lote: vendido caiu de 10 -> 6 (4 voltaram a disponivel)
    const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(sample.soldSacks, 6);

    // a venda (movimento, append-only) tambem caiu
    const movement = await prisma.sampleMovement.findFirst({
      where: { sampleId, movementType: 'SALE' },
    });
    assert.equal(movement.quantitySacks, 6);
  });

  test('editar fase 1: trocar preco e corretagens recomputa o total', async () => {
    const { contractId, bankAccountId } = await setupEmittableContract({ lotNumber: '21031' });
    const lookups = await fetchLookups();

    const emitted = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({
        bankAccountId,
        lookups,
        overrides: {
          saleFields: saleFields({ unitPrice: 200, sellerBrokeragePct: 3, buyerBrokeragePct: 0.5 }),
        },
      }),
      adminActor
    );

    assert.equal(Number(emitted.contract.unitPrice), 200);
    assert.equal(Number(emitted.contract.sellerBrokeragePct), 3);
    assert.equal(Number(emitted.contract.buyerBrokeragePct), 0.5);
    // 10 x 200 = 2000; 3% = 60; 0,5% = 10
    assert.equal(Number(emitted.contract.totalValue), 2000);
    assert.equal(Number(emitted.contract.sellerBrokerageValue), 60);
    assert.equal(Number(emitted.contract.buyerBrokerageValue), 10);
  });

  test('editar fase 1: trocar os corretores substitui as linhas do contrato', async () => {
    const { contractId, bankAccountId } = await setupEmittableContract({ lotNumber: '21032' });
    const lookups = await fetchLookups();

    const broker2 = randomUUID();
    await prisma.broker.create({ data: { id: broker2, name: 'Corretor Dois', status: 'ACTIVE' } });

    await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({
        bankAccountId,
        lookups,
        overrides: { saleFields: saleFields({ brokerIds: [broker2] }) },
      }),
      adminActor
    );

    const rows = await prisma.saleContractBroker.findMany({
      where: { saleContractId: contractId },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].brokerId, broker2);
    assert.equal(rows[0].brokerNameSnapshot, 'Corretor Dois');
  });

  test('editar fase 1: trocar a data sincroniza a venda do lote (movementDate)', async () => {
    const { contractId, sampleId, bankAccountId } = await setupEmittableContract({
      lotNumber: '21033',
    });
    const lookups = await fetchLookups();

    const emitted = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({
        bankAccountId,
        lookups,
        overrides: { saleFields: saleFields({ contractDate: '2026-07-01' }) },
      }),
      adminActor
    );

    assert.ok(emitted.contract.contractDate.startsWith('2026-07-01'));
    const movement = await prisma.sampleMovement.findFirst({
      where: { sampleId, movementType: 'SALE' },
    });
    assert.equal(new Date(movement.movementDate).toISOString().slice(0, 10), '2026-07-01');
  });

  test('editar sacas em liga -> 422 (trava F7.1)', async () => {
    const { contractId, sampleId, bankAccountId } = await setupEmittableContract({
      lotNumber: '21034',
    });
    const lookups = await fetchLookups();
    // Exercita a trava F7.1 sem montar uma cascata real: marca o lote como liga.
    await prisma.sample.update({ where: { id: sampleId }, data: { isBlend: true } });

    await assert.rejects(
      () =>
        saleContractService.emitSaleContract(
          contractId,
          etapa2Payload({
            bankAccountId,
            lookups,
            overrides: { saleFields: saleFields({ quantitySacks: 6 }) },
          }),
          adminActor
        ),
      (err) => err.status === 422
    );
  });

  test('emitir: faltando obrigatorio (banco) -> 422', async () => {
    const { contractId, bankAccountId } = await setupEmittableContract({ lotNumber: '21002' });
    const lookups = await fetchLookups();
    await assert.rejects(
      () =>
        saleContractService.emitSaleContract(
          contractId,
          etapa2Payload({ bankAccountId, lookups, overrides: { sellerBankAccountId: undefined } }),
          adminActor
        ),
      (err) => err.status === 422
    );
  });

  test('re-emitir (Editar): CONFERIR -> CONFERIR + nova auditoria', async () => {
    const { contractId, bankAccountId } = await setupEmittableContract({ lotNumber: '21003' });
    const lookups = await fetchLookups();
    const first = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({ bankAccountId, lookups }),
      adminActor
    );
    const second = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({ bankAccountId, lookups, expectedVersion: first.contract.version }),
      adminActor
    );
    assert.equal(second.contract.status, 'CONFERIR');
    const exports = await prisma.saleContractExport.findMany({
      where: { saleContractId: contractId },
    });
    assert.equal(exports.length, 2);
  });

  test('confirmar: CONFERIR -> CONFIRMADO', async () => {
    const { contractId, bankAccountId } = await setupEmittableContract({ lotNumber: '21004' });
    const lookups = await fetchLookups();
    const emitted = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({ bankAccountId, lookups }),
      adminActor
    );
    const confirmed = await saleContractService.confirmSaleContract(
      contractId,
      { expectedVersion: emitted.contract.version },
      adminActor
    );
    assert.equal(confirmed.contract.status, 'CONFIRMADO');
  });

  test('aplicar agio em CONFIRMADO: recalcula total + corretagem, registra no log, status mantido', async () => {
    const refs = await setupConfirmedContract({ lotNumber: '21100' });
    const result = await saleContractService.applyAgioSaleContract(
      refs.contractId,
      { expectedVersion: refs.version, agioDesagioType: 'AGIO', agioDesagioValue: 50 },
      adminActor
    );
    const c = result.contract;
    assert.equal(c.status, 'CONFIRMADO'); // status NAO muda
    assert.equal(c.agioDesagioType, 'AGIO');
    assert.equal(Number(c.agioDesagioValue), 50);
    // base 10 sc x R$100 + agio R$50/saca => R$150/saca efetivo => total 1500
    assert.equal(Number(c.totalValue), 1500);
    assert.equal(Number(c.sellerBrokerageValue), 30); // 1500 x 2%
    assert.equal(Number(c.buyerBrokerageValue), 15); // 1500 x 1%
    assert.equal(c.version, refs.version + 1);

    const logs = await prisma.saleContractAgioLog.findMany({
      where: { saleContractId: refs.contractId },
    });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].agioDesagioType, 'AGIO');
    assert.equal(Number(logs[0].agioDesagioValue), 50);
    assert.equal(logs[0].previousAgioType, null);
    assert.equal(Number(logs[0].previousTotalValue), 1000);
    assert.equal(Number(logs[0].newTotalValue), 1500);
    assert.equal(logs[0].appliedByUserId, adminActor.actorUserId);
  });

  test('aplicar agio: substitui (nao acumula) e o Financeiro reflete a nova corretagem', async () => {
    const refs = await setupConfirmedContract({ lotNumber: '21101' });
    const first = await saleContractService.applyAgioSaleContract(
      refs.contractId,
      { expectedVersion: refs.version, agioDesagioType: 'AGIO', agioDesagioValue: 50 },
      adminActor
    );
    // Reaplica DESAGIO 20 sobre o preco CRU (100-20=80) => total 800; NAO 150-20.
    const second = await saleContractService.applyAgioSaleContract(
      refs.contractId,
      { expectedVersion: first.contract.version, agioDesagioType: 'DESAGIO', agioDesagioValue: 20 },
      adminActor
    );
    const c = second.contract;
    assert.equal(c.agioDesagioType, 'DESAGIO');
    assert.equal(Number(c.totalValue), 800); // 80 x 10 — substitui, nao acumula
    assert.equal(Number(c.sellerBrokerageValue), 16); // 800 x 2%
    assert.equal(Number(c.buyerBrokerageValue), 8); // 800 x 1%

    const logs = await prisma.saleContractAgioLog.findMany({
      where: { saleContractId: refs.contractId },
    });
    assert.equal(logs.length, 2);
    const firstLog = logs.find((l) => l.previousAgioType === null);
    const secondLog = logs.find((l) => l.previousAgioType === 'AGIO');
    assert.ok(firstLog && secondLog);
    assert.equal(Number(secondLog.previousAgioValue), 50);
    assert.equal(Number(secondLog.previousTotalValue), 1500);
    assert.equal(Number(secondLog.newTotalValue), 800);

    // Financeiro le ao vivo: a cota reflete a corretagem recalculada (16 + 8).
    const fin = await saleContractService.listBrokerReceivables({}, adminActor);
    const item = fin.items.find((i) => i.id === refs.contractId);
    assert.equal(item.commissionTotal, 24);
    assert.equal(item.brokers[0].share, 24);
  });

  test('aplicar agio fora de CONFIRMADO -> 409 (CONFERIR e FATURADO)', async () => {
    // CONFERIR (emitido, nao confirmado)
    const { contractId, bankAccountId } = await setupEmittableContract({ lotNumber: '21102' });
    const lookups = await fetchLookups();
    const emitted = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({ bankAccountId, lookups }),
      adminActor
    );
    await assert.rejects(
      () =>
        saleContractService.applyAgioSaleContract(
          contractId,
          {
            expectedVersion: emitted.contract.version,
            agioDesagioType: 'AGIO',
            agioDesagioValue: 10,
          },
          adminActor
        ),
      /cannot receive agio/
    );

    // FATURADO (confirmado + faturado)
    const refs = await setupConfirmedContract({ lotNumber: '21103' });
    const invoiced = await saleContractService.invoiceSaleContract(
      refs.contractId,
      { expectedVersion: refs.version, date: '2026-07-15' },
      adminActor
    );
    await assert.rejects(
      () =>
        saleContractService.applyAgioSaleContract(
          refs.contractId,
          {
            expectedVersion: invoiced.contract.version,
            agioDesagioType: 'AGIO',
            agioDesagioValue: 10,
          },
          adminActor
        ),
      /cannot receive agio/
    );
  });

  test('aplicar agio: version stale -> 409; sem tipo -> 422; COMMERCIAL -> 403; nada muda', async () => {
    const refs = await setupConfirmedContract({ lotNumber: '21104' });
    await assert.rejects(
      () =>
        saleContractService.applyAgioSaleContract(
          refs.contractId,
          { expectedVersion: refs.version + 5, agioDesagioType: 'AGIO', agioDesagioValue: 10 },
          adminActor
        ),
      /modified concurrently/
    );
    await assert.rejects(
      () =>
        saleContractService.applyAgioSaleContract(
          refs.contractId,
          { expectedVersion: refs.version },
          adminActor
        ),
      /agioDesagioType is required/
    );
    await assert.rejects(
      () =>
        saleContractService.applyAgioSaleContract(
          refs.contractId,
          { expectedVersion: refs.version, agioDesagioType: 'AGIO', agioDesagioValue: 10 },
          commercialActor
        ),
      /not allowed/
    );
    // nenhuma aplicacao passou: segue sem agio, total cru e sem log.
    const after = await saleContractService.getSaleContract(refs.contractId, adminActor);
    assert.equal(after.contract.agioDesagioType, null);
    assert.equal(Number(after.contract.totalValue), 1000);
    const logs = await prisma.saleContractAgioLog.findMany({
      where: { saleContractId: refs.contractId },
    });
    assert.equal(logs.length, 0);
  });

  test('guards: emitir CONFIRMADO -> 409; confirmar EM_ABERTO -> 409', async () => {
    const { contractId, bankAccountId } = await setupEmittableContract({ lotNumber: '21005' });
    const lookups = await fetchLookups();
    const emitted = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({ bankAccountId, lookups }),
      adminActor
    );
    await saleContractService.confirmSaleContract(
      contractId,
      { expectedVersion: emitted.contract.version },
      adminActor
    );
    await assert.rejects(
      () =>
        saleContractService.emitSaleContract(
          contractId,
          etapa2Payload({ bankAccountId, lookups, expectedVersion: emitted.contract.version + 1 }),
          adminActor
        ),
      (err) => err.status === 409
    );

    const other = await setupEmittableContract({ lotNumber: '21006' });
    await assert.rejects(
      () =>
        saleContractService.confirmSaleContract(
          other.contractId,
          { expectedVersion: 0 },
          adminActor
        ),
      (err) => err.status === 409
    );
  });

  test('concorrencia: expectedVersion stale -> 409', async () => {
    const { contractId, bankAccountId } = await setupEmittableContract({ lotNumber: '21007' });
    const lookups = await fetchLookups();
    await assert.rejects(
      () =>
        saleContractService.emitSaleContract(
          contractId,
          etapa2Payload({ bankAccountId, lookups, expectedVersion: 99 }),
          adminActor
        ),
      (err) => err.status === 409
    );
  });

  test('D48: editar o vendedor sincroniza o Sample.ownerClientId', async () => {
    const { contractId, sampleId } = await setupEmittableContract({ lotNumber: '21008' });
    const lookups = await fetchLookups();
    const newSellerId = randomUUID();
    await createSellerClient(newSellerId);
    const newBankAccountId = await createSellerBankAccount(newSellerId);

    await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({
        bankAccountId: newBankAccountId,
        lookups,
        overrides: { sellerClientId: newSellerId },
      }),
      adminActor
    );

    const sample = await prisma.sample.findUnique({
      where: { id: sampleId },
      select: { ownerClientId: true },
    });
    assert.equal(sample.ownerClientId, newSellerId);
  });

  test('WASH_OUT: cancelar a venda de contrato CONFERIR vira WASH_OUT', async () => {
    const { contractId, sampleId, bankAccountId } = await setupEmittableContract({
      lotNumber: '21009',
    });
    const lookups = await fetchLookups();
    await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({ bankAccountId, lookups }),
      adminActor
    );

    const movement = await prisma.sampleMovement.findFirst({ where: { sampleId } });
    const sample = await queryService.requireSample(sampleId);
    await commandService.cancelSampleMovement(
      {
        sampleId,
        movementId: movement.id,
        reasonText: 'Venda cancelada',
        expectedVersion: sample.version,
      },
      commercialActor
    );

    const contract = await prisma.saleContract.findUnique({ where: { id: contractId } });
    assert.equal(contract.status, 'WASH_OUT');
    assert.equal(contract.washoutReason, 'Venda cancelada');
    assert.ok(contract.washoutAt);
  });

  test('WASH_OUT: cancelar a venda de contrato CONFIRMADO vira WASH_OUT', async () => {
    const { contractId, sampleId, bankAccountId } = await setupEmittableContract({
      lotNumber: '21010',
    });
    const lookups = await fetchLookups();
    const emitted = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({ bankAccountId, lookups }),
      adminActor
    );
    await saleContractService.confirmSaleContract(
      contractId,
      { expectedVersion: emitted.contract.version },
      adminActor
    );

    const movement = await prisma.sampleMovement.findFirst({ where: { sampleId } });
    const sample = await queryService.requireSample(sampleId);
    await commandService.cancelSampleMovement(
      { sampleId, movementId: movement.id, reasonText: 'Quebra', expectedVersion: sample.version },
      commercialActor
    );

    const contract = await prisma.saleContract.findUnique({ where: { id: contractId } });
    assert.equal(contract.status, 'WASH_OUT');
  });

  test('cancelar EM_ABERTO: remove o contrato, desfaz a venda e devolve as sacas', async () => {
    const { contractId, sampleId } = await setupEmittableContract({ lotNumber: '21012' });

    const before = await prisma.sample.findUnique({
      where: { id: sampleId },
      select: { commercialStatus: true, soldSacks: true },
    });
    assert.equal(before.commercialStatus, 'SOLD');
    assert.equal(before.soldSacks, 10);

    const c = await prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { version: true },
    });
    const result = await saleContractService.cancelSaleContract(
      contractId,
      { expectedVersion: c.version },
      adminActor
    );
    assert.deepEqual(result, { deleted: true, contractId });

    // contrato (e corretor) sumiram
    assert.equal((await prisma.saleContract.findMany()).length, 0);
    assert.equal((await prisma.saleContractBroker.findMany()).length, 0);

    // venda CANCELLED + sacas de volta ao lote (disponivel)
    const movement = await prisma.sampleMovement.findFirst({ where: { sampleId } });
    assert.equal(movement.status, 'CANCELLED');
    const after = await prisma.sample.findUnique({
      where: { id: sampleId },
      select: { commercialStatus: true, soldSacks: true },
    });
    assert.equal(after.commercialStatus, 'OPEN');
    assert.equal(after.soldSacks, 0);
  });

  test('cancelar: status CONFERIR -> 409 (nao-cancelavel; use Quebrar)', async () => {
    const { contractId, bankAccountId } = await setupEmittableContract({ lotNumber: '21013' });
    const lookups = await fetchLookups();
    await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({ bankAccountId, lookups }),
      adminActor
    );
    const c = await prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { version: true },
    });
    await assert.rejects(
      () =>
        saleContractService.cancelSaleContract(
          contractId,
          { expectedVersion: c.version },
          adminActor
        ),
      (err) => err.status === 409
    );
  });

  test('cancelar: version estale -> 409; inexistente -> 404; COMMERCIAL -> 403', async () => {
    const { contractId } = await setupEmittableContract({ lotNumber: '21014' });
    const c = await prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { version: true },
    });

    await assert.rejects(
      () =>
        saleContractService.cancelSaleContract(contractId, { expectedVersion: 999 }, adminActor),
      (err) => err.status === 409
    );
    await assert.rejects(
      () =>
        saleContractService.cancelSaleContract(randomUUID(), { expectedVersion: 0 }, adminActor),
      (err) => err.status === 404
    );
    await assert.rejects(
      () =>
        saleContractService.cancelSaleContract(
          contractId,
          { expectedVersion: c.version },
          commercialActor
        ),
      (err) => err.status === 403
    );
  });

  test('getNextContractNumber: preview NNNN/AA (max+1); exige ADMIN', async () => {
    // Vazio -> 0001/AA.
    const first = await saleContractService.getNextContractNumber(adminActor);
    assert.equal(first.contractNumber, `0001/${currentYear2}`);

    // Apos criar 1 contrato (via venda) -> 0002/AA.
    await setupEmittableContract({ lotNumber: '21020' });
    const second = await saleContractService.getNextContractNumber(adminActor);
    assert.equal(second.contractNumber, `0002/${currentYear2}`);

    // Gate ADMIN.
    await assert.rejects(
      () => saleContractService.getNextContractNumber(commercialActor),
      (err) => err.status === 403
    );
  });

  test('listContractLookups retorna as 3 listas; emit exige ADMIN', async () => {
    const lk = await saleContractService.listContractLookups(commercialActor);
    assert.ok(lk.paymentForms.length >= 2);
    assert.ok(lk.modalities.length >= 3);
    assert.ok(lk.packagings.length >= 3);

    const { contractId, bankAccountId } = await setupEmittableContract({ lotNumber: '21011' });
    const lookups = await fetchLookups();
    await assert.rejects(
      () =>
        saleContractService.emitSaleContract(
          contractId,
          etapa2Payload({ bankAccountId, lookups }),
          commercialActor
        ),
      (err) => err.status === 403
    );
  });

  test('PDF: contrato emitido gera um %PDF a partir dos snapshots reais', async () => {
    const { contractId, sampleId, bankAccountId } = await setupEmittableContract({
      lotNumber: '21012',
    });
    const lookups = await fetchLookups();
    await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({ bankAccountId, lookups }),
      adminActor
    );

    const { contract } = await saleContractService.getSaleContract(contractId, adminActor);
    const sample = await queryService.requireSample(sampleId);
    const { buffer } = await saleContractPdfService.renderContractPdf(contract, {
      lotNumber: sample.internalLotNumber ?? null,
      issuer: getContractIssuer(),
    });

    assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(buffer.length > 1500);
  });

  test('Espelho: contrato CONFIRMADO renderiza %PDF p/ os 2 lados, com a comissão de cada lado', async () => {
    const { contractId } = await setupConfirmedContract({ lotNumber: '21099' });
    const { contract } = await saleContractService.getSaleContract(contractId, adminActor);

    // venda padrao: 10 sacas x R$100 = R$1000; corretagem vend 2% = 20, comp 1% = 10
    assert.equal(contract.status, 'CONFIRMADO');
    assert.equal(contract.sellerBrokerageValue, 20);
    assert.equal(contract.buyerBrokerageValue, 10);

    const seller = await saleContractPdfService.renderEspelhoPdf(contract, {
      side: 'seller',
      issuer: getContractIssuer(),
    });
    const buyer = await saleContractPdfService.renderEspelhoPdf(contract, {
      side: 'buyer',
      issuer: getContractIssuer(),
    });
    assert.equal(seller.buffer.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.equal(buyer.buffer.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.notEqual(seller.checksumSha256, buyer.checksumSha256);
  });

  // Como setupConfirmedContract, mas com um corretor especifico (p/ o escopo
  // do COMMERCIAL no Financeiro).
  async function setupConfirmedContractWithBroker({ lotNumber, brokerId }) {
    const sellerId = randomUUID();
    await createSellerClient(sellerId);
    const bankAccountId = await createSellerBankAccount(sellerId);
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const sampleId = randomUUID();
    await createClassifiedSample({ id: sampleId, lotNumber, declaredSacks: 10 });
    await prisma.sample.update({ where: { id: sampleId }, data: { ownerClientId: sellerId } });
    const sample = await queryService.requireSample(sampleId);
    const sale = await sell(sampleId, sample.version, buyerId, { brokerIds: [brokerId] });
    const lookups = await fetchLookups();
    const emitted = await saleContractService.emitSaleContract(
      sale.saleContract.id,
      etapa2Payload({ bankAccountId, lookups }),
      adminActor
    );
    await saleContractService.confirmSaleContract(
      sale.saleContract.id,
      { expectedVersion: emitted.contract.version },
      adminActor
    );
    return { contractId: sale.saleContract.id };
  }

  test('Financeiro: ADMIN vê os fechamentos elegíveis com corretores e cotas', async () => {
    const { contractId } = await setupConfirmedContract({ lotNumber: '23010' });
    // um EM_ABERTO (não confirmado) NÃO deve aparecer
    await setupEmittableContract({ lotNumber: '23011' });

    const res = await saleContractService.listBrokerReceivables({}, adminActor);
    const item = res.items.find((i) => i.id === contractId);
    assert.ok(item, 'contrato confirmado com corretagem deve aparecer');
    assert.equal(item.totalValue, 1000); // 100 x 10 sacas
    assert.equal(item.commissionTotal, 30); // 1000 x (2% + 1%)
    assert.equal(item.brokerCount, 1);
    assert.equal(item.brokers.length, 1);
    assert.equal(item.brokers[0].name, 'Corretor Teste');
    assert.equal(item.brokers[0].share, 30);
    assert.equal(item.myShare, undefined);
    // só status congelados entram
    assert.ok(res.items.every((i) => ['CONFIRMADO', 'FATURADO', 'PAGO'].includes(i.status)));
  });

  test('Financeiro: COMMERCIAL vê só os seus fechamentos e só a própria cota', async () => {
    const commercialUserId = '0000c0a0-0000-4000-8000-00000000c0a0';
    const myBrokerId = '0000b0a0-0000-4000-8000-00000000b0a0';
    await prisma.user.upsert({
      where: { id: commercialUserId },
      update: { role: 'COMMERCIAL' },
      create: {
        id: commercialUserId,
        fullName: 'Comercial Teste',
        username: 'com-teste',
        usernameCanonical: 'com-teste',
        email: 'com-teste@example.com',
        emailCanonical: 'com-teste@example.com',
        passwordHash: 'x',
        role: 'COMMERCIAL',
      },
    });
    await prisma.broker.upsert({
      where: { id: myBrokerId },
      update: { userId: commercialUserId, status: 'ACTIVE' },
      create: { id: myBrokerId, name: 'Eu Corretor', status: 'ACTIVE', userId: commercialUserId },
    });
    const myActor = { ...commercialActor, actorUserId: commercialUserId };

    const mine = await setupConfirmedContractWithBroker({
      lotNumber: '23020',
      brokerId: myBrokerId,
    });
    // contrato de OUTRO corretor (TEST_BROKER) — não deve aparecer p/ mim
    await setupConfirmedContract({ lotNumber: '23021' });

    const res = await saleContractService.listBrokerReceivables({}, myActor);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].id, mine.contractId);
    assert.equal(res.items[0].commissionTotal, 30);
    assert.equal(res.items[0].myShare, 30);
    assert.equal(res.items[0].brokers, undefined); // não vê a lista de corretores
  });

  test('Financeiro: COMMERCIAL sem Broker vinculado → vazio', async () => {
    await setupConfirmedContract({ lotNumber: '23030' });
    const noBroker = { ...commercialActor, actorUserId: randomUUID() };
    const res = await saleContractService.listBrokerReceivables({}, noBroker);
    assert.deepEqual(res.items, []);
  });

  test('Financeiro: papel sem acesso (REGISTRATION) → 403', async () => {
    const reg = { ...commercialActor, role: 'REGISTRATION', actorUserId: randomUUID() };
    await assert.rejects(() => saleContractService.listBrokerReceivables({}, reg), /not allowed/);
  });

  test('criar lookup inline: cria ACTIVE, aparece na lista e fica no fim (append)', async () => {
    const before = await saleContractService.listContractLookups(adminActor);
    const created = await saleContractService.createContractLookup(
      { list: 'paymentForm', name: 'À vista (teste)' },
      adminActor
    );
    assert.equal(created.list, 'paymentForm');
    assert.ok(created.item.id);
    assert.equal(created.item.name, 'À vista (teste)');

    const after = await saleContractService.listContractLookups(adminActor);
    assert.equal(after.paymentForms.length, before.paymentForms.length + 1);
    // append (sortOrder = max+1) -> último na ordem (sortOrder asc, name asc)
    assert.equal(after.paymentForms[after.paymentForms.length - 1].id, created.item.id);
  });

  test('criar lookup inline: nome duplicado -> 409; lista inválida/nome vazio -> 422', async () => {
    await saleContractService.createContractLookup({ list: 'modality', name: 'Dup' }, adminActor);
    await assert.rejects(
      () => saleContractService.createContractLookup({ list: 'modality', name: 'Dup' }, adminActor),
      /already exists/
    );
    await assert.rejects(
      () => saleContractService.createContractLookup({ list: 'naoexiste', name: 'X' }, adminActor),
      /paymentForm, modality or packaging/
    );
    await assert.rejects(
      () => saleContractService.createContractLookup({ list: 'packaging', name: '  ' }, adminActor),
      /name is required/
    );
  });

  test('criar lookup inline: qualquer autenticado pode (D59) — COMMERCIAL cria', async () => {
    const created = await saleContractService.createContractLookup(
      { list: 'packaging', name: 'Bag teste' },
      commercialActor
    );
    assert.equal(created.item.name, 'Bag teste');
    const after = await saleContractService.listContractLookups(commercialActor);
    assert.ok(after.packagings.some((p) => p.id === created.item.id));
  });

  test('faturar: CONFIRMADO -> FATURADO grava invoicedAt', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '22001' });
    const r = await saleContractService.invoiceSaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-15' },
      adminActor
    );
    assert.equal(r.contract.status, 'FATURADO');
    assert.equal(r.contract.invoicedAt?.slice(0, 10), '2026-07-15');
  });

  test('pagar (apos faturar): FATURADO -> PAGO grava paidAt e preserva invoicedAt', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '22002' });
    const inv = await saleContractService.invoiceSaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-15' },
      adminActor
    );
    const pay = await saleContractService.paySaleContract(
      contractId,
      { expectedVersion: inv.contract.version, date: '2026-07-25' },
      adminActor
    );
    assert.equal(pay.contract.status, 'PAGO');
    assert.equal(pay.contract.paidAt?.slice(0, 10), '2026-07-25');
    assert.equal(pay.contract.invoicedAt?.slice(0, 10), '2026-07-15');
  });

  test('pagar direto (pular faturamento): CONFIRMADO -> PAGO com invoicedAt nulo', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '22003' });
    const pay = await saleContractService.paySaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-25' },
      adminActor
    );
    assert.equal(pay.contract.status, 'PAGO');
    assert.equal(pay.contract.paidAt?.slice(0, 10), '2026-07-25');
    assert.equal(pay.contract.invoicedAt, null);
  });

  test('desfazer: FATURADO -> CONFIRMADO limpa invoicedAt', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '22004' });
    const inv = await saleContractService.invoiceSaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-15' },
      adminActor
    );
    const rev = await saleContractService.revertSaleContractStatus(
      contractId,
      { expectedVersion: inv.contract.version },
      adminActor
    );
    assert.equal(rev.contract.status, 'CONFIRMADO');
    assert.equal(rev.contract.invoicedAt, null);
  });

  test('desfazer: PAGO (com faturamento) -> FATURADO limpa paidAt', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '22005' });
    const inv = await saleContractService.invoiceSaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-15' },
      adminActor
    );
    const pay = await saleContractService.paySaleContract(
      contractId,
      { expectedVersion: inv.contract.version, date: '2026-07-25' },
      adminActor
    );
    const rev = await saleContractService.revertSaleContractStatus(
      contractId,
      { expectedVersion: pay.contract.version },
      adminActor
    );
    assert.equal(rev.contract.status, 'FATURADO');
    assert.equal(rev.contract.paidAt, null);
    assert.equal(rev.contract.invoicedAt?.slice(0, 10), '2026-07-15');
  });

  test('desfazer: PAGO (pulou faturamento) -> CONFIRMADO', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '22006' });
    const pay = await saleContractService.paySaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-25' },
      adminActor
    );
    const rev = await saleContractService.revertSaleContractStatus(
      contractId,
      { expectedVersion: pay.contract.version },
      adminActor
    );
    assert.equal(rev.contract.status, 'CONFIRMADO');
    assert.equal(rev.contract.paidAt, null);
  });

  test('guards: faturar/pagar de CONFERIR -> 409; desfazer de CONFIRMADO -> 409', async () => {
    const a = await setupEmittableContract({ lotNumber: '22007' });
    const lookups = await fetchLookups();
    const emitted = await saleContractService.emitSaleContract(
      a.contractId,
      etapa2Payload({ bankAccountId: a.bankAccountId, lookups }),
      adminActor
    );
    await assert.rejects(
      () =>
        saleContractService.invoiceSaleContract(
          a.contractId,
          { expectedVersion: emitted.contract.version, date: '2026-07-15' },
          adminActor
        ),
      (err) => err.status === 409
    );
    await assert.rejects(
      () =>
        saleContractService.paySaleContract(
          a.contractId,
          { expectedVersion: emitted.contract.version, date: '2026-07-15' },
          adminActor
        ),
      (err) => err.status === 409
    );

    const b = await setupConfirmedContract({ lotNumber: '22008' });
    await assert.rejects(
      () =>
        saleContractService.revertSaleContractStatus(
          b.contractId,
          { expectedVersion: b.version },
          adminActor
        ),
      (err) => err.status === 409
    );
  });

  test('faturar: expectedVersion stale -> 409', async () => {
    const { contractId } = await setupConfirmedContract({ lotNumber: '22009' });
    await assert.rejects(
      () =>
        saleContractService.invoiceSaleContract(
          contractId,
          { expectedVersion: 99, date: '2026-07-15' },
          adminActor
        ),
      (err) => err.status === 409
    );
  });

  test('faturar: data invalida -> 422', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '22010' });
    await assert.rejects(
      () =>
        saleContractService.invoiceSaleContract(
          contractId,
          { expectedVersion: version, date: 'xx' },
          adminActor
        ),
      (err) => err.status === 422
    );
  });

  test('faturar exige ADMIN (COMMERCIAL 403)', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '22011' });
    await assert.rejects(
      () =>
        saleContractService.invoiceSaleContract(
          contractId,
          { expectedVersion: version, date: '2026-07-15' },
          commercialActor
        ),
      (err) => err.status === 403
    );
  });

  test('quebra manual: CONFIRMADO -> WASH_OUT, cancela a venda e restaura as sacas', async () => {
    const { contractId, sampleId, version } = await setupConfirmedContract({ lotNumber: '23001' });
    const before = await prisma.sample.findUnique({
      where: { id: sampleId },
      select: { soldSacks: true },
    });
    assert.equal(before.soldSacks, 10);

    const r = await saleContractService.washoutSaleContract(
      contractId,
      { expectedVersion: version, reason: 'Comprador desistiu' },
      adminActor
    );
    assert.equal(r.contract.status, 'WASH_OUT');
    assert.equal(r.contract.washoutReason, 'Comprador desistiu');
    assert.ok(r.contract.washoutAt);

    const movement = await prisma.sampleMovement.findFirst({ where: { sampleId } });
    assert.equal(movement.status, 'CANCELLED');
    const after = await prisma.sample.findUnique({
      where: { id: sampleId },
      select: { soldSacks: true },
    });
    assert.equal(after.soldSacks, 0);
  });

  test('quebra manual: a partir de FATURADO -> WASH_OUT', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '23002' });
    const inv = await saleContractService.invoiceSaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-15' },
      adminActor
    );
    const r = await saleContractService.washoutSaleContract(
      contractId,
      { expectedVersion: inv.contract.version, reason: 'Quebra apos faturar' },
      adminActor
    );
    assert.equal(r.contract.status, 'WASH_OUT');
  });

  test('quebra manual: a partir de PAGO -> WASH_OUT', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '23003' });
    const pay = await saleContractService.paySaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-25' },
      adminActor
    );
    const r = await saleContractService.washoutSaleContract(
      contractId,
      { expectedVersion: pay.contract.version, reason: 'Quebra apos pagar' },
      adminActor
    );
    assert.equal(r.contract.status, 'WASH_OUT');
  });

  test('quebra manual: a partir de CONFERIR -> WASH_OUT', async () => {
    const { contractId, bankAccountId } = await setupEmittableContract({ lotNumber: '23004' });
    const lookups = await fetchLookups();
    const emitted = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({ bankAccountId, lookups }),
      adminActor
    );
    const r = await saleContractService.washoutSaleContract(
      contractId,
      { expectedVersion: emitted.contract.version, reason: 'Quebra em conferencia' },
      adminActor
    );
    assert.equal(r.contract.status, 'WASH_OUT');
  });

  test('quebra manual: EM_ABERTO -> 409 (usar cancelar a venda)', async () => {
    const { contractId } = await setupEmittableContract({ lotNumber: '23005' });
    await assert.rejects(
      () =>
        saleContractService.washoutSaleContract(
          contractId,
          { expectedVersion: 0, reason: 'qualquer' },
          adminActor
        ),
      (err) => err.status === 409
    );
  });

  test('quebra manual: contrato ja WASH_OUT -> 409', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '23006' });
    const r = await saleContractService.washoutSaleContract(
      contractId,
      { expectedVersion: version, reason: 'Primeira quebra' },
      adminActor
    );
    await assert.rejects(
      () =>
        saleContractService.washoutSaleContract(
          contractId,
          { expectedVersion: r.contract.version, reason: 'De novo' },
          adminActor
        ),
      (err) => err.status === 409
    );
  });

  test('quebra manual: motivo vazio -> 422', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '23007' });
    await assert.rejects(
      () =>
        saleContractService.washoutSaleContract(
          contractId,
          { expectedVersion: version, reason: '   ' },
          adminActor
        ),
      (err) => err.status === 422
    );
  });

  test('quebra manual: expectedVersion stale -> 409', async () => {
    const { contractId } = await setupConfirmedContract({ lotNumber: '23008' });
    await assert.rejects(
      () =>
        saleContractService.washoutSaleContract(
          contractId,
          { expectedVersion: 99, reason: 'qualquer' },
          adminActor
        ),
      (err) => err.status === 409
    );
  });

  test('quebra manual exige ADMIN (COMMERCIAL 403)', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '23009' });
    await assert.rejects(
      () =>
        saleContractService.washoutSaleContract(
          contractId,
          { expectedVersion: version, reason: 'qualquer' },
          commercialActor
        ),
      (err) => err.status === 403
    );
  });

  test('lote: cancelar a venda de contrato PAGO -> WASH_OUT (extensao)', async () => {
    const { contractId, sampleId, version } = await setupConfirmedContract({ lotNumber: '23010' });
    await saleContractService.paySaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-25' },
      adminActor
    );
    const movement = await prisma.sampleMovement.findFirst({ where: { sampleId } });
    const sample = await queryService.requireSample(sampleId);
    await commandService.cancelSampleMovement(
      {
        sampleId,
        movementId: movement.id,
        reasonText: 'Cancelada pelo lote',
        expectedVersion: sample.version,
      },
      commercialActor
    );
    const contract = await prisma.saleContract.findUnique({ where: { id: contractId } });
    assert.equal(contract.status, 'WASH_OUT');
    assert.equal(contract.washoutReason, 'Cancelada pelo lote');
  });

  // ---- Contrato FUTURO (sem lote) ----

  function createFutureInput(buyerId, overrides = {}) {
    return {
      buyerClientId: buyerId,
      quantitySacks: 50,
      unitPrice: 100,
      sellerBrokeragePct: 2,
      buyerBrokeragePct: 1,
      contractDate: '2026-09-01',
      brokerIds: [TEST_BROKER_ID],
      ...overrides,
    };
  }

  test('futuro: cria FUTURO EM_ABERTO sem lote (sampleId/movementId nulos)', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);

    const res = await saleContractService.createFutureSaleContract(
      createFutureInput(buyerId),
      adminActor
    );
    const c = res.contract;
    assert.equal(c.type, 'FUTURO');
    assert.equal(c.status, 'EM_ABERTO');
    assert.equal(c.sampleId, null);
    assert.equal(c.movementId, null);
    assert.equal(c.quantitySacks, 50);
    assert.equal(Number(c.totalValue), 5000); // 50 x 100
    assert.equal(Number(c.sellerBrokerageValue), 100); // 5000 x 2%
    assert.equal(Number(c.buyerBrokerageValue), 50); // 5000 x 1%
    assert.equal(c.brokers.length, 1);
    assert.equal(c.brokers[0].brokerId, TEST_BROKER_ID);

    // nenhuma venda/movimento criado
    assert.equal((await prisma.sampleMovement.findMany()).length, 0);
  });

  test('futuro: numero continua a sequencia global (a vista + futuro)', async () => {
    await setupEmittableContract({ lotNumber: '24001' }); // 0001/AA (a vista)
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const res = await saleContractService.createFutureSaleContract(
      createFutureInput(buyerId),
      adminActor
    );
    assert.equal(res.contract.contractNumber, `0002/${currentYear2}`);
  });

  test('futuro: emitir -> CONFERIR (vendedor/banco vem no emit)', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const sellerId = randomUUID();
    await createSellerClient(sellerId);
    const bankAccountId = await createSellerBankAccount(sellerId);
    const lookups = await fetchLookups();

    const created = await saleContractService.createFutureSaleContract(
      createFutureInput(buyerId),
      adminActor
    );
    const emitted = await saleContractService.emitSaleContract(
      created.contract.id,
      etapa2Payload({ bankAccountId, lookups, overrides: { sellerClientId: sellerId } }),
      adminActor
    );
    assert.equal(emitted.contract.status, 'CONFERIR');
    assert.equal(emitted.contract.type, 'FUTURO');
    assert.equal(emitted.contract.sellerClientId, sellerId);
    assert.ok(emitted.contract.sellerBankSnapshot);
  });

  test('futuro: washout marca WASH_OUT sem tocar em lote', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const sellerId = randomUUID();
    await createSellerClient(sellerId);
    const bankAccountId = await createSellerBankAccount(sellerId);
    const lookups = await fetchLookups();

    const created = await saleContractService.createFutureSaleContract(
      createFutureInput(buyerId),
      adminActor
    );
    const emitted = await saleContractService.emitSaleContract(
      created.contract.id,
      etapa2Payload({ bankAccountId, lookups, overrides: { sellerClientId: sellerId } }),
      adminActor
    );
    const washed = await saleContractService.washoutSaleContract(
      created.contract.id,
      { expectedVersion: emitted.contract.version, reason: 'Negocio caiu' },
      adminActor
    );
    assert.equal(washed.contract.status, 'WASH_OUT');
    assert.equal(washed.contract.washoutReason, 'Negocio caiu');
    assert.ok(washed.contract.washoutAt);
    assert.equal((await prisma.sampleMovement.findMany()).length, 0);
  });

  test('futuro: cancelar EM_ABERTO apaga o contrato (e os corretores)', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const created = await saleContractService.createFutureSaleContract(
      createFutureInput(buyerId),
      adminActor
    );

    const res = await saleContractService.cancelSaleContract(
      created.contract.id,
      { expectedVersion: 0 },
      adminActor
    );
    assert.equal(res.deleted, true);
    assert.equal(
      await prisma.saleContract.findUnique({ where: { id: created.contract.id } }),
      null
    );
    assert.equal(
      (await prisma.saleContractBroker.findMany({ where: { saleContractId: created.contract.id } }))
        .length,
      0
    );
  });

  test('futuro: criar exige ADMIN (COMMERCIAL 403)', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    await assert.rejects(
      () =>
        saleContractService.createFutureSaleContract(createFutureInput(buyerId), commercialActor),
      (err) => err.status === 403
    );
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
