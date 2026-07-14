import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { SampleQueryService } from '../src/samples/sample-query-service.js';

// Card "Amostras enviadas" (DSB-D14; nasceu no dashboard, DSH-D5):
// getRecentSampleSends mistura
// PHYSICAL_SAMPLE_SENT + REPORT_EXPORTED (LIMIT 40, mais recente primeiro),
// marca cancelados pelo pareamento payload.sendEventId, aplica a última
// edição (destinatário ATUAL) e exclui amostras INVALIDATED.

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('sample-recent-sends integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const queryService = new SampleQueryService({ prisma });

  const MINUTE_MS = 60_000;

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  let eventSequenceBySample = new Map();
  let lotSequence = 0;

  async function createSample({ isBlend = false } = {}) {
    const id = randomUUID();
    lotSequence += 1;
    await prisma.sample.create({
      data: {
        id,
        status: 'CLASSIFIED',
        internalLotNumber: String(9000 + lotSequence),
        isBlend,
      },
    });
    // Trigger do event store: o 1º evento do lote DEVE ser
    // REGISTRATION_CONFIRMED — bootstrap bem no passado.
    await insertEvent({
      sampleId: id,
      eventType: 'REGISTRATION_CONFIRMED',
      occurredAt: new Date(Date.now() - 30 * 24 * 3600_000),
    });
    return id;
  }

  async function insertEvent({ sampleId, eventType, occurredAt, payload = {} }) {
    const sequenceNumber = (eventSequenceBySample.get(sampleId) ?? 0) + 1;
    eventSequenceBySample.set(sampleId, sequenceNumber);
    const eventId = randomUUID();
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
        requestId: `req-${sampleId.slice(0, 8)}-${sequenceNumber}`,
        metadataModule: 'CLASSIFICATION',
      },
    });
    return eventId;
  }

  function snapshot(displayName) {
    return { id: randomUUID(), displayName };
  }

  function minutesAgo(n) {
    return new Date(Date.now() - n * MINUTE_MS);
  }

  test.before(async () => {
    await prisma.$connect();
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test.beforeEach(async () => {
    eventSequenceBySample = new Map();
    await resetDatabase();
  });

  test('banco vazio: lista vazia', async () => {
    const result = await queryService.getRecentSampleSends();
    assert.deepStrictEqual(result.items, []);
  });

  test('mistura física + laudo, mais recente primeiro, com campos do minicard', async () => {
    const physicalSample = await createSample({ isBlend: true });
    const reportSample = await createSample();

    await insertEvent({
      sampleId: physicalSample,
      eventType: 'PHYSICAL_SAMPLE_SENT',
      occurredAt: minutesAgo(20),
      payload: {
        recipientClientId: randomUUID(),
        recipientClientSnapshot: snapshot('Cooperativa Alfa'),
        sentDate: '2026-07-07',
      },
    });
    await insertEvent({
      sampleId: reportSample,
      eventType: 'REPORT_EXPORTED',
      occurredAt: minutesAgo(5),
      payload: {
        recipientClientId: randomUUID(),
        recipientClientSnapshot: snapshot('Exportadora Beta'),
      },
    });

    const { items } = await queryService.getRecentSampleSends();

    assert.strictEqual(items.length, 2);
    // Mais recente primeiro: o laudo (5 min) vem antes do envio físico (20 min).
    assert.strictEqual(items[0].kind, 'REPORT');
    assert.strictEqual(items[0].sampleId, reportSample);
    assert.strictEqual(items[0].recipient, 'Exportadora Beta');
    assert.strictEqual(items[0].cancelled, false);
    assert.strictEqual(items[0].isBlend, false);

    assert.strictEqual(items[1].kind, 'PHYSICAL_SAMPLE');
    assert.strictEqual(items[1].sampleId, physicalSample);
    assert.strictEqual(items[1].recipient, 'Cooperativa Alfa');
    assert.strictEqual(items[1].isBlend, true);
    assert.strictEqual(typeof items[1].internalLotNumber, 'string');
    assert.ok(new Date(items[0].at).getTime() > new Date(items[1].at).getTime());
  });

  test('respeita o limite de 40 itens', async () => {
    const sampleId = await createSample();
    for (let i = 0; i < 41; i += 1) {
      await insertEvent({
        sampleId,
        eventType: 'REPORT_EXPORTED',
        occurredAt: minutesAgo(41 - i),
        payload: { destination: `Destino ${i}` },
      });
    }

    const { items } = await queryService.getRecentSampleSends();

    assert.strictEqual(items.length, 40);
    // O evento mais antigo (Destino 0, há 41 min) fica de fora.
    assert.strictEqual(items[items.length - 1].recipient, 'Destino 1');
    assert.strictEqual(items[0].recipient, 'Destino 40');
  });

  test('marca cancelled só no envio pareado pelo sendEventId', async () => {
    const sampleId = await createSample();
    const cancelledSend = await insertEvent({
      sampleId,
      eventType: 'PHYSICAL_SAMPLE_SENT',
      occurredAt: minutesAgo(30),
      payload: { recipientClientSnapshot: snapshot('Cliente Cancelado') },
    });
    await insertEvent({
      sampleId,
      eventType: 'PHYSICAL_SAMPLE_SENT',
      occurredAt: minutesAgo(20),
      payload: { recipientClientSnapshot: snapshot('Cliente Válido') },
    });
    await insertEvent({
      sampleId,
      eventType: 'PHYSICAL_SAMPLE_SEND_CANCELLED',
      occurredAt: minutesAgo(10),
      payload: { sendEventId: cancelledSend },
    });

    const { items } = await queryService.getRecentSampleSends();

    // O cancelamento em si não vira item; os 2 envios aparecem.
    assert.strictEqual(items.length, 2);
    const byRecipient = Object.fromEntries(items.map((item) => [item.recipient, item]));
    assert.strictEqual(byRecipient['Cliente Cancelado'].cancelled, true);
    assert.strictEqual(byRecipient['Cliente Válido'].cancelled, false);
  });

  test('destinatário ATUAL: a última edição vence o payload original', async () => {
    const sampleId = await createSample();
    const sendEventId = await insertEvent({
      sampleId,
      eventType: 'PHYSICAL_SAMPLE_SENT',
      occurredAt: minutesAgo(30),
      payload: { recipientClientSnapshot: snapshot('Original') },
    });
    await insertEvent({
      sampleId,
      eventType: 'PHYSICAL_SAMPLE_SEND_UPDATED',
      occurredAt: minutesAgo(20),
      payload: { sendEventId, recipientClientSnapshot: snapshot('Primeira Edição') },
    });
    await insertEvent({
      sampleId,
      eventType: 'PHYSICAL_SAMPLE_SEND_UPDATED',
      occurredAt: minutesAgo(10),
      payload: { sendEventId, recipientClientSnapshot: snapshot('Edição Final') },
    });

    const { items } = await queryService.getRecentSampleSends();

    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].recipient, 'Edição Final');
  });

  test('laudo sem snapshot cai no destination livre; sem nada vira null', async () => {
    const sampleId = await createSample();
    await insertEvent({
      sampleId,
      eventType: 'REPORT_EXPORTED',
      occurredAt: minutesAgo(20),
      payload: { destination: 'exportacao@cliente.com' },
    });
    await insertEvent({
      sampleId,
      eventType: 'REPORT_EXPORTED',
      occurredAt: minutesAgo(10),
      payload: { format: 'pdf' },
    });

    const { items } = await queryService.getRecentSampleSends();

    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[0].recipient, null);
    assert.strictEqual(items[1].recipient, 'exportacao@cliente.com');
  });

  test('exclui envios de amostras INVALIDATED', async () => {
    // O trigger do event store bloqueia eventos em amostra INVALIDATED —
    // envia primeiro (CLASSIFIED) e invalida depois, como no fluxo real.
    const sampleId = await createSample();
    await insertEvent({
      sampleId,
      eventType: 'PHYSICAL_SAMPLE_SENT',
      occurredAt: minutesAgo(5),
      payload: { recipientClientSnapshot: snapshot('Não Deve Aparecer') },
    });
    await prisma.sample.update({ where: { id: sampleId }, data: { status: 'INVALIDATED' } });

    const { items } = await queryService.getRecentSampleSends();

    assert.deepStrictEqual(items, []);
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
