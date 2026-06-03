import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { SampleQueryService } from '../src/samples/sample-query-service.js';

// Filtro "Enviado para" (envio fisico event-sourced). Verifica a projecao SQL
// resolveSampleIdsSentToClients: envio ativo aparece, cancelado some,
// reatribuido (UPDATED) segue o novo destinatario, multi-select = OR.

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('sample-send-filter integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const queryService = new SampleQueryService({ prisma });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  let eventSequence = 0;

  async function insertEvent({
    eventId = randomUUID(),
    sampleId,
    sequenceNumber,
    eventType,
    occurredAt,
    payload,
    module,
    fromStatus = null,
    toStatus = null,
    idempotencyScope = null,
    idempotencyKey = null,
  }) {
    eventSequence += 1;
    await prisma.sampleEvent.create({
      data: {
        eventId,
        sampleId,
        sequenceNumber,
        eventType,
        schemaVersion: 1,
        occurredAt,
        actorType: 'USER',
        actorUserId: randomUUID(),
        source: 'WEB',
        payload,
        requestId: `req-${eventSequence}`,
        metadataModule: module,
        fromStatus,
        toStatus,
        idempotencyScope,
        idempotencyKey,
      },
    });
    return eventId;
  }

  // Cria uma amostra (REGISTRATION_CONFIRMED) com um envio fisico para
  // `recipientClientId`. Opcionalmente reatribui (UPDATED -> reassignTo) e/ou
  // cancela (CANCELLED) o mesmo envio.
  async function seedSampleWithSend({ recipientClientId, reassignTo = null, cancelled = false }) {
    const sampleId = randomUUID();
    await prisma.sample.create({ data: { id: sampleId, status: 'REGISTRATION_CONFIRMED' } });

    let seq = 1;
    await insertEvent({
      sampleId,
      sequenceNumber: seq++,
      eventType: 'REGISTRATION_CONFIRMED',
      occurredAt: new Date(Date.UTC(2026, 0, 1, 12, 0)),
      payload: {
        sampleLotNumber: sampleId.slice(0, 8),
        declared: { owner: 'Test', sacks: 10, harvest: '25/26' },
        receivedChannel: 'in_person',
      },
      module: 'REGISTRATION',
      fromStatus: null,
      toStatus: 'REGISTRATION_CONFIRMED',
      idempotencyScope: 'REGISTRATION_CONFIRM',
      idempotencyKey: `seed-${sampleId}`,
    });

    const sendEventId = await insertEvent({
      sampleId,
      sequenceNumber: seq++,
      eventType: 'PHYSICAL_SAMPLE_SENT',
      occurredAt: new Date(Date.UTC(2026, 0, 10, 12, 0)),
      payload: {
        recipientClientId,
        recipientClientSnapshot: { displayName: 'Destinatario' },
        sentDate: '2026-01-10',
      },
      module: 'CLASSIFICATION',
    });

    if (reassignTo) {
      await insertEvent({
        sampleId,
        sequenceNumber: seq++,
        eventType: 'PHYSICAL_SAMPLE_SEND_UPDATED',
        occurredAt: new Date(Date.UTC(2026, 0, 11, 12, 0)),
        payload: {
          sendEventId,
          recipientClientId: reassignTo,
          recipientClientSnapshot: { displayName: 'Destinatario 2' },
          sentDate: '2026-01-10',
        },
        module: 'CLASSIFICATION',
      });
    }

    if (cancelled) {
      await insertEvent({
        sampleId,
        sequenceNumber: seq++,
        eventType: 'PHYSICAL_SAMPLE_SEND_CANCELLED',
        occurredAt: new Date(Date.UTC(2026, 0, 12, 12, 0)),
        payload: { sendEventId },
        module: 'CLASSIFICATION',
      });
    }

    return sampleId;
  }

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('envio ativo para o cliente -> amostra aparece no filtro', async () => {
    await resetDatabase();
    const clientY = randomUUID();
    const sampleId = await seedSampleWithSend({ recipientClientId: clientY });

    const result = await queryService.listSamples({ sentToClientIds: [clientY] });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, sampleId);
  });

  test('envio cancelado -> amostra NAO aparece', async () => {
    await resetDatabase();
    const clientY = randomUUID();
    await seedSampleWithSend({ recipientClientId: clientY, cancelled: true });

    const result = await queryService.listSamples({ sentToClientIds: [clientY] });

    assert.equal(result.items.length, 0);
  });

  test('envio reatribuido (Y -> Z) -> aparece para Z, nao para Y', async () => {
    await resetDatabase();
    const clientY = randomUUID();
    const clientZ = randomUUID();
    const sampleId = await seedSampleWithSend({ recipientClientId: clientY, reassignTo: clientZ });

    const forZ = await queryService.listSamples({ sentToClientIds: [clientZ] });
    assert.equal(forZ.items.length, 1);
    assert.equal(forZ.items[0].id, sampleId);

    const forY = await queryService.listSamples({ sentToClientIds: [clientY] });
    assert.equal(forY.items.length, 0);
  });

  test('multi-select -> OR (qualquer um dos destinatarios)', async () => {
    await resetDatabase();
    const clientA = randomUUID();
    const clientB = randomUUID();
    await seedSampleWithSend({ recipientClientId: clientA });
    await seedSampleWithSend({ recipientClientId: clientB });

    const both = await queryService.listSamples({ sentToClientIds: [clientA, clientB] });
    assert.equal(both.items.length, 2);

    const onlyA = await queryService.listSamples({ sentToClientIds: [clientA] });
    assert.equal(onlyA.items.length, 1);
  });

  test('sem filtro de envio -> nao restringe por envio', async () => {
    await resetDatabase();
    const clientY = randomUUID();
    await seedSampleWithSend({ recipientClientId: clientY, cancelled: true });

    // sentToClientIds vazio: a amostra (mesmo com envio cancelado) aparece,
    // pois o filtro nao esta ativo.
    const result = await queryService.listSamples({ sentToClientIds: [] });
    assert.equal(result.items.length, 1);
  });
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
