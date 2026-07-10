import { HttpError } from '../contracts/errors.js';
import { assertAuthenticatedActor } from '../users/user-support.js';
import {
  CLIENT_ATTACHMENT_VIEW_SELECT,
  normalizeAttachmentDescription,
  toClientAttachmentView,
} from './client-attachment-support.js';
import { CLIENT_UNIT_STATUSES } from './client-support.js';

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

  // Vincula o anexo a uma filial/fazenda do cliente. O vinculo e DEFINITIVO:
  // um anexo ja vinculado nao troca de filial nem volta a ser do cliente
  // (corrigir engano = excluir o anexo e subir de novo). Nao move o arquivo:
  // o storagePath continua em clients/<clientId>/attachments/.
  async linkClientAttachmentUnit(clientId, attachmentId, input, actorContext) {
    assertAuthenticatedActor(actorContext, 'link client attachment unit');
    requireId(clientId, 'clientId');
    requireId(attachmentId, 'attachmentId');
    const unitId = input?.unitId;
    requireId(unitId, 'unitId');

    // Escopo: o anexo tem que pertencer ao cliente da rota.
    const attachment = await this.prisma.clientAttachment.findFirst({
      where: { id: attachmentId, clientId },
      select: { id: true, unitId: true },
    });
    if (!attachment) {
      throw new HttpError(404, 'Attachment not found', {
        code: 'CLIENT_ATTACHMENT_NOT_FOUND',
      });
    }
    if (attachment.unitId) {
      throw new HttpError(409, 'Attachment is already linked to a unit', {
        code: 'CLIENT_ATTACHMENT_ALREADY_LINKED',
      });
    }

    // A filial tem que ser do mesmo cliente (PJ nao tem filial -- cai aqui).
    const unit = await this.prisma.clientUnit.findFirst({
      where: { id: unitId, clientId },
      select: { id: true, status: true },
    });
    if (!unit) {
      throw new HttpError(404, 'Client unit not found', { code: 'CLIENT_UNIT_NOT_FOUND' });
    }
    if (unit.status === CLIENT_UNIT_STATUSES.INACTIVE) {
      throw new HttpError(422, 'Client unit is inactive', {
        code: 'CLIENT_UNIT_INACTIVE',
        field: 'unitId',
      });
    }

    const updated = await this.prisma.clientAttachment.update({
      where: { id: attachmentId },
      data: { unitId },
      select: CLIENT_ATTACHMENT_VIEW_SELECT,
    });

    return { attachment: toClientAttachmentView(updated) };
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
