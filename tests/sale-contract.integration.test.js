import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

import { EventContractDbService } from '../src/events/event-contract-db-service.js';
import { PrismaEventStore } from '../src/events/prisma-event-store.js';
import { SampleQueryService } from '../src/samples/sample-query-service.js';
import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { SaleContractService } from '../src/sale-contracts/sale-contract-service.js';
import { SaleContractShipmentService } from '../src/sale-contracts/sale-contract-shipment-service.js';
import { SaleContractPdfService } from '../src/sale-contracts/sale-contract-pdf-service.js';
import { LocalUploadService } from '../src/uploads/local-upload-service.js';
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
  // Embarque (EMB27): serviço de confirmação com upload local num dir temporário.
  const shipmentUploadsDir = path.join(os.tmpdir(), `sale-contract-shipment-it-${randomUUID()}`);
  const shipmentService = new SaleContractShipmentService({
    prisma,
    uploadService: new LocalUploadService({ baseDir: shipmentUploadsDir }),
  });
  // PNG mínimo (assinatura + início do IHDR) — magic bytes que o file-type aceita.
  const TINY_PNG = Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001', 'hex');

  const commercialActor = {
    actorType: 'USER',
    actorUserId: randomUUID(),
    role: 'COMMERCIAL',
    source: 'api',
    requestId: randomUUID(),
  };
  const adminActor = { ...commercialActor, role: 'ADMIN', actorUserId: randomUUID() };

  async function resetDatabase() {
    // sale_contract nao tem FK para sample (refs sao colunas escalares) — o
    // CASCADE de `sample` NAO limpa os contratos, entao truncamos as tabelas do
    // contrato explicitamente pra cada teste comecar sem contratos residuais.
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE sale_contract_status_log, sale_contract_espelho_log, approval_label_log, custom_print_job, sale_contract_agio_log, sale_contract_export, sale_contract_broker, sale_contract, client_audit_event, sample_movement, sample_blend_component, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
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

  // Banco = texto livre na conta (D141); a entidade Bank nao existe mais.
  async function createSellerBankAccount(sellerId) {
    const accountId = randomUUID();
    await prisma.clientBankAccount.create({
      data: {
        id: accountId,
        clientId: sellerId,
        bankName: 'BANCO TESTE',
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

  // Fase J (D123): o washout via cancel grava SaleContractStatusLog com o
  // ator do cancel (FK -> app_user), entao o usuario COMMERCIAL das vendas
  // tambem precisa existir (mesmo molde do seedAdminUser).
  async function seedCommercialUser() {
    const suffix = commercialActor.actorUserId.slice(0, 8);
    await prisma.user.upsert({
      where: { id: commercialActor.actorUserId },
      update: {},
      create: {
        id: commercialActor.actorUserId,
        fullName: `Comercial ${suffix}`,
        username: `comercial-${suffix}`,
        usernameCanonical: `comercial-${suffix}`,
        email: `comercial-${suffix}@example.com`,
        emailCanonical: `comercial-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'COMMERCIAL',
      },
    });
  }

  async function fetchLookups() {
    // Determinismo: `findFirst` sem `orderBy` devolve linha arbitraria (a ordem
    // fisica varia entre ambientes — local x CI). Para a modalidade isso e
    // critico: se cair numa que exige embarque (Retirar/Posto, requiresShipment),
    // TODO teste que paga bate no portao EMB28 ("Shipment must be confirmed
    // before payment"). Estes lookups sao o caso GERAL (sem embarque) — os testes
    // de embarque escolhem a modalidade por nome a parte. Fixa requiresShipment:false
    // + orderBy pra reprodutibilidade.
    const [paymentForm, modality, packaging] = await Promise.all([
      prisma.contractPaymentForm.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { name: 'asc' },
      }),
      prisma.contractModality.findFirst({
        where: { status: 'ACTIVE', requiresShipment: false },
        orderBy: { name: 'asc' },
      }),
      prisma.contractPackaging.findFirst({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
    ]);
    return { paymentForm, modality, packaging };
  }

  // Cria amostra (com dono=vendedor) + registra a venda; devolve refs do contrato.
  async function setupEmittableContract({ lotNumber, saleOverrides = {} }) {
    const sellerId = randomUUID();
    await createSellerClient(sellerId);
    const bankAccountId = await createSellerBankAccount(sellerId);
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const sampleId = randomUUID();
    await createClassifiedSample({ id: sampleId, lotNumber, declaredSacks: 10 });
    await prisma.sample.update({ where: { id: sampleId }, data: { ownerClientId: sellerId } });
    const sample = await queryService.requireSample(sampleId);
    const sale = await sell(sampleId, sample.version, buyerId, saleOverrides);
    return {
      contractId: sale.contract.id,
      version: sale.contract.version,
      sampleId,
      sellerId,
      buyerId,
      bankAccountId,
    };
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
      requiresApproval: false,
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

  // O contrato ja nasce EMITIDO (D97) — nao ha mais passo "confirmar"/"emitir"
  // separado. setupEmittableContract ja devolve refs + version do EMITIDO.
  async function setupConfirmedContract(args) {
    return setupEmittableContract(args);
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

  // Registra a venda a vista GERANDO o contrato EMITIDO num passo so (D97,
  // createSpotSaleContract). Garante dono=vendedor (cria se faltar) + conta
  // bancaria + listas ativas. Devolve { contract } (getSaleContract).
  async function sell(sampleId, _version, buyerId, overrides = {}) {
    let sample = await queryService.requireSample(sampleId);
    let sellerId = sample.ownerClientId;
    if (!sellerId) {
      sellerId = randomUUID();
      await createSellerClient(sellerId);
      await prisma.sample.update({ where: { id: sampleId }, data: { ownerClientId: sellerId } });
    }
    let bank = await prisma.clientBankAccount.findFirst({ where: { clientId: sellerId } });
    if (!bank) {
      bank = { id: await createSellerBankAccount(sellerId) };
    }
    const lookups = await fetchLookups();
    sample = await queryService.requireSample(sampleId);
    return saleContractService.createSpotSaleContract(
      {
        type: 'MERCADO_A_VISTA',
        sampleId,
        expectedVersion: sample.version,
        buyerClientId: buyerId,
        quantitySacks: 10,
        unitPrice: 100,
        sellerBrokeragePct: 2,
        buyerBrokeragePct: 1,
        contractDate: '2026-06-26',
        brokerIds: [TEST_BROKER_ID],
        sellerClientId: sellerId,
        sellerBankAccountId: bank.id,
        paymentFormId: lookups.paymentForm.id,
        modalityId: lookups.modality.id,
        packagingId: lookups.packaging.id,
        invoiceDate: '2026-07-10',
        paymentDate: '2026-07-20',
        requiresApproval: false,
        ...overrides,
      },
      adminActor
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
    await seedCommercialUser();
  });

  test('venda a vista cria 1 contrato EMITIDO com numero, total, corretagens e corretor', async () => {
    const sampleId = randomUUID();
    const buyerId = randomUUID();
    await createClassifiedSample({ id: sampleId, lotNumber: '20001', declaredSacks: 10 });
    await createBuyerClient(buyerId);
    const sample = await queryService.requireSample(sampleId);

    const result = await sell(sampleId, sample.version, buyerId);

    assert.equal(result.contract.contractNumber, `0001/${currentYear2}`);

    const contracts = await prisma.saleContract.findMany();
    assert.equal(contracts.length, 1);
    const contract = contracts[0];
    assert.equal(contract.status, 'EMITIDO');
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

  // Embarque F1 (EMB21/EMB22): o contrato herda "embarca?" da MODALIDADE por
  // snapshot no emit — Retirar/Posto=sim, Disponivel=nao — e shippedAt nasce nulo.
  test('emit congela requiresShipment da modalidade e shippedAt nasce nulo', async () => {
    const modalities = await prisma.contractModality.findMany({
      where: { name: { in: ['Retirar', 'Disponível'] } },
    });
    const retirar = modalities.find((m) => m.name === 'Retirar');
    const disponivel = modalities.find((m) => m.name === 'Disponível');
    assert.ok(retirar && disponivel, 'modalidades Retirar/Disponível semeadas');
    // A flag mora na modalidade (semeada pela migration).
    assert.equal(retirar.requiresShipment, true);
    assert.equal(disponivel.requiresShipment, false);

    const buyerId = randomUUID();
    await createBuyerClient(buyerId);

    const s1 = randomUUID();
    await createClassifiedSample({ id: s1, lotNumber: '25100', declaredSacks: 10 });
    const sample1 = await queryService.requireSample(s1);
    const withShipment = await sell(s1, sample1.version, buyerId, { modalityId: retirar.id });
    assert.equal(withShipment.contract.requiresShipment, true);
    assert.equal(withShipment.contract.shippedAt, null);

    const s2 = randomUUID();
    await createClassifiedSample({ id: s2, lotNumber: '25101', declaredSacks: 10 });
    const sample2 = await queryService.requireSample(s2);
    const noShipment = await sell(s2, sample2.version, buyerId, { modalityId: disponivel.id });
    assert.equal(noShipment.contract.requiresShipment, false);
  });

  // EMB32: requiresShipment é snapshot congelado na emissão — o Editar só re-deriva se
  // a MODALIDADE do contrato mudar ali; um flip posterior da flag "embarca?" da
  // modalidade NÃO vaza pra contratos antigos (gêmeo do furo AP20/AP32).
  test('EMB32: Editar preserva requiresShipment se a modalidade não muda; segue se muda', async () => {
    // Modalidade DEDICADA (upsert idempotente por nome, self-healing) — NAO mexer nas
    // semeadas: contract_modality NAO e truncada no beforeEach, entao um flip nelas
    // vazaria pros outros testes de embarque (que usam a 'Retirar' semeada).
    const shipMod = await prisma.contractModality.upsert({
      where: { name: 'EMB32 Embarca' },
      create: {
        id: randomUUID(),
        name: 'EMB32 Embarca',
        requiresShipment: true,
        status: 'ACTIVE',
        sortOrder: 900,
      },
      update: { requiresShipment: true },
    });
    const semEmbarque = await prisma.contractModality.findFirst({
      where: { requiresShipment: false },
      orderBy: { name: 'asc' },
    });
    const { contractId, bankAccountId } = await setupEmittableContract({
      lotNumber: '21500',
      saleOverrides: { modalityId: shipMod.id },
    });
    const row = await prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { requiresShipment: true, version: true },
    });
    assert.equal(row.requiresShipment, true);

    // Alguém baixa a flag "embarca?" da modalidade DEPOIS da emissão.
    await prisma.contractModality.update({
      where: { id: shipMod.id },
      data: { requiresShipment: false },
    });

    const lookups = await fetchLookups();
    // Editar um campo qualquer, MESMA modalidade → preserva (não re-snapshota o flip).
    const edited1 = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({
        bankAccountId,
        lookups,
        expectedVersion: row.version,
        overrides: { modalityId: shipMod.id, observations: 'MUDOU OBS' },
      }),
      adminActor
    );
    assert.equal(edited1.contract.requiresShipment, true);

    // Editar TROCANDO a modalidade → acompanha a nova (sem embarque).
    const edited2 = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({
        bankAccountId,
        lookups,
        expectedVersion: edited1.contract.version,
        overrides: { modalityId: semEmbarque.id },
      }),
      adminActor
    );
    assert.equal(edited2.contract.requiresShipment, false);
  });

  // ============================================================
  // Embarque F2 (EMB27): confirmação (shippedAt + fotos 0..10) + guards
  // ============================================================
  async function setupShipmentContract({ lotNumber, modalityName = 'Retirar' }) {
    const modality = await prisma.contractModality.findFirst({ where: { name: modalityName } });
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const sampleId = randomUUID();
    await createClassifiedSample({ id: sampleId, lotNumber, declaredSacks: 10 });
    const sample = await queryService.requireSample(sampleId);
    const sale = await sell(sampleId, sample.version, buyerId, { modalityId: modality.id });
    return sale.contract; // getSaleContract view (requiresShipment, shippedAt, status EMITIDO)
  }

  test('confirmShipment grava shippedAt (0 fotos) e vira embarcado', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25200' });
    assert.equal(contract.requiresShipment, true);
    const res = await shipmentService.confirmShipment(
      contract.id,
      { shippedAt: '2026-07-08', transporte: 'THIRD_PARTY', files: [] },
      adminActor
    );
    // shippedAt volta como ISO (@db.Date → meia-noite UTC), igual invoiceDate/paidAt.
    assert.equal(res.context.shippedAt?.slice(0, 10), '2026-07-08');
    const row = await prisma.saleContract.findUnique({
      where: { id: contract.id },
      select: { shippedAt: true },
    });
    assert.ok(row.shippedAt);
    const photos = await shipmentService.listShipmentPhotos(contract.id, adminActor);
    assert.equal(photos.items.length, 0);
  });

  test('confirmShipment NÃO bumpa a version do contrato (EMB22)', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25214' });
    const before = await prisma.saleContract.findUnique({
      where: { id: contract.id },
      select: { version: true },
    });
    await shipmentService.confirmShipment(
      contract.id,
      { shippedAt: '2026-07-08', transporte: 'THIRD_PARTY', files: [] },
      adminActor
    );
    const after = await prisma.saleContract.findUnique({
      where: { id: contract.id },
      select: { version: true },
    });
    assert.equal(after.version, before.version);
  });

  test('confirmShipment rejeita data futura (máx hoje BRT)', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25201' });
    await assert.rejects(
      () =>
        shipmentService.confirmShipment(
          contract.id,
          { shippedAt: '2999-01-01', transporte: 'THIRD_PARTY', files: [] },
          adminActor
        ),
      (err) => err.status === 422 && err.details?.code === 'VALIDATION_ERROR'
    );
  });

  test('confirmShipment 422 se o contrato não exige embarque (Disponível)', async () => {
    const contract = await setupShipmentContract({
      lotNumber: '25202',
      modalityName: 'Disponível',
    });
    assert.equal(contract.requiresShipment, false);
    await assert.rejects(
      () =>
        shipmentService.confirmShipment(
          contract.id,
          { shippedAt: '2026-07-08', transporte: 'THIRD_PARTY', files: [] },
          adminActor
        ),
      (err) => err.status === 422 && err.details?.code === 'CONTRACT_SHIPMENT_NOT_REQUIRED'
    );
  });

  test('confirmShipment 409 se já embarcado (terminal, sem undo)', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25203' });
    await shipmentService.confirmShipment(
      contract.id,
      { shippedAt: '2026-07-08', transporte: 'THIRD_PARTY', files: [] },
      adminActor
    );
    await assert.rejects(
      () =>
        shipmentService.confirmShipment(
          contract.id,
          { shippedAt: '2026-07-08', transporte: 'THIRD_PARTY', files: [] },
          adminActor
        ),
      (err) => err.status === 409 && err.details?.code === 'CONTRACT_ALREADY_SHIPPED'
    );
  });

  test('confirmShipment 409 se o contrato não está EMITIDO/FATURADO', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25204' });
    await prisma.saleContract.update({ where: { id: contract.id }, data: { status: 'WASH_OUT' } });
    await assert.rejects(
      () =>
        shipmentService.confirmShipment(
          contract.id,
          { shippedAt: '2026-07-08', transporte: 'THIRD_PARTY', files: [] },
          adminActor
        ),
      (err) => err.status === 409 && err.details?.code === 'CONTRACT_NOT_SHIPPABLE'
    );
  });

  test('confirmShipment 422 se mais de 10 fotos', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25205' });
    const files = Array.from({ length: 11 }, () => ({
      fileBuffer: TINY_PNG,
      originalFileName: 'p.png',
    }));
    await assert.rejects(
      () =>
        shipmentService.confirmShipment(
          contract.id,
          { shippedAt: '2026-07-08', transporte: 'THIRD_PARTY', files },
          adminActor
        ),
      (err) => err.status === 422 && err.details?.code === 'SHIPMENT_TOO_MANY_PHOTOS'
    );
  });

  test('confirmShipment grava fotos; listShipmentPhotos devolve sem storagePath', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25206' });
    await shipmentService.confirmShipment(
      contract.id,
      {
        shippedAt: '2026-07-08',
        transporte: 'THIRD_PARTY',
        files: [{ fileBuffer: TINY_PNG, originalFileName: 'carga.png' }],
      },
      adminActor
    );
    const photos = await shipmentService.listShipmentPhotos(contract.id, adminActor);
    assert.equal(photos.items.length, 1);
    assert.equal(photos.items[0].mimeType, 'image/png');
    // A view não vaza o caminho interno do arquivo.
    assert.equal(photos.items[0].storagePath, undefined);
  });

  test('confirmShipment 415 se a foto não é imagem aceita (magic bytes)', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25215' });
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n', 'utf8');
    await assert.rejects(
      () =>
        shipmentService.confirmShipment(
          contract.id,
          {
            shippedAt: '2026-07-08',
            transporte: 'THIRD_PARTY',
            files: [{ fileBuffer: pdf, originalFileName: 'nf.pdf' }],
          },
          adminActor
        ),
      (err) => err.status === 415
    );
  });

  test('confirmShipment 413 se a foto passa de 12 MiB', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25216' });
    const big = Buffer.concat([TINY_PNG, Buffer.alloc(12 * 1024 * 1024)]);
    await assert.rejects(
      () =>
        shipmentService.confirmShipment(
          contract.id,
          {
            shippedAt: '2026-07-08',
            transporte: 'THIRD_PARTY',
            files: [{ fileBuffer: big, originalFileName: 'grande.png' }],
          },
          adminActor
        ),
      (err) => err.status === 413
    );
  });

  test('confirmShipment aceita exatamente 10 fotos (fronteira do teto)', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25217' });
    const files = Array.from({ length: 10 }, (_, i) => ({
      fileBuffer: TINY_PNG,
      originalFileName: `p${i}.png`,
    }));
    await shipmentService.confirmShipment(
      contract.id,
      { shippedAt: '2026-07-08', transporte: 'THIRD_PARTY', files },
      adminActor
    );
    const photos = await shipmentService.listShipmentPhotos(contract.id, adminActor);
    assert.equal(photos.items.length, 10);
  });

  // ============================================================
  // Embarque FASE 2 (EMB30): transporte + responsavel
  // ============================================================
  test('EMB30: COMPANY grava carrier + responsavel (snapshot do nome)', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25230' });
    await shipmentService.confirmShipment(
      contract.id,
      {
        shippedAt: '2026-07-08',
        transporte: 'COMPANY',
        responsibleUserId: adminActor.actorUserId,
        files: [],
      },
      adminActor
    );
    const row = await prisma.saleContract.findUnique({
      where: { id: contract.id },
      select: {
        shipmentCarrier: true,
        shipmentResponsibleUserId: true,
        shipmentResponsibleName: true,
      },
    });
    assert.equal(row.shipmentCarrier, 'COMPANY');
    assert.equal(row.shipmentResponsibleUserId, adminActor.actorUserId);
    assert.ok(row.shipmentResponsibleName?.startsWith('Admin'));
  });

  test('EMB30: THIRD_PARTY grava carrier sem responsavel', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25231' });
    await shipmentService.confirmShipment(
      contract.id,
      { shippedAt: '2026-07-08', transporte: 'THIRD_PARTY', files: [] },
      adminActor
    );
    const row = await prisma.saleContract.findUnique({
      where: { id: contract.id },
      select: {
        shipmentCarrier: true,
        shipmentResponsibleUserId: true,
        shipmentResponsibleName: true,
      },
    });
    assert.equal(row.shipmentCarrier, 'THIRD_PARTY');
    assert.equal(row.shipmentResponsibleUserId, null);
    assert.equal(row.shipmentResponsibleName, null);
  });

  test('EMB30: 422 se transporte ausente', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25232' });
    await assert.rejects(
      () =>
        shipmentService.confirmShipment(
          contract.id,
          { shippedAt: '2026-07-08', files: [] },
          adminActor
        ),
      (err) =>
        err.status === 422 &&
        err.details?.code === 'VALIDATION_ERROR' &&
        err.details?.field === 'transporte'
    );
  });

  test('EMB30: 422 COMPANY sem responsavel (SHIPMENT_RESPONSIBLE_INVALID)', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25233' });
    await assert.rejects(
      () =>
        shipmentService.confirmShipment(
          contract.id,
          { shippedAt: '2026-07-08', transporte: 'COMPANY', files: [] },
          adminActor
        ),
      (err) => err.status === 422 && err.details?.code === 'SHIPMENT_RESPONSIBLE_INVALID'
    );
  });

  test('EMB30: 422 COMPANY com responsavel PROSPECTOR (blindagem)', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25234' });
    const prospectorId = randomUUID();
    const suffix = prospectorId.slice(0, 8);
    await prisma.user.create({
      data: {
        id: prospectorId,
        fullName: 'Prospector Teste',
        username: `prosp-${suffix}`,
        usernameCanonical: `prosp-${suffix}`,
        email: `prosp-${suffix}@example.com`,
        emailCanonical: `prosp-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'PROSPECTOR',
      },
    });
    await assert.rejects(
      () =>
        shipmentService.confirmShipment(
          contract.id,
          {
            shippedAt: '2026-07-08',
            transporte: 'COMPANY',
            responsibleUserId: prospectorId,
            files: [],
          },
          adminActor
        ),
      (err) => err.status === 422 && err.details?.code === 'SHIPMENT_RESPONSIBLE_INVALID'
    );
  });

  // ============================================================
  // Embarque FASE 2 (EMB31): retencao de 15 dias das fotos
  // ============================================================
  test('EMB31: foto >15d some da lista, descriptor 404 e a purga apaga a linha', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25235' });
    await shipmentService.confirmShipment(
      contract.id,
      {
        shippedAt: '2026-07-08',
        transporte: 'THIRD_PARTY',
        files: [{ fileBuffer: TINY_PNG, originalFileName: 'velha.png' }],
      },
      adminActor
    );
    const before = await shipmentService.listShipmentPhotos(contract.id, adminActor);
    assert.equal(before.items.length, 1);
    const photoId = before.items[0].id;
    // Envelhece a foto pra 20 dias atras (via update direto — o createdAt e @default now).
    await prisma.saleContractShipmentPhoto.update({
      where: { id: photoId },
      data: { createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) },
    });
    // Some da lista (filtro) e da URL direta (404).
    const after = await shipmentService.listShipmentPhotos(contract.id, adminActor);
    assert.equal(after.items.length, 0);
    await assert.rejects(
      () => shipmentService.getShipmentPhotoDescriptor(contract.id, photoId, adminActor),
      (err) => err.status === 404
    );
    // A purga (force, bypassa o throttle) remove a linha do banco.
    await shipmentService.purgeExpiredShipmentPhotos({ force: true });
    const row = await prisma.saleContractShipmentPhoto.findUnique({ where: { id: photoId } });
    assert.equal(row, null);
  });

  // ============================================================
  // Embarque F3 (EMB23-EMB25): worklist — estados, ordem, contador, filtros, busca
  // ============================================================
  test('listShipmentContracts: estados/ordem/contador/filtros', async () => {
    const atrasado = await setupShipmentContract({ lotNumber: '25300' });
    await prisma.saleContract.update({
      where: { id: atrasado.id },
      data: { invoiceDate: new Date('2000-01-01T00:00:00Z') },
    });
    const aEmbarcar = await setupShipmentContract({ lotNumber: '25301' });
    await prisma.saleContract.update({
      where: { id: aEmbarcar.id },
      data: { invoiceDate: new Date('2100-01-01T00:00:00Z') },
    });
    const embarcado = await setupShipmentContract({ lotNumber: '25302' });
    await shipmentService.confirmShipment(
      embarcado.id,
      { shippedAt: '2026-07-08', transporte: 'THIRD_PARTY', files: [] },
      adminActor
    );
    const cancelado = await setupShipmentContract({ lotNumber: '25303' });
    await prisma.saleContract.update({
      where: { id: cancelado.id },
      data: { status: 'WASH_OUT' },
    });

    const all = await saleContractService.listShipmentContracts({}, adminActor);
    const byId = new Map(all.items.map((it) => [it.id, it]));
    assert.equal(byId.get(atrasado.id)?.state, 'atrasado');
    assert.equal(byId.get(aEmbarcar.id)?.state, 'a_embarcar');
    assert.equal(byId.get(embarcado.id)?.state, 'embarcado');
    assert.equal(byId.get(cancelado.id)?.state, 'cancelado');
    // Contador estável (EMB24): 1 atrasado.
    assert.equal(all.overdueCount, 1);
    // Ordem: G0 por invoiceDate ASC (atrasado 2000 antes de a_embarcar 2100), depois
    // embarcado (G1), depois cancelado (G2).
    const order = all.items.map((it) => it.id);
    assert.ok(order.indexOf(atrasado.id) < order.indexOf(aEmbarcar.id));
    assert.ok(order.indexOf(aEmbarcar.id) < order.indexOf(embarcado.id));
    assert.ok(order.indexOf(embarcado.id) < order.indexOf(cancelado.id));

    const fAtrasado = await saleContractService.listShipmentContracts(
      { filter: 'atrasado' },
      adminActor
    );
    assert.deepEqual(
      fAtrasado.items.map((i) => i.id),
      [atrasado.id]
    );
    const fEmbarcado = await saleContractService.listShipmentContracts(
      { filter: 'embarcado' },
      adminActor
    );
    assert.deepEqual(
      fEmbarcado.items.map((i) => i.id),
      [embarcado.id]
    );
    // Só dado não-sensível (EMB25): a linha não carrega preço/corretagem.
    assert.equal(fAtrasado.items[0].totalValue, undefined);
    assert.ok('sellerWarehouse' in fAtrasado.items[0]);
  });

  test('listShipmentContracts: busca por nº + paginação keyset cruzando grupos', async () => {
    const c1 = await setupShipmentContract({ lotNumber: '25310' });
    await prisma.saleContract.update({
      where: { id: c1.id },
      data: { invoiceDate: new Date('2001-01-01T00:00:00Z') },
    });
    const c2 = await setupShipmentContract({ lotNumber: '25311' });
    await shipmentService.confirmShipment(
      c2.id,
      { shippedAt: '2026-07-08', transporte: 'THIRD_PARTY', files: [] },
      adminActor
    );

    const found = await saleContractService.listShipmentContracts(
      { search: c1.contractNumber },
      adminActor
    );
    assert.deepEqual(
      found.items.map((i) => i.id),
      [c1.id]
    );

    // limit=1: 1ª página = c1 (G0 não-embarcado), cursor → 2ª página = c2 (G1 embarcado).
    const p1 = await saleContractService.listShipmentContracts({ limit: 1 }, adminActor);
    assert.equal(p1.items.length, 1);
    assert.equal(p1.items[0].id, c1.id);
    assert.ok(p1.nextCursor);
    const p2 = await saleContractService.listShipmentContracts(
      { limit: 1, cursor: p1.nextCursor },
      adminActor
    );
    assert.equal(p2.items[0].id, c2.id);
  });

  // Embarque F4 (EMB10/EMB17/EMB24): evento do dashboard — agendado/atrasado/realizado.
  test('getDashboardShipmentEvents: typeKeys agendado/atrasado/realizado', async () => {
    // Datas ANCORADAS em hoje (BRT) pra o teste não envelhecer (fixar julho/26 fazia
    // o "agendado" virar "atrasado" quando hoje passava da data). O feed usa a
    // invoiceDate como dia do embarque (Modelo X); "agendado" precisa estar no FUTURO.
    // Uso dias úteis (o feed rola fim de semana p/ trás, DSB-D7) e janela ampla.
    const toKey = (d) => d.toISOString().slice(0, 10);
    const bizDay = (offset) => {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() + offset);
      while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
      return d;
    };
    // Offsets com gap >= 4: o roll-back de fim de semana desloca ate 2 dias,
    // entao -10 e -8 COLIDIAM no mesmo dia (sexta) quando "hoje" UTC caia na
    // segunda — o bucket do dia recebia [atrasado, realizado] e o [0] quebrava.
    const futureDate = bizDay(10); // agendado (futuro)
    const pastDate = bizDay(-10); // atrasado (passado; pos-roll em [-12,-10])
    const doneDate = bizDay(-6); // realizado (pos-roll em [-8,-6] — disjunto)

    const future = await setupShipmentContract({ lotNumber: '25400' });
    await prisma.saleContract.update({
      where: { id: future.id },
      data: { invoiceDate: futureDate },
    });
    const past = await setupShipmentContract({ lotNumber: '25401' });
    await prisma.saleContract.update({
      where: { id: past.id },
      data: { invoiceDate: pastDate },
    });
    const done = await setupShipmentContract({ lotNumber: '25402' });
    await prisma.saleContract.update({
      where: { id: done.id },
      data: { invoiceDate: doneDate },
    });
    await shipmentService.confirmShipment(
      done.id,
      { shippedAt: toKey(doneDate), transporte: 'THIRD_PARTY', files: [] },
      adminActor
    );

    const events = await saleContractService.getDashboardShipmentEvents(
      { from: toKey(bizDay(-20)), to: toKey(bizDay(20)) },
      adminActor
    );
    const fk = toKey(futureDate);
    const pk = toKey(pastDate);
    const dk = toKey(doneDate);
    // Previsto = azul; atrasado = vermelho; realizado = verde (cor por estado, DSB-D10).
    assert.equal(events[fk]?.[0]?.typeKey, 'contract_shipment');
    assert.equal(events[pk]?.[0]?.typeKey, 'contract_shipment_overdue');
    assert.equal(events[dk]?.[0]?.typeKey, 'contract_shipment_done');
    // Label recolhido + id namespaced (não colide com pagamento/aprovação do mesmo dia).
    assert.ok(events[fk][0].label.startsWith('embarque · '));
    assert.ok(events[fk][0].id.startsWith('shipment:'));
  });

  // Faturamento (DSB-D11): getDashboardInvoiceEvents — feed do card de Eventos, irmao
  // do embarque (auth-only). Agendado = EMITIDO no invoiceDate; realizado = FATURADO/
  // PAGO no invoicedAt (dia REAL do faturamento). WASH_OUT fora; janela filtra.
  test('getDashboardInvoiceEvents: EMITIDO no invoiceDate; FATURADO realizado no invoicedAt; janela + WASH_OUT', async () => {
    // (1) EMITIDO com invoiceDate em janela → aparece como agendado (contract_invoice*).
    const emitido = await setupConfirmedContract({ lotNumber: '25060' });
    await prisma.saleContract.update({
      where: { id: emitido.contractId },
      data: { invoiceDate: new Date('2026-07-15T00:00:00Z') },
    });

    // (2) WASH_OUT não deve aparecer no feed.
    const washed = await setupEmittableContract({ lotNumber: '25061' });
    await saleContractService.washoutSaleContract(
      washed.contractId,
      { expectedVersion: washed.version, reason: 'Caiu' },
      adminActor
    );

    // (3) FATURADO → realizado no invoicedAt (2026-07-08), NÃO no invoiceDate.
    const toInvoice = await setupConfirmedContract({ lotNumber: '25062' });
    await saleContractService.invoiceSaleContract(
      toInvoice.contractId,
      { expectedVersion: toInvoice.version, date: '2026-07-08' },
      adminActor
    );

    const res = await saleContractService.getDashboardInvoiceEvents(
      { from: '2026-07-01', to: '2026-07-31' },
      adminActor
    );

    // (1) agendado no invoiceDate 07-15 — typeKey/state do faturamento, label + id.
    const sched = (res['2026-07-15'] ?? []).find((e) => e.contractId === emitido.contractId);
    assert.ok(sched, 'EMITIDO deve aparecer no invoiceDate');
    assert.ok(sched.typeKey.startsWith('contract_invoice'));
    assert.equal(
      sched.state,
      sched.typeKey === 'contract_invoice_overdue' ? 'atrasado' : 'previsto'
    );
    assert.ok(sched.label.startsWith('faturamento · '));
    assert.ok(sched.id.startsWith('invoice:')); // namespaced (não colide com pagamento/embarque)

    // (2) WASH_OUT fora (em qualquer dia).
    assert.ok(
      !Object.values(res)
        .flat()
        .some((e) => e.contractId === washed.contractId),
      'WASH_OUT fora do feed'
    );

    // (3) realizado no invoicedAt 07-08 (não no invoiceDate original 07-10).
    const done = (res['2026-07-08'] ?? []).find((e) => e.contractId === toInvoice.contractId);
    assert.ok(done, 'FATURADO deve aparecer no invoicedAt');
    assert.equal(done.typeKey, 'contract_invoice_done');
    assert.equal(done.state, 'realizado');
    assert.ok(
      !(res['2026-07-10'] ?? []).some((e) => e.contractId === toInvoice.contractId),
      'FATURADO não aparece no invoiceDate como agendado'
    );

    // Janela em agosto → nenhum dos contratos aparece (filtro de data).
    const out = await saleContractService.getDashboardInvoiceEvents(
      { from: '2026-08-01', to: '2026-08-14' },
      adminActor
    );
    assert.ok(
      !Object.values(out)
        .flat()
        .some((e) => e.contractId === emitido.contractId),
      'fora da janela não aparece'
    );
  });

  // Embarque F5 (EMB28): portão do pagamento — não paga sem embarcar; após confirmar,
  // segue direto pro pagamento (a version não muda no confirm).
  test('paySaleContract: portão do embarque (422 → confirma → paga)', async () => {
    const contract = await setupShipmentContract({ lotNumber: '25500' });
    await saleContractService.invoiceSaleContract(
      contract.id,
      { expectedVersion: contract.version, date: '2026-07-06' },
      adminActor
    );
    const faturado = await saleContractService.getSaleContract(contract.id, adminActor);
    await assert.rejects(
      () =>
        saleContractService.paySaleContract(
          contract.id,
          { expectedVersion: faturado.contract.version, date: '2026-07-08' },
          adminActor
        ),
      (err) => err.status === 422 && err.details?.code === 'CONTRACT_SHIPMENT_REQUIRED'
    );
    // Confirma o embarque (não bumpa version) → pagar passa com a MESMA expectedVersion.
    await shipmentService.confirmShipment(
      contract.id,
      { shippedAt: '2026-07-08', transporte: 'THIRD_PARTY', files: [] },
      adminActor
    );
    const paid = await saleContractService.paySaleContract(
      contract.id,
      { expectedVersion: faturado.contract.version, date: '2026-07-08' },
      adminActor
    );
    assert.equal(paid.contract.status, 'PAGO');
  });

  // AP18 (F2 do portão): faturar exige a aprovação enviada. Contrato marcado sem
  // etiqueta trava no faturar (422); após enviar 1 etiqueta, libera (a version não
  // muda no envio, então o retry do modal segue com a mesma expectedVersion). Pagar
  // HERDA (E3) — não precisa de gate próprio.
  test('invoiceSaleContract: portão da aprovação (marcado sem etiqueta 422 → envia → fatura)', async () => {
    const { contractId, version } = await setupEmittableContract({ lotNumber: '25610' });
    // Marca "precisa de aprovação" (o setup nasce não-marcado). Não bumpa version.
    await prisma.saleContract.update({
      where: { id: contractId },
      data: { requiresApproval: true },
    });

    await assert.rejects(
      () =>
        saleContractService.invoiceSaleContract(
          contractId,
          { expectedVersion: version, date: '2026-07-06' },
          adminActor
        ),
      (err) => err.status === 422 && err.details?.code === 'CONTRACT_APPROVAL_REQUIRED'
    );

    // Grava 1 aprovação enviada (approval_label_log) → libera o faturamento.
    const job = await prisma.customPrintJob.create({
      data: { status: 'PENDING', payload: { lines: [] } },
      select: { id: true },
    });
    await prisma.approvalLabelLog.create({
      data: {
        id: randomUUID(),
        saleContractId: contractId,
        actorUserId: adminActor.actorUserId,
        customPrintJobId: job.id,
        payload: { lines: [] },
      },
    });

    const invoiced = await saleContractService.invoiceSaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-06' },
      adminActor
    );
    assert.equal(invoiced.contract.status, 'FATURADO');
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

    assert.equal(r1.contract.contractNumber, `0001/${currentYear2}`);
    assert.equal(r2.contract.contractNumber, `0002/${currentYear2}`);
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

  test('cancelar a venda (movimento) faz WASHOUT do contrato', async () => {
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

    // D97: cancelar a venda NAO apaga o contrato — ele vira WASH_OUT (registro
    // mantido, com motivo); os corretores tambem sao preservados.
    const contracts = await prisma.saleContract.findMany();
    assert.equal(contracts.length, 1);
    assert.equal(contracts[0].status, 'WASH_OUT');
    assert.equal(contracts[0].washoutReason, 'Venda cancelada no teste');
    assert.equal((await prisma.saleContractBroker.findMany()).length, 1);
  });

  test('gestao de contratos: COMMERCIAL vê tudo (escopo aberto); PROSPECTOR 403; REGISTRATION/ADMIN veem tudo', async () => {
    const sampleId = randomUUID();
    const buyerId = randomUUID();
    await createClassifiedSample({ id: sampleId, lotNumber: '20006', declaredSacks: 10 });
    await createBuyerClient(buyerId);
    const sample = await queryService.requireSample(sampleId);
    const result = await sell(sampleId, sample.version, buyerId); // corretor = TEST_BROKER

    // Escopo aberto: COMMERCIAL sem Broker vinculado vê o contrato e detalha qualquer um.
    const noBroker = { ...commercialActor, actorUserId: randomUUID() };
    assert.equal((await saleContractService.listSaleContracts({}, noBroker)).items.length, 1);
    const noBrokerDetail = await saleContractService.getSaleContract(result.contract.id, noBroker);
    assert.equal(noBrokerDetail.contract.id, result.contract.id);

    // Acesso unificado (2026-07-15): só o PROSPECTOR continua barrado; os demais
    // não-PROSPECTOR (ex.: REGISTRATION) passam.
    const prospector = { ...commercialActor, role: 'PROSPECTOR', actorUserId: randomUUID() };
    await assert.rejects(
      () => saleContractService.listSaleContracts({}, prospector),
      (err) => err.status === 403
    );
    const reg = { ...commercialActor, role: 'REGISTRATION', actorUserId: randomUUID() };
    assert.equal((await saleContractService.listSaleContracts({}, reg)).items.length, 1);

    // ADMIN vê tudo.
    const list = await saleContractService.listSaleContracts({}, adminActor);
    assert.equal(list.items.length, 1);
    const detail = await saleContractService.getSaleContract(result.contract.id, adminActor);
    assert.equal(detail.contract.contractNumber, `0001/${currentYear2}`);
    assert.equal(detail.contract.brokers.length, 1);
  });

  test('acesso unificado (2026-07-15): todo não-PROSPECTOR lê e detalha contratos', async () => {
    const sampleId = randomUUID();
    const buyerId = randomUUID();
    await createClassifiedSample({ id: sampleId, lotNumber: '20099', declaredSacks: 10 });
    await createBuyerClient(buyerId);
    const sample = await queryService.requireSample(sampleId);
    const result = await sell(sampleId, sample.version, buyerId);

    for (const role of ['CLASSIFIER', 'REGISTRATION', 'CADASTRO']) {
      const actor = { ...commercialActor, role, actorUserId: randomUUID() };
      const list = await saleContractService.listSaleContracts({}, actor);
      assert.ok(
        list.items.some((i) => i.id === result.contract.id),
        `${role} deve listar o contrato`
      );
      const detail = await saleContractService.getSaleContract(result.contract.id, actor);
      assert.equal(detail.contract.id, result.contract.id);
    }
  });

  test('gestao de contratos: COMMERCIAL vê/detalha TODOS os contratos (escopo aberto)', async () => {
    const commercialUserId = randomUUID();
    const myBrokerId = randomUUID();
    const suffix = commercialUserId.slice(0, 8);
    await prisma.user.create({
      data: {
        id: commercialUserId,
        fullName: 'Corretor Contratos',
        username: `cc-${suffix}`,
        usernameCanonical: `cc-${suffix}`,
        email: `cc-${suffix}@example.com`,
        emailCanonical: `cc-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'COMMERCIAL',
      },
    });
    await prisma.broker.upsert({
      where: { id: myBrokerId },
      update: { userId: commercialUserId, status: 'ACTIVE' },
      create: {
        id: myBrokerId,
        name: 'Corretor Contratos',
        status: 'ACTIVE',
        userId: commercialUserId,
      },
    });
    const myActor = { ...commercialActor, actorUserId: commercialUserId };

    const mine = await setupConfirmedContractWithBroker({
      lotNumber: '20010',
      brokerId: myBrokerId,
    });
    const other = await setupConfirmedContract({ lotNumber: '20011' }); // corretor = TEST_BROKER

    // Lista: vê os DOIS (o dele e o de outro corretor).
    const list = await saleContractService.listSaleContracts({}, myActor);
    assert.equal(list.items.length, 2);
    assert.ok(list.items.some((i) => i.id === mine.contractId));
    assert.ok(list.items.some((i) => i.id === other.contractId));

    // Get: detalha qualquer um, inclusive o de outro corretor.
    const detailMine = await saleContractService.getSaleContract(mine.contractId, myActor);
    assert.equal(detailMine.contract.id, mine.contractId);
    const detailOther = await saleContractService.getSaleContract(other.contractId, myActor);
    assert.equal(detailOther.contract.id, other.contractId);
  });

  test('gestao de contratos: COMMERCIAL-corretor GERENCIA + cria o próprio (Fase 2, D110)', async () => {
    const commercialUserId = randomUUID();
    const myBrokerId = randomUUID();
    const suffix = commercialUserId.slice(0, 8);
    await prisma.user.create({
      data: {
        id: commercialUserId,
        fullName: 'Corretor Gestor',
        username: `cg-${suffix}`,
        usernameCanonical: `cg-${suffix}`,
        email: `cg-${suffix}@example.com`,
        emailCanonical: `cg-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'COMMERCIAL',
      },
    });
    await prisma.broker.upsert({
      where: { id: myBrokerId },
      update: { userId: commercialUserId, status: 'ACTIVE' },
      create: {
        id: myBrokerId,
        name: 'Corretor Gestor',
        status: 'ACTIVE',
        userId: commercialUserId,
      },
    });
    const myActor = { ...commercialActor, actorUserId: commercialUserId };

    // Fatura o PRÓPRIO contrato (é corretor dele) -> ok.
    const mine = await setupConfirmedContractWithBroker({
      lotNumber: '20020',
      brokerId: myBrokerId,
    });
    const cur = await prisma.saleContract.findUnique({
      where: { id: mine.contractId },
      select: { version: true },
    });
    const invoiced = await saleContractService.invoiceSaleContract(
      mine.contractId,
      { expectedVersion: cur.version, date: '2026-07-06' },
      myActor
    );
    assert.equal(invoiced.contract.status, 'FATURADO');

    // Cria futuro incluindo a si mesmo como corretor -> ok.
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const created = await saleContractService.createFutureSaleContract(
      await createFutureInput(buyerId, { brokerIds: [myBrokerId] }),
      myActor
    );
    assert.ok(created.contract.id);
  });

  test('editar (re-emitir) um EMITIDO: mantem EMITIDO com campos, snapshots e auditoria', async () => {
    const { contractId, bankAccountId } = await setupEmittableContract({ lotNumber: '21001' });
    const lookups = await fetchLookups();

    const emitted = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({ bankAccountId, lookups }),
      adminActor
    );

    assert.equal(emitted.contract.status, 'EMITIDO');
    assert.equal(emitted.contract.paymentFormText, lookups.paymentForm.name);
    assert.equal(emitted.contract.modalityText, lookups.modality.name);
    assert.equal(emitted.contract.packagingText, lookups.packaging.name);
    assert.equal(emitted.contract.purchaseNumber, 'NF-123');
    assert.ok(emitted.contract.sellerBankSnapshot);
    assert.equal(emitted.contract.sellerBankSnapshot.accountId, bankAccountId);
    // D141: snapshot novo congela o bankName da conta (sem bankId/compeCode).
    assert.equal(emitted.contract.sellerBankSnapshot.bankName, 'BANCO TESTE');
    // nasce EMITIDO v0 (D97); a edicao/re-emissao leva a v1.
    assert.equal(emitted.contract.version, 1);

    // 1 auditoria da CRIACAO + 1 desta re-emissao = 2.
    const exports = await prisma.saleContractExport.findMany({
      where: { saleContractId: contractId },
    });
    assert.equal(exports.length, 2);
  });

  test('editar com paymentDate < invoiceDate: 422 no campo (D142), sem tocar o contrato', async () => {
    const { contractId, bankAccountId } = await setupEmittableContract({ lotNumber: '21006' });
    const lookups = await fetchLookups();

    await assert.rejects(
      saleContractService.emitSaleContract(
        contractId,
        etapa2Payload({
          bankAccountId,
          lookups,
          overrides: { invoiceDate: '2026-07-20', paymentDate: '2026-07-10' },
        }),
        adminActor
      ),
      (error) => error.status === 422 && error.details?.field === 'paymentDate'
    );

    // a normalizacao barra ANTES de qualquer escrita: version segue 0.
    const contract = await prisma.saleContract.findUnique({ where: { id: contractId } });
    assert.equal(contract.version, 0);
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

  test('re-emitir (Editar): EMITIDO -> EMITIDO + nova auditoria', async () => {
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
    assert.equal(second.contract.status, 'EMITIDO');
    // 1 auditoria da CRIACAO + 2 re-emissoes = 3.
    const exports = await prisma.saleContractExport.findMany({
      where: { saleContractId: contractId },
    });
    assert.equal(exports.length, 3);
  });

  test('aplicar agio em EMITIDO: recalcula total + corretagem, registra no log, status mantido', async () => {
    const refs = await setupConfirmedContract({ lotNumber: '21100' });
    const result = await saleContractService.applyAgioSaleContract(
      refs.contractId,
      { expectedVersion: refs.version, agioDesagioType: 'AGIO', agioDesagioValue: 50 },
      adminActor
    );
    const c = result.contract;
    assert.equal(c.status, 'EMITIDO'); // status NAO muda
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

    // Financeiro le ao vivo: o commissionTotal reflete a corretagem recalculada (16 + 8).
    const fin = await saleContractService.listBrokerReceivables({}, adminActor);
    const item = fin.items.find((i) => i.id === refs.contractId);
    assert.equal(item.commissionTotal, 24);
  });

  test('aplicar agio fora de EMITIDO -> 409 (FATURADO)', async () => {
    // FATURADO (emitido + faturado): agio so vale em EMITIDO.
    const refs = await setupConfirmedContract({ lotNumber: '21103' });
    const invoiced = await saleContractService.invoiceSaleContract(
      refs.contractId,
      { expectedVersion: refs.version, date: '2026-07-06' },
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

  test('aplicar agio: version stale -> 409; sem tipo -> 422; nada muda', async () => {
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
    // nenhuma aplicacao passou: segue sem agio, total cru e sem log.
    const after = await saleContractService.getSaleContract(refs.contractId, adminActor);
    assert.equal(after.contract.agioDesagioType, null);
    assert.equal(Number(after.contract.totalValue), 1000);
    const logs = await prisma.saleContractAgioLog.findMany({
      where: { saleContractId: refs.contractId },
    });
    assert.equal(logs.length, 0);
  });

  test('guards: editar FATURADO -> 409 (so EMITIDO edita)', async () => {
    const refs = await setupConfirmedContract({ lotNumber: '21005' });
    const lookups = await fetchLookups();
    const invoiced = await saleContractService.invoiceSaleContract(
      refs.contractId,
      { expectedVersion: refs.version, date: '2026-07-06' },
      adminActor
    );
    await assert.rejects(
      () =>
        saleContractService.emitSaleContract(
          refs.contractId,
          etapa2Payload({
            bankAccountId: refs.bankAccountId,
            lookups,
            expectedVersion: invoiced.contract.version,
          }),
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

  test('D146: editar o vendedor de contrato à vista cujo lote é origem de liga não estoura 409 e propaga', async () => {
    // Lote que alimenta uma liga E tem contrato à vista. Trocar o vendedor recai
    // na propagação reativa de owner das ligas ancestrais; antes da D146 o
    // owner-sync não confirmava e estourava 409 BLEND_HARVEST_PROPAGATION_REQUIRED,
    // quebrando o Editar. Agora auto-confirma e propaga.
    const sellerAId = randomUUID();
    await createSellerClient(sellerAId);
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);

    // 2 origens do mesmo dono (liga exige ≥2 componentes) → owner unânime = sellerA.
    const originId = randomUUID();
    const origin2Id = randomUUID();
    await createClassifiedSample({ id: originId, lotNumber: '27050', declaredSacks: 100 });
    await createClassifiedSample({ id: origin2Id, lotNumber: '27051', declaredSacks: 100 });
    await prisma.sample.update({ where: { id: originId }, data: { ownerClientId: sellerAId } });
    await prisma.sample.update({ where: { id: origin2Id }, data: { ownerClientId: sellerAId } });

    const blend = await commandService.createBlend(
      {
        clientDraftId: randomUUID(),
        components: [
          { originSampleId: originId, contributedSacks: 20 },
          { originSampleId: origin2Id, contributedSacks: 20 },
        ],
        sampleLotNumber: '27052',
      },
      adminActor
    );

    // Contrato à vista sobre o lote origem (vende 10 das ~80 sacas livres).
    const originSample = await queryService.requireSample(originId);
    const sale = await sell(originId, originSample.version, buyerId);

    // Editar o vendedor para sellerB — NÃO deve lançar (D146).
    const sellerBId = randomUUID();
    await createSellerClient(sellerBId);
    const sellerBBank = await createSellerBankAccount(sellerBId);
    const lookups = await fetchLookups();
    await saleContractService.emitSaleContract(
      sale.contract.id,
      etapa2Payload({
        bankAccountId: sellerBBank,
        lookups,
        expectedVersion: sale.contract.version,
        overrides: { sellerClientId: sellerBId },
      }),
      adminActor
    );

    // Propagou ao lote origem…
    const originAfter = await prisma.sample.findUnique({
      where: { id: originId },
      select: { ownerClientId: true },
    });
    assert.equal(originAfter.ownerClientId, sellerBId);
    // …e recalculou o dono da liga (origens agora divergem → sem dono unânime).
    const blendAfter = await prisma.sample.findUnique({
      where: { id: blend.sample.id },
      select: { ownerClientId: true },
    });
    assert.notEqual(blendAfter.ownerClientId, sellerAId);
  });

  test('WASH_OUT: cancelar a venda de contrato EMITIDO vira WASH_OUT', async () => {
    // O contrato ja nasce EMITIDO (D97) — nao precisa de emit separado.
    const { contractId, sampleId } = await setupEmittableContract({
      lotNumber: '21009',
    });

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

  test('getNextContractNumber: preview NNNN/AA (max+1); ADMIN + COMMERCIAL (D110)', async () => {
    // Vazio -> 0001/AA.
    const first = await saleContractService.getNextContractNumber(adminActor);
    assert.equal(first.contractNumber, `0001/${currentYear2}`);

    // Apos criar 1 contrato (via venda) -> 0002/AA.
    await setupEmittableContract({ lotNumber: '21020' });
    const second = await saleContractService.getNextContractNumber(adminActor);
    assert.equal(second.contractNumber, `0002/${currentYear2}`);

    // Acesso unificado (2026-07-15): COMMERCIAL e os demais não-PROSPECTOR preveem o
    // número; só o PROSPECTOR é barrado.
    const commercialPreview = await saleContractService.getNextContractNumber(commercialActor);
    assert.equal(commercialPreview.contractNumber, `0002/${currentYear2}`);
    const reg = { ...commercialActor, role: 'REGISTRATION', actorUserId: randomUUID() };
    assert.equal(
      (await saleContractService.getNextContractNumber(reg)).contractNumber,
      `0002/${currentYear2}`
    );
    const prospector = { ...commercialActor, role: 'PROSPECTOR', actorUserId: randomUUID() };
    await assert.rejects(
      () => saleContractService.getNextContractNumber(prospector),
      (err) => err.status === 403
    );
  });

  test('listContractLookups retorna as 3 listas; COMMERCIAL edita (escopo aberto)', async () => {
    const lk = await saleContractService.listContractLookups(commercialActor);
    assert.ok(lk.paymentForms.length >= 2);
    assert.ok(lk.modalities.length >= 3);
    assert.ok(lk.packagings.length >= 3);

    const { contractId, bankAccountId, version } = await setupEmittableContract({
      lotNumber: '21011',
    });
    const lookups = await fetchLookups();
    // Escopo aberto: COMMERCIAL (sem ser corretor do contrato) re-emite/edita.
    const res = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({ bankAccountId, lookups, expectedVersion: version }),
      commercialActor
    );
    assert.equal(res.contract.status, 'EMITIDO');
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

  test('Espelho: contrato EMITIDO renderiza %PDF p/ os 2 lados, com a comissão de cada lado', async () => {
    const { contractId } = await setupConfirmedContract({ lotNumber: '21099' });
    const { contract } = await saleContractService.getSaleContract(contractId, adminActor);

    // venda padrao: 10 sacas x R$100 = R$1000; corretagem vend 2% = 20, comp 1% = 10
    assert.equal(contract.status, 'EMITIDO');
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
  // do COMMERCIAL no Financeiro). Nasce EMITIDO (D97).
  async function setupContractWithBrokers({ lotNumber, brokerIds }) {
    const sellerId = randomUUID();
    await createSellerClient(sellerId);
    await createSellerBankAccount(sellerId);
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const sampleId = randomUUID();
    await createClassifiedSample({ id: sampleId, lotNumber, declaredSacks: 10 });
    await prisma.sample.update({ where: { id: sampleId }, data: { ownerClientId: sellerId } });
    const sample = await queryService.requireSample(sampleId);
    const sale = await sell(sampleId, sample.version, buyerId, { brokerIds });
    return { contractId: sale.contract.id };
  }

  async function setupConfirmedContractWithBroker({ lotNumber, brokerId }) {
    return setupContractWithBrokers({ lotNumber, brokerIds: [brokerId] });
  }

  // COMMERCIAL vinculado a um Broker (Broker.userId), pro escopo own-only do
  // Financeiro (D135) e do /contratos (D110).
  async function createCommercialBrokerUser(name) {
    const userId = randomUUID();
    const brokerId = randomUUID();
    const suffix = userId.slice(0, 8);
    await prisma.user.create({
      data: {
        id: userId,
        fullName: name,
        username: `fin-${suffix}`,
        usernameCanonical: `fin-${suffix}`,
        email: `fin-${suffix}@example.com`,
        emailCanonical: `fin-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'COMMERCIAL',
      },
    });
    await prisma.broker.upsert({
      where: { id: brokerId },
      update: { userId, status: 'ACTIVE' },
      create: { id: brokerId, name, status: 'ACTIVE', userId },
    });
    return { actor: { ...commercialActor, actorUserId: userId }, brokerId };
  }

  test('Financeiro: ADMIN vê os fechamentos elegíveis com a corretagem total + corretores (D136)', async () => {
    const { contractId } = await setupConfirmedContract({ lotNumber: '23010' });

    const res = await saleContractService.listBrokerReceivables({}, adminActor);
    const item = res.items.find((i) => i.id === contractId);
    assert.ok(item, 'contrato confirmado com corretagem deve aparecer');
    assert.equal(item.totalValue, 1000); // 100 x 10 sacas
    assert.equal(item.commissionTotal, 30); // 1000 x (2% + 1%)
    assert.equal(typeof item.version, 'number'); // D137: item traz version (p/ o Pago)
    assert.equal(item.brokers.length, 1);
    assert.equal(item.brokers[0].name, 'Corretor Teste');
    assert.equal(item.brokers[0].share, undefined); // D136: sem cota por corretor
    assert.equal(item.brokerCount, undefined); // D136: sem contagem/rateio
    // só status congelados entram
    assert.ok(
      res.items.every((i) => ['EMITIDO', 'FATURADO', 'PAGO', 'WASH_OUT'].includes(i.status))
    );
  });

  test('Financeiro (escopo aberto): COMMERCIAL vê TODOS os fechamentos, co-corretores visíveis', async () => {
    const { actor: myActor, brokerId: myBrokerId } =
      await createCommercialBrokerUser('Corretor Fin');
    const mine = await setupConfirmedContractWithBroker({
      lotNumber: '23021',
      brokerId: myBrokerId,
    });
    const other = await setupConfirmedContract({ lotNumber: '23022' }); // corretor = TEST_BROKER

    const res = await saleContractService.listBrokerReceivables({}, myActor);
    assert.equal(res.items.length, 2);
    assert.ok(res.items.some((i) => i.id === mine.contractId));
    assert.ok(
      res.items.some((i) => i.id === other.contractId),
      'vê contrato de outro corretor'
    );
    // co-corretores visíveis + total = corretagem total de TODOS os fechamentos (2 × 30)
    const mineItem = res.items.find((i) => i.id === mine.contractId);
    assert.equal(mineItem.brokers[0].brokerId, myBrokerId);
    assert.equal(res.totalCommission, 60);
  });

  test('Financeiro (escopo aberto): COMMERCIAL sem Broker vinculado vê TODOS os fechamentos', async () => {
    const { contractId } = await setupConfirmedContract({ lotNumber: '23023' });
    const orphan = { ...commercialActor, actorUserId: randomUUID() };
    const res = await saleContractService.listBrokerReceivables({}, orphan);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].id, contractId);
    assert.equal(res.totalCommission, 30);
  });

  test('Financeiro (D136): total do COMMERCIAL = corretagem total dos fechamentos dele (sem rateio)', async () => {
    const { actor: myActor, brokerId: myBrokerId } =
      await createCommercialBrokerUser('Corretor Rateio');
    // contrato dividido entre ele e o TEST_BROKER: corretagem 30, 2 corretores (sem ÷N)
    const shared = await setupContractWithBrokers({
      lotNumber: '23024',
      brokerIds: [myBrokerId, TEST_BROKER_ID],
    });
    const res = await saleContractService.listBrokerReceivables({}, myActor);
    const item = res.items.find((i) => i.id === shared.contractId);
    assert.ok(item);
    assert.equal(item.commissionTotal, 30); // corretagem cheia do contrato (2 lados)
    assert.equal(item.brokers.length, 2); // co-corretores visíveis (só nomes)
    assert.equal(item.brokers[0].share, undefined); // D136: sem valor por corretor
    assert.equal(res.totalCommission, 30); // corretagem TOTAL dos fechamentos dele (NÃO ÷N)
  });

  test('Financeiro (escopo aberto): COMMERCIAL busca por corretor acha contratos de todos', async () => {
    const { actor: myActor, brokerId: myBrokerId } =
      await createCommercialBrokerUser('Corretor Busca');
    await setupConfirmedContractWithBroker({ lotNumber: '23025', brokerId: myBrokerId });
    // contrato de OUTRO corretor (Mariana), em que ele NÃO está
    const marianaId = randomUUID();
    await prisma.broker.create({
      data: { id: marianaId, name: 'Mariana Corretora', status: 'ACTIVE' },
    });
    const alheio = await setupConfirmedContractWithBroker({
      lotNumber: '23026',
      brokerId: marianaId,
    });

    // Escopo aberto: COMMERCIAL busca "mariana" → acha o contrato dela.
    const res = await saleContractService.listBrokerReceivables({ search: 'mariana' }, myActor);
    assert.ok(res.items.some((i) => i.id === alheio.contractId));
  });

  test('Financeiro (acesso unificado): REGISTRATION acessa; só PROSPECTOR → 403', async () => {
    const reg = { ...commercialActor, role: 'REGISTRATION', actorUserId: randomUUID() };
    assert.ok(Array.isArray((await saleContractService.listBrokerReceivables({}, reg)).items));
    const prospector = { ...commercialActor, role: 'PROSPECTOR', actorUserId: randomUUID() };
    await assert.rejects(
      () => saleContractService.listBrokerReceivables({}, prospector),
      /not allowed/
    );
  });

  test('Financeiro: inclui fechamento SEM corretagem (P24/D92) com commissionTotal 0', async () => {
    const { contractId } = await setupConfirmedContract({
      lotNumber: '23040',
      saleOverrides: { sellerBrokeragePct: 0, buyerBrokeragePct: 0 },
    });
    const res = await saleContractService.listBrokerReceivables({}, adminActor);
    const item = res.items.find((i) => i.id === contractId);
    assert.ok(item, 'contrato confirmado sem corretagem deve aparecer no Financeiro (P24)');
    assert.equal(item.totalValue, 1000); // 100 x 10 sacas
    assert.equal(item.commissionTotal, 0);
    assert.equal(item.brokers.length, 1); // o corretor aparece; sem valor por corretor (D136)
  });

  test('Financeiro (D145): washout paga corretagem só no FUTURO — físico some, futuro fica', async () => {
    // Físico (à vista) em washout → NÃO gera cobrança → some do Financeiro (D145).
    const spot = await setupEmittableContract({ lotNumber: '23050' });
    await saleContractService.washoutSaleContract(
      spot.contractId,
      { expectedVersion: spot.version, reason: 'Físico caiu' },
      adminActor
    );
    // FUTURO em washout → segue cobrável (D105 preservada só para o FUTURO).
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const fut = await saleContractService.createFutureSaleContract(
      await createFutureInput(buyerId),
      adminActor
    );
    await saleContractService.washoutSaleContract(
      fut.contract.id,
      { expectedVersion: fut.contract.version, reason: 'Futuro caiu' },
      adminActor
    );

    const res = await saleContractService.listBrokerReceivables({}, adminActor);
    assert.equal(
      res.items.find((i) => i.id === spot.contractId),
      undefined,
      'físico em WASH_OUT NÃO deve aparecer no Financeiro (D145)'
    );
    const futItem = res.items.find((i) => i.id === fut.contract.id);
    assert.ok(futItem, 'FUTURO em WASH_OUT deve aparecer no Financeiro');
    assert.equal(futItem.paymentState, 'cancelado');
    assert.equal(futItem.commissionTotal, 150); // 3% de 5000 (50 sacas × R$100)
    // "Corretagem total" conta só o FUTURO washout (o físico ficou de fora).
    assert.equal(res.totalCommission, 150);
    // O filtro "Cancelado" também lista só o FUTURO.
    const canc = await saleContractService.listBrokerReceivables(
      { filter: 'cancelado' },
      adminActor
    );
    assert.deepEqual(
      canc.items.map((i) => i.id),
      [fut.contract.id]
    );
  });

  test('Financeiro (S86): item traz paymentDate e a resposta traz totalCommission', async () => {
    const { contractId } = await setupConfirmedContract({ lotNumber: '24010' });
    const res = await saleContractService.listBrokerReceivables({}, adminActor);
    const item = res.items.find((i) => i.id === contractId);
    assert.ok(item);
    assert.equal(item.paymentDate, '2026-07-20T00:00:00.000Z'); // paymentDate default do sell()
    assert.equal(res.totalCommission, 30); // único contrato: 2% + 1% de 1000
    assert.equal(res.nextCursor, null); // uma página só
  });

  test('Financeiro (S86): totalCommission respeita a busca', async () => {
    const a = await setupConfirmedContract({ lotNumber: '24020' });
    await setupConfirmedContract({ lotNumber: '24021' });
    const all = await saleContractService.listBrokerReceivables({}, adminActor);
    assert.equal(all.totalCommission, 60); // 2 contratos x 30

    const numA = (await saleContractService.getSaleContract(a.contractId, adminActor)).contract
      .contractNumber;
    const filtered = await saleContractService.listBrokerReceivables({ search: numA }, adminActor);
    assert.equal(filtered.items.length, 1);
    assert.equal(filtered.items[0].id, a.contractId);
    assert.equal(filtered.totalCommission, 30); // total segue a busca
  });

  test('Financeiro (S86): pagina por cursor (limit + cursor, sem sobreposição)', async () => {
    const c1 = await setupConfirmedContract({ lotNumber: '24030' });
    const c2 = await setupConfirmedContract({ lotNumber: '24031' });
    const c3 = await setupConfirmedContract({ lotNumber: '24032' });

    const page1 = await saleContractService.listBrokerReceivables({ limit: 2 }, adminActor);
    assert.equal(page1.items.length, 2);
    assert.notEqual(page1.nextCursor, null);
    assert.equal(page1.totalCommission, 90); // agregado do conjunto inteiro (3 x 30)

    const page2 = await saleContractService.listBrokerReceivables(
      { limit: 2, cursor: page1.nextCursor },
      adminActor
    );
    assert.equal(page2.items.length, 1);
    assert.equal(page2.nextCursor, null);

    const ids1 = new Set(page1.items.map((i) => i.id));
    assert.ok(!page2.items.some((i) => ids1.has(i.id)), 'sem sobreposição entre páginas');
    const allIds = new Set([...page1.items, ...page2.items].map((i) => i.id));
    assert.deepEqual([...allIds].sort(), [c1.contractId, c2.contractId, c3.contractId].sort());
  });

  test('Financeiro (S86): busca por nº e por nome de corretor (server-side)', async () => {
    const a = await setupConfirmedContract({ lotNumber: '24040' });
    const otherBrokerId = randomUUID();
    await prisma.broker.create({
      data: { id: otherBrokerId, name: 'Mariana Corretora', status: 'ACTIVE' },
    });
    const b = await setupConfirmedContractWithBroker({
      lotNumber: '24041',
      brokerId: otherBrokerId,
    });

    // por nome de corretor (case-insensitive) → só o contrato B
    const byBroker = await saleContractService.listBrokerReceivables(
      { search: 'mariana' },
      adminActor
    );
    assert.equal(byBroker.items.length, 1);
    assert.equal(byBroker.items[0].id, b.contractId);

    // pelo nº do contrato → só o A
    const numA = (await saleContractService.getSaleContract(a.contractId, adminActor)).contract
      .contractNumber;
    const byNumber = await saleContractService.listBrokerReceivables({ search: numA }, adminActor);
    assert.equal(byNumber.items.length, 1);
    assert.equal(byNumber.items[0].id, a.contractId);
  });

  // ── Revisão do Pagamento (FN1–FN6): casa do pagamento ──

  test('Financeiro (FN1/FN4/FN6): ordem vencido→a_vencer→pago→cancelado + chips + N vencidos', async () => {
    const venc = await setupConfirmedContract({ lotNumber: '26010' });
    const aVenc = await setupConfirmedContract({ lotNumber: '26011' });
    const pago = await setupConfirmedContract({ lotNumber: '26012' });
    // D145: o cancelado precisa ser FUTURO para aparecer no Financeiro (o físico em
    // washout some). Wrapper mantém a forma { contractId } dos demais setups.
    const cancBuyerId = randomUUID();
    await createBuyerClient(cancBuyerId);
    const cancFut = await saleContractService.createFutureSaleContract(
      await createFutureInput(cancBuyerId),
      adminActor
    );
    const canc = { contractId: cancFut.contract.id };
    // Estados/datas controlados (setupConfirmedContract nasce EMITIDO).
    await prisma.saleContract.update({
      where: { id: venc.contractId },
      data: { paymentDate: new Date('2000-01-01T00:00:00.000Z') }, // vencido (passado)
    });
    await prisma.saleContract.update({
      where: { id: aVenc.contractId },
      data: { paymentDate: new Date('2100-01-01T00:00:00.000Z') }, // a vencer (futuro)
    });
    await prisma.saleContract.update({
      where: { id: pago.contractId },
      data: { status: 'PAGO', paidAt: new Date('2026-07-05T00:00:00.000Z') },
    });
    await prisma.saleContract.update({
      where: { id: canc.contractId },
      data: { status: 'WASH_OUT' },
    });

    const res = await saleContractService.listBrokerReceivables({}, adminActor);
    assert.deepEqual(
      res.items.map((i) => i.id),
      [venc.contractId, aVenc.contractId, pago.contractId, canc.contractId]
    );
    const byId = Object.fromEntries(res.items.map((i) => [i.id, i]));
    assert.equal(byId[venc.contractId].paymentState, 'vencido');
    assert.equal(byId[aVenc.contractId].paymentState, 'a_vencer');
    assert.equal(byId[pago.contractId].paymentState, 'pago');
    assert.equal(byId[canc.contractId].paymentState, 'cancelado');
    // FN6: 1 vencido, corretagem 30 (2% + 1% de 1000)
    assert.equal(res.overdueCount, 1);
    assert.equal(res.overdueCommission, 30);
  });

  test('Financeiro (FN5): filtros por estado, independentes do cabeçalho', async () => {
    const venc = await setupConfirmedContract({ lotNumber: '26020' });
    const aVenc = await setupConfirmedContract({ lotNumber: '26021' });
    const pago = await setupConfirmedContract({ lotNumber: '26022' });
    await prisma.saleContract.update({
      where: { id: venc.contractId },
      data: { paymentDate: new Date('2000-01-01T00:00:00.000Z') },
    });
    await prisma.saleContract.update({
      where: { id: aVenc.contractId },
      data: { paymentDate: new Date('2100-01-01T00:00:00.000Z') },
    });
    await prisma.saleContract.update({
      where: { id: pago.contractId },
      data: { status: 'PAGO', paidAt: new Date('2026-07-05T00:00:00.000Z') },
    });

    const vencidos = await saleContractService.listBrokerReceivables(
      { filter: 'vencido' },
      adminActor
    );
    assert.deepEqual(
      vencidos.items.map((i) => i.id),
      [venc.contractId]
    );
    const aVencer = await saleContractService.listBrokerReceivables(
      { filter: 'a_vencer' },
      adminActor
    );
    assert.deepEqual(
      aVencer.items.map((i) => i.id),
      [aVenc.contractId]
    );
    const pagos = await saleContractService.listBrokerReceivables({ filter: 'pago' }, adminActor);
    assert.deepEqual(
      pagos.items.map((i) => i.id),
      [pago.contractId]
    );
    // o cabeçalho (total + vencidos) independe do filtro FN5 ativo
    assert.equal(vencidos.totalCommission, 90); // 3 x 30
    assert.equal(vencidos.overdueCount, 1);
  });

  test('Financeiro (FN5): busca por comprador (case-insensitive, sem vazar)', async () => {
    const a = await setupConfirmedContract({ lotNumber: '26030' });
    const b = await setupConfirmedContract({ lotNumber: '26031' });
    await prisma.saleContract.update({
      where: { id: a.contractId },
      data: { buyerSnapshot: { displayName: 'Fazenda Aurora' } },
    });
    await prisma.saleContract.update({
      where: { id: b.contractId },
      data: { buyerSnapshot: { displayName: 'Sítio Bela Vista' } },
    });
    const res = await saleContractService.listBrokerReceivables({ search: 'AURORA' }, adminActor);
    assert.deepEqual(
      res.items.map((i) => i.id),
      [a.contractId]
    );
    assert.equal(res.items[0].buyerName, 'Fazenda Aurora');
  });

  test('Financeiro (FN4): paginação keyset atravessa os grupos (não-pago → pago)', async () => {
    const u1 = await setupConfirmedContract({ lotNumber: '26040' });
    const u2 = await setupConfirmedContract({ lotNumber: '26041' });
    const p1 = await setupConfirmedContract({ lotNumber: '26042' });
    await prisma.saleContract.update({
      where: { id: u1.contractId },
      data: { paymentDate: new Date('2100-01-01T00:00:00.000Z') },
    });
    await prisma.saleContract.update({
      where: { id: u2.contractId },
      data: { paymentDate: new Date('2100-01-02T00:00:00.000Z') },
    });
    await prisma.saleContract.update({
      where: { id: p1.contractId },
      data: { status: 'PAGO', paidAt: new Date('2026-07-05T00:00:00.000Z') },
    });
    const page1 = await saleContractService.listBrokerReceivables({ limit: 2 }, adminActor);
    assert.deepEqual(
      page1.items.map((i) => i.id),
      [u1.contractId, u2.contractId]
    );
    assert.equal(typeof page1.nextCursor, 'string');
    const page2 = await saleContractService.listBrokerReceivables(
      { limit: 2, cursor: page1.nextCursor },
      adminActor
    );
    assert.deepEqual(
      page2.items.map((i) => i.id),
      [p1.contractId]
    );
    assert.equal(page2.nextCursor, null);
  });

  test('Pagar (E30): rejeita data futura (após faturar); hoje passa', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '26050' });
    const inv = await saleContractService.invoiceSaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-06' },
      adminActor
    );
    await assert.rejects(
      () =>
        saleContractService.paySaleContract(
          contractId,
          { expectedVersion: inv.contract.version, date: '2999-12-31' },
          adminActor
        ),
      (err) => err.status === 422
    );
    // DSB-D7: um dia útil não-futuro passa (pagar recusa fim de semana + futuro).
    // Recua "hoje BRT" pro dia útil mais recente (≤ hoje) — robusto em qualquer dia.
    const payDate = (() => {
      const d = new Date(Date.now() - 3 * 3600_000);
      d.setUTCHours(0, 0, 0, 0);
      while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    })();
    const paid = await saleContractService.paySaleContract(
      contractId,
      { expectedVersion: inv.contract.version, date: payDate },
      adminActor
    );
    assert.equal(paid.contract.status, 'PAGO');
  });

  test('criar lookup inline: cria ACTIVE, aparece na lista e fica no fim (append)', async () => {
    // nome unico + cleanup: as tabelas de lookup nao sao truncadas entre runs
    // (guardam os valores seedados), entao o teste nao pode usar um nome fixo.
    const name = `À vista ${randomUUID().slice(0, 8)}`;
    const before = await saleContractService.listContractLookups(adminActor);
    const created = await saleContractService.createContractLookup(
      { list: 'paymentForm', name },
      adminActor
    );
    assert.equal(created.list, 'paymentForm');
    assert.ok(created.item.id);
    assert.equal(created.item.name, name);

    const after = await saleContractService.listContractLookups(adminActor);
    assert.equal(after.paymentForms.length, before.paymentForms.length + 1);
    // append (sortOrder = max+1) -> último na ordem (sortOrder asc, name asc)
    assert.equal(after.paymentForms[after.paymentForms.length - 1].id, created.item.id);

    await prisma.contractPaymentForm.delete({ where: { id: created.item.id } });
  });

  test('criar lookup inline: nome duplicado -> 409; lista inválida/nome vazio -> 422', async () => {
    const dup = `Dup ${randomUUID().slice(0, 8)}`;
    const created = await saleContractService.createContractLookup(
      { list: 'modality', name: dup },
      adminActor
    );
    await assert.rejects(
      () => saleContractService.createContractLookup({ list: 'modality', name: dup }, adminActor),
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

    await prisma.contractModality.delete({ where: { id: created.item.id } });
  });

  test('criar lookup inline (acesso unificado 2026-07-15): COMMERCIAL cria; só PROSPECTOR 403', async () => {
    const name = `Bag ${randomUUID().slice(0, 8)}`;
    const created = await saleContractService.createContractLookup(
      { list: 'packaging', name },
      commercialActor
    );
    assert.ok(created.item.id);
    await prisma.contractPackaging.delete({ where: { id: created.item.id } });

    const prospector = { ...commercialActor, role: 'PROSPECTOR', actorUserId: randomUUID() };
    await assert.rejects(
      () =>
        saleContractService.createContractLookup(
          { list: 'packaging', name: 'Bag teste' },
          prospector
        ),
      (err) => err.status === 403
    );
  });

  test('faturar: EMITIDO -> FATURADO grava invoicedAt', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '22001' });
    const r = await saleContractService.invoiceSaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-06' },
      adminActor
    );
    assert.equal(r.contract.status, 'FATURADO');
    assert.equal(r.contract.invoicedAt?.slice(0, 10), '2026-07-06');
  });

  test('pagar (apos faturar): FATURADO -> PAGO grava paidAt e preserva invoicedAt', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '22002' });
    const inv = await saleContractService.invoiceSaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-06' },
      adminActor
    );
    const pay = await saleContractService.paySaleContract(
      contractId,
      { expectedVersion: inv.contract.version, date: '2026-07-08' }, // E30: máx hoje (BRT)
      adminActor
    );
    assert.equal(pay.contract.status, 'PAGO');
    assert.equal(pay.contract.paidAt?.slice(0, 10), '2026-07-08');
    assert.equal(pay.contract.invoicedAt?.slice(0, 10), '2026-07-06');
  });

  // F1 (E21-E27/D138): getDashboardPaymentEvents — feed do card de Eventos.
  test('Eventos (D138): ADMIN vê agendado no paymentDate; janela filtra; WASH_OUT fora', async () => {
    const emitido = await setupConfirmedContract({ lotNumber: '25010' }); // paymentDate 2026-07-20
    const washed = await setupEmittableContract({ lotNumber: '25011' });
    await saleContractService.washoutSaleContract(
      washed.contractId,
      { expectedVersion: washed.version, reason: 'Caiu' },
      adminActor
    );

    // janela cobrindo 2026-07-20 → o EMITIDO aparece como agendado; o WASH_OUT não.
    const inWindow = await saleContractService.getDashboardPaymentEvents(
      { from: '2026-07-13', to: '2026-07-26' },
      adminActor
    );
    const day = inWindow['2026-07-20'] ?? [];
    const ev = day.find((e) => e.contractId === emitido.contractId);
    assert.ok(ev, 'contrato EMITIDO deve aparecer como agendado no paymentDate');
    assert.equal(ev.typeKey, 'contract_payment_due');
    assert.equal(ev.status, 'EMITIDO');
    assert.ok(!day.some((e) => e.contractId === washed.contractId), 'WASH_OUT fora do feed');

    // janela em agosto → o contrato de 2026-07-20 não aparece (filtro de data).
    const outWindow = await saleContractService.getDashboardPaymentEvents(
      { from: '2026-08-01', to: '2026-08-14' },
      adminActor
    );
    assert.ok(
      !(outWindow['2026-07-20'] ?? []).some((e) => e.contractId === emitido.contractId),
      'fora da janela não aparece'
    );
  });

  test('Eventos (D138): contrato PAGO aparece como realizado no paidAt (não no paymentDate)', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '25020' }); // paymentDate 2026-07-20
    const inv = await saleContractService.invoiceSaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-06' },
      adminActor
    );
    await saleContractService.paySaleContract(
      contractId,
      { expectedVersion: inv.contract.version, date: '2026-07-08' }, // E30: máx hoje (BRT)
      adminActor
    );

    const res = await saleContractService.getDashboardPaymentEvents(
      { from: '2026-07-01', to: '2026-07-26' },
      adminActor
    );
    // realizado no paidAt (2026-07-08), NÃO no paymentDate (2026-07-20).
    const ev = (res['2026-07-08'] ?? []).find((e) => e.contractId === contractId);
    assert.ok(ev, 'PAGO deve aparecer no paidAt');
    assert.equal(ev.typeKey, 'contract_payment_paid');
    assert.equal(ev.status, 'PAGO');
    assert.ok(
      !(res['2026-07-20'] ?? []).some((e) => e.contractId === contractId),
      'PAGO não aparece no paymentDate'
    );
  });

  test('Eventos (escopo aberto): COMMERCIAL vê eventos de todos; só PROSPECTOR → 403', async () => {
    const { actor: myActor, brokerId: myBrokerId } =
      await createCommercialBrokerUser('Corretor Eventos');
    const mine = await setupContractWithBrokers({ lotNumber: '25030', brokerIds: [myBrokerId] });
    const other = await setupConfirmedContract({ lotNumber: '25031' }); // corretor = TEST_BROKER

    const res = await saleContractService.getDashboardPaymentEvents(
      { from: '2026-07-13', to: '2026-07-26' },
      myActor
    );
    const day = res['2026-07-20'] ?? [];
    assert.ok(
      day.some((e) => e.contractId === mine.contractId),
      'vê o contrato dele'
    );
    assert.ok(
      day.some((e) => e.contractId === other.contractId),
      'vê o de outro corretor'
    );

    // Acesso unificado (2026-07-15): REGISTRATION (e demais não-PROSPECTOR) acessa;
    // só o PROSPECTOR → 403 (gate FINANCEIRO_ROLES = NON_PROSPECTOR_ROLES).
    const reg = { ...commercialActor, role: 'REGISTRATION', actorUserId: randomUUID() };
    const regEvents = await saleContractService.getDashboardPaymentEvents(
      { from: '2026-07-13', to: '2026-07-26' },
      reg
    );
    assert.equal(typeof regEvents, 'object');
    const prospector = { ...commercialActor, role: 'PROSPECTOR', actorUserId: randomUUID() };
    await assert.rejects(
      () =>
        saleContractService.getDashboardPaymentEvents(
          { from: '2026-07-13', to: '2026-07-26' },
          prospector
        ),
      /not allowed/
    );
  });

  test('pagar de EMITIDO -> 409 (precisa faturar antes, D106)', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '22003' });
    await assert.rejects(
      () =>
        saleContractService.paySaleContract(
          contractId,
          { expectedVersion: version, date: '2026-07-24' }, // dia útil (sexta) — DSB-D7
          adminActor
        ),
      (err) => err.status === 409
    );
  });

  // ── Fase J (D123–D125): auditoria de marcos + espelho + timeline ──

  test('Fase J: faturar e pagar gravam SaleContractStatusLog com ator', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '24101' });
    const inv = await saleContractService.invoiceSaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-06' },
      adminActor
    );
    await saleContractService.paySaleContract(
      contractId,
      { expectedVersion: inv.contract.version, date: '2026-07-08' }, // E30: máx hoje (BRT)
      adminActor
    );

    const logs = await prisma.saleContractStatusLog.findMany({
      where: { saleContractId: contractId },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(logs.length, 2);
    assert.equal(logs[0].toStatus, 'FATURADO');
    assert.equal(logs[0].actorUserId, adminActor.actorUserId);
    assert.equal(logs[1].toStatus, 'PAGO');
    assert.equal(logs[1].actorUserId, adminActor.actorUserId);
  });

  test('Fase J: washout manual (a vista, via cancel da venda) grava StatusLog com ator e motivo', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '24102' });
    await saleContractService.washoutSaleContract(
      contractId,
      { expectedVersion: version, reason: 'Quebra fase J' },
      adminActor
    );

    const log = await prisma.saleContractStatusLog.findFirst({
      where: { saleContractId: contractId, toStatus: 'WASH_OUT' },
    });
    assert.ok(log);
    assert.equal(log.reason, 'Quebra fase J');
    assert.equal(log.actorUserId, adminActor.actorUserId);
  });

  test('Fase J: washout de FUTURO grava StatusLog com ator e motivo', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const created = await saleContractService.createFutureSaleContract(
      await createFutureInput(buyerId),
      adminActor
    );
    await saleContractService.washoutSaleContract(
      created.contract.id,
      { expectedVersion: created.contract.version, reason: 'Quebra futuro fase J' },
      adminActor
    );

    const log = await prisma.saleContractStatusLog.findFirst({
      where: { saleContractId: created.contract.id, toStatus: 'WASH_OUT' },
    });
    assert.ok(log);
    assert.equal(log.reason, 'Quebra futuro fase J');
    assert.equal(log.actorUserId, adminActor.actorUserId);
  });

  test('Fase J: logEspelhoGenerated grava EspelhoLog com lado e ator', async () => {
    const { contractId } = await setupConfirmedContract({ lotNumber: '24103' });
    await saleContractService.logEspelhoGenerated(contractId, 'seller', adminActor);

    const log = await prisma.saleContractEspelhoLog.findFirst({
      where: { saleContractId: contractId },
    });
    assert.ok(log);
    assert.equal(log.side, 'seller');
    assert.equal(log.actorUserId, adminActor.actorUserId);
  });

  test('Fase J: timeline agrega criacao/marco/espelho/aprovacao com nomes; legado sem log fica sem autor', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '24104' });
    await saleContractService.invoiceSaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-06' },
      adminActor
    );
    await saleContractService.logEspelhoGenerated(contractId, 'buyer', adminActor);
    const job = await prisma.customPrintJob.create({
      data: { status: 'PENDING', payload: { lines: [] } },
      select: { id: true },
    });
    await prisma.approvalLabelLog.create({
      data: {
        id: randomUUID(),
        saleContractId: contractId,
        actorUserId: adminActor.actorUserId,
        customPrintJobId: job.id,
        payload: { lines: [] },
      },
    });

    const timeline = await saleContractService.getSaleContractTimeline(contractId, adminActor);
    const kinds = timeline.items.map((item) => item.kind);
    assert.ok(kinds.includes('CRIACAO'));
    assert.ok(kinds.includes('STATUS'));
    assert.ok(kinds.includes('ESPELHO'));
    assert.ok(kinds.includes('APROVACAO'));
    // Ordem DESC: a criacao e a linha mais antiga (ultima).
    assert.equal(kinds[kinds.length - 1], 'CRIACAO');

    const mark = timeline.items.find((item) => item.kind === 'STATUS');
    assert.equal(mark.toStatus, 'FATURADO');
    assert.equal(mark.legacy, false);
    assert.equal(mark.actorName, `Admin ${adminActor.actorUserId.slice(0, 8)}`);
    assert.equal(timeline.items.find((item) => item.kind === 'ESPELHO').side, 'buyer');

    // LEGADO (D123): sem a linha auditada, o marco cai pro fallback so-com-data.
    await prisma.saleContractStatusLog.deleteMany({ where: { saleContractId: contractId } });
    const legacy = await saleContractService.getSaleContractTimeline(contractId, adminActor);
    const legacyMark = legacy.items.find((item) => item.kind === 'STATUS');
    assert.equal(legacyMark.legacy, true);
    assert.equal(legacyMark.toStatus, 'FATURADO');
    assert.equal(legacyMark.actorName, null);
  });

  test('Fase J: timeline acessível ao COMMERCIAL sem vínculo (escopo aberto)', async () => {
    const { contractId } = await setupConfirmedContract({ lotNumber: '24105' });
    const stranger = { ...commercialActor, actorUserId: randomUUID() };
    const timeline = await saleContractService.getSaleContractTimeline(contractId, stranger);
    assert.ok(Array.isArray(timeline.items), 'COMMERCIAL sem vínculo acessa o timeline');
  });

  test('faturar: expectedVersion stale -> 409', async () => {
    const { contractId } = await setupConfirmedContract({ lotNumber: '22009' });
    await assert.rejects(
      () =>
        saleContractService.invoiceSaleContract(
          contractId,
          { expectedVersion: 99, date: '2026-07-06' },
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

  test('faturar: COMMERCIAL fatura qualquer contrato (escopo aberto)', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '22011' });
    const res = await saleContractService.invoiceSaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-06' },
      commercialActor
    );
    assert.equal(res.contract.status, 'FATURADO');
  });

  test('quebra manual: EMITIDO -> WASH_OUT, cancela a venda e restaura as sacas', async () => {
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
      { expectedVersion: version, date: '2026-07-06' },
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
    const inv = await saleContractService.invoiceSaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-06' },
      adminActor
    );
    const pay = await saleContractService.paySaleContract(
      contractId,
      { expectedVersion: inv.contract.version, date: '2026-07-08' }, // E30: máx hoje (BRT)
      adminActor
    );
    const r = await saleContractService.washoutSaleContract(
      contractId,
      { expectedVersion: pay.contract.version, reason: 'Quebra apos pagar' },
      adminActor
    );
    assert.equal(r.contract.status, 'WASH_OUT');
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

  test('quebra manual: COMMERCIAL dá washout em qualquer contrato (escopo aberto)', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '23009' });
    const r = await saleContractService.washoutSaleContract(
      contractId,
      { expectedVersion: version, reason: 'qualquer' },
      commercialActor
    );
    assert.equal(r.contract.status, 'WASH_OUT');
  });

  test('lote: cancelar a venda de contrato PAGO -> WASH_OUT (extensao)', async () => {
    const { contractId, sampleId, version } = await setupConfirmedContract({ lotNumber: '23010' });
    const inv = await saleContractService.invoiceSaleContract(
      contractId,
      { expectedVersion: version, date: '2026-07-06' },
      adminActor
    );
    await saleContractService.paySaleContract(
      contractId,
      { expectedVersion: inv.contract.version, date: '2026-07-08' }, // E30: máx hoje (BRT)
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

  // Fase 1 + etapa 2 do Futuro num body so (nasce EMITIDO, D97): cria um vendedor
  // PJ + conta bancaria e resolve as 3 listas ativas p/ preencher a etapa 2.
  async function createFutureInput(buyerId, overrides = {}) {
    const sellerId = randomUUID();
    await createSellerClient(sellerId);
    const sellerBankAccountId = await createSellerBankAccount(sellerId);
    const lookups = await fetchLookups();
    return {
      buyerClientId: buyerId,
      quantitySacks: 50,
      unitPrice: 100,
      sellerBrokeragePct: 2,
      buyerBrokeragePct: 1,
      contractDate: '2026-09-01',
      brokerIds: [TEST_BROKER_ID],
      // etapa 2 (contrato Futuro nasce EMITIDO num passo so)
      sellerClientId: sellerId,
      sellerBankAccountId,
      paymentFormId: lookups.paymentForm.id,
      modalityId: lookups.modality.id,
      packagingId: lookups.packaging.id,
      invoiceDate: '2026-07-10',
      paymentDate: '2026-07-20',
      requiresApproval: false,
      ...overrides,
    };
  }

  test('futuro: cria FUTURO EMITIDO sem lote (sampleId/movementId nulos)', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);

    const res = await saleContractService.createFutureSaleContract(
      await createFutureInput(buyerId),
      adminActor
    );
    const c = res.contract;
    assert.equal(c.type, 'FUTURO');
    assert.equal(c.status, 'EMITIDO');
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

  test('futuro: aprovação grava/lê sinal + lembrete na criação; "Não" zera; o Editar NÃO altera o sinal (AP32)', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);

    // "Sim" + lembrete 45 → persiste e volta na leitura.
    const sim = await saleContractService.createFutureSaleContract(
      await createFutureInput(buyerId, { requiresApproval: true, approvalReminderLeadDays: 45 }),
      adminActor
    );
    assert.equal(sim.contract.requiresApproval, true);
    assert.equal(sim.contract.approvalReminderLeadDays, 45);

    // "Não" ignora o valor enviado → grava null.
    const nao = await saleContractService.createFutureSaleContract(
      await createFutureInput(buyerId, { requiresApproval: false, approvalReminderLeadDays: 45 }),
      adminActor
    );
    assert.equal(nao.contract.requiresApproval, false);
    assert.equal(nao.contract.approvalReminderLeadDays, null);

    // AP32: o Editar (emit) NÃO altera o sinal — latch de mão única. O payload
    // pedindo "Sim" num contrato "Não" é ignorado (preserva "Não" + lead null).
    const edit = await saleContractService.emitSaleContract(
      nao.contract.id,
      etapa2Payload({
        bankAccountId: nao.contract.sellerBankAccountId,
        lookups: await fetchLookups(),
        expectedVersion: nao.contract.version,
        overrides: { requiresApproval: true, approvalReminderLeadDays: 10 },
      }),
      adminActor
    );
    assert.equal(edit.contract.requiresApproval, false);
    assert.equal(edit.contract.approvalReminderLeadDays, null);
  });

  // ---- D144: datas planejadas "À definir" (null) em contratos FUTUROS ----------

  test('D144: futuro cria com datas "à definir" (ambas/uma); à vista recusa null', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);

    const both = await saleContractService.createFutureSaleContract(
      await createFutureInput(buyerId, { invoiceDate: null, paymentDate: null }),
      adminActor
    );
    assert.equal(both.contract.status, 'EMITIDO');
    assert.equal(both.contract.invoiceDate, null);
    assert.equal(both.contract.paymentDate, null);

    // Uma só "à definir" (independência por campo) — D142 não dispara.
    const onlyPay = await saleContractService.createFutureSaleContract(
      await createFutureInput(buyerId, { paymentDate: null }),
      adminActor
    );
    assert.ok(onlyPay.contract.invoiceDate);
    assert.equal(onlyPay.contract.paymentDate, null);

    // À vista (caminho spot): null segue 422 no campo.
    const sampleId = randomUUID();
    await createClassifiedSample({ id: sampleId, lotNumber: '21050' });
    await assert.rejects(
      sell(sampleId, 0, buyerId, { invoiceDate: null }),
      (error) => error.status === 422 && error.details?.field === 'invoiceDate'
    );
  });

  test('D144: Editar futuro define, volta pra "à definir" e D142 tardio segue valendo', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const created = await saleContractService.createFutureSaleContract(
      await createFutureInput(buyerId, { invoiceDate: null, paymentDate: null }),
      adminActor
    );
    const lookups = await fetchLookups();
    const bankAccountId = created.contract.sellerBankAccountId;

    // Define as duas datas no Editar.
    const defined = await saleContractService.emitSaleContract(
      created.contract.id,
      etapa2Payload({
        bankAccountId,
        lookups,
        expectedVersion: created.contract.version,
        overrides: { invoiceDate: '2026-08-10', paymentDate: '2026-08-20' },
      }),
      adminActor
    );
    assert.equal(defined.contract.invoiceDate?.slice(0, 10), '2026-08-10');
    assert.equal(defined.contract.paymentDate?.slice(0, 10), '2026-08-20');

    // Volta o pagamento pra "à definir" — persiste null (simetria do Editar).
    const reverted = await saleContractService.emitSaleContract(
      created.contract.id,
      etapa2Payload({
        bankAccountId,
        lookups,
        expectedVersion: defined.contract.version,
        overrides: { invoiceDate: '2026-08-10', paymentDate: null },
      }),
      adminActor
    );
    assert.equal(reverted.contract.paymentDate, null);
    assert.equal(reverted.contract.invoiceDate?.slice(0, 10), '2026-08-10');

    // D142 tardio: ao definir depois, o par incoerente é recusado.
    await assert.rejects(
      saleContractService.emitSaleContract(
        created.contract.id,
        etapa2Payload({
          bankAccountId,
          lookups,
          expectedVersion: reverted.contract.version,
          overrides: { invoiceDate: '2026-08-21', paymentDate: '2026-08-20' },
        }),
        adminActor
      ),
      (error) => error.status === 422 && error.details?.field === 'paymentDate'
    );
  });

  test('D144: Editar um à vista com data null → 422 (permissão deriva do type persistido)', async () => {
    const { contractId, bankAccountId } = await setupEmittableContract({ lotNumber: '21051' });
    const lookups = await fetchLookups();
    await assert.rejects(
      saleContractService.emitSaleContract(
        contractId,
        etapa2Payload({ bankAccountId, lookups, overrides: { paymentDate: null } }),
        adminActor
      ),
      (error) => error.status === 422 && error.details?.field === 'paymentDate'
    );
  });

  test('D144: faturar e pagar direto com planejadas "à definir" (data real basta)', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const created = await saleContractService.createFutureSaleContract(
      await createFutureInput(buyerId, { invoiceDate: null, paymentDate: null }),
      adminActor
    );
    const invoiced = await saleContractService.invoiceSaleContract(
      created.contract.id,
      { expectedVersion: created.contract.version, date: '2026-07-08' },
      adminActor
    );
    assert.equal(invoiced.contract.status, 'FATURADO');
    const paid = await saleContractService.paySaleContract(
      created.contract.id,
      { expectedVersion: invoiced.contract.version, date: '2026-07-08' },
      adminActor
    );
    assert.equal(paid.contract.status, 'PAGO');
    // As planejadas seguem "à definir" no histórico.
    assert.equal(paid.contract.invoiceDate, null);
    assert.equal(paid.contract.paymentDate, null);
  });

  test('D144: worklist de embarque inclui "à definir" no fim; sem atraso; sem evento no calendário', async () => {
    const dated = await setupShipmentContract({ lotNumber: '25320' });
    await prisma.saleContract.update({
      where: { id: dated.id },
      data: { invoiceDate: new Date('2000-01-01T00:00:00Z') },
    });
    const undated = await setupShipmentContract({ lotNumber: '25321' });
    await prisma.saleContract.update({
      where: { id: undated.id },
      data: { invoiceDate: null },
    });

    const all = await saleContractService.listShipmentContracts({}, adminActor);
    const byId = new Map(all.items.map((i) => [i.id, i]));
    assert.equal(byId.get(undated.id)?.state, 'a_embarcar');
    assert.equal(byId.get(undated.id)?.invoiceDate, null);
    // Nulls-last: o datado (2000, atrasado) vem antes do "à definir".
    const order = all.items.map((i) => i.id);
    assert.ok(order.indexOf(dated.id) < order.indexOf(undated.id));
    // Contador de atrasados não conta o "à definir".
    assert.equal(all.overdueCount, 1);

    // Filtros: a_embarcar inclui; atrasado exclui.
    const fA = await saleContractService.listShipmentContracts(
      { filter: 'a_embarcar' },
      adminActor
    );
    assert.ok(fA.items.some((i) => i.id === undated.id));
    const fAtr = await saleContractService.listShipmentContracts(
      { filter: 'atrasado' },
      adminActor
    );
    assert.ok(!fAtr.items.some((i) => i.id === undated.id));

    // Keyset atravessa a cauda null: limit=1 → datado, cursor → "à definir".
    const p1 = await saleContractService.listShipmentContracts({ limit: 1 }, adminActor);
    assert.deepEqual(
      p1.items.map((i) => i.id),
      [dated.id]
    );
    const p2 = await saleContractService.listShipmentContracts(
      { limit: 1, cursor: p1.nextCursor },
      adminActor
    );
    assert.deepEqual(
      p2.items.map((i) => i.id),
      [undated.id]
    );

    // Calendário: o "à definir" não gera evento agendado em janela nenhuma.
    const events = await saleContractService.getDashboardShipmentEvents(
      { from: '1999-01-01', to: '2199-12-31' },
      adminActor
    );
    const flat = Object.values(events).flat();
    assert.ok(!flat.some((e) => e.id.includes(undated.id)));
    assert.ok(flat.some((e) => e.id.includes(dated.id)));
  });

  test('D144: financeiro trata paymentDate "à definir" como a_vencer, nunca vencido', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const created = await saleContractService.createFutureSaleContract(
      await createFutureInput(buyerId, { paymentDate: null }),
      adminActor
    );
    const res = await saleContractService.listBrokerReceivables({}, adminActor);
    const item = res.items.find((i) => i.id === created.contract.id);
    assert.ok(item, 'contrato "à definir" aparece no Financeiro');
    assert.equal(item.paymentState, 'a_vencer');
    assert.equal(item.paymentDate, null);
    assert.equal(res.overdueCount ?? 0, 0);
  });

  // ---- Aprovacao: worklist da sub-aba (AP25-AP28, F3) ---------------------------
  // Contrato marcado direto no Prisma: controle fino de status/invoiceDate/seq pro
  // keyset (mais leve que o fluxo de venda real). O estado da worklist deriva de um
  // AGREGADO (contagem no approval_label_log), entao a query e $queryRaw.
  let aprSeq = 970000;
  async function mkApprovalContract({
    status = 'EMITIDO',
    requiresApproval = true,
    invoiceDate = null,
    buyerName = 'Comprador Worklist',
    sacks = 100,
  } = {}) {
    aprSeq += 1;
    const id = randomUUID();
    // FUTURO (sem lote): a aprovacao e type-agnostica; usar FUTURO mantem o fixture
    // leve (sem montar Sample+SampleMovement) e satisfaz a CHECK
    // chk_sale_contract_type_lote (D147 — um MERCADO_A_VISTA exige sample_id+movement_id).
    await prisma.saleContract.create({
      data: {
        id,
        type: 'FUTURO',
        contractSeq: aprSeq,
        contractNumber: `${aprSeq}/99`,
        status,
        requiresApproval,
        contractDate: new Date('2026-07-01T00:00:00.000Z'),
        invoiceDate: invoiceDate ? new Date(`${invoiceDate}T00:00:00.000Z`) : null,
        sellerSnapshot: { displayName: 'Vendedor' },
        buyerSnapshot: { displayName: buyerName },
        quantitySacks: sacks,
        unitPrice: '2500.00',
        totalValue: '250000.00',
      },
    });
    return id;
  }

  async function mkApprovalLabel(contractId, createdAt) {
    const job = await prisma.customPrintJob.create({
      data: { status: 'PENDING', payload: { lines: [] } },
      select: { id: true },
    });
    await prisma.approvalLabelLog.create({
      data: {
        id: randomUUID(),
        saleContractId: contractId,
        customPrintJobId: job.id,
        payload: { lines: [] },
        ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
      },
    });
  }

  test('listApprovalContracts: estados/ordem/filtros/·N×/pendingCount', async () => {
    const c1 = await mkApprovalContract({ invoiceDate: '2026-07-10' }); // a_enviar
    const c2 = await mkApprovalContract({ invoiceDate: '2026-07-05' }); // a_enviar (mais cedo)
    const c3 = await mkApprovalContract({ invoiceDate: '2026-07-08' }); // enviada ·2×
    await mkApprovalLabel(c3, '2026-07-02T10:00:00.000Z');
    await mkApprovalLabel(c3, '2026-07-03T10:00:00.000Z');
    const c4 = await mkApprovalContract({ status: 'WASH_OUT' }); // cancelado
    await mkApprovalContract({ requiresApproval: false }); // nao-marcado -> fora da lista

    // Default 'a_enviar': so os pendentes, fila por invoiceDate ASC (c2 antes de c1).
    const aEnviar = await saleContractService.listApprovalContracts({}, adminActor);
    assert.deepEqual(
      aEnviar.items.map((i) => i.id),
      [c2, c1]
    );
    assert.ok(aEnviar.items.every((i) => i.state === 'a_enviar'));
    assert.equal(aEnviar.pendingCount, 2);

    // Enviadas: c3, state enviada, sendCount 2 (o "·N×", AP24).
    const enviadas = await saleContractService.listApprovalContracts(
      { filter: 'enviada' },
      adminActor
    );
    assert.deepEqual(
      enviadas.items.map((i) => i.id),
      [c3]
    );
    assert.equal(enviadas.items[0].state, 'enviada');
    assert.equal(enviadas.items[0].sendCount, 2);

    // Canceladas: c4 (WASH_OUT vence, mesmo sem/­com envio).
    const canceladas = await saleContractService.listApprovalContracts(
      { filter: 'cancelado' },
      adminActor
    );
    assert.deepEqual(
      canceladas.items.map((i) => i.id),
      [c4]
    );
    assert.equal(canceladas.items[0].state, 'cancelado');

    // Todas: os 4 marcados (nao o nao-marcado). pendingCount estavel = 2.
    const todas = await saleContractService.listApprovalContracts({ filter: 'todos' }, adminActor);
    assert.equal(todas.items.length, 4);
    assert.equal(todas.pendingCount, 2);
  });

  test('listApprovalContracts: busca por nº e por comprador (nao-sensivel)', async () => {
    const alpha = await mkApprovalContract({ invoiceDate: '2026-07-10', buyerName: 'Alpha Cafe' });
    await mkApprovalContract({ invoiceDate: '2026-07-11', buyerName: 'Beta Cafe' });

    const byBuyer = await saleContractService.listApprovalContracts(
      { search: 'alpha' },
      adminActor
    );
    assert.deepEqual(
      byBuyer.items.map((i) => i.id),
      [alpha]
    );

    const row = await prisma.saleContract.findUnique({
      where: { id: alpha },
      select: { contractNumber: true },
    });
    const byNum = await saleContractService.listApprovalContracts(
      { search: row.contractNumber },
      adminActor
    );
    assert.deepEqual(
      byNum.items.map((i) => i.id),
      [alpha]
    );
  });

  test('listApprovalContracts: paginacao keyset (limit 2) na fila a_enviar', async () => {
    const ids = [];
    for (let i = 0; i < 3; i++) {
      ids.push(await mkApprovalContract({ invoiceDate: `2026-07-0${i + 1}` }));
    }
    // Fila ASC por invoiceDate: 07-01/07-02/07-03 = ids[0]/ids[1]/ids[2].
    const page1 = await saleContractService.listApprovalContracts(
      { filter: 'a_enviar', limit: 2 },
      adminActor
    );
    assert.deepEqual(
      page1.items.map((i) => i.id),
      [ids[0], ids[1]]
    );
    assert.ok(page1.nextCursor);

    const page2 = await saleContractService.listApprovalContracts(
      { filter: 'a_enviar', limit: 2, cursor: page1.nextCursor },
      adminActor
    );
    assert.deepEqual(
      page2.items.map((i) => i.id),
      [ids[2]]
    );
    assert.equal(page2.nextCursor, null);
  });

  test('listApprovalContracts: papel operacional (REGISTRATION) tambem lista (AP10/AP30)', async () => {
    const c = await mkApprovalContract({ invoiceDate: '2026-07-10' });
    const reg = { ...commercialActor, role: 'REGISTRATION', actorUserId: randomUUID() };
    const res = await saleContractService.listApprovalContracts({}, reg);
    assert.deepEqual(
      res.items.map((i) => i.id),
      [c]
    );
  });

  // ---- Aprovacao: toggle rapido do sinal no Detalhes (AP23 + travas AP20, F5) -----
  const verOf = async (id) =>
    (await prisma.saleContract.findUnique({ where: { id }, select: { version: true } })).version;

  test('setSaleContractApprovalFlag: liga (lead 30) em EMITIDO; desmarcar é impossível (AP32)', async () => {
    const c = await mkApprovalContract({ requiresApproval: false });

    const on = await saleContractService.setSaleContractApprovalFlag(
      c,
      { requiresApproval: true, expectedVersion: await verOf(c) },
      adminActor
    );
    assert.equal(on.contract.requiresApproval, true);
    assert.equal(on.contract.approvalReminderLeadDays, 30); // lead PADRAO ao ligar

    // AP32: latch de mão única — Sim→Não é sempre 409, mesmo SEM envio.
    const vOn = await verOf(c);
    await assert.rejects(
      () =>
        saleContractService.setSaleContractApprovalFlag(
          c,
          { requiresApproval: false, expectedVersion: vOn },
          adminActor
        ),
      (err) => err.status === 409 && err.details?.code === 'APPROVAL_FLAG_LOCKED'
    );
  });

  test('setSaleContractApprovalFlag: Sim→Não trava também DEPOIS do envio (409 LOCKED, AP32)', async () => {
    const c = await mkApprovalContract({ requiresApproval: true });
    await mkApprovalLabel(c);
    const v = await verOf(c);
    await assert.rejects(
      () =>
        saleContractService.setSaleContractApprovalFlag(
          c,
          { requiresApproval: false, expectedVersion: v },
          adminActor
        ),
      (err) => err.status === 409 && err.details?.code === 'APPROVAL_FLAG_LOCKED'
    );
  });

  test('setSaleContractApprovalFlag: idempotente — re-solicitar já-Sim não reseta o lead (AP32)', async () => {
    const c = await mkApprovalContract({ requiresApproval: true });
    // Lead custom (simula um ajuste no "Editar"); a prisma.update NÃO bumpa version.
    await prisma.saleContract.update({
      where: { id: c },
      data: { approvalReminderLeadDays: 15 },
    });
    const res = await saleContractService.setSaleContractApprovalFlag(
      c,
      { requiresApproval: true, expectedVersion: await verOf(c) },
      adminActor
    );
    assert.equal(res.contract.requiresApproval, true);
    assert.equal(res.contract.approvalReminderLeadDays, 15); // preservado, NÃO resetou p/ 30
  });

  test('setSaleContractApprovalFlag: faturado congela — nem solicitar (409 NOT_EDITABLE)', async () => {
    const c = await mkApprovalContract({ requiresApproval: true, status: 'FATURADO' });
    const v = await verOf(c);
    await assert.rejects(
      () =>
        saleContractService.setSaleContractApprovalFlag(
          c,
          { requiresApproval: true, expectedVersion: v },
          adminActor
        ),
      (err) => err.status === 409 && err.details?.code === 'APPROVAL_FLAG_NOT_EDITABLE'
    );
  });

  test('emitSaleContract NÃO altera requiresApproval — o portão do faturar sobrevive (AP32/🔴)', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    // FUTURO marcado (Sim), sem etiqueta → portão AP18 ativo.
    const sim = await saleContractService.createFutureSaleContract(
      await createFutureInput(buyerId, { requiresApproval: true, approvalReminderLeadDays: 20 }),
      adminActor
    );
    // "Editar" (emit) tentando desmarcar: o payload pede Não, mas o latch preserva Sim.
    const edited = await saleContractService.emitSaleContract(
      sim.contract.id,
      etapa2Payload({
        bankAccountId: sim.contract.sellerBankAccountId,
        lookups: await fetchLookups(),
        expectedVersion: sim.contract.version,
        overrides: { requiresApproval: false },
      }),
      adminActor
    );
    assert.equal(edited.contract.requiresApproval, true); // preservado — NÃO virou Não

    // O portão AP18 do faturar segue exigindo etiqueta (não foi furado pelo Editar).
    await assert.rejects(
      () =>
        saleContractService.invoiceSaleContract(
          sim.contract.id,
          { expectedVersion: edited.contract.version, date: '2026-07-10' },
          adminActor
        ),
      (err) => err.status === 422 && err.details?.code === 'CONTRACT_APPROVAL_REQUIRED'
    );
  });

  test('listApprovalContracts: à vista washout NÃO entra no cancelado; futuro washout entra (AP33)', async () => {
    // Futuro washout marcado → aparece no G2 (cancelado).
    const futuroWashed = await mkApprovalContract({ status: 'WASH_OUT' });

    // À vista washout marcado → NÃO aparece (alinha ao Financeiro/D145).
    const { contractId, version } = await setupEmittableContract({ lotNumber: '25633' });
    await prisma.saleContract.update({
      where: { id: contractId },
      data: { requiresApproval: true },
    });
    await saleContractService.washoutSaleContract(
      contractId,
      { expectedVersion: version, reason: 'Caiu' },
      adminActor
    );

    const canceladas = await saleContractService.listApprovalContracts(
      { filter: 'cancelado' },
      adminActor
    );
    const ids = canceladas.items.map((item) => item.id);
    assert.ok(ids.includes(futuroWashed), 'futuro washout deve aparecer no cancelado');
    assert.ok(!ids.includes(contractId), 'à vista washout NÃO deve aparecer (AP33/D145)');
  });

  // AP31/DSB-D19: card de "Avisos" — aprovacao a enviar. Aparece enquanto marcado +
  // EMITIDO + sem etiqueta, dentro da janela (invoice_date <= hoje + lead) OU sem data
  // ("A definir", D144 — sempre avisa). Some quando a etiqueta e gerada.
  test('aprovação (DSB-D19): getDashboardAvisos — aparece/some/À definir/fora da janela', async () => {
    const dayOffset = (days) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const setLead = (id, days) =>
      prisma.saleContract.update({ where: { id }, data: { approvalReminderLeadDays: days } });

    // Dentro da janela (data futura + lead folgado) → aparece.
    const within = await mkApprovalContract({ invoiceDate: dayOffset(5), buyerName: 'Dentro' });
    await setLead(within, 30);
    // Faturamento ja passou sem etiqueta → aparece (dueInDays negativo).
    const overdue = await mkApprovalContract({ invoiceDate: dayOffset(-3), buyerName: 'Vencido' });
    // "A definir" (sem data) → SEMPRE aparece.
    const noDate = await mkApprovalContract({ invoiceDate: null, buyerName: 'Sem data' });
    // Marcado mas com etiqueta enviada → some.
    const sent = await mkApprovalContract({ invoiceDate: dayOffset(2), buyerName: 'Enviado' });
    await setLead(sent, 30);
    await mkApprovalLabel(sent);
    // Nao-marcado → fora.
    const unmarked = await mkApprovalContract({
      requiresApproval: false,
      invoiceDate: dayOffset(2),
    });
    // Faturado (status != EMITIDO) → fora.
    const invoiced = await mkApprovalContract({ status: 'FATURADO', invoiceDate: dayOffset(2) });
    await setLead(invoiced, 30);
    // Washout → fora.
    const washed = await mkApprovalContract({ status: 'WASH_OUT', invoiceDate: dayOffset(2) });
    // Alem da janela (data distante, lead 0 default) → fora.
    const beyond = await mkApprovalContract({ invoiceDate: dayOffset(100), buyerName: 'Longe' });

    const { items } = await saleContractService.getDashboardAvisos({}, adminActor);
    const ids = new Set(items.map((i) => i.contractId));

    assert.ok(ids.has(within), 'dentro da janela aparece');
    assert.ok(ids.has(overdue), 'vencido aparece');
    assert.ok(ids.has(noDate), '"À definir" aparece');
    assert.ok(!ids.has(sent), 'com etiqueta some');
    assert.ok(!ids.has(unmarked), 'não-marcado fora');
    assert.ok(!ids.has(invoiced), 'faturado fora');
    assert.ok(!ids.has(washed), 'washout fora');
    assert.ok(!ids.has(beyond), 'além da janela fora');

    const noDateItem = items.find((i) => i.contractId === noDate);
    assert.equal(noDateItem.dueInDays, null);
    assert.equal(noDateItem.kind, 'aprovacao_a_enviar');
    assert.equal(noDateItem.id, `aviso:${noDate}`);
    const overdueItem = items.find((i) => i.contractId === overdue);
    assert.ok(overdueItem.dueInDays < 0, 'vencido tem dueInDays negativo');
  });

  test('aprovação (AP16): getRecentApprovalSends devolve nº+comprador, exclui avulsas, ordena desc', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const c1 = (
      await saleContractService.createFutureSaleContract(
        await createFutureInput(buyerId),
        adminActor
      )
    ).contract;
    const c2 = (
      await saleContractService.createFutureSaleContract(
        await createFutureInput(buyerId),
        adminActor
      )
    ).contract;

    const newJobId = async () => (await prisma.customPrintJob.create({ data: { payload: {} } })).id;
    const logRow = async (saleContractId, createdAt) => ({
      id: randomUUID(),
      saleContractId,
      customPrintJobId: await newJobId(),
      payload: {},
      createdAt,
    });
    // c1 @ 08h, c2 @ 10h, e uma avulsa histórica (saleContractId null) @ 11h.
    await prisma.approvalLabelLog.create({
      data: await logRow(c1.id, new Date('2026-07-09T08:00:00.000Z')),
    });
    await prisma.approvalLabelLog.create({
      data: await logRow(c2.id, new Date('2026-07-09T10:00:00.000Z')),
    });
    await prisma.approvalLabelLog.create({
      data: await logRow(null, new Date('2026-07-09T11:00:00.000Z')),
    });

    const items = await saleContractService.getRecentApprovalSends();
    // Só os vinculados; ordenados por createdAt desc (c2 10h antes de c1 8h).
    const mine = items.filter(
      (i) => i.contractNumber === c1.contractNumber || i.contractNumber === c2.contractNumber
    );
    assert.equal(mine.length, 2);
    assert.equal(mine[0].contractNumber, c2.contractNumber);
    assert.equal(mine[1].contractNumber, c1.contractNumber);
    assert.equal(mine[0].kind, 'APPROVAL');
    assert.ok(mine[0].id.startsWith('approval:'));
    assert.ok(mine[0].buyer); // comprador do snapshot do contrato
    // A avulsa (saleContractId null) NÃO aparece — todos os itens têm contrato.
    assert.ok(items.every((i) => i.contractNumber != null));
  });

  test('futuro: numero continua a sequencia global (a vista + futuro)', async () => {
    await setupEmittableContract({ lotNumber: '24001' }); // 0001/AA (a vista)
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const res = await saleContractService.createFutureSaleContract(
      await createFutureInput(buyerId),
      adminActor
    );
    assert.equal(res.contract.contractNumber, `0002/${currentYear2}`);
  });

  test('futuro: nasce EMITIDO com vendedor e banco (etapa 2 no mesmo passo)', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const input = await createFutureInput(buyerId);

    const created = await saleContractService.createFutureSaleContract(input, adminActor);
    assert.equal(created.contract.status, 'EMITIDO');
    assert.equal(created.contract.type, 'FUTURO');
    assert.equal(created.contract.sellerClientId, input.sellerClientId);
    assert.ok(created.contract.sellerBankSnapshot);
  });

  test('futuro: washout marca WASH_OUT sem tocar em lote', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);

    const created = await saleContractService.createFutureSaleContract(
      await createFutureInput(buyerId),
      adminActor
    );
    const washed = await saleContractService.washoutSaleContract(
      created.contract.id,
      { expectedVersion: created.contract.version, reason: 'Negocio caiu' },
      adminActor
    );
    assert.equal(washed.contract.status, 'WASH_OUT');
    assert.equal(washed.contract.washoutReason, 'Negocio caiu');
    assert.ok(washed.contract.washoutAt);
    assert.equal((await prisma.sampleMovement.findMany()).length, 0);
  });

  test('futuro: COMMERCIAL cria para outros corretores sem se incluir (escopo aberto)', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const input = await createFutureInput(buyerId); // corretores = [TEST_BROKER], não o commercialActor
    // Escopo aberto: o COMMERCIAL não precisa mais se incluir como corretor.
    const created = await saleContractService.createFutureSaleContract(input, commercialActor);
    assert.ok(created.contract.id);
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
