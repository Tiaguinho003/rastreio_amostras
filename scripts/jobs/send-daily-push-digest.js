#!/usr/bin/env node
// Lembretes diarios via Web Push, parametrizados por --kind. Cada kind tem
// agendamento proprio no Cloud Scheduler (que dispara o job Cloud Run
// `push-digest` com override de args — ver setup-push-digest-scheduler.sh):
//
//   --kind=classification      todos os dias 08:00 (America/Sao_Paulo)
//     "Amostras aguardando classificação" -> ADMIN + CLASSIFIER, so com
//     pendencia > 0.
//   --kind=registrations       seg-sex 08:00
//     "Revise os Cadastros!" -> ADMIN + CADASTRO, so com pendencia > 0.
//   --kind=prospect-reminder   seg-sex 11:00
//     "Bom dia <primeiro nome>!" -> PROSPECTOR (personalizada por usuario,
//     sem condicao — e lembrete de preencher o formulario de visita).
//
// Sem --kind: roda os TRES (uso manual/smoke):
//   npm run push:digest
//   scripts/gcp/execute-job.sh push-digest <cloud-env> [--kind=X]
//
// Entrega: TTL curto (12h pendencias / 6h lembrete) — lembrete de ontem nao
// chega hoje; urgency normal. SEM header Topic: a Apple respondeu 400 a ele
// na primeira execucao real (2026-06-11) e o anti-acumulo de notificacoes
// VISIVEIS ja e garantido pela `tag` no aparelho (mesma tag substitui).
//
// Sem PUSH_VAPID_* configurado o script loga e sai com exit 0 — o job
// agendado nao deve falhar por feature desabilitada. Exit != 0 so em falha
// dura (ex: banco inacessivel).

import { getPrismaClient } from '../../src/db/prisma-client.js';
import { createPushServiceFromEnv } from '../../src/push/create-push-service.js';
import { SampleQueryService } from '../../src/samples/sample-query-service.js';

const PENDING_TTL_SECONDS = 12 * 60 * 60;
const REMINDER_TTL_SECONDS = 6 * 60 * 60;

const KNOWN_KINDS = ['classification', 'registrations', 'prospect-reminder'];

function parseKinds(argv) {
  const kindArg = argv.find((arg) => arg.startsWith('--kind='));
  if (!kindArg) {
    return KNOWN_KINDS;
  }

  const kind = kindArg.slice('--kind='.length).trim();
  if (!KNOWN_KINDS.includes(kind)) {
    console.error(`[push-digest] kind invalido: '${kind}'. Use: ${KNOWN_KINDS.join(', ')}`);
    process.exitCode = 1;
    return [];
  }

  return [kind];
}

function formatCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function firstName(fullName, fallback) {
  const name = (fullName ?? '').trim().split(/\s+/)[0];
  return name || fallback || 'time';
}

async function sendClassificationDigest({ pushService, queryService }) {
  const pending = await queryService.getDashboardPending();
  const total = pending?.classificationPending?.total ?? 0;
  console.log('[push-digest] classificacao pendente', { total });
  if (total === 0) {
    return;
  }

  const result = await pushService.sendToRoles(
    ['ADMIN', 'CLASSIFIER'],
    {
      title: 'Amostras aguardando classificação',
      body: `${formatCount(total, 'amostra pendente', 'amostras pendentes')} de classificação.`,
      url: '/dashboard',
      tag: 'daily-classification',
    },
    { ttl: PENDING_TTL_SECONDS, urgency: 'normal' }
  );
  console.log('[push-digest] classificacao enviada', result);
}

async function sendRegistrationsDigest({ pushService, queryService }) {
  const pending = await queryService.getDashboardPending();
  const total = pending?.clientsIncomplete?.total ?? 0;
  console.log('[push-digest] cadastros pendentes', { total });
  if (total === 0) {
    return;
  }

  const result = await pushService.sendToRoles(
    ['ADMIN', 'CADASTRO'],
    {
      title: 'Revise os Cadastros!',
      body: `Temos ${total} pendentes`,
      url: '/clients?incomplete=true',
      tag: 'daily-clients',
    },
    { ttl: PENDING_TTL_SECONDS, urgency: 'normal' }
  );
  console.log('[push-digest] cadastros enviado', result);
}

async function sendProspectReminder({ pushService }) {
  const result = await pushService.sendPersonalizedToRoles(
    ['PROSPECTOR'],
    (user) => ({
      title: `Bom dia ${firstName(user?.fullName, user?.username)}!`,
      body: 'Vamos prospectar! Lembre-se dos formulários de visita.',
      url: '/informe',
      tag: 'prospect-reminder',
    }),
    { ttl: REMINDER_TTL_SECONDS, urgency: 'normal' }
  );
  console.log('[push-digest] lembrete prospeccao enviado', result);
}

async function main() {
  const kinds = parseKinds(process.argv.slice(2));
  if (kinds.length === 0) {
    return;
  }

  const prisma = getPrismaClient();
  const pushService = createPushServiceFromEnv({ prisma });

  if (!pushService) {
    console.warn('[push-digest] PUSH_VAPID_* not configured — nothing to send');
    return;
  }

  const queryService = new SampleQueryService({ prisma });
  const context = { pushService, queryService };

  for (const kind of kinds) {
    if (kind === 'classification') {
      await sendClassificationDigest(context);
    } else if (kind === 'registrations') {
      await sendRegistrationsDigest(context);
    } else if (kind === 'prospect-reminder') {
      await sendProspectReminder(context);
    }
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
