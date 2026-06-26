import { HttpError } from '../contracts/errors.js';
import { assertAuthenticatedActor } from '../users/user-support.js';
import {
  CLIENT_ATTACHMENT_VIEW_SELECT,
  normalizeAttachmentDescription,
  toClientAttachmentView,
} from './client-attachment-support.js';

function requireId(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpError(422, `${field} is required`, { code: 'VALIDATION_ERROR', field });
  }
}

// Anexos do cliente (Fechamento Fase 0 -- D27). O arquivo (PDF/imagem) e
// gravado pelo uploadService (valida magic bytes); a linha guarda so metadados.
// Acesso = qualquer usuario autenticado (D59).
export class ClientAttachmentService {
  constructor({ prisma, uploadService = null }) {
    this.prisma = prisma;
    this.uploadService = uploadService;
  }

  async _assertClientExists(clientId) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) {
      throw new HttpError(404, 'Client not found', { code: 'CLIENT_NOT_FOUND' });
    }
  }

  async listClientAttachments(clientId, actorContext) {
    assertAuthenticatedActor(actorContext, 'list client attachments');
    requireId(clientId, 'clientId');
    await this._assertClientExists(clientId);

    const rows = await this.prisma.clientAttachment.findMany({
      where: { clientId },
      orderBy: [{ createdAt: 'desc' }],
      select: CLIENT_ATTACHMENT_VIEW_SELECT,
    });
    return { items: rows.map(toClientAttachmentView) };
  }

  async addClientAttachment(clientId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'add client attachment');
    requireId(clientId, 'clientId');
    await this._assertClientExists(clientId);

    if (!this.uploadService) {
      throw new HttpError(501, 'Upload service is not configured');
    }

    const description = normalizeAttachmentDescription(input?.description);

    // O uploadService valida magic bytes/tamanho e grava o arquivo (415/413/422).
    const stored = await this.uploadService.saveClientAttachment({
      clientId,
      buffer: input?.fileBuffer ?? null,
      originalFileName: input?.originalFileName ?? null,
    });

    const created = await this.prisma.clientAttachment.create({
      data: {
        id: stored.attachmentId,
        clientId,
        storagePath: stored.storagePath,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
        description,
        uploadedByUserId: actor.actorUserId ?? null,
      },
      select: CLIENT_ATTACHMENT_VIEW_SELECT,
    });

    return { attachment: toClientAttachmentView(created) };
  }

  async deleteClientAttachment(clientId, attachmentId, actorContext) {
    assertAuthenticatedActor(actorContext, 'delete client attachment');
    requireId(clientId, 'clientId');
    requireId(attachmentId, 'attachmentId');

    // Escopo: o anexo tem que pertencer ao cliente da rota.
    const existing = await this.prisma.clientAttachment.findFirst({
      where: { id: attachmentId, clientId },
      select: { id: true, storagePath: true },
    });
    if (!existing) {
      throw new HttpError(404, 'Attachment not found', {
        code: 'CLIENT_ATTACHMENT_NOT_FOUND',
      });
    }

    await this.prisma.clientAttachment.delete({ where: { id: attachmentId } });

    // Remove o arquivo do disco (best-effort: a linha -- fonte da verdade -- ja saiu).
    if (this.uploadService && existing.storagePath) {
      try {
        await this.uploadService.deleteByStoragePath(existing.storagePath);
      } catch {
        // arquivo orfao no disco e tolerado
      }
    }

    return { ok: true };
  }
}
