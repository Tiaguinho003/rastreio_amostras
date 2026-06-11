import { randomUUID } from 'node:crypto';

import { HttpError } from '../contracts/errors.js';
import { assertAuthenticatedActor, normalizeOptionalText } from '../users/user-support.js';

// Web Push (notificacoes nativas de SO) via protocolo VAPID.
// Inscricoes em push_subscription (1 row por aparelho/navegador por usuario;
// upsert por endpoint — outro usuario ativando no mesmo aparelho assume a
// inscricao). Envio e SIDE-EFFECT inline fire-and-forget: quem chama embrulha
// em try/catch e nunca deixa o push quebrar o request (padrao Q.auto).
//
// webPushClient e injetavel (default: lib `web-push`) pra testes nao falarem
// com os push services reais (Apple/Google).

const ENDPOINT_MAX = 2048;
const KEY_MAX = 512;
const USER_AGENT_MAX = 300;
// Push services rejeitam payloads grandes (~4KB); truncamos os textos bem
// antes disso.
const TITLE_MAX = 80;
const BODY_MAX = 160;

export const PUSH_DEFAULT_TTL_SECONDS = 24 * 60 * 60;

function truncateText(value, max) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function normalizeEndpoint(value, fieldName = 'endpoint') {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(422, `${fieldName} is required`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  const normalized = value.trim();
  if (normalized.length > ENDPOINT_MAX || !/^https:\/\//.test(normalized)) {
    throw new HttpError(422, `${fieldName} must be an https URL`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  return normalized;
}

function normalizeSubscriptionKey(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(422, `${fieldName} is required`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  const normalized = value.trim();
  // Chaves da inscricao sao base64url (RFC 8291).
  if (normalized.length > KEY_MAX || !/^[A-Za-z0-9_-]+=*$/.test(normalized)) {
    throw new HttpError(422, `${fieldName} must be base64url`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  return normalized;
}

export class PushNotificationService {
  constructor({ prisma, webPushClient, vapidPublicKey, vapidPrivateKey, vapidSubject }) {
    this.prisma = prisma;
    this.webPushClient = webPushClient;
    this.vapidPublicKey = vapidPublicKey;
    this.vapidPrivateKey = vapidPrivateKey;
    this.vapidSubject = vapidSubject;
  }

  getPublicKey() {
    return this.vapidPublicKey;
  }

  // Estado do toggle no Perfil: o endpoint deste aparelho esta inscrito PARA
  // o usuario logado? (Aparelho compartilhado: inscricao de outro usuario
  // conta como nao-inscrito pra quem pergunta.)
  async getSubscriptionStatus({ endpoint }, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'read push subscription');
    const normalized = normalizeOptionalText(endpoint, 'endpoint', ENDPOINT_MAX);
    if (!normalized) {
      return { subscribed: false };
    }

    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint: normalized },
      select: { userId: true },
    });

    return { subscribed: existing?.userId === actor.actorUserId };
  }

  async saveSubscription(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'save push subscription');
    const endpoint = normalizeEndpoint(input?.endpoint);
    const p256dh = normalizeSubscriptionKey(input?.keys?.p256dh, 'keys.p256dh');
    const auth = normalizeSubscriptionKey(input?.keys?.auth, 'keys.auth');
    const userAgent = normalizeOptionalText(input?.userAgent, 'userAgent', USER_AGENT_MAX);

    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        id: randomUUID(),
        userId: actor.actorUserId,
        endpoint,
        p256dh,
        auth,
        userAgent,
      },
      // Endpoint ja conhecido: re-inscricao do mesmo aparelho (rotacao de
      // chaves) ou outro usuario assumindo o aparelho — dono troca.
      update: {
        userId: actor.actorUserId,
        p256dh,
        auth,
        userAgent,
      },
    });

    return { subscription: { endpoint } };
  }

  async removeSubscription(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'remove push subscription');
    const endpoint = normalizeEndpoint(input?.endpoint);

    // Escopado ao dono: ninguem remove inscricao de outro usuario.
    const result = await this.prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: actor.actorUserId },
    });

    return { removed: result.count > 0 };
  }

  /**
   * Envia uma notificacao para todos os aparelhos inscritos dos usuarios
   * ATIVOS dos papeis dados. Nunca lanca por falha de entrega individual:
   * agrega resultados e poda inscricoes mortas (404/410). 401/403 do push
   * service indicam problema de VAPID/config — loga e NAO poda.
   */
  async sendToRoles(roles, message, options = {}) {
    const subscriptions = await this._findSubscriptionsByRoles(roles, options);
    if (subscriptions.length === 0) {
      return { sent: 0, failed: 0, pruned: 0 };
    }

    return this._dispatch(
      subscriptions.map((subscription) => ({ subscription, message })),
      options
    );
  }

  /**
   * Envia para todos os aparelhos inscritos de usuarios ESPECIFICOS
   * (ativos). Mesmo contrato/agregacao do sendToRoles — usado quando a
   * elegibilidade e calculada por usuario fora daqui (ex: lembrete do
   * relatorio semanal do comercial).
   */
  async sendToUsers(userIds, message, options = {}) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return { sent: 0, failed: 0, pruned: 0 };
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: {
        userId: { in: userIds },
        user: { status: 'ACTIVE' },
      },
      select: {
        endpoint: true,
        p256dh: true,
        auth: true,
      },
    });
    if (subscriptions.length === 0) {
      return { sent: 0, failed: 0, pruned: 0 };
    }

    return this._dispatch(
      subscriptions.map((subscription) => ({ subscription, message })),
      options
    );
  }

  /**
   * Variante personalizada: monta a mensagem POR USUARIO (ex: saudacao com
   * o primeiro nome). buildMessage(user) recebe { id, fullName, username }
   * e devolve { title, body, url, tag }.
   */
  async sendPersonalizedToRoles(roles, buildMessage, options = {}) {
    const subscriptions = await this._findSubscriptionsByRoles(roles, options, {
      includeUser: true,
    });
    if (subscriptions.length === 0) {
      return { sent: 0, failed: 0, pruned: 0 };
    }

    return this._dispatch(
      subscriptions.map((subscription) => ({
        subscription,
        message: buildMessage(subscription.user),
      })),
      options
    );
  }

  async _findSubscriptionsByRoles(
    roles,
    { excludeUserId = null } = {},
    { includeUser = false } = {}
  ) {
    return this.prisma.pushSubscription.findMany({
      where: {
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
        user: {
          role: { in: roles },
          status: 'ACTIVE',
        },
      },
      select: {
        endpoint: true,
        p256dh: true,
        auth: true,
        ...(includeUser ? { user: { select: { id: true, fullName: true, username: true } } } : {}),
      },
    });
  }

  async _dispatch(deliveries, options = {}) {
    const { ttl = PUSH_DEFAULT_TTL_SECONDS, urgency = 'high', topic = undefined } = options;

    const sendOptions = {
      TTL: ttl,
      urgency,
      ...(topic ? { topic } : {}),
    };

    const results = await Promise.allSettled(
      deliveries.map(({ subscription, message }) =>
        this.webPushClient.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({
            title: truncateText(message.title, TITLE_MAX),
            body: truncateText(message.body, BODY_MAX),
            url: message.url ?? '/dashboard',
            tag: message.tag ?? 'rastreio',
          }),
          sendOptions
        )
      )
    );

    let sent = 0;
    let failed = 0;
    const deadEndpoints = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        sent += 1;
        return;
      }

      const statusCode = result.reason?.statusCode ?? null;
      if (statusCode === 404 || statusCode === 410) {
        // Inscricao expirada/revogada pelo navegador: poda.
        deadEndpoints.push(deliveries[index].subscription.endpoint);
        return;
      }

      failed += 1;
      console.error('[push] falha ao enviar notificacao', {
        statusCode,
        message: result.reason?.message ?? 'unknown',
      });
    });

    if (deadEndpoints.length > 0) {
      await this.prisma.pushSubscription
        .deleteMany({ where: { endpoint: { in: deadEndpoints } } })
        .catch((cause) => {
          console.error('[push] falha ao podar inscricoes mortas', {
            message: cause?.message ?? 'unknown',
          });
        });
    }

    return { sent, failed, pruned: deadEndpoints.length };
  }
}
