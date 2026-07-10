import { normalizeOptionalText, toIsoString } from '../users/user-support.js';

// Anexos do cliente (Fechamento Fase 0 -- D27): PDF + imagens, INDEPENDENTE do
// contrato. A view NAO expoe storagePath/checksum (internos); o download e por
// rota dedicada via id. So metadados aqui -- o arquivo e validado/gravado pelo
// upload service.

export const CLIENT_ATTACHMENT_DESCRIPTION_MAX = 200;

export function normalizeAttachmentDescription(value) {
  return normalizeOptionalText(value, 'description', CLIENT_ATTACHMENT_DESCRIPTION_MAX);
}

// A filial entra por select aninhado (nunca `include`) -- so id/nome/status.
// O resto do ClientUnit (CNPJ, endereco, inscricao estadual) nao vaza pra view.
export const CLIENT_ATTACHMENT_VIEW_SELECT = Object.freeze({
  id: true,
  clientId: true,
  unitId: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  description: true,
  uploadedByUserId: true,
  createdAt: true,
  uploadedBy: { select: { id: true, fullName: true } },
  unit: { select: { id: true, name: true, status: true } },
});

export function toClientAttachmentView(att) {
  return {
    id: att.id,
    clientId: att.clientId,
    unitId: att.unitId ?? null,
    fileName: att.fileName ?? null,
    mimeType: att.mimeType ?? null,
    sizeBytes: att.sizeBytes ?? null,
    description: att.description ?? null,
    uploadedByUserId: att.uploadedByUserId ?? null,
    uploadedBy: att.uploadedBy
      ? { id: att.uploadedBy.id, fullName: att.uploadedBy.fullName }
      : null,
    unit: att.unit ? { id: att.unit.id, name: att.unit.name, status: att.unit.status } : null,
    createdAt: toIsoString(att.createdAt),
  };
}
