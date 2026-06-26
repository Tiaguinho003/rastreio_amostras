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
    clientAttachment: {
      findMany: overrides.findMany ?? (async () => []),
      findFirst:
        overrides.findFirst ??
        (async () => ({ id: 'att-1', storagePath: 'clients/c1/attachments/att-1-x.pdf' })),
      create:
        overrides.create ??
        (async ({ data }) => ({ ...data, uploadedBy: null, createdAt: new Date(0) })),
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

test('listClientAttachments: retorna items', async () => {
  const svc = new ClientAttachmentService({
    prisma: fakePrisma(),
    uploadService: fakeUploadService(),
  });
  const result = await svc.listClientAttachments('c1', actor);
  assert.ok(Array.isArray(result.items));
});
