import { EventValidator } from '../contracts/event-validator.js';
import { HttpError } from '../contracts/errors.js';

const MUTATING_EVENT_TYPES = new Set([
  'SAMPLE_RECEIVED',
  'REGISTRATION_STARTED',
  'REGISTRATION_CONFIRMED',
  'QR_PRINT_REQUESTED',
  'CLASSIFICATION_STARTED',
  'CLASSIFICATION_SAVED_PARTIAL',
  'CLASSIFICATION_COMPLETED',
  'SAMPLE_INVALIDATED',
  'REGISTRATION_UPDATED',
  'SALE_CREATED',
  'SALE_UPDATED',
  'SALE_CANCELLED',
  'LOSS_RECORDED',
  'LOSS_UPDATED',
  'LOSS_CANCELLED',
  'COMMERCIAL_STATUS_UPDATED',
  'CLASSIFICATION_UPDATED',
]);

const PRINT_ATTEMPT_EVENTS = new Set(['QR_PRINT_REQUESTED', 'QR_REPRINT_REQUESTED']);

function idempotencyCompositeKey(sampleId, scope, key) {
  return `${sampleId}::${scope}::${key}`;
}

function printAttemptCompositeKey(sampleId, printAction, attemptNumber) {
  return `${sampleId}::${printAction}::${attemptNumber}`;
}

function isMutatingEvent(event) {
  if (MUTATING_EVENT_TYPES.has(event.eventType)) {
    return true;
  }

  if (event.eventType === 'QR_PRINTED') {
    const printAction = event?.payload?.printAction;
    return printAction === 'PRINT' || event.fromStatus !== null || event.toStatus !== null;
  }

  return false;
}

export class EventContractService {
  constructor({ store, validator = new EventValidator() }) {
    this.store = store;
    this.validator = validator;
  }

  appendEvent(eventDraft, options = {}) {
    const { expectedVersion, simulateFailureAfterSampleMutation = false } = options;
    const existingEvents = this.store.getEvents(eventDraft.sampleId);
    const event = {
      ...eventDraft,
      sequenceNumber: existingEvents.length + 1,
    };

    this.validator.validate(event);

    const hasIdempotency = Boolean(event.idempotencyScope && event.idempotencyKey);
    if (hasIdempotency) {
      const idKey = idempotencyCompositeKey(
        event.sampleId,
        event.idempotencyScope,
        event.idempotencyKey
      );
      const existingEventId = this.store.idempotencyIndex.get(idKey);
      if (existingEventId) {
        const existing = this.store.getEventById(existingEventId);
        return {
          statusCode: 200,
          idempotent: true,
          event: existing,
        };
      }
    }

    if (PRINT_ATTEMPT_EVENTS.has(event.eventType)) {
      const attemptKey = printAttemptCompositeKey(
        event.sampleId,
        event.payload.printAction,
        event.payload.attemptNumber
      );
      const existingAttemptEventId = this.store.printAttemptIndex.get(attemptKey);
      if (existingAttemptEventId) {
        const existing = this.store.getEventById(existingAttemptEventId);
        return {
          statusCode: 200,
          idempotent: true,
          event: existing,
        };
      }
    }

    return this.store.transaction((tx) => {
      const sample = tx.samples.get(event.sampleId) ?? null;
      const hasStatusTransition = event.fromStatus !== null || event.toStatus !== null;
      const mutatesSample = isMutatingEvent(event);

      if (!sample && event.eventType !== 'SAMPLE_RECEIVED') {
        throw new HttpError(404, `Sample ${event.sampleId} does not exist`);
      }

      if (sample && mutatesSample) {
        if (typeof expectedVersion !== 'number') {
          throw new HttpError(409, 'expectedVersion is required for sample mutations');
        }
        if (sample.version !== expectedVersion) {
          throw new HttpError(
            409,
            `Version conflict. expected=${expectedVersion} current=${sample.version}`
          );
        }
      }

      if (
        sample &&
        hasStatusTransition &&
        event.fromStatus !== null &&
        sample.status !== event.fromStatus
      ) {
        throw new HttpError(
          409,
          `Invalid status transition. current=${sample.status} fromStatus=${event.fromStatus}`
        );
      }

      let nextSample;
      if (!sample) {
        nextSample = {
          id: event.sampleId,
          status: event.toStatus,
          commercialStatus: 'OPEN',
          version: 1,
          ownerClientId: null,
          ownerRegistrationId: null,
          declared: {
            owner: null,
            sacks: null,
            harvest: null,
            originLot: null,
          },
        };
        tx.samples.set(event.sampleId, nextSample);
      } else if (mutatesSample) {
        const nextCommercialStatus =
          event.eventType === 'COMMERCIAL_STATUS_UPDATED'
            ? (event?.payload?.toCommercialStatus ?? sample.commercialStatus ?? 'OPEN')
            : (sample.commercialStatus ?? 'OPEN');

        nextSample = {
          ...sample,
          status: event.toStatus !== null ? event.toStatus : sample.status,
          commercialStatus: nextCommercialStatus,
          version: sample.version + 1,
        };

        if (event.eventType === 'REGISTRATION_CONFIRMED') {
          nextSample.ownerClientId = Object.prototype.hasOwnProperty.call(
            event.payload,
            'ownerClientId'
          )
            ? (event.payload.ownerClientId ?? null)
            : (sample.ownerClientId ?? null);
          nextSample.ownerRegistrationId = Object.prototype.hasOwnProperty.call(
            event.payload,
            'ownerRegistrationId'
          )
            ? (event.payload.ownerRegistrationId ?? null)
            : (sample.ownerRegistrationId ?? null);
          nextSample.declared = {
            owner: event.payload.declared?.owner ?? null,
            sacks: event.payload.declared?.sacks ?? null,
            harvest: event.payload.declared?.harvest ?? null,
            originLot: event.payload.declared?.originLot ?? null,
          };
        }

        if (event.eventType === 'REGISTRATION_UPDATED') {
          const after = event.payload.after ?? {};
          const declaredAfter = after.declared ?? {};

          if (Object.prototype.hasOwnProperty.call(after, 'ownerClientId')) {
            nextSample.ownerClientId = after.ownerClientId ?? null;
          }
          if (Object.prototype.hasOwnProperty.call(after, 'ownerRegistrationId')) {
            nextSample.ownerRegistrationId = after.ownerRegistrationId ?? null;
          }

          nextSample.declared = {
            owner: Object.prototype.hasOwnProperty.call(declaredAfter, 'owner')
              ? declaredAfter.owner
              : (sample.declared?.owner ?? null),
            sacks: Object.prototype.hasOwnProperty.call(declaredAfter, 'sacks')
              ? declaredAfter.sacks
              : (sample.declared?.sacks ?? null),
            harvest: Object.prototype.hasOwnProperty.call(declaredAfter, 'harvest')
              ? declaredAfter.harvest
              : (sample.declared?.harvest ?? null),
            originLot: Object.prototype.hasOwnProperty.call(declaredAfter, 'originLot')
              ? declaredAfter.originLot
              : (sample.declared?.originLot ?? null),
          };

          if (Object.prototype.hasOwnProperty.call(after, 'soldSacks')) {
            nextSample.soldSacks = after.soldSacks;
          }
          if (Object.prototype.hasOwnProperty.call(after, 'lostSacks')) {
            nextSample.lostSacks = after.lostSacks;
          }
          if (Object.prototype.hasOwnProperty.call(after, 'commercialStatus')) {
            nextSample.commercialStatus = after.commercialStatus;
          }
        }

        if (
          event.eventType === 'SALE_CREATED' ||
          event.eventType === 'SALE_UPDATED' ||
          event.eventType === 'SALE_CANCELLED' ||
          event.eventType === 'LOSS_RECORDED' ||
          event.eventType === 'LOSS_UPDATED' ||
          event.eventType === 'LOSS_CANCELLED'
        ) {
          if (Object.prototype.hasOwnProperty.call(event.payload, 'soldSacks')) {
            nextSample.soldSacks = event.payload.soldSacks;
          }
          if (Object.prototype.hasOwnProperty.call(event.payload, 'lostSacks')) {
            nextSample.lostSacks = event.payload.lostSacks;
          }
          if (Object.prototype.hasOwnProperty.call(event.payload, 'commercialStatus')) {
            nextSample.commercialStatus = event.payload.commercialStatus;
          }
        }

        tx.samples.set(event.sampleId, nextSample);
      } else {
        nextSample = sample;
      }

      if (simulateFailureAfterSampleMutation) {
        throw new HttpError(500, 'Simulated failure after sample mutation');
      }

      const events = tx.eventsBySample.get(event.sampleId) ?? [];
      const persistedEvent = {
        ...event,
        sequenceNumber: events.length + 1,
      };
      events.push(persistedEvent);
      tx.eventsBySample.set(event.sampleId, events);
      tx.eventsById.set(persistedEvent.eventId, persistedEvent);

      if (hasIdempotency) {
        const idKey = idempotencyCompositeKey(
          event.sampleId,
          event.idempotencyScope,
          event.idempotencyKey
        );
        tx.idempotencyIndex.set(idKey, persistedEvent.eventId);
      }

      if (PRINT_ATTEMPT_EVENTS.has(event.eventType)) {
        const attemptKey = printAttemptCompositeKey(
          event.sampleId,
          event.payload.printAction,
          event.payload.attemptNumber
        );
        tx.printAttemptIndex.set(attemptKey, persistedEvent.eventId);
      }

      return {
        statusCode: 201,
        idempotent: false,
        sample: nextSample,
        event: persistedEvent,
      };
    });
  }
}
