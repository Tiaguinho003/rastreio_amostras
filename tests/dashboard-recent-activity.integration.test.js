import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { SampleQueryService } from '../src/samples/sample-query-service.js';

// Dashboard "Ultimas atividades" (getDashboardRecentActivity), Caminho A do
// envio cancelado: o card PHYSICAL_SAMPLE_SENT vem com cancelled=true quando
// existe um PHYSICAL_SAMPLE_SEND_CANCELLED apontando pra AQUELE envio
// (payload.sendEventId = event_id do SENT). O frontend esmaece o card.
// Cada reenvio e independente; eventos nao-envio sempre cancelled=false.

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('dashboard-recent-activity integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
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

  // Cria uma amostra (REGISTRATION_CONFIRMED) com N envios fisicos. Cada envio
  // pode ser cancelado (CANCELLED com payload.sendEventId apontando pra ele).
  // Os envios ganham occurredAt crescente (dia 10, 11, ...) pra a ordem do feed
  // (occurredAt DESC) ser previsivel.
  async function seedSampleWithSends({ sends }) {
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
      toStatus: 'REGISTRATION_CONFIRMED',
      idempotencyScope: 'REGISTRATION_CONFIRM',
      idempotencyKey: `seed-${sampleId}`,
    });

    let day = 10;
    for (const send of sends) {
      const sendEventId = await insertEvent({
        sampleId,
        sequenceNumber: seq++,
        eventType: 'PHYSICAL_SAMPLE_SENT',
        occurredAt: new Date(Date.UTC(2026, 0, day, 12, 0)),
        payload: {
          recipientClientId: randomUUID(),
          recipientClientSnapshot: { displayName: 'Destinatario' },
          sentDate: `2026-01-${day}`,
        },
        module: 'CLASSIFICATION',
      });

      if (send.cancelled) {
        await insertEvent({
          sampleId,
          sequenceNumber: seq++,
          eventType: 'PHYSICAL_SAMPLE_SEND_CANCELLED',
          occurredAt: new Date(Date.UTC(2026, 0, day, 18, 0)),
          payload: { sendEventId },
          module: 'CLASSIFICATION',
        });
      }
      day += 1;
    }

    return sampleId;
  }

  function sentItems(items, sampleId) {
    return items.filter(
      (item) => item.sampleId === sampleId && item.activity.type === 'PHYSICAL_SAMPLE_SENT'
    );
  }

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('envio NAO cancelado -> card cancelled=false (e o registro tambem)', async () => {
    await resetDatabase();
    const sampleId = await seedSampleWithSends({ sends: [{ cancelled: false }] });

    const { items } = await queryService.getDashboardRecentActivity();
    const [sent] = sentItems(items, sampleId);
    const registration = items.find(
      (item) => item.sampleId === sampleId && item.activity.type === 'REGISTRATION_CONFIRMED'
    );

    assert.equal(sent.cancelled, false);
    // Evento nao-envio nunca e marcado como cancelado.
    assert.equal(registration.cancelled, false);
  });

  test('envio cancelado -> card cancelled=true', async () => {
    await resetDatabase();
    const sampleId = await seedSampleWithSends({ sends: [{ cancelled: true }] });

    const { items } = await queryService.getDashboardRecentActivity();
    const [sent] = sentItems(items, sampleId);

    assert.equal(sent.cancelled, true);
  });

  test('reenvio apos cancelar -> so o envio cancelado fica marcado (correlacao por sendEventId)', async () => {
    await resetDatabase();
    // 1o envio (dia 10) cancelado; 2o envio (dia 11) ativo.
    const sampleId = await seedSampleWithSends({
      sends: [{ cancelled: true }, { cancelled: false }],
    });

    const { items } = await queryService.getDashboardRecentActivity();
    const sents = sentItems(items, sampleId);

    assert.equal(sents.length, 2);
    // Feed ordena por occurredAt DESC: [0] = envio mais novo (dia 11, ativo),
    // [1] = envio mais antigo (dia 10, cancelado).
    assert.equal(sents[0].cancelled, false);
    assert.equal(sents[1].cancelled, true);
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
