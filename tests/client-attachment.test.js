import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeAttachmentDescription,
  toClientAttachmentView,
} from '../src/clients/client-attachment-support.js';
import { ClientAttachmentService } from '../src/clients/client-attachment-service.js';

const actor = { actorUserId: 'u1', role: 'CADASTRO', requestId: 'r1' };

// ---------------------------------------------------------------------------
// support (sem DB)
// ---------------------------------------------------------------------------

test('normalizeAttachmentDescription: opcional; vazio vira null', () => {
  assert.equal(normalizeAttachmentDescription(undefined), null);
  assert.equal(normalizeAttachmentDescription('  '), null);
  assert.equal(normalizeAttachmentDescription('  contrato 2024 '), 'contrato 2024');
});

test('toClientAttachmentView: NAO expoe storagePath/checksum; inclui uploadedBy', () => {
  const now = new Date('2026-06-26T12:00:00.000Z');
  const view = toClientAttachmentView({
    id: 'att-1',
    clientId: 'c1',
    storagePath: 'clients/c1/attachments/att-1-x.pdf',
    checksumSha256: 'deadbeef',
    fileName: 'x.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 123,
    description: 'contrato',
    uploadedByUserId: 'u1',
    createdAt: now,
    uploadedBy: { id: 'u1', fullName: 'Flavio' },
  });
  assert.equal(view.fileName, 'x.pdf');
  assert.equal(view.mimeType, 'application/pdf');
  assert.deepEqual(view.uploadedBy, { id: 'u1', fullName: 'Flavio' });
  assert.equal('storagePath' in view, false);
  assert.equal('checksumSha256' in view, false);
});

test('toClientAttachmentView: sem filial vira unit/unitId null', () => {
  const view = toClientAttachmentView({
    id: 'att-1',
    clientId: 'c1',
    unitId: null,
    createdAt: new Date(0),
  });
  assert.equal(view.unitId, null);
  assert.equal(view.unit, null);
});

test('toClientAttachmentView: da filial expoe SO id/name/status', () => {
  const view = toClientAttachmentView({
    id: 'att-1',
    clientId: 'c1',
    unitId: 'un-1',
    createdAt: new Date(0),
    // O select do service nunca traz estes campos; se um dia trouxer, a view
    // continua obrigada a nao vazar dados cadastrais da fazenda.
    unit: {
      id: 'un-1',
      name: 'Fazenda Santa Rita',
      status: 'ACTIVE',
      cnpj: '12345678000199',
      city: 'Patrocinio',
      registrationNumber: 'IE-9',
    },
  });
  assert.equal(view.unitId, 'un-1');
  assert.deepEqual(view.unit, { id: 'un-1', name: 'Fazenda Santa Rita', status: 'ACTIVE' });
  assert.equal('cnpj' in view.unit, false);
  assert.equal('city' in view.unit, false);
  assert.equal('registrationNumber' in view.unit, false);
});

// ---------------------------------------------------------------------------
// service (prisma + uploadService fakes, sem DB nem disco)
// ---------------------------------------------------------------------------

function fakeUploadService(overrides = {}) {
  return {
    saveClientAttachment:
      overrides.save ??
      (async ({ clientId, originalFileName }) => ({
        attachmentId: 'att-1',
        storagePath: `clients/${clientId}/attachments/att-1-${originalFileName ?? 'arquivo.bin'}`,
        fileName: originalFileName ?? 'arquivo.bin',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        checksumSha256: 'abc',
      })),
    deleteByStoragePath: overrides.del ?? (async () => {}),
  };
}

function fakePrisma(overrides = {}) {
  return {
    client: {
      findUnique: overrides.clientFindUnique ?? (async () => ({ id: 'c1' })),
    },
    clientUnit: {
      findFirst: overrides.unitFindFirst ?? (async () => ({ id: 'un-1', status: 'ACTIVE' })),
    },
    clientAttachment: {
      findMany: overrides.findMany ?? (async () => []),
      findFirst:
        overrides.findFirst ??
        (async () => ({
          id: 'att-1',
          unitId: null,
          storagePath: 'clients/c1/attachments/att-1-x.pdf',
        })),
      create:
        overrides.create ??
        (async ({ data }) => ({ ...data, uploadedBy: null, createdAt: new Date(0) })),
      update:
        overrides.update ??
        (async ({ where, data }) => ({
          id: where.id,
          clientId: 'c1',
          unitId: data.unitId,
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
          description: null,
          uploadedByUserId: 'u1',
          uploadedBy: null,
          unit: { id: data.unitId, name: 'Fazenda Santa Rita', status: 'ACTIVE' },
          createdAt: new Date(0),
        })),
      delete: overrides.delete ?? (async () => ({})),
    },
  };
}

test('addClientAttachment: grava arquivo + cria row e retorna a view', async () => {
  const svc = new ClientAttachmentService({
    prisma: fakePrisma(),
    uploadService: fakeUploadService(),
  });
  const { attachment } = await svc.addClientAttachment(
    'c1',
    {
      fileBuffer: Buffer.from('%PDF-1.4 fake'),
      originalFileName: 'contrato.pdf',
      description: 'doc',
    },
    actor
  );
  assert.equal(attachment.fileName, 'contrato.pdf');
  assert.equal(attachment.mimeType, 'application/pdf');
  assert.equal(attachment.uploadedByUserId, 'u1');
  assert.equal('storagePath' in attachment, false);
});

test('addClientAttachment: cliente inexistente vira 404 (sem gravar arquivo)', async () => {
  let saved = false;
  const svc = new ClientAttachmentService({
    prisma: fakePrisma({ clientFindUnique: async () => null }),
    uploadService: fakeUploadService({
      save: async () => {
        saved = true;
        return {};
      },
    }),
  });
  await assert.rejects(
    () => svc.addClientAttachment('ghost', { fileBuffer: Buffer.from('x') }, actor),
    (e) => e.status === 404 && e.details?.code === 'CLIENT_NOT_FOUND'
  );
  assert.equal(saved, false);
});

test('addClientAttachment: sem autenticacao vira 401', async () => {
  const svc = new ClientAttachmentService({
    prisma: fakePrisma(),
    uploadService: fakeUploadService(),
  });
  await assert.rejects(
    () => svc.addClientAttachment('c1', { fileBuffer: Buffer.from('x') }, {}),
    (e) => e.status === 401
  );
});

test('addClientAttachment: sem uploadService vira 501', async () => {
  const svc = new ClientAttachmentService({ prisma: fakePrisma(), uploadService: null });
  await assert.rejects(
    () => svc.addClientAttachment('c1', { fileBuffer: Buffer.from('x') }, actor),
    (e) => e.status === 501
  );
});

test('deleteClientAttachment: remove row + arquivo do disco', async () => {
  let deletedPath = null;
  const svc = new ClientAttachmentService({
    prisma: fakePrisma(),
    uploadService: fakeUploadService({
      del: async (p) => {
        deletedPath = p;
      },
    }),
  });
  const result = await svc.deleteClientAttachment('c1', 'att-1', actor);
  assert.deepEqual(result, { ok: true });
  assert.equal(deletedPath, 'clients/c1/attachments/att-1-x.pdf');
});

test('deleteClientAttachment: anexo fora do cliente vira 404', async () => {
  const svc = new ClientAttachmentService({
    prisma: fakePrisma({ findFirst: async () => null }),
    uploadService: fakeUploadService(),
  });
  await assert.rejects(
    () => svc.deleteClientAttachment('c1', 'outro', actor),
    (e) => e.status === 404 && e.details?.code === 'CLIENT_ATTACHMENT_NOT_FOUND'
  );
});

// --- vinculo anexo -> filial (definitivo) ---

test('linkClientAttachmentUnit: vincula e devolve a view com a filial', async () => {
  let updateArgs = null;
  const svc = new ClientAttachmentService({
    prisma: fakePrisma({
      update: async (args) => {
        updateArgs = args;
        return {
          id: 'att-1',
          clientId: 'c1',
          unitId: 'un-1',
          createdAt: new Date(0),
          unit: { id: 'un-1', name: 'Fazenda Santa Rita', status: 'ACTIVE' },
        };
      },
    }),
    uploadService: fakeUploadService(),
  });
  const { attachment } = await svc.linkClientAttachmentUnit(
    'c1',
    'att-1',
    { unitId: 'un-1' },
    actor
  );
  assert.equal(updateArgs.data.unitId, 'un-1');
  assert.equal(attachment.unitId, 'un-1');
  assert.deepEqual(attachment.unit, { id: 'un-1', name: 'Fazenda Santa Rita', status: 'ACTIVE' });
  // O vinculo nao mexe no arquivo.
  assert.equal('storagePath' in attachment, false);
});

test('linkClientAttachmentUnit: anexo ja vinculado vira 409', async () => {
  let updated = false;
  const svc = new ClientAttachmentService({
    prisma: fakePrisma({
      findFirst: async () => ({ id: 'att-1', unitId: 'un-antiga' }),
      update: async () => {
        updated = true;
        return {};
      },
    }),
    uploadService: fakeUploadService(),
  });
  await assert.rejects(
    () => svc.linkClientAttachmentUnit('c1', 'att-1', { unitId: 'un-1' }, actor),
    (e) => e.status === 409 && e.details?.code === 'CLIENT_ATTACHMENT_ALREADY_LINKED'
  );
  assert.equal(updated, false);
});

test('linkClientAttachmentUnit: anexo fora do cliente vira 404', async () => {
  const svc = new ClientAttachmentService({
    prisma: fakePrisma({ findFirst: async () => null }),
    uploadService: fakeUploadService(),
  });
  await assert.rejects(
    () => svc.linkClientAttachmentUnit('c1', 'outro', { unitId: 'un-1' }, actor),
    (e) => e.status === 404 && e.details?.code === 'CLIENT_ATTACHMENT_NOT_FOUND'
  );
});

test('linkClientAttachmentUnit: filial de outro cliente (ou PJ, sem filial) vira 404', async () => {
  const svc = new ClientAttachmentService({
    prisma: fakePrisma({ unitFindFirst: async () => null }),
    uploadService: fakeUploadService(),
  });
  await assert.rejects(
    () => svc.linkClientAttachmentUnit('c1', 'att-1', { unitId: 'un-de-outro' }, actor),
    (e) => e.status === 404 && e.details?.code === 'CLIENT_UNIT_NOT_FOUND'
  );
});

test('linkClientAttachmentUnit: filial inativa vira 422', async () => {
  let updated = false;
  const svc = new ClientAttachmentService({
    prisma: fakePrisma({
      unitFindFirst: async () => ({ id: 'un-1', status: 'INACTIVE' }),
      update: async () => {
        updated = true;
        return {};
      },
    }),
    uploadService: fakeUploadService(),
  });
  await assert.rejects(
    () => svc.linkClientAttachmentUnit('c1', 'att-1', { unitId: 'un-1' }, actor),
    (e) => e.status === 422 && e.details?.code === 'CLIENT_UNIT_INACTIVE'
  );
  assert.equal(updated, false);
});

test('linkClientAttachmentUnit: unitId ausente vira 422', async () => {
  const svc = new ClientAttachmentService({
    prisma: fakePrisma(),
    uploadService: fakeUploadService(),
  });
  await assert.rejects(
    () => svc.linkClientAttachmentUnit('c1', 'att-1', { unitId: null }, actor),
    (e) => e.status === 422 && e.details?.field === 'unitId'
  );
});

test('linkClientAttachmentUnit: sem autenticacao vira 401', async () => {
  const svc = new ClientAttachmentService({
    prisma: fakePrisma(),
    uploadService: fakeUploadService(),
  });
  await assert.rejects(
    () => svc.linkClientAttachmentUnit('c1', 'att-1', { unitId: 'un-1' }, {}),
    (e) => e.status === 401
  );
});

test('listClientAttachments: retorna items', async () => {
  const svc = new ClientAttachmentService({
    prisma: fakePrisma(),
    uploadService: fakeUploadService(),
  });
  const result = await svc.listClientAttachments('c1', actor);
  assert.ok(Array.isArray(result.items));
});
