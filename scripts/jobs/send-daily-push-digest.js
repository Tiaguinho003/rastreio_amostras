#!/usr/bin/env node
// Digest diario de pendencias via Web Push (lembrete agendado).
//
// Disparado 1x/dia pelo Cloud Scheduler (job Cloud Run `push-digest`, ver
// scripts/gcp/setup-push-digest-scheduler.sh) ou manualmente:
//   npm run push:digest
//   scripts/gcp/execute-job.sh push-digest <cloud-env>
//
// O que envia (cada notificacao SO quando a contagem > 0):
//   1. Amostras pendentes de classificacao -> ADMIN + CLASSIFIER
//   2. Clientes com cadastro incompleto    -> ADMIN
//
// Caracteristicas de entrega:
//   * TTL 12h — digest de ontem nao chega hoje junto com o novo;
//   * topic fixo por tipo (vira apns-collapse-id): aparelho desligado por
//     dias acorda com NO MAXIMO um digest de cada tipo, nao uma pilha;
//   * urgency normal (nao acorda radio do aparelho como evento critico).
//
// Sem PUSH_VAPID_* configurado o script loga e sai com exit 0 — o job
// agendado nao deve falhar por feature desabilitada. Exit != 0 so em falha
// dura (ex: banco inacessivel).

import { getPrismaClient } from '../../src/db/prisma-client.js';
import { createPushServiceFromEnv } from '../../src/push/create-push-service.js';
import { SampleQueryService } from '../../src/samples/sample-query-service.js';

const DIGEST_TTL_SECONDS = 12 * 60 * 60;

function formatCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

async function main() {
  const prisma = getPrismaClient();
  const pushService = createPushServiceFromEnv({ prisma });

  if (!pushService) {
    console.warn('[push-digest] PUSH_VAPID_* not configured — nothing to send');
    return;
  }

  const queryService = new SampleQueryService({ prisma });
  const pending = await queryService.getDashboardPending();

  const classificationTotal = pending?.classificationPending?.total ?? 0;
  const clientsIncompleteTotal = pending?.clientsIncomplete?.total ?? 0;

  console.log('[push-digest] pendencias', {
    classificationTotal,
    clientsIncompleteTotal,
  });

  if (classificationTotal > 0) {
    const result = await pushService.sendToRoles(
      ['ADMIN', 'CLASSIFIER'],
      {
        title: 'Amostras aguardando classificação',
        body: `${formatCount(classificationTotal, 'amostra pendente', 'amostras pendentes')} de classificação.`,
        url: '/dashboard',
        tag: 'daily-classification',
      },
      { ttl: DIGEST_TTL_SECONDS, urgency: 'normal', topic: 'daily-classification' }
    );
    console.log('[push-digest] classificacao', result);
  }

  if (clientsIncompleteTotal > 0) {
    const result = await pushService.sendToRoles(
      ['ADMIN'],
      {
        title: 'Cadastros incompletos',
        body: `${formatCount(clientsIncompleteTotal, 'cliente', 'clientes')} com cadastro incompleto.`,
        url: '/clients?incomplete=true',
        tag: 'daily-clients',
      },
      { ttl: DIGEST_TTL_SECONDS, urgency: 'normal', topic: 'daily-clients' }
    );
    console.log('[push-digest] clientes', result);
  }

  await prisma.$disconnect();
}

main().catch(async (cause) => {
  console.error('[push-digest] falha dura', {
    message: cause?.message ?? 'unknown',
  });
  if (cause?.stack) {
    console.error(cause.stack);
  }
  process.exitCode = 1;
});
