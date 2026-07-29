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

  async function createSample({
    declaredOriginLot = null,
    isBlend = false,
    status = 'REGISTRATION_CONFIRMED',
    version = 0,
  } = {}) {
    const id = randomUUID();
    await prisma.sample.create({
      data: {
        id,
        status,
        version,
        isBlend,
        declaredOwner: 'Fazenda Teste',
        declaredSacks: 100,
        declaredOriginLot,
      },
    });
    return id;
  }

  // RC-D100: liga que CONSOME o lote dado. O componente e o que faz a edicao do
  // lote propagar pras ancestrais — e o que o prefill detecta pra travar.
  async function createBlendConsuming(originSampleId) {
    const blendId = await createSample({ isBlend: true, declaredOriginLot: 'PA-01' });
    await prisma.sampleBlendComponent.create({
      data: { id: randomUUID(), sampleId: blendId, originSampleId, contributedSacks: 50 },
    });
    return blendId;
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

  test('sendApprovalLabel: 409 APPROVAL_CONTRACT_NOT_ELIGIBLE para marcado FINALIZADO (AP21 apertou p/ so EMITIDO)', async () => {
    const contractId = await createContract({ status: 'FINALIZADO' });

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
    // Hifen NAO separa mais (faz parte do codigo): "1234-5678" fica inteiro.
    assert.deepEqual(response.body.lots, ['1234-5678', '91011', '121/3', '999']);
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

  // -------------------------------------------------------------------------
  // RC-D100: quando o campo "Lotes de origem" pode ser EDITADO no modal (e a
  // edicao cascatear pro cadastro do lote) e quando ele trava. As tres travas
  // do meio existem porque a escrita teria efeito ALEM deste lote.

  test('getApprovalLabelPrefill: lote comum -> editavel, com o alvo da cascata e a version do contrato', async () => {
    const sampleId = await createSample({ declaredOriginLot: 'PA-01 PA-02', version: 4 });
    const contractId = await createContract({ status: 'EMITIDO', sampleId });

    const response = await api.getApprovalLabelPrefill(buildInput({ params: { contractId } }));

    assert.equal(response.status, 200);
    assert.equal(response.body.originLot.editable, true);
    assert.equal(response.body.originLot.lockReason, null);
    assert.equal(response.body.originLot.sampleId, sampleId);
    assert.equal(response.body.originLot.sampleVersion, 4);
    const contract = await prisma.saleContract.findUnique({ where: { id: contractId } });
    assert.equal(response.body.contractVersion, contract.version);
  });

  test('getApprovalLabelPrefill: LIGA trava (editar fixaria a derivacao dela pra sempre)', async () => {
    // A liga TEM origem — a somatoria das origens dos componentes. O que ela
    // nao pode e receber a edicao daqui: o updateRegistration setaria
    // blendOriginLotPinned e ela pararia de re-derivar, em silencio.
    const blendId = await createSample({ isBlend: true, declaredOriginLot: 'PA-01, PA-02' });
    const contractId = await createContract({ status: 'EMITIDO', sampleId: blendId });

    const response = await api.getApprovalLabelPrefill(buildInput({ params: { contractId } }));

    assert.equal(response.status, 200);
    assert.equal(response.body.originLot.editable, false);
    assert.equal(response.body.originLot.lockReason, 'BLEND');
    assert.equal(response.body.originLot.sampleId, null);
    // A origem continua sendo EXIBIDA e impressa — travado nao e vazio.
    assert.deepEqual(response.body.lots, ['PA-01', 'PA-02']);
  });

  test('getApprovalLabelPrefill: COMPONENTE de liga trava (a edicao propagaria pras ancestrais)', async () => {
    const sampleId = await createSample({ declaredOriginLot: 'PA-07' });
    const contractId = await createContract({ status: 'EMITIDO', sampleId });
    // Antes de existir a liga, o mesmo lote e editavel: e a liga que trava.
    const before = await api.getApprovalLabelPrefill(buildInput({ params: { contractId } }));
    assert.equal(before.body.originLot.editable, true);

    await createBlendConsuming(sampleId);

    const after = await api.getApprovalLabelPrefill(buildInput({ params: { contractId } }));
    assert.equal(after.body.originLot.editable, false);
    assert.equal(after.body.originLot.lockReason, 'BLEND_COMPONENT');
    assert.equal(after.body.originLot.sampleVersion, null);
  });

  test('getApprovalLabelPrefill: Futuro -> NO_SAMPLE; lote fora de status -> SAMPLE_STATUS', async () => {
    const futuro = await createContract({ status: 'EMITIDO', type: 'FUTURO', sampleId: null });
    const futuroPrefill = await api.getApprovalLabelPrefill(
      buildInput({ params: { contractId: futuro } })
    );
    assert.equal(futuroPrefill.body.originLot.editable, false);
    assert.equal(futuroPrefill.body.originLot.lockReason, 'NO_SAMPLE');

    // Lote invalidado: o updateRegistration recusaria (assertSampleStatus), entao
    // o campo trava aqui em vez de deixar o "Imprimir" estourar um 409.
    const invalidId = await createSample({ status: 'INVALIDATED', declaredOriginLot: 'PA-09' });
    const invalidContract = await createContract({ status: 'EMITIDO', sampleId: invalidId });
    const invalidPrefill = await api.getApprovalLabelPrefill(
      buildInput({ params: { contractId: invalidContract } })
    );
    assert.equal(invalidPrefill.body.originLot.editable, false);
    assert.equal(invalidPrefill.body.originLot.lockReason, 'SAMPLE_STATUS');
  });

  test('getApprovalLabelPrefill: com 12 codigos, `lots` recorta em 7 + "+" mas `originLotText` traz TODOS', async () => {
    // 🔴 A razao de o modal editar sobre o TEXTO e nao sobre os chips: salvar de
    // volta o que `lots` mostra apagaria 5 lotes e gravaria um "+" literal no
    // cadastro. O round-trip so e seguro pelo originLotText.
    const twelve = Array.from({ length: 12 }, (_, i) => `L${i + 1}`).join(' ');
    const sampleId = await createSample({ declaredOriginLot: twelve });
    const contractId = await createContract({ status: 'EMITIDO', sampleId });

    const response = await api.getApprovalLabelPrefill(buildInput({ params: { contractId } }));

    assert.deepEqual(response.body.lots, ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', '+']);
    assert.equal(response.body.originLotText, twelve);
    assert.equal(response.body.originLot.editable, true);
  });

  test('sendApprovalLabel: a linha LOTE chega CRUA e o backend a recorta pro papel', async () => {
    // O modal manda o texto inteiro (o mesmo que foi pro cadastro); quem corta e
    // o splitOriginLotForLabel, a MESMA funcao do prefill — regra num lugar so.
    const contractId = await createContract({ status: 'EMITIDO' });
    const twelve = Array.from({ length: 12 }, (_, i) => `L${i + 1}`).join(', ');

    const response = await api.sendApprovalLabel(
      buildInput({ body: { saleContractId: contractId, lines: buildLines({ lotes: twelve }) } })
    );

    assert.equal(response.status, 201);
    const job = await prisma.customPrintJob.findFirst();
    const lotLine = job.payload.lines.find((line) => line.label === 'LOTE');
    assert.equal(lotLine.value, 'L1, L2, L3, L4, L5, L6, L7, +');
  });

  test('sendApprovalLabel: codigo acima de 16 chars e cortado, e o hifen NAO separa', async () => {
    const contractId = await createContract({ status: 'EMITIDO' });

    const response = await api.sendApprovalLabel(
      buildInput({
        body: {
          saleContractId: contractId,
          lines: buildLines({ lotes: `PA-01 ${'X'.repeat(20)}` }),
        },
      })
    );

    assert.equal(response.status, 201);
    const job = await prisma.customPrintJob.findFirst();
    const lotLine = job.payload.lines.find((line) => line.label === 'LOTE');
    assert.equal(lotLine.value, `PA-01, ${'X'.repeat(16)}`);
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
