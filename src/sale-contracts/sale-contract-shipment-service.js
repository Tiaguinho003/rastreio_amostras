import { HttpError } from '../contracts/errors.js';
import { assertAuthenticatedActor } from '../users/user-support.js';
import {
  brtTodayDateOnly,
  buildShipmentContext,
  normalizeActionDate,
  normalizeShipmentCarrier,
  SHIPMENT_CONTEXT_SELECT,
  SHIPMENT_PHOTO_VIEW_SELECT,
  toShipmentPhotoView,
} from './sale-contract-support.js';

const MAX_SHIPMENT_PHOTOS = 10;
const SHIPPABLE_STATUSES = ['EMITIDO', 'FATURADO'];
// EMB31: as fotos do embarque expiram em 15 dias — somem da UI (filtro nas 2 leituras)
// e o disco e limpo por uma purga oportunista com throttle (sem Cloud Scheduler; molde
// do expireStalePrintJobs). No Cloud Run o throttle e per-instancia best-effort.
const SHIPMENT_PHOTO_RETENTION_MS = 15 * 24 * 60 * 60 * 1000;
const SHIPMENT_PHOTO_PURGE_THROTTLE_MS = 60 * 60 * 1000;
let lastShipmentPhotoPurgeAt = 0;

function shipmentPhotoCutoff() {
  return new Date(Date.now() - SHIPMENT_PHOTO_RETENTION_MS);
}

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
    // EMB31: hot path que arma a purga oportunista (throttled) das fotos expiradas.
    void this.purgeExpiredShipmentPhotos().catch(() => {});
    const rows = await this.prisma.saleContractShipmentPhoto.findMany({
      // EMB31: some as expiradas (>15d) — a purga fisica e assincrona/throttled.
      where: { saleContractId: contractId, createdAt: { gte: shipmentPhotoCutoff() } },
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
      // EMB31: uma foto expirada (>15d) tambem some da URL direta (404), nao so da lista.
      where: {
        id: photoId,
        saleContractId: contractId,
        createdAt: { gte: shipmentPhotoCutoff() },
      },
      select: { storagePath: true, mimeType: true },
    });
    if (!photo) {
      throw new HttpError(404, 'Shipment photo not found', { code: 'SHIPMENT_PHOTO_NOT_FOUND' });
    }
    return photo;
  }

  // EMB31: apaga do banco + disco as fotos com mais de 15 dias. Oportunista (armada por
  // um hot path de leitura), throttled a 1h (per-instancia; `force` so nos testes).
  // Ordem LINHA->ARQUIVO: orfao de arquivo e tolerado, orfao de linha nao (molde do
  // rollback do confirmShipment). Delete idempotente — rodar de novo nao quebra.
  async purgeExpiredShipmentPhotos({ force = false } = {}) {
    const now = Date.now();
    if (!force && now - lastShipmentPhotoPurgeAt < SHIPMENT_PHOTO_PURGE_THROTTLE_MS) {
      return { purged: 0 };
    }
    lastShipmentPhotoPurgeAt = now;
    const expired = await this.prisma.saleContractShipmentPhoto.findMany({
      where: { createdAt: { lt: shipmentPhotoCutoff() } },
      select: { id: true, storagePath: true },
    });
    if (expired.length === 0) {
      return { purged: 0 };
    }
    await this.prisma.saleContractShipmentPhoto.deleteMany({
      where: { id: { in: expired.map((photo) => photo.id) } },
    });
    if (this.uploadService?.deleteByStoragePath) {
      for (const photo of expired) {
        try {
          await this.uploadService.deleteByStoragePath(photo.storagePath);
        } catch {
          // best-effort: orfao de arquivo tolerado
        }
      }
    }
    return { purged: expired.length };
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

    // EMB30: transporte OBRIGATORIO (sem default). COMPANY ("Pela empresa") exige um
    // responsavel ATIVO nao-PROSPECTOR (blinda a API alem do picker) e congela o
    // snapshot do nome (molde brokerNameSnapshot). THIRD_PARTY ("Por terceiros") nao tem.
    const carrier = normalizeShipmentCarrier(input?.transporte);
    let responsibleUserId = null;
    let responsibleName = null;
    if (carrier === 'COMPANY') {
      const rawResponsible = input?.responsibleUserId;
      if (typeof rawResponsible !== 'string' || rawResponsible.length === 0) {
        throw new HttpError(422, 'Responsible user is required for company transport', {
          code: 'SHIPMENT_RESPONSIBLE_INVALID',
          field: 'responsibleUserId',
        });
      }
      const user = await this.prisma.user.findUnique({
        where: { id: rawResponsible },
        select: { id: true, fullName: true, status: true, role: true },
      });
      if (!user || user.status !== 'ACTIVE' || user.role === 'PROSPECTOR') {
        throw new HttpError(422, 'Responsible user is invalid', {
          code: 'SHIPMENT_RESPONSIBLE_INVALID',
          field: 'responsibleUserId',
        });
      }
      responsibleUserId = user.id;
      responsibleName = user.fullName;
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
          // EMB30: carrier + responsavel gravados JUNTO do shippedAt, na MESMA
          // updateMany — seguem o eixo do embarque (sem bumpar version, EMB22).
          data: {
            shippedAt,
            shipmentCarrier: carrier,
            shipmentResponsibleUserId: responsibleUserId,
            shipmentResponsibleName: responsibleName,
          },
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
