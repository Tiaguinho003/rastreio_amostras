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
import { bizDay, calendarDay, dayKey } from './helpers/relative-dates.js';
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

  // `legalName` e opcional so pra RC-F6 (busca por nome da parte): os nomes
  // padrao sao iguais em todos os fixtures, entao um contrato so com nome
  // proprio prova que a busca casa a PARTE certa, e nao a lista inteira.
  async function createBuyerClient(id, legalName = 'Comprador PJ') {
    await prisma.client.create({
      data: {
        id,
        personType: 'PJ',
        legalName,
        cnpj: nextCnpj(),
        status: 'INACTIVE',
        isBuyer: true,
      },
    });
  }

  async function createSellerClient(id, legalName = 'Vendedor PJ') {
    await prisma.client.create({
      data: {
        id,
        personType: 'PJ',
        legalName,
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
    // fisica varia entre ambientes — local x CI). `orderBy` fixa a escolha.
    const [paymentForm, modality, packaging] = await Promise.all([
      prisma.contractPaymentForm.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { name: 'asc' },
      }),
      prisma.contractModality.findFirst({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
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
        // RC-D40: sem `sellerClientId` — o servidor deriva do dono do lote e
        // RECUSA o campo. O `sellerId` acima ainda serve pra achar a conta.
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

  // Faturamento (DSB-D11): getDashboardInvoiceEvents — feed do card de Eventos.
  // RC-D64: LEMBRETE PURO — só EMITIDO no invoiceDate, sempre 'previsto'. WASH_OUT
  // e FINALIZADO ficam fora (não têm o que lembrar); a janela filtra.
  test('getDashboardInvoiceEvents (RC-D64): EMITIDO no invoiceDate, sempre previsto; terminais fora', async () => {
    // Data ancorada em hoje: com data fixa o "agendado" viraria outra coisa quando
    // o dia passasse. Este feed agrupa no dia REAL (DSB-D18, sem roll de fim de
    // semana) → calendarDay.
    const schedDate = calendarDay(10);
    const emitido = await setupConfirmedContract({ lotNumber: '25060' });
    await prisma.saleContract.update({
      where: { id: emitido.contractId },
      data: { invoiceDate: schedDate },
    });

    // WASH_OUT não deve aparecer no feed.
    const washed = await setupEmittableContract({ lotNumber: '25061' });
    await saleContractService.washoutSaleContract(
      washed.contractId,
      { expectedVersion: washed.version, reason: 'Caiu' },
      adminActor
    );

    // FINALIZADO também não: o contrato não pede mais nada (RC-D62).
    // RC-D85: finalizar só existe a partir do faturamento, então a data vai para o
    // passado, o contrato é finalizado, e SÓ ENTÃO ela é movida para o dia do feed.
    // O que este teste afirma é que o FINALIZADO fica fora por STATUS — não por
    // estar fora da janela.
    const done = await setupConfirmedContract({ lotNumber: '25062' });
    await prisma.saleContract.update({
      where: { id: done.contractId },
      data: { invoiceDate: calendarDay(-1) },
    });
    await saleContractService.finalizeSaleContract(
      done.contractId,
      { expectedVersion: done.version },
      adminActor
    );
    await prisma.saleContract.update({
      where: { id: done.contractId },
      data: { invoiceDate: schedDate },
    });

    const res = await saleContractService.getDashboardInvoiceEvents(
      { from: '2026-07-01', to: dayKey(calendarDay(20)) },
      adminActor
    );

    const sched = (res[dayKey(schedDate)] ?? []).find((e) => e.contractId === emitido.contractId);
    assert.ok(sched, 'EMITIDO deve aparecer no invoiceDate');
    assert.equal(sched.typeKey, 'contract_invoice');
    assert.equal(sched.state, 'previsto');
    assert.ok(sched.label.startsWith('faturamento · '));
    assert.ok(sched.id.startsWith('invoice:')); // namespaced (não colide com pagamento)

    const all = Object.values(res).flat();
    assert.ok(!all.some((e) => e.contractId === washed.contractId), 'WASH_OUT fora do feed');
    assert.ok(!all.some((e) => e.contractId === done.contractId), 'FINALIZADO fora do feed');
  });

  // Embarque F5 (EMB28): portão do pagamento — não paga sem embarcar; após confirmar,
  // segue direto pro pagamento (a version não muda no confirm).
  // AP18 (F2 do portão): faturar exige a aprovação enviada. Contrato marcado sem
  // etiqueta trava no faturar (422); após enviar 1 etiqueta, libera (a version não
  // muda no envio, então o retry do modal segue com a mesma expectedVersion). Pagar
  // HERDA (E3) — não precisa de gate próprio.
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

  // RC-D72: o "Editar" mostra o lote num campo TRAVADO. O contrato guarda so o
  // sampleId, entao o NUMERO tem que sair da leitura do detalhe — senao a tela
  // diz "Lote" e nao diz qual.
  test('RC-D72 detalhe: contrato com lote devolve o numero dele; Futuro devolve null', async () => {
    const sampleId = randomUUID();
    const buyerId = randomUUID();
    await createClassifiedSample({ id: sampleId, lotNumber: '20777', declaredSacks: 10 });
    await createBuyerClient(buyerId);
    const sample = await queryService.requireSample(sampleId);
    const vista = await sell(sampleId, sample.version, buyerId);

    const detalheVista = await saleContractService.getSaleContract(vista.contract.id, adminActor);
    assert.equal(detalheVista.contract.sampleLotNumber, '20777');

    // Futuro nao tem lote: nao ha numero, e o campo nem chega a ser renderizado.
    const futuro = (
      await saleContractService.createFutureSaleContract(
        await createFutureInput(buyerId),
        adminActor
      )
    ).contract;
    const detalheFuturo = await saleContractService.getSaleContract(futuro.id, adminActor);
    assert.equal(detalheFuturo.contract.sampleLotNumber, null);
  });

  // =========================================================================
  // RC-F6: a lista de /contratos virou servidor-side. Antes o front baixava ate
  // 200 com query VAZIA e filtrava/buscava/contava em memoria.
  // =========================================================================

  test('RC-F6 lista: status e tipo sao MULTI e filtram no servidor', async () => {
    const emitido = await setupConfirmedContract({ lotNumber: '20120' });
    const finalizado = await setupConfirmedContract({ lotNumber: '20121' });
    await saleContractService.finalizeSaleContract(
      finalizado.contractId,
      { expectedVersion: finalizado.version },
      adminActor
    );
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const futuro = (
      await saleContractService.createFutureSaleContract(
        await createFutureInput(buyerId),
        adminActor
      )
    ).contract;

    const all = await saleContractService.listSaleContracts({}, adminActor);
    assert.equal(all.items.length, 3);
    assert.equal(all.total, 3);

    // Um valor so.
    const soFinalizado = await saleContractService.listSaleContracts(
      { status: 'FINALIZADO' },
      adminActor
    );
    assert.deepEqual(
      soFinalizado.items.map((i) => i.id),
      [finalizado.contractId]
    );
    assert.equal(soFinalizado.total, 1);

    // Multi por csv (como viaja na querystring) e por lista.
    const doisStatus = await saleContractService.listSaleContracts(
      { status: 'EMITIDO,FINALIZADO' },
      adminActor
    );
    assert.equal(doisStatus.items.length, 3); // o FUTURO tambem esta EMITIDO
    const porLista = await saleContractService.listSaleContracts(
      { status: ['EMITIDO', 'FINALIZADO'] },
      adminActor
    );
    assert.equal(porLista.items.length, 3);

    // Tipo recorta a vista x futuro.
    const soFuturo = await saleContractService.listSaleContracts({ type: 'FUTURO' }, adminActor);
    assert.deepEqual(
      soFuturo.items.map((i) => i.id),
      [futuro.id]
    );
    const soVista = await saleContractService.listSaleContracts(
      { type: 'MERCADO_A_VISTA' },
      adminActor
    );
    assert.equal(soVista.items.length, 2);
    assert.ok(soVista.items.every((i) => i.id !== futuro.id));

    // Combinar status + tipo intersecta (AND), nao soma.
    const combinado = await saleContractService.listSaleContracts(
      { status: 'EMITIDO', type: 'MERCADO_A_VISTA' },
      adminActor
    );
    assert.deepEqual(
      combinado.items.map((i) => i.id),
      [emitido.contractId]
    );

    // Valor invalido e 422 — ignorar em silencio devolveria a lista inteira.
    await assert.rejects(
      () => saleContractService.listSaleContracts({ status: 'QUITADO' }, adminActor),
      (err) => err.status === 422 && err.details?.field === 'status'
    );
  });

  test('RC-F6 lista: busca cobre nº do contrato, nº da compra E nomes das partes', async () => {
    // Ate a RC-F6 o servidor buscava nº do contrato + nº da compra e o navegador
    // buscava nº + nomes: campos DIFERENTES nos dois lados. Agora e a uniao.
    const alvo = await setupConfirmedContract({ lotNumber: '20130' });
    await setupConfirmedContract({ lotNumber: '20131' }); // ruido
    const detalhe = await saleContractService.getSaleContract(alvo.contractId, adminActor);

    // Nº do contrato.
    const porNumero = await saleContractService.listSaleContracts(
      { search: detalhe.contract.contractNumber },
      adminActor
    );
    assert.deepEqual(
      porNumero.items.map((i) => i.id),
      [alvo.contractId]
    );

    // Nomes das PARTES (snapshot JSON) — o caso que so existia no navegador. Os
    // fixtures padrao chamam todo mundo de "Comprador PJ"/"Vendedor PJ", entao um
    // contrato com as duas partes batizadas prova que a busca casa a parte certa.
    const compradorUnico = randomUUID();
    const vendedorUnico = randomUUID();
    await createBuyerClient(compradorUnico, 'Exportadora Zanzibar');
    await createSellerClient(vendedorUnico, 'Fazenda Kilimanjaro');
    const bancoDoVendedor = await createSellerBankAccount(vendedorUnico);
    const futuroInput = await createFutureInput(compradorUnico, {
      sellerClientId: vendedorUnico,
      sellerBankAccountId: bancoDoVendedor,
    });
    const doZanzibar = (await saleContractService.createFutureSaleContract(futuroInput, adminActor))
      .contract;

    const porComprador = await saleContractService.listSaleContracts(
      { search: 'zanzibar' }, // case-insensitive
      adminActor
    );
    assert.deepEqual(
      porComprador.items.map((i) => i.id),
      [doZanzibar.id]
    );
    assert.equal(porComprador.total, 1);

    // Nome do VENDEDOR (o outro lado do OR do snapshot).
    const porVendedor = await saleContractService.listSaleContracts(
      { search: 'kilimanjaro' },
      adminActor
    );
    assert.deepEqual(
      porVendedor.items.map((i) => i.id),
      [doZanzibar.id]
    );

    // E o nome padrao pega so os dois a vista — a busca discrimina a parte.
    const porNomePadrao = await saleContractService.listSaleContracts(
      { search: 'Vendedor PJ' },
      adminActor
    );
    assert.equal(porNomePadrao.items.length, 2);
    assert.ok(porNomePadrao.items.every((i) => i.id !== doZanzibar.id));

    // O ILIKE do snapshot escapa `%`/`_`: sem o escape, '%PJ' viraria curinga e
    // casaria "Comprador PJ"/"Vendedor PJ" nos tres contratos.
    const comCuringa = await saleContractService.listSaleContracts({ search: '%PJ' }, adminActor);
    assert.equal(comCuringa.items.length, 0);
    assert.equal(comCuringa.total, 0);
  });

  test('RC-F6 lista: filtra por comprador, vendedor e janela de periodo', async () => {
    const a = await setupConfirmedContract({ lotNumber: '20140' });
    const b = await setupConfirmedContract({ lotNumber: '20141' });

    // Partes: cada fixture cria comprador e vendedor proprios.
    const porComprador = await saleContractService.listSaleContracts(
      { buyerClientId: a.buyerId },
      adminActor
    );
    assert.deepEqual(
      porComprador.items.map((i) => i.id),
      [a.contractId]
    );
    const porVendedor = await saleContractService.listSaleContracts(
      { sellerClientId: b.sellerId },
      adminActor
    );
    assert.deepEqual(
      porVendedor.items.map((i) => i.id),
      [b.contractId]
    );

    // Periodo: a base escolhe a COLUNA. Os dois tem contractDate 2026-06-26;
    // so o `b` tem invoiceDate/paymentDate preenchidos pelo etapa2 do fixture.
    const porDataContrato = await saleContractService.listSaleContracts(
      { periodBase: 'contract', periodFrom: '2026-06-26', periodTo: '2026-06-26' },
      adminActor
    );
    assert.equal(porDataContrato.items.length, 2);

    const foraDaJanela = await saleContractService.listSaleContracts(
      { periodBase: 'contract', periodFrom: '2026-06-27', periodTo: '2026-12-31' },
      adminActor
    );
    assert.equal(foraDaJanela.items.length, 0);
    assert.equal(foraDaJanela.total, 0);

    // Janela invertida e 422 (silenciar devolveria zero sem explicar).
    await assert.rejects(
      () =>
        saleContractService.listSaleContracts(
          { periodFrom: '2026-08-31', periodTo: '2026-08-01' },
          adminActor
        ),
      (err) => err.status === 422 && err.details?.field === 'periodFrom'
    );
    await assert.rejects(
      () => saleContractService.listSaleContracts({ buyerClientId: 'nao-e-uuid' }, adminActor),
      (err) => err.status === 422 && err.details?.field === 'buyerClientId'
    );
  });

  test('RC-F6 lista: keyset por contractSeq nao repete nem pula, e total e do FILTRO', async () => {
    const criados = [];
    for (const lotNumber of ['20150', '20151', '20152', '20153', '20154']) {
      criados.push((await setupConfirmedContract({ lotNumber })).contractId);
    }

    // Pagina 1: ordem contractSeq desc (mais novo primeiro).
    const p1 = await saleContractService.listSaleContracts({ limit: 2 }, adminActor);
    assert.equal(p1.items.length, 2);
    assert.ok(p1.nextCursor, 'pagina cheia deve trazer cursor');
    // O total e do filtro inteiro, NAO da pagina — e o que a toolbar mostra.
    assert.equal(p1.total, 5);

    const p2 = await saleContractService.listSaleContracts(
      { limit: 2, cursor: p1.nextCursor },
      adminActor
    );
    assert.equal(p2.items.length, 2);
    assert.equal(p2.total, 5);

    const p3 = await saleContractService.listSaleContracts(
      { limit: 2, cursor: p2.nextCursor },
      adminActor
    );
    assert.equal(p3.items.length, 1);
    assert.equal(p3.nextCursor, null, 'ultima pagina nao tem proxima');

    // Sem repetir, sem pular e na ordem decrescente de seq.
    const paginado = [...p1.items, ...p2.items, ...p3.items].map((i) => i.id);
    assert.equal(new Set(paginado).size, 5);
    assert.deepEqual([...paginado].sort(), [...criados].sort());
    const seqs = [...p1.items, ...p2.items, ...p3.items].map((i) => i.contractSeq);
    assert.deepEqual(
      seqs,
      [...seqs].sort((x, y) => y - x)
    );

    // O cursor respeita o filtro: filtrando por tipo, o total acompanha.
    const soVista = await saleContractService.listSaleContracts(
      { type: 'MERCADO_A_VISTA', limit: 2 },
      adminActor
    );
    assert.equal(soVista.total, 5);

    // Cursor malformado cai na 1a pagina em vez de estourar.
    const lixo = await saleContractService.listSaleContracts(
      { limit: 2, cursor: 'abc' },
      adminActor
    );
    assert.deepEqual(
      lixo.items.map((i) => i.id),
      p1.items.map((i) => i.id)
    );
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

    // Finaliza o PRÓPRIO contrato (é corretor dele) -> ok.
    const mine = await setupConfirmedContractWithBroker({
      lotNumber: '20020',
      brokerId: myBrokerId,
    });
    const cur = await prisma.saleContract.findUnique({
      where: { id: mine.contractId },
      select: { version: true },
    });
    const finalized = await saleContractService.finalizeSaleContract(
      mine.contractId,
      { expectedVersion: cur.version },
      myActor
    );
    assert.equal(finalized.contract.status, 'FINALIZADO');

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

  test('aplicar agio fora de EMITIDO -> 409 (FINALIZADO)', async () => {
    // FINALIZADO: agio so vale em EMITIDO (reabrir devolve a possibilidade).
    const refs = await setupConfirmedContract({ lotNumber: '21103' });
    const finalized = await saleContractService.finalizeSaleContract(
      refs.contractId,
      { expectedVersion: refs.version },
      adminActor
    );
    await assert.rejects(
      () =>
        saleContractService.applyAgioSaleContract(
          refs.contractId,
          {
            expectedVersion: finalized.contract.version,
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

  test('guards: editar FINALIZADO -> 409 (so EMITIDO edita)', async () => {
    const refs = await setupConfirmedContract({ lotNumber: '21005' });
    const lookups = await fetchLookups();
    const finalized = await saleContractService.finalizeSaleContract(
      refs.contractId,
      { expectedVersion: refs.version },
      adminActor
    );
    await assert.rejects(
      () =>
        saleContractService.emitSaleContract(
          refs.contractId,
          etapa2Payload({
            bankAccountId: refs.bankAccountId,
            lookups,
            expectedVersion: finalized.contract.version,
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

  // RC-D37 (revoga a D48): o vendedor de um contrato COM lote e o dono do lote. O
  // `sellerClientId` do payload deixou de ser lido — editar o contrato nao
  // transfere mais o lote, e o vendedor gravado continua o dono.
  // RC-D40: o campo nao e mais ignorado em silencio — e RECUSADO. Aceitar-e-
  // descartar faria o chamador acreditar que trocou o vendedor.
  test('RC-D40: editar mandando outro vendedor recusa com 422 e nao toca o lote', async () => {
    const { contractId, sampleId } = await setupEmittableContract({ lotNumber: '21008' });
    const lookups = await fetchLookups();
    const ownerBefore = await prisma.sample.findUnique({
      where: { id: sampleId },
      select: { ownerClientId: true },
    });
    const bankAccountId = await createSellerBankAccount(ownerBefore.ownerClientId);
    const intruderId = randomUUID();
    await createSellerClient(intruderId);

    await assert.rejects(
      () =>
        saleContractService.emitSaleContract(
          contractId,
          etapa2Payload({
            bankAccountId,
            lookups,
            overrides: { sellerClientId: intruderId },
          }),
          adminActor
        ),
      (error) =>
        error.status === 422 &&
        error.details?.code === 'SELLER_DERIVED_FROM_SAMPLE' &&
        error.details?.field === 'sellerClientId'
    );

    const sample = await prisma.sample.findUnique({
      where: { id: sampleId },
      select: { ownerClientId: true },
    });
    assert.equal(sample.ownerClientId, ownerBefore.ownerClientId, 'o lote nao muda de dono');
    const { contract } = await saleContractService.getSaleContract(contractId, adminActor);
    assert.equal(contract.sellerClientId, ownerBefore.ownerClientId, 'o vendedor segue o do lote');
  });

  // O mesmo campo, na porta de criacao a vista.
  test('RC-D40: criar a vista mandando vendedor recusa com 422', async () => {
    const sampleId = randomUUID();
    const ownerId = randomUUID();
    const buyerId = randomUUID();
    await createSellerClient(ownerId);
    await createBuyerClient(buyerId);
    await createClassifiedSample({ id: sampleId, lotNumber: '21010', declaredSacks: 10 });
    await prisma.sample.update({ where: { id: sampleId }, data: { ownerClientId: ownerId } });
    const bankAccountId = await createSellerBankAccount(ownerId);
    const lookups = await fetchLookups();
    const intruderId = randomUUID();
    await createSellerClient(intruderId);

    const sample = await queryService.requireSample(sampleId);

    await assert.rejects(
      () =>
        saleContractService.createSpotSaleContract(
          {
            sampleId,
            expectedVersion: sample.version,
            buyerClientId: buyerId,
            ...saleFields(),
            ...etapa2Payload({ bankAccountId, lookups, overrides: { sellerClientId: intruderId } }),
          },
          adminActor
        ),
      (error) => error.status === 422 && error.details?.code === 'SELLER_DERIVED_FROM_SAMPLE'
    );

    // Nada foi criado — a recusa precede a transacao.
    assert.equal(await prisma.saleContract.count({ where: { sampleId } }), 0);
  });

  // A contraparte: trocar o dono NO LOTE e o caminho que muda o vendedor — e ele
  // vale na proxima emissao, sem ninguem tocar no contrato.
  test('RC-D37: trocar o dono do lote muda o vendedor do contrato na re-emissao', async () => {
    const { contractId, sampleId } = await setupEmittableContract({ lotNumber: '21009' });
    const lookups = await fetchLookups();
    const newOwnerId = randomUUID();
    await createSellerClient(newOwnerId);
    const newBankAccountId = await createSellerBankAccount(newOwnerId);

    const sampleBefore = await prisma.sample.findUnique({ where: { id: sampleId } });
    await commandService.updateRegistration(
      {
        sampleId,
        expectedVersion: sampleBefore.version,
        after: { ownerClientId: newOwnerId },
        reasonCode: 'DATA_FIX',
        reasonText: 'Troca de dono no lote',
      },
      adminActor
    );

    const updated = await saleContractService.emitSaleContract(
      contractId,
      etapa2Payload({ bankAccountId: newBankAccountId, lookups }),
      adminActor
    );

    assert.equal(updated.contract.sellerClientId, newOwnerId);
  });

  test('RC-D37: editar contrato à vista cujo lote é origem de liga não estoura 409 nem toca lote e liga', async () => {
    // Lote que alimenta uma liga E tem contrato à vista. Antes da D146 o
    // owner-sync estourava 409 BLEND_HARVEST_PROPAGATION_REQUIRED e quebrava o
    // Editar; a D146 resolveu auto-confirmando a propagação, e a RC-D36 tirou o
    // dono da propagação. A RC-D37 fecha o assunto: o Editar não escreve mais no
    // lote, então não há propagação a disparar nem dono a trocar — nem no lote
    // origem, nem na liga.
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
        ownerClientId: sellerAId,
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

    // Editar o contrato — NÃO deve lançar 409 de propagação de liga. (O
    // vendedor não entra no payload: RC-D40 o recusa em contrato com lote.)
    const sellerABank = await createSellerBankAccount(sellerAId);
    const lookups = await fetchLookups();
    const updated = await saleContractService.emitSaleContract(
      sale.contract.id,
      etapa2Payload({
        bankAccountId: sellerABank,
        lookups,
        expectedVersion: sale.contract.version,
      }),
      adminActor
    );

    // O lote origem NÃO trocou de dono (RC-D37 revogou a D48)…
    const originAfter = await prisma.sample.findUnique({
      where: { id: originId },
      select: { ownerClientId: true },
    });
    assert.equal(originAfter.ownerClientId, sellerAId);
    // …a liga também não…
    const blendAfter = await prisma.sample.findUnique({
      where: { id: blend.sample.id },
      select: { ownerClientId: true },
    });
    assert.equal(blendAfter.ownerClientId, sellerAId);
    // …e o vendedor emitido segue sendo o dono do lote.
    assert.equal(updated.contract.sellerClientId, sellerAId);
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

  // RC-D27/D28: a previa da emissao monta o contrato QUE SERIA emitido, sem
  // gravar nada. Os testes abaixo travam as tres propriedades que importam:
  // nao persiste, casa com o que a emissao produz, e cobre os tres modos.
  test('Previa (RC-D27): monta o contrato do formulario e NAO grava nada', async () => {
    const sellerId = randomUUID();
    await createSellerClient(sellerId);
    const bankAccountId = await createSellerBankAccount(sellerId);
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const lookups = await fetchLookups();
    const before = await prisma.saleContract.count();

    const preview = await saleContractService.previewSaleContract(
      {
        type: 'FUTURO',
        buyerClientId: buyerId,
        sellerClientId: sellerId,
        ...saleFields(),
        ...etapa2Payload({ bankAccountId, lookups }),
      },
      adminActor
    );

    // Nada de novo no banco: a previa e so leitura.
    assert.equal(await prisma.saleContract.count(), before);
    // Numero PROVISORIO — a alocacao real so acontece na tx sob advisory lock.
    assert.equal(preview.provisionalNumber, true);
    assert.match(preview.contract.contractNumber, /^\d{4}\/\d{2}$/);
    // Os campos da fase 1 entram; os da etapa 2 vem do _resolveEmitData.
    assert.equal(preview.contract.quantitySacks, 10);
    assert.equal(preview.contract.unitPrice, 100);
    // O dinheiro sai do computeContractMoneyWithAgio como string de 2 casas —
    // mesma forma que vai pro banco.
    assert.equal(Number(preview.contract.totalValue), 1000);
    assert.equal(Number(preview.contract.sellerBrokerageValue), 20);
    assert.equal(Number(preview.contract.buyerBrokerageValue), 10);
    assert.ok(preview.contract.sellerBankSnapshot);
    assert.ok(preview.contract.buyerSnapshot);

    // E o renderizador da emissao aceita a forma montada em memoria.
    const { buffer } = await saleContractPdfService.renderContractPdf(preview.contract, {
      lotNumber: null,
      issuer: getContractIssuer(),
    });
    assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  });

  test('Previa (RC-D28): os numeros batem com os do contrato realmente emitido', async () => {
    const { contractId, sampleId, sellerId, buyerId, bankAccountId } = await setupEmittableContract(
      { lotNumber: '21055' }
    );
    const lookups = await fetchLookups();

    // Mesma entrada que o "Editar" mandaria — sem `sellerClientId`, que a
    // RC-D40 recusa em contrato com lote (o vendedor sai do dono).
    const preview = await saleContractService.previewSaleContract(
      {
        contractId,
        buyerClientId: buyerId,
        saleFields: saleFields({ unitPrice: 120 }),
        ...etapa2Payload({ bankAccountId, lookups }),
      },
      adminActor
    );
    // No "Editar" o numero JA existe — nao e provisorio.
    assert.equal(preview.provisionalNumber, false);
    assert.equal(preview.sampleId, sampleId);

    const { contract } = await saleContractService.getSaleContract(contractId, adminActor);
    assert.equal(preview.contract.contractNumber, contract.contractNumber);

    // Emite de fato com a MESMA entrada e compara o dinheiro.
    const emitted = await saleContractService.emitSaleContract(
      contractId,
      {
        ...etapa2Payload({ bankAccountId, lookups, expectedVersion: contract.version }),
        buyerClientId: buyerId,
        saleFields: saleFields({ unitPrice: 120 }),
      },
      adminActor
    );
    assert.equal(Number(emitted.contract.totalValue), Number(preview.contract.totalValue));
    assert.equal(
      Number(emitted.contract.sellerBrokerageValue),
      Number(preview.contract.sellerBrokerageValue)
    );
    assert.equal(
      Number(emitted.contract.buyerBrokerageValue),
      Number(preview.contract.buyerBrokerageValue)
    );
  });

  test('Previa (RC-D27): a vista sem vendedor explicito cai no dono do lote', async () => {
    const { sampleId, sellerId, bankAccountId, buyerId } = await setupEmittableContract({
      lotNumber: '21056',
    });
    const lookups = await fetchLookups();

    const preview = await saleContractService.previewSaleContract(
      {
        type: 'MERCADO_A_VISTA',
        sampleId,
        buyerClientId: buyerId,
        ...saleFields(),
        ...etapa2Payload({ bankAccountId, lookups }),
      },
      adminActor
    );
    assert.equal(preview.contract.sellerClientId, sellerId);
    assert.equal(preview.sampleId, sampleId);
  });

  // RC-D40: o gêmeo do teste de emissão. A prévia é o documento que o usuário
  // confirma antes de emitir — ela tem que tratar o vendedor do payload
  // exatamente como a emissão trata, senão ele aprovaria um PDF com um vendedor
  // e emitiria outro.
  test('Previa (RC-D40): a vista com vendedor explicito recusa com 422', async () => {
    const { sampleId, bankAccountId, buyerId } = await setupEmittableContract({
      lotNumber: '21057',
    });
    const lookups = await fetchLookups();
    const intruderId = randomUUID();
    await createSellerClient(intruderId);

    await assert.rejects(
      () =>
        saleContractService.previewSaleContract(
          {
            type: 'MERCADO_A_VISTA',
            sampleId,
            buyerClientId: buyerId,
            ...saleFields(),
            ...etapa2Payload({ bankAccountId, lookups, overrides: { sellerClientId: intruderId } }),
          },
          adminActor
        ),
      (error) => error.status === 422 && error.details?.code === 'SELLER_DERIVED_FROM_SAMPLE'
    );
  });

  // E o caminho limpo: sem vendedor no payload, a prévia cai no dono do lote —
  // é o que garante que o PDF confirmado traz quem vai assinar.
  test('Previa (RC-D37): a vista sem vendedor no payload usa o dono do lote', async () => {
    const { sampleId, sellerId, bankAccountId, buyerId } = await setupEmittableContract({
      lotNumber: '21058',
    });
    const lookups = await fetchLookups();

    const preview = await saleContractService.previewSaleContract(
      {
        type: 'MERCADO_A_VISTA',
        sampleId,
        buyerClientId: buyerId,
        ...saleFields(),
        ...etapa2Payload({ bankAccountId, lookups }),
      },
      adminActor
    );
    assert.equal(preview.contract.sellerClientId, sellerId);
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
    assert.ok(res.items.every((i) => ['EMITIDO', 'FINALIZADO', 'WASH_OUT'].includes(i.status)));
  });

  test('Financeiro (escopo aberto): ADMIN vê TODOS os fechamentos, co-corretores visíveis', async () => {
    const { brokerId: myBrokerId } = await createCommercialBrokerUser('Corretor Fin');
    const mine = await setupConfirmedContractWithBroker({
      lotNumber: '23021',
      brokerId: myBrokerId,
    });
    const other = await setupConfirmedContract({ lotNumber: '23022' }); // corretor = TEST_BROKER

    // RC-D3: a carteira e ADMIN-only; o ESCOPO dentro dela segue aberto.
    const res = await saleContractService.listBrokerReceivables({}, adminActor);
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

  test('Financeiro (escopo aberto): ADMIN sem Broker vinculado vê TODOS os fechamentos', async () => {
    const { contractId } = await setupConfirmedContract({ lotNumber: '23023' });
    const orphan = { ...adminActor, actorUserId: randomUUID() };
    const res = await saleContractService.listBrokerReceivables({}, orphan);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].id, contractId);
    assert.equal(res.totalCommission, 30);
  });

  test('Financeiro (D136): total = corretagem total dos fechamentos (sem rateio)', async () => {
    const { brokerId: myBrokerId } = await createCommercialBrokerUser('Corretor Rateio');
    // contrato dividido entre ele e o TEST_BROKER: corretagem 30, 2 corretores (sem ÷N)
    const shared = await setupContractWithBrokers({
      lotNumber: '23024',
      brokerIds: [myBrokerId, TEST_BROKER_ID],
    });
    const res = await saleContractService.listBrokerReceivables({}, adminActor);
    const item = res.items.find((i) => i.id === shared.contractId);
    assert.ok(item);
    assert.equal(item.commissionTotal, 30); // corretagem cheia do contrato (2 lados)
    assert.equal(item.brokers.length, 2); // co-corretores visíveis (só nomes)
    assert.equal(item.brokers[0].share, undefined); // D136: sem valor por corretor
    assert.equal(res.totalCommission, 30); // corretagem TOTAL dos fechamentos dele (NÃO ÷N)
  });

  test('Financeiro (escopo aberto): busca por corretor acha contratos de todos', async () => {
    const { brokerId: myBrokerId } = await createCommercialBrokerUser('Corretor Busca');
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

    // Escopo aberto: busca "mariana" → acha o contrato dela.
    const res = await saleContractService.listBrokerReceivables({ search: 'mariana' }, adminActor);
    assert.ok(res.items.some((i) => i.id === alheio.contractId));
  });

  test('Financeiro (RC-D3): só ADMIN acessa a carteira; demais não-PROSPECTOR → 403', async () => {
    assert.ok(
      Array.isArray((await saleContractService.listBrokerReceivables({}, adminActor)).items)
    );
    // A carteira consolidada saiu do acesso unificado (RC-D3). O dinheiro em si
    // NAO ficou reservado: o detalhe do contrato segue devolvendo valores e
    // corretagem pra todos (RC-D4) — o gate e de rota, nao de campo.
    for (const role of ['COMMERCIAL', 'REGISTRATION', 'CLASSIFIER', 'CADASTRO', 'PROSPECTOR']) {
      const actor = { ...commercialActor, role, actorUserId: randomUUID() };
      await assert.rejects(
        () => saleContractService.listBrokerReceivables({}, actor),
        /not allowed/,
        `${role} nao deve acessar a carteira`
      );
    }
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

  test('Financeiro (FN1/FN4/FN6): ordem vencido→a_vencer→recebida→cancelado + chips + N vencidos', async () => {
    const venc = await setupConfirmedContract({ lotNumber: '26010' });
    const aVenc = await setupConfirmedContract({ lotNumber: '26011' });
    // RC-D67: 'recebida' vem do CONTRATO estar FINALIZADO — o /financeiro não tem
    // ação própria, então a corretagem sai da fila em /contratos.
    const recebida = await setupConfirmedContract({ lotNumber: '26012' });
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
      where: { id: recebida.contractId },
      data: { status: 'FINALIZADO' },
    });
    await prisma.saleContract.update({
      where: { id: canc.contractId },
      data: { status: 'WASH_OUT' },
    });

    const res = await saleContractService.listBrokerReceivables({}, adminActor);
    assert.deepEqual(
      res.items.map((i) => i.id),
      [venc.contractId, aVenc.contractId, recebida.contractId, canc.contractId]
    );
    const byId = Object.fromEntries(res.items.map((i) => [i.id, i]));
    assert.equal(byId[venc.contractId].paymentState, 'vencido');
    assert.equal(byId[aVenc.contractId].paymentState, 'a_vencer');
    assert.equal(byId[recebida.contractId].paymentState, 'recebida');
    assert.equal(byId[canc.contractId].paymentState, 'cancelado');
    // FN6: 1 vencido, corretagem 30 (2% + 1% de 1000)
    assert.equal(res.overdueCount, 1);
    assert.equal(res.overdueCommission, 30);
  });

  test('Financeiro (FN5): filtros por estado, independentes do cabeçalho', async () => {
    const venc = await setupConfirmedContract({ lotNumber: '26020' });
    const aVenc = await setupConfirmedContract({ lotNumber: '26021' });
    const recebida = await setupConfirmedContract({ lotNumber: '26022' });
    await prisma.saleContract.update({
      where: { id: venc.contractId },
      data: { paymentDate: new Date('2000-01-01T00:00:00.000Z') },
    });
    await prisma.saleContract.update({
      where: { id: aVenc.contractId },
      data: { paymentDate: new Date('2100-01-01T00:00:00.000Z') },
    });
    await prisma.saleContract.update({
      where: { id: recebida.contractId },
      data: { status: 'FINALIZADO' },
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
    const recebidas = await saleContractService.listBrokerReceivables(
      { filter: 'recebida' },
      adminActor
    );
    assert.deepEqual(
      recebidas.items.map((i) => i.id),
      [recebida.contractId]
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

  test('Financeiro (FN4): paginação keyset atravessa os grupos (a receber → recebida)', async () => {
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
      data: { status: 'FINALIZADO' },
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

  // F1 (E21-E27/D138): getDashboardPaymentEvents — feed do card de Eventos.
  test('Eventos (D138): ADMIN vê agendado no paymentDate; janela filtra; WASH_OUT fora', async () => {
    const emitido = await setupConfirmedContract({ lotNumber: '25010' }); // paymentDate 2026-07-20
    const washed = await setupEmittableContract({ lotNumber: '25011' });
    await saleContractService.washoutSaleContract(
      washed.contractId,
      { expectedVersion: washed.version, reason: 'Caiu' },
      adminActor
    );

    // O paymentDate 2026-07-20 do fixture já passou no relógio real, e um
    // vencimento vencido vira 'atrasado' (E29). Ancora os dois contratos no
    // futuro — o que este teste prova é o AGENDADO. Feed agrupa no dia REAL
    // (DSB-D18, sem roll de fim de semana) → calendarDay.
    const dueDate = calendarDay(10);
    await prisma.saleContract.updateMany({
      where: { id: { in: [emitido.contractId, washed.contractId] } },
      data: { paymentDate: dueDate },
    });

    // janela cobrindo o vencimento → o EMITIDO aparece como agendado; o WASH_OUT não.
    const inWindow = await saleContractService.getDashboardPaymentEvents(
      { from: dayKey(calendarDay(3)), to: dayKey(calendarDay(16)) },
      adminActor
    );
    const day = inWindow[dayKey(dueDate)] ?? [];
    const ev = day.find((e) => e.contractId === emitido.contractId);
    assert.ok(ev, 'contrato EMITIDO deve aparecer como agendado no paymentDate');
    assert.equal(ev.typeKey, 'contract_payment_due');
    assert.equal(ev.status, 'EMITIDO');
    assert.ok(!day.some((e) => e.contractId === washed.contractId), 'WASH_OUT fora do feed');

    // janela depois do vencimento → o contrato não aparece (filtro de data).
    const outWindow = await saleContractService.getDashboardPaymentEvents(
      { from: dayKey(calendarDay(30)), to: dayKey(calendarDay(44)) },
      adminActor
    );
    assert.ok(
      !(outWindow[dayKey(dueDate)] ?? []).some((e) => e.contractId === emitido.contractId),
      'fora da janela não aparece'
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
    // só o PROSPECTOR → 403 (gate PAYMENT_FEED_ROLES = NON_PROSPECTOR_ROLES —
    // RC-D5: o feed do calendário NÃO acompanhou a carteira pro ADMIN-only).
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

  // ── Fase J (D123–D125): auditoria de marcos + espelho + timeline ──

  // RC-D63: finalizar VOLTA. O log acumula as duas pontas e é a ÚNICA fonte de
  // "quem e quando" — por isso o marco não ganhou coluna no contrato: na segunda
  // passada a coluna estaria mentindo sobre a primeira.
  test('Fase J/RC-D63: finalizar → reabrir → finalizar acumula 3 marcos com ator', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '24101' });
    const fin1 = await saleContractService.finalizeSaleContract(
      contractId,
      { expectedVersion: version },
      adminActor
    );
    assert.equal(fin1.contract.status, 'FINALIZADO');
    const reopened = await saleContractService.reopenSaleContract(
      contractId,
      { expectedVersion: fin1.contract.version },
      adminActor
    );
    assert.equal(reopened.contract.status, 'EMITIDO');
    const fin2 = await saleContractService.finalizeSaleContract(
      contractId,
      { expectedVersion: reopened.contract.version },
      adminActor
    );
    assert.equal(fin2.contract.status, 'FINALIZADO');

    const logs = await prisma.saleContractStatusLog.findMany({
      where: { saleContractId: contractId },
      orderBy: { createdAt: 'asc' },
    });
    assert.deepEqual(
      logs.map((l) => l.toStatus),
      ['FINALIZADO', 'EMITIDO', 'FINALIZADO']
    );
    assert.ok(logs.every((l) => l.actorUserId === adminActor.actorUserId));
  });

  test('RC-D62: finalizar só de EMITIDO e reabrir só de FINALIZADO (409 no resto)', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '24110' });
    // Reabrir um contrato em andamento não faz sentido.
    await assert.rejects(
      () =>
        saleContractService.reopenSaleContract(
          contractId,
          { expectedVersion: version },
          adminActor
        ),
      (err) => err.status === 409 && err.details?.code === 'SALE_CONTRACT_NOT_REOPENABLE'
    );
    const fin = await saleContractService.finalizeSaleContract(
      contractId,
      { expectedVersion: version },
      adminActor
    );
    // Finalizar duas vezes, idem.
    await assert.rejects(
      () =>
        saleContractService.finalizeSaleContract(
          contractId,
          { expectedVersion: fin.contract.version },
          adminActor
        ),
      (err) => err.status === 409 && err.details?.code === 'SALE_CONTRACT_NOT_FINALIZABLE'
    );
  });

  test('RC-D62: finalizar com version stale -> 409 e nada muda', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '24111' });
    await assert.rejects(
      () =>
        saleContractService.finalizeSaleContract(
          contractId,
          { expectedVersion: version + 5 },
          adminActor
        ),
      (err) => err.status === 409 && err.details?.code === 'SALE_CONTRACT_VERSION_CONFLICT'
    );
    const after = await saleContractService.getSaleContract(contractId, adminActor);
    assert.equal(after.contract.status, 'EMITIDO');
    const logs = await prisma.saleContractStatusLog.findMany({
      where: { saleContractId: contractId },
    });
    assert.equal(logs.length, 0);
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
    await saleContractService.finalizeSaleContract(
      contractId,
      { expectedVersion: version },
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
    assert.equal(mark.toStatus, 'FINALIZADO');
    assert.equal(mark.legacy, false);
    assert.equal(mark.actorName, `Admin ${adminActor.actorUserId.slice(0, 8)}`);
    assert.equal(timeline.items.find((item) => item.kind === 'ESPELHO').side, 'buyer');

    // RC-D62: o fallback legado so-com-data sobrou no WASHOUT — os marcos de
    // faturar/pagar, que tinham data propria, morreram com eles.
    await prisma.saleContractStatusLog.deleteMany({ where: { saleContractId: contractId } });
    const semLog = await saleContractService.getSaleContractTimeline(contractId, adminActor);
    assert.ok(!semLog.items.some((item) => item.kind === 'STATUS'));
  });

  test('Fase J: timeline acessível ao COMMERCIAL sem vínculo (escopo aberto)', async () => {
    const { contractId } = await setupConfirmedContract({ lotNumber: '24105' });
    const stranger = { ...commercialActor, actorUserId: randomUUID() };
    const timeline = await saleContractService.getSaleContractTimeline(contractId, stranger);
    assert.ok(Array.isArray(timeline.items), 'COMMERCIAL sem vínculo acessa o timeline');
  });

  test('finalizar: COMMERCIAL finaliza qualquer contrato (escopo aberto)', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '22011' });
    const res = await saleContractService.finalizeSaleContract(
      contractId,
      { expectedVersion: version },
      commercialActor
    );
    assert.equal(res.contract.status, 'FINALIZADO');
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

  test('quebra manual: a partir de FINALIZADO -> WASH_OUT', async () => {
    const { contractId, version } = await setupConfirmedContract({ lotNumber: '23002' });
    const fin = await saleContractService.finalizeSaleContract(
      contractId,
      { expectedVersion: version },
      adminActor
    );
    const r = await saleContractService.washoutSaleContract(
      contractId,
      { expectedVersion: fin.contract.version, reason: 'Quebra apos finalizar' },
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

  test('lote: cancelar a venda de contrato FINALIZADO -> WASH_OUT (extensao)', async () => {
    const { contractId, sampleId, version } = await setupConfirmedContract({ lotNumber: '23010' });
    await saleContractService.finalizeSaleContract(
      contractId,
      { expectedVersion: version },
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

  // ⚠️ RC-D86 REVOGOU a parte do D144 que este teste guardava: "à definir" era
  // finalizavel direto. Nao e mais — sem data de faturamento nao houve nota, logo
  // nao ha pagamento a declarar. O RC-D63 segue de pe: finalizar nao PEDE data
  // nenhuma ao operador; ele so exige que a planejada exista e ja tenha chegado.
  test('RC-D86: planejada "à definir" NAO finaliza; a saida e por a data', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const created = await saleContractService.createFutureSaleContract(
      await createFutureInput(buyerId, { invoiceDate: null, paymentDate: null }),
      adminActor
    );
    // RC-D68: sem data nenhuma, a agenda diz que nao ha compromisso.
    assert.equal(created.contract.agenda?.kind, 'nenhum');
    await assert.rejects(
      saleContractService.finalizeSaleContract(
        created.contract.id,
        { expectedVersion: created.contract.version },
        adminActor
      ),
      (error) =>
        error.status === 409 && error.details?.code === 'SALE_CONTRACT_INVOICE_DATE_MISSING'
    );
    // O contrato nao foi tocado — nem status nem version.
    const untouched = await saleContractService.getSaleContract(created.contract.id, adminActor);
    assert.equal(untouched.contract.status, 'EMITIDO');
    assert.equal(untouched.contract.version, created.contract.version);
  });

  test('RC-D85: antes da data de faturamento nao finaliza; a partir dela sim', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    const created = await saleContractService.createFutureSaleContract(
      await createFutureInput(buyerId, { invoiceDate: null, paymentDate: null }),
      adminActor
    );

    // Datas RELATIVAS (helper): a asserta e sobre futuro/passado, nao sobre a data.
    // Offsets folgados (+2/-1) porque o servidor corta em BRT e o helper em UTC —
    // 3h de diferenca derrubariam um teste ancorado exatamente em hoje. O corte no
    // PROPRIO dia (o "a partir de" inclusivo) esta coberto no teste unitario, que
    // passa o `todayKey` na mao.
    await prisma.saleContract.update({
      where: { id: created.contract.id },
      data: { invoiceDate: calendarDay(2) },
    });
    await assert.rejects(
      saleContractService.finalizeSaleContract(
        created.contract.id,
        { expectedVersion: created.contract.version },
        adminActor
      ),
      (error) => error.status === 409 && error.details?.code === 'SALE_CONTRACT_BEFORE_INVOICE_DATE'
    );

    await prisma.saleContract.update({
      where: { id: created.contract.id },
      data: { invoiceDate: calendarDay(-1) },
    });
    const finalized = await saleContractService.finalizeSaleContract(
      created.contract.id,
      { expectedVersion: created.contract.version },
      adminActor
    );
    assert.equal(finalized.contract.status, 'FINALIZADO');
    assert.equal(finalized.contract.agenda?.kind, 'finalizado');
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

  test('setSaleContractApprovalFlag: finalizado congela — nem solicitar (409 NOT_EDITABLE)', async () => {
    const c = await mkApprovalContract({ requiresApproval: true, status: 'FINALIZADO' });
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

  // RC-D66: o portão AP18 morreu — a aprovação não trava mais nada. Mas o LATCH
  // continua: um contrato que virou "Sim" não volta pra "Não" nem pelo Editar, e é
  // ele que mantém o aviso de pé (o card de Avisos e a agenda RC-D68 leem daí).
  test('emitSaleContract NÃO altera requiresApproval — o latch sobrevive ao Editar (AP32/🔴)', async () => {
    const buyerId = randomUUID();
    await createBuyerClient(buyerId);
    // FUTURO marcado (Sim), sem etiqueta.
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

    // RC-D66: sem etiqueta, finalizar PASSA — a aprovação avisa, não trava. E o
    // aviso continua de pé enquanto ninguém gerou etiqueta (RC-D68).
    assert.equal(edited.contract.agenda?.kind, 'aprovacao');
    const finalized = await saleContractService.finalizeSaleContract(
      sim.contract.id,
      { expectedVersion: edited.contract.version },
      adminActor
    );
    assert.equal(finalized.contract.status, 'FINALIZADO');
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
    // Finalizado (status != EMITIDO) → fora.
    const finalizado = await mkApprovalContract({
      status: 'FINALIZADO',
      invoiceDate: dayOffset(2),
    });
    await setLead(finalizado, 30);
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
    assert.ok(!ids.has(finalizado), 'finalizado fora');
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
