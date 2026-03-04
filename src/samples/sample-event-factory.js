import { randomUUID } from 'node:crypto';

import { HttpError } from '../contracts/errors.js';

export const SOURCE_TYPES = ['web', 'api', 'worker'];
export const MODULE_TYPES = ['registration', 'classification', 'print', 'ocr'];

export function normalizeActorContext(actorContext) {
  const actorType = actorContext?.actorType ?? 'SYSTEM';
  const source = actorContext?.source ?? 'api';

  if (!SOURCE_TYPES.includes(source)) {
    throw new HttpError(422, `Invalid source ${source}`);
  }

  if (actorType === 'USER') {
    if (typeof actorContext?.actorUserId !== 'string' || actorContext.actorUserId.length === 0) {
      throw new HttpError(422, 'actorUserId is required when actorType=USER');
    }
  }

  if (actorType !== 'USER' && actorType !== 'SYSTEM') {
    throw new HttpError(422, `Invalid actorType ${actorType}`);
  }

  return {
    actorType,
    actorUserId: actorType === 'USER' ? actorContext.actorUserId : null,
    source,
    role: actorContext?.role ?? null,
    requestId: actorContext?.requestId ?? randomUUID(),
    correlationId: actorContext?.correlationId ?? null,
    causationId: actorContext?.causationId ?? null,
    ip: actorContext?.ip ?? null,
    userAgent: actorContext?.userAgent ?? null
  };
}

export function buildEventEnvelope({
  eventType,
  sampleId,
  payload,
  fromStatus,
  toStatus,
  module,
  actorContext,
  schemaVersion = 1,
  idempotencyScope = null,
  idempotencyKey = null,
  occurredAt = new Date().toISOString()
}) {
  if (!MODULE_TYPES.includes(module)) {
    throw new HttpError(422, `Invalid module ${module}`);
  }

  const actor = normalizeActorContext(actorContext);

  const event = {
    eventId: randomUUID(),
    eventType,
    sampleId,
    occurredAt,
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    source: actor.source,
    schemaVersion,
    payload,
    requestId: actor.requestId,
    correlationId: actor.correlationId,
    causationId: actor.causationId,
    fromStatus,
    toStatus,
    metadata: {
      module,
      ip: actor.ip,
      userAgent: actor.userAgent
    }
  };

  if (idempotencyScope && idempotencyKey) {
    event.idempotencyScope = idempotencyScope;
    event.idempotencyKey = idempotencyKey;
  }

  return event;
}
