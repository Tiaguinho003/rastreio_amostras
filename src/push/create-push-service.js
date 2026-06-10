import webPush from 'web-push';

import { getPrismaClient } from '../db/prisma-client.js';
import { PushNotificationService } from './push-notification-service.js';

// Factory por env (padrao create-email-service): exige as 3 vars
// PUSH_VAPID_PUBLIC_KEY + PUSH_VAPID_PRIVATE_KEY + PUSH_VAPID_SUBJECT.
// Faltando qualquer uma -> retorna null e o app roda com push desabilitado
// (rotas respondem 501; gatilhos viram no-op). trim() defensivo: secret
// criado com newline acidental e classico.

export function createPushServiceFromEnv({ prisma = null } = {}) {
  const vapidPublicKey = (process.env.PUSH_VAPID_PUBLIC_KEY ?? '').trim() || null;
  const vapidPrivateKey = (process.env.PUSH_VAPID_PRIVATE_KEY ?? '').trim() || null;
  const vapidSubject = (process.env.PUSH_VAPID_SUBJECT ?? '').trim() || null;

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return null;
  }

  if (!/^(mailto:|https:)/.test(vapidSubject)) {
    throw new Error('PUSH_VAPID_SUBJECT must start with mailto: or https:');
  }

  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  return new PushNotificationService({
    prisma: prisma ?? getPrismaClient(),
    webPushClient: webPush,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject,
  });
}
