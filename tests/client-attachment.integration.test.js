import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

import { ClientAttachmentService } from '../src/clients/client-attachment-service.js';
import { LocalUploadService } from '../src/uploads/local-upload-service.js';

// Vinculo anexo -> filial contra o banco real. Os testes unitarios usam um
// prisma fake, entao NAO cobrem o select aninhado da unit, a FK nem a coluna
// da migration -- que e justamente o que este arquivo exercita.

// PDF minimo valido (magic bytes %PDF) pro LocalUploadService aceitar.
const TINY_PDF = Buffer.from('255044462d312e340a25454f460a', 'hex');

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('client attachment integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const TEST_USER_ID = '00000000-0000-0000-0000-0000000009a1';
  let uploadsDir;
  let service;

  // uploadedByUserId tem FK pra app_user: o ator precisa existir de verdade.
  const actor = {
    actorType: 'USER',
    actorUserId: TEST_USER_ID,
    role: 'CADASTRO',
    source: 'web',
    requestId: 'req-attachment-integration',
  };

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_attachment, client_audit_event, client_unit, client RESTART IDENTITY CASCADE'
    );
  }

  async function ensureTestUser() {
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: {},
      create: {
        id: TEST_USER_ID,
        fullName: 'Test Anexo',
        username: 'test-anexo-integration',
        usernameCanonical: 'test-anexo-integration',
        email: 'test-anexo-integration@test.local',
        emailCanonical: 'test-anexo-integration@test.local',
        passwordHash: 'x',
        role: 'CADASTRO',
        status: 'ACTIVE',
      },
    });
  }

  // Cria o cliente PF direto no Prisma (sem o ClientService) -- aqui interessa
  // so a topologia client -> unit -> attachment.
  async function createPfClientWithUnits() {
    const clientId = randomUUID();
    await prisma.client.create({
      // chk_client_role_flags exige ao menos um papel marcado.
      data: {
        id: clientId,
        personType: 'PF',
        fullName: 'Produtor Teste',
        cpf: randomCpf(),
        isSeller: true,
      },
    });
    const activeUnit = await prisma.clientUnit.create({
      data: { id: randomUUID(), clientId, name: 'Fazenda Santa Rita', code: 1, status: 'ACTIVE' },
    });
    const inactiveUnit = await prisma.clientUnit.create({
      data: { id: randomUUID(), clientId, name: 'Fazenda Boa Vista', code: 2, status: 'INACTIVE' },
    });
    return { clientId, activeUnit, inactiveUnit };
  }

  async function uploadAttachment(clientId) {
    const { attachment } = await service.addClientAttachment(
      clientId,
      { fileBuffer: TINY_PDF, originalFileName: 'contrato.pdf' },
      actor
    );
    return attachment;
  }

  test.before(async () => {
    await prisma.$connect();
    await resetDatabase();
    await ensureTestUser();
    uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'client-attachment-it-'));
    service = new ClientAttachmentService({
      prisma,
      uploadService: new LocalUploadService({ baseDir: uploadsDir }),
    });
  });

  test.beforeEach(resetDatabase);

  test.after(async () => {
    await resetDatabase();
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.$disconnect();
    await fs.rm(uploadsDir, { recursive: true, force: true });
  });

  test('anexo nasce sem filial e a listagem devolve unit null', async () => {
    const { clientId } = await createPfClientWithUnits();
    const attachment = await uploadAttachment(clientId);

    assert.equal(attachment.unitId, null);
    assert.equal(attachment.unit, null);

    const { items } = await service.listClientAttachments(clientId, actor);
    assert.equal(items.length, 1);
    assert.equal(items[0].unit, null);
  });

  test('vincula a filial ativa: persiste e a listagem traz id/nome/status', async () => {
    const { clientId, activeUnit } = await createPfClientWithUnits();
    const attachment = await uploadAttachment(clientId);

    const linked = await service.linkClientAttachmentUnit(
      clientId,
      attachment.id,
      { unitId: activeUnit.id },
      actor
    );
    assert.equal(linked.attachment.unitId, activeUnit.id);
    assert.deepEqual(linked.attachment.unit, {
      id: activeUnit.id,
      name: 'Fazenda Santa Rita',
      status: 'ACTIVE',
    });

    // A coluna foi mesmo gravada (nao so a view montada em memoria).
    const row = await prisma.clientAttachment.findUnique({ where: { id: attachment.id } });
    assert.equal(row.unitId, activeUnit.id);

    const { items } = await service.listClientAttachments(clientId, actor);
    assert.deepEqual(items[0].unit, {
      id: activeUnit.id,
      name: 'Fazenda Santa Rita',
      status: 'ACTIVE',
    });
    // O vinculo nao move o arquivo.
    assert.equal(row.storagePath.startsWith(`clients/${clientId}/attachments/`), true);
  });

  test('o vinculo e definitivo: revincular vira 409 e nao altera a linha', async () => {
    const { clientId, activeUnit } = await createPfClientWithUnits();
    const attachment = await uploadAttachment(clientId);
    await service.linkClientAttachmentUnit(
      clientId,
      attachment.id,
      { unitId: activeUnit.id },
      actor
    );

    const outraUnit = await prisma.clientUnit.create({
      data: { id: randomUUID(), clientId, name: 'Fazenda Nova', code: 3, status: 'ACTIVE' },
    });

    await assert.rejects(
      () =>
        service.linkClientAttachmentUnit(clientId, attachment.id, { unitId: outraUnit.id }, actor),
      (e) => e.status === 409 && e.details?.code === 'CLIENT_ATTACHMENT_ALREADY_LINKED'
    );

    const row = await prisma.clientAttachment.findUnique({ where: { id: attachment.id } });
    assert.equal(row.unitId, activeUnit.id);
  });

  test('filial inativa nao recebe vinculo (422)', async () => {
    const { clientId, inactiveUnit } = await createPfClientWithUnits();
    const attachment = await uploadAttachment(clientId);

    await assert.rejects(
      () =>
        service.linkClientAttachmentUnit(
          clientId,
          attachment.id,
          { unitId: inactiveUnit.id },
          actor
        ),
      (e) => e.status === 422 && e.details?.code === 'CLIENT_UNIT_INACTIVE'
    );

    const row = await prisma.clientAttachment.findUnique({ where: { id: attachment.id } });
    assert.equal(row.unitId, null);
  });

  test('filial de outro cliente vira 404', async () => {
    const a = await createPfClientWithUnits();
    const b = await createPfClientWithUnits();
    const attachment = await uploadAttachment(a.clientId);

    await assert.rejects(
      () =>
        service.linkClientAttachmentUnit(
          a.clientId,
          attachment.id,
          { unitId: b.activeUnit.id },
          actor
        ),
      (e) => e.status === 404 && e.details?.code === 'CLIENT_UNIT_NOT_FOUND'
    );
  });

  test('inativar a filial depois: o anexo continua listado, com o status refletido', async () => {
    const { clientId, activeUnit } = await createPfClientWithUnits();
    const attachment = await uploadAttachment(clientId);
    await service.linkClientAttachmentUnit(
      clientId,
      attachment.id,
      { unitId: activeUnit.id },
      actor
    );

    await prisma.clientUnit.update({ where: { id: activeUnit.id }, data: { status: 'INACTIVE' } });

    const { items } = await service.listClientAttachments(clientId, actor);
    assert.equal(items.length, 1);
    assert.equal(items[0].unit.status, 'INACTIVE');

    // E segue excluivel (FK RESTRICT nao atrapalha o delete do anexo).
    const result = await service.deleteClientAttachment(clientId, attachment.id, actor);
    assert.deepEqual(result, { ok: true });
  });
}

function randomCpf() {
  return String(Math.floor(Math.random() * 9e10) + 1e10).padStart(11, '0');
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
