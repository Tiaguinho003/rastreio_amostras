import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';
import { LocalAuthService } from '../src/auth/local-auth-service.js';
import { SampleQueryService } from '../src/samples/sample-query-service.js';

// Integracao da Aprovacao do contrato: seletor reduzido, prefill e envio auditado
// (approval_label_log + custom_print_job na MESMA tx). Reforma "o portao" (AP17/
// AP21): gerar exige o contrato MARCADO (requiresApproval) e elegibilidade so
// EMITIDO. Monta a API real (createBackendApiV1) com LocalAuthService em memoria —
// o gate "qualquer papel exceto PROSPECTOR" e o central do methodName/allowlist,
// entao os testes exercitam a autorizacao de verdade (CLASSIFIER passa,
// PROSPECTOR 403), nao um actor fake.

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('approval label integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const queryService = new SampleQueryService({ prisma });

  const adminId = randomUUID();
  const classifierId = randomUUID();
  const prospectorId = randomUUID();

  const authService = new LocalAuthService({
    secret: 'approval-label-integration-secret',
    allowPlaintextPasswords: true,
    users: [
      {
        id: adminId,
        username: 'apr-admin',
        password: 'admin123',
        role: 'ADMIN',
        displayName: 'Admin Aprovacao',
      },
      {
        id: classifierId,
        username: 'apr-classifier',
        password: 'classifier123',
        role: 'CLASSIFIER',
        displayName: 'Classificador Aprovacao',
      },
      {
        id: prospectorId,
        username: 'apr-prospector',
        password: 'prospector123',
        role: 'PROSPECTOR',
        displayName: 'Prospector Aprovacao',
      },
    ],
  });

  const api = createBackendApiV1({ authService, queryService });

  function headersFor(username, password) {
    return {
      authorization: `Bearer ${authService.login({ username, password }).accessToken}`,
      'x-forwarded-for': '127.0.0.1',
      'user-agent': 'node-test',
      'x-source': 'web',
    };
  }

  const adminHeaders = headersFor('apr-admin', 'admin123');
  const classifierHeaders = headersFor('apr-classifier', 'classifier123');
  const prospectorHeaders = headersFor('apr-prospector', 'prospector123');

  function buildInput({ headers = adminHeaders, params = {}, query = {}, body = {} } = {}) {
    return { headers, params, query, body };
  }

  // Linhas no formato do modal (5 campos + LOTE juntado por ", ").
  function buildLines(overrides = {}) {
    return [
      { label: 'N° COMPRA', value: overrides.compra ?? 'OC-123' },
      { label: 'N° FECHAMENTO', value: overrides.fechamento ?? '0001/99' },
      { label: 'PRODUT', value: overrides.produtor ?? 'Produtor Teste' },
      { label: 'ARMAZ', value: overrides.armazem ?? '' },
      { label: 'SACAS', value: overrides.sacas ?? '100' },
      { label: 'LOTE', value: overrides.lotes ?? '111, 222' },
    ];
  }

  // FK actor_user_id -> app_user: upsert dos atores (app_user nao e truncado
  // pelo resetDatabase, entao o upsert por id basta).
  async function seedUser(id, role, prefix) {
    const suffix = id.slice(0, 8);
    await prisma.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        fullName: `${prefix} ${suffix}`,
        username: `${prefix}-${suffix}`,
        usernameCanonical: `${prefix}-${suffix}`,
        email: `${prefix}-${suffix}@example.com`,
        emailCanonical: `${prefix}-${suffix}@example.com`,
        passwordHash: 'x',
        role,
      },
    });
  }

  // Contratos sinteticos direto no Prisma (SaleContract e CRUD sem trigger):
  // mais leve que a venda real e independente do dominio de amostras.
  let contractSeq = 900000;
  async function createContract({
    status = 'EMITIDO',
    sampleId = null,
    requiresApproval = true,
    ...overrides
  } = {}) {
    contractSeq += 1;
    const id = randomUUID();
    // D147 (CHECK chk_sale_contract_type_lote): MERCADO_A_VISTA exige sample_id +
    // movement_id; FUTURO exige ambos nulos. O helper nasce FUTURO (fixture leve,
    // type-agnostico — a aprovacao independe do tipo). Com `sampleId` (ou type
    // MERCADO_A_VISTA explicito) monta um a-vista VALIDO: cria o SampleMovement e
    // liga sample_id + movement_id.
    const spot = sampleId != null || overrides.type === 'MERCADO_A_VISTA';
    let movementId = null;
    if (spot) {
      if (sampleId == null) sampleId = await createSample();
      // SALE exige buyer_client_id (CHECK chk_sample_movement_type_fields): comprador
      // PF mínimo (só full_name; o resto NULL satisfaz chk_client_person_type_fields).
      const buyerId = randomUUID();
      await prisma.client.create({
        data: { id: buyerId, personType: 'PF', fullName: 'Comprador Teste', isBuyer: true },
      });
      movementId = randomUUID();
      await prisma.sampleMovement.create({
        data: {
          id: movementId,
          sampleId,
          movementType: 'SALE',
          buyerClientId: buyerId,
          quantitySacks: overrides.quantitySacks ?? 100,
          movementDate: new Date('2026-07-01T00:00:00.000Z'),
        },
      });
    }
    await prisma.saleContract.create({
      data: {
        id,
        type: spot ? 'MERCADO_A_VISTA' : 'FUTURO',
        contractSeq,
        contractNumber: `${contractSeq}/99`,
        status,
        // Reforma "o portao": a geracao exige o contrato MARCADO (AP17). O helper
        // nasce marcado por padrao (a maioria dos testes exercita o happy-path da
        // geracao); os testes do gate AP17 passam requiresApproval: false.
        requiresApproval,
        contractDate: new Date('2026-07-01T00:00:00.000Z'),
        purchaseNumber: overrides.purchaseNumber ?? null,
        sampleId: spot ? sampleId : null,
        movementId,
        sellerSnapshot: overrides.sellerSnapshot ?? { displayName: 'Vendedor Teste' },
        buyerSnapshot: overrides.buyerSnapshot ?? { displayName: 'Comprador Teste' },
        sellerWarehouseSnapshot: overrides.sellerWarehouseSnapshot ?? null,
        quantitySacks: overrides.quantitySacks ?? 100,
        unitPrice: '2500.00',
        totalValue: '250000.00',
      },
    });
    return id;
  }

  async function createSample({ declaredOriginLot = null } = {}) {
    const id = randomUUID();
    await prisma.sample.create({
      data: {
        id,
        status: 'REGISTRATION_CONFIRMED',
        declaredOwner: 'Fazenda Teste',
        declaredSacks: 100,
        declaredOriginLot,
      },
    });
    return id;
  }

  async function auditCounts() {
    const [logs, jobs] = await Promise.all([
      prisma.approvalLabelLog.count(),
      prisma.customPrintJob.count(),
    ]);
    return { logs, jobs };
  }

  test.before(async () => {
    await seedUser(adminId, 'ADMIN', 'apr-admin');
    await seedUser(classifierId, 'CLASSIFIER', 'apr-classifier');
    await seedUser(prospectorId, 'PROSPECTOR', 'apr-prospector');
  });

  test.beforeEach(async () => {
    // approval_label_log tem FK pra sale_contract/custom_print_job — truncar
    // ANTES (CASCADE cobre, mas a lista explicita deixa o reset auto-contido).
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE approval_label_log, custom_print_job, sale_contract_agio_log, sale_contract_export, sale_contract_broker, sale_contract, sample_movement, sample_event, sample RESTART IDENTITY CASCADE'
    );
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('sendApprovalLabel vinculado grava job + log na MESMA tx (ids casam, payloads identicos, ator preenchido)', async () => {
    const contractId = await createContract({ status: 'EMITIDO' });

    const response = await api.sendApprovalLabel(
      buildInput({ body: { saleContractId: contractId, lines: buildLines() } })
    );

    assert.equal(response.status, 201);
    assert.ok(response.body.id);
    assert.ok(response.body.customPrintJobId);

    const log = await prisma.approvalLabelLog.findUnique({ where: { id: response.body.id } });
    assert.ok(log);
    assert.equal(log.saleContractId, contractId);
    assert.equal(log.actorUserId, adminId);
    assert.equal(log.customPrintJobId, response.body.customPrintJobId);

    const job = await prisma.customPrintJob.findUnique({
      where: { id: response.body.customPrintJobId },
    });
    assert.ok(job);
    assert.equal(job.status, 'PENDING');
    // O payload auditado = o payload enfileirado (mesmas linhas normalizadas).
    assert.deepEqual(log.payload, job.payload);
    assert.equal(job.payload.lines.length, 6);
  });

  test('sendApprovalLabel: sem contrato agora e rejeitada (AP12) — 422 APPROVAL_CONTRACT_REQUIRED, nada gravado', async () => {
    const response = await api.sendApprovalLabel(
      buildInput({ headers: classifierHeaders, body: { lines: buildLines() } })
    );

    assert.equal(response.status, 422);
    assert.equal(response.body.error.details.code, 'APPROVAL_CONTRACT_REQUIRED');
    assert.deepEqual(await auditCounts(), { logs: 0, jobs: 0 });
  });

  test('sendApprovalLabel: um papel nao-COMMERCIAL (CLASSIFIER) envia COM contrato (201, log vinculado)', async () => {
    const contractId = await createContract({ status: 'EMITIDO' });

    const response = await api.sendApprovalLabel(
      buildInput({
        headers: classifierHeaders,
        body: { saleContractId: contractId, lines: buildLines() },
      })
    );

    assert.equal(response.status, 201);
    const log = await prisma.approvalLabelLog.findUnique({ where: { id: response.body.id } });
    assert.equal(log.saleContractId, contractId);
    assert.equal(log.actorUserId, classifierId);
  });

  test('sendApprovalLabel: 409 APPROVAL_CONTRACT_NOT_ELIGIBLE para WASH_OUT e nada e gravado', async () => {
    const contractId = await createContract({ status: 'WASH_OUT' });

    const response = await api.sendApprovalLabel(
      buildInput({ body: { saleContractId: contractId, lines: buildLines() } })
    );

    assert.equal(response.status, 409);
    assert.equal(response.body.error.details.code, 'APPROVAL_CONTRACT_NOT_ELIGIBLE');
    assert.deepEqual(await auditCounts(), { logs: 0, jobs: 0 });
  });

  test('sendApprovalLabel: 409 APPROVAL_CONTRACT_NOT_MARKED para contrato NAO marcado (AP17)', async () => {
    const contractId = await createContract({ status: 'EMITIDO', requiresApproval: false });

    const response = await api.sendApprovalLabel(
      buildInput({ body: { saleContractId: contractId, lines: buildLines() } })
    );

    assert.equal(response.status, 409);
    assert.equal(response.body.error.details.code, 'APPROVAL_CONTRACT_NOT_MARKED');
    assert.deepEqual(await auditCounts(), { logs: 0, jobs: 0 });
  });

  test('sendApprovalLabel: 409 APPROVAL_CONTRACT_NOT_ELIGIBLE para marcado FATURADO (AP21 apertou p/ so EMITIDO)', async () => {
    const contractId = await createContract({ status: 'FATURADO' });

    const response = await api.sendApprovalLabel(
      buildInput({ body: { saleContractId: contractId, lines: buildLines() } })
    );

    assert.equal(response.status, 409);
    assert.equal(response.body.error.details.code, 'APPROVAL_CONTRACT_NOT_ELIGIBLE');
    assert.deepEqual(await auditCounts(), { logs: 0, jobs: 0 });
  });

  test('sendApprovalLabel: 404 para contrato inexistente ou id malformado, nada gravado', async () => {
    const missing = await api.sendApprovalLabel(
      buildInput({ body: { saleContractId: randomUUID(), lines: buildLines() } })
    );
    assert.equal(missing.status, 404);

    const malformed = await api.sendApprovalLabel(
      buildInput({ body: { saleContractId: 'nao-e-uuid', lines: buildLines() } })
    );
    assert.equal(malformed.status, 404);

    assert.deepEqual(await auditCounts(), { logs: 0, jobs: 0 });
  });

  test('sendApprovalLabel: 422 APPROVAL_LABEL_EMPTY quando todas as linhas vem vazias', async () => {
    const emptyLines = buildLines({
      compra: '',
      fechamento: '',
      produtor: '',
      armazem: '',
      sacas: '',
      lotes: '',
    });

    // Com contrato VÁLIDO + linhas vazias: prova que o guard de linhas-vazias vem
    // ANTES do de contrato (AP12) — o código é APPROVAL_LABEL_EMPTY, não _REQUIRED.
    const contractId = await createContract({ status: 'EMITIDO' });
    const response = await api.sendApprovalLabel(
      buildInput({ body: { saleContractId: contractId, lines: emptyLines } })
    );

    assert.equal(response.status, 422);
    assert.equal(response.body.error.details.code, 'APPROVAL_LABEL_EMPTY');
    assert.deepEqual(await auditCounts(), { logs: 0, jobs: 0 });
  });

  test('PROSPECTOR recebe 403 nos 2 metodos (gate central por methodName)', async () => {
    const contractId = await createContract({ status: 'EMITIDO' });

    const prefill = await api.getApprovalLabelPrefill(
      buildInput({ headers: prospectorHeaders, params: { contractId } })
    );
    assert.equal(prefill.status, 403);

    const send = await api.sendApprovalLabel(
      buildInput({ headers: prospectorHeaders, body: { lines: buildLines() } })
    );
    assert.equal(send.status, 403);
  });

  test('getApprovalLabelPrefill: campo a campo com cortes 26/52, lotes quebrados e texto original', async () => {
    const sampleId = await createSample({ declaredOriginLot: '1234-5678 91011, 121/3; 999' });
    const contractId = await createContract({
      status: 'EMITIDO', // AP21: prefill so em EMITIDO (a quebra de campos independe do status)
      sampleId,
      purchaseNumber: 'C'.repeat(40),
      sellerSnapshot: { displayName: 'P'.repeat(60) },
      sellerWarehouseSnapshot: { displayName: 'W'.repeat(60) },
      quantitySacks: 250,
    });

    const response = await api.getApprovalLabelPrefill(
      buildInput({ headers: classifierHeaders, params: { contractId } })
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.fields.compra, 'C'.repeat(26));
    assert.equal(response.body.fields.produtor, 'P'.repeat(52));
    assert.equal(response.body.fields.armazem, 'W'.repeat(52));
    assert.equal(response.body.fields.sacas, '250');
    assert.deepEqual(response.body.lots, ['1234', '5678', '91011', '121/3', '999']);
    assert.equal(response.body.originLotText, '1234-5678 91011, 121/3; 999');
  });

  test('getApprovalLabelPrefill: Futuro sem amostra -> lots [] e originLotText null; armazem ausente vazio', async () => {
    const contractId = await createContract({
      status: 'EMITIDO',
      type: 'FUTURO',
      sampleId: null,
      sellerWarehouseSnapshot: null,
    });

    const response = await api.getApprovalLabelPrefill(buildInput({ params: { contractId } }));

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.lots, []);
    assert.equal(response.body.originLotText, null);
    assert.equal(response.body.fields.armazem, '');
    assert.equal(response.body.fields.compra, '');
  });

  test('getApprovalLabelPrefill: 409 WASH_OUT e 404 inexistente/malformado', async () => {
    const washout = await createContract({ status: 'WASH_OUT' });

    const conflicted = await api.getApprovalLabelPrefill(
      buildInput({ params: { contractId: washout } })
    );
    assert.equal(conflicted.status, 409);
    assert.equal(conflicted.body.error.details.code, 'APPROVAL_CONTRACT_NOT_ELIGIBLE');

    const missing = await api.getApprovalLabelPrefill(
      buildInput({ params: { contractId: randomUUID() } })
    );
    assert.equal(missing.status, 404);

    const malformed = await api.getApprovalLabelPrefill(
      buildInput({ params: { contractId: 'nao-e-uuid' } })
    );
    assert.equal(malformed.status, 404);
  });

  test('getApprovalLabelPrefill: 409 APPROVAL_CONTRACT_NOT_MARKED para contrato NAO marcado (AP17)', async () => {
    const contractId = await createContract({ status: 'EMITIDO', requiresApproval: false });

    const response = await api.getApprovalLabelPrefill(buildInput({ params: { contractId } }));

    assert.equal(response.status, 409);
    assert.equal(response.body.error.details.code, 'APPROVAL_CONTRACT_NOT_MARKED');
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
