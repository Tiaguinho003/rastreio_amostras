import { HttpError } from '../contracts/errors.js';
import { assertAuthenticatedActor } from '../users/user-support.js';
import {
  brtTodayDateOnly,
  buildShipmentContext,
  normalizeActionDate,
  SHIPMENT_CONTEXT_SELECT,
  SHIPMENT_PHOTO_VIEW_SELECT,
  toShipmentPhotoView,
} from './sale-contract-support.js';

const MAX_SHIPMENT_PHOTOS = 10;
const SHIPPABLE_STATUSES = ['EMITIDO', 'FATURADO'];

function requireId(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpError(422, `${field} is required`, { code: 'VALIDATION_ERROR', field });
  }
}

// Confirmacao do embarque (EMB27) + leitura das fotos. TAREFA OPERACIONAL:
// auth-only, SEM gate de papel nem escopo por posse — todos os nao-PROSPECTOR
// (EMB16; PROSPECTOR barrado no allowlist central). O arquivo (JPEG/PNG/WebP) e
// gravado pelo uploadService (magic bytes); a linha guarda metadados. A
// confirmacao e TERMINAL (sem undo, EMB19) — a trava de idempotencia e o
// shipped_at:null no where do updateMany (dispensa expectedVersion).
export class SaleContractShipmentService {
  constructor({ prisma, uploadService = null }) {
    this.prisma = prisma;
    this.uploadService = uploadService;
  }

  async _requireContract(contractId, select) {
    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select,
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    return contract;
  }

  async getShipmentContext(contractId, actorContext) {
    assertAuthenticatedActor(actorContext, 'get shipment context');
    requireId(contractId, 'contractId');
    const contract = await this._requireContract(contractId, SHIPMENT_CONTEXT_SELECT);
    return { context: buildShipmentContext(contract) };
  }

  async listShipmentPhotos(contractId, actorContext) {
    assertAuthenticatedActor(actorContext, 'list shipment photos');
    requireId(contractId, 'contractId');
    const rows = await this.prisma.saleContractShipmentPhoto.findMany({
      where: { saleContractId: contractId },
      orderBy: [{ createdAt: 'asc' }],
      select: SHIPMENT_PHOTO_VIEW_SELECT,
    });
    return { items: rows.map(toShipmentPhotoView) };
  }

  // Descritor pra rota-proxy autenticada (a rota binaria delega a auth a este
  // metodo, molde da foto de amostra). So storagePath + mimeType.
  async getShipmentPhotoDescriptor(contractId, photoId, actorContext) {
    assertAuthenticatedActor(actorContext, 'read shipment photo');
    requireId(contractId, 'contractId');
    requireId(photoId, 'photoId');
    const photo = await this.prisma.saleContractShipmentPhoto.findFirst({
      where: { id: photoId, saleContractId: contractId },
      select: { storagePath: true, mimeType: true },
    });
    if (!photo) {
      throw new HttpError(404, 'Shipment photo not found', { code: 'SHIPMENT_PHOTO_NOT_FOUND' });
    }
    return photo;
  }

  // Confirma o embarque: grava shippedAt (<= hoje BRT) + 0..10 fotos, numa tx.
  async confirmShipment(contractId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'confirm shipment');
    requireId(contractId, 'contractId');
    if (!this.uploadService) {
      throw new HttpError(501, 'Upload service is not configured');
    }

    const shippedAt = normalizeActionDate(input?.shippedAt, 'shippedAt');
    // EMB27: confirma-se depois do fato (o motorista reporta) — a carga pode ter
    // sido ontem, mas NAO no futuro. Molde do guard E30 do pagamento.
    if (shippedAt.getTime() > brtTodayDateOnly().getTime()) {
      throw new HttpError(422, 'Shipment date must not be in the future', {
        code: 'VALIDATION_ERROR',
        field: 'shippedAt',
      });
    }

    const files = Array.isArray(input?.files) ? input.files : [];
    if (files.length > MAX_SHIPMENT_PHOTOS) {
      throw new HttpError(422, `A confirmacao aceita no maximo ${MAX_SHIPMENT_PHOTOS} fotos`, {
        code: 'SHIPMENT_TOO_MANY_PHOTOS',
        field: 'files',
      });
    }

    const contract = await this._requireContract(contractId, {
      id: true,
      requiresShipment: true,
      shippedAt: true,
      status: true,
    });
    if (!contract.requiresShipment) {
      throw new HttpError(422, 'Sale contract does not require shipment', {
        code: 'CONTRACT_SHIPMENT_NOT_REQUIRED',
      });
    }
    if (contract.shippedAt) {
      throw new HttpError(409, 'Shipment already confirmed', { code: 'CONTRACT_ALREADY_SHIPPED' });
    }
    if (!SHIPPABLE_STATUSES.includes(contract.status)) {
      throw new HttpError(409, `Sale contract is ${contract.status} and cannot be shipped`, {
        code: 'CONTRACT_NOT_SHIPPABLE',
      });
    }

    // Disk-first (valida magic bytes/tamanho por arquivo). Se a tx falhar depois,
    // os arquivos gravados sao removidos (best-effort; orfao tolerado).
    const stored = [];
    for (const file of files) {
      stored.push(
        await this.uploadService.saveContractShipmentPhoto({
          contractId,
          buffer: file?.fileBuffer ?? null,
          originalFileName: file?.originalFileName ?? null,
        })
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // shippedAt e um EIXO PROPRIO (EMB22): NAO bumpa version. A trava de corrida e
        // o shippedAt:null no where (o 2o confirm bate 0 linhas → 409). Manter a version
        // estavel deixa o portao do pagamento (EMB28) seguir direto pro pagamento com a
        // mesma expectedVersion, sem 409 espurio apos confirmar o embarque.
        const updated = await tx.saleContract.updateMany({
          where: {
            id: contractId,
            requiresShipment: true,
            shippedAt: null,
            status: { in: SHIPPABLE_STATUSES },
          },
          data: { shippedAt },
        });
        if (updated.count === 0) {
          // Corrida: alguem confirmou/mudou o status entre o guard e a tx.
          throw new HttpError(409, 'Shipment already confirmed', {
            code: 'CONTRACT_ALREADY_SHIPPED',
          });
        }
        if (stored.length > 0) {
          await tx.saleContractShipmentPhoto.createMany({
            data: stored.map((s) => ({
              id: s.attachmentId,
              saleContractId: contractId,
              storagePath: s.storagePath,
              fileName: s.fileName,
              mimeType: s.mimeType,
              sizeBytes: s.sizeBytes,
              checksumSha256: s.checksumSha256,
              uploadedByUserId: actor.actorUserId ?? null,
            })),
          });
        }
      });
    } catch (error) {
      for (const s of stored) {
        try {
          await this.uploadService.deleteByStoragePath(s.storagePath);
        } catch {
          // arquivo orfao no disco e tolerado
        }
      }
      throw error;
    }

    const refreshed = await this._requireContract(contractId, SHIPMENT_CONTEXT_SELECT);
    return { context: buildShipmentContext(refreshed) };
  }
}
