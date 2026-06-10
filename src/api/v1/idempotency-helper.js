import { randomUUID } from 'node:crypto';

import { toHttpErrorResponse } from '../http-utils.js';

// #5 (Q-02 + Q-25): suporte a header Idempotency-Key em rotas de criacao.
// Decisoes: A1 (ignora body diferente, retorna cached); B1 (cache TUDO,
// inclusive 4xx/5xx); C1 (header opcional); D2 (sem cleanup automatico
// nesta fase); T8 (scope inclui actorUserId).
//
// Padrao: store separa o acesso ao Prisma; helper de wrap orquestra
// a logica. Uso:
//   const result = await withIdempotency({
//     store, scope: 'POST /clients:user-<id>', headers, handler: async () => ({ status, body }),
//   });

export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_KEY_MIN_LEN = 1;
export const IDEMPOTENCY_KEY_MAX_LEN = 255;
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

// Scope canonico por rota. Sempre concatenar `:user-<actorUserId>` no
// caller para obter o scope completo (T8).
export const IDEMPOTENCY_SCOPES = {
  CREATE_CLIENT: 'POST /clients',
  CREATE_CLIENT_UNIT: 'POST /clients/:id/units',
  // Informe de visita: a fila offline reenvia com a mesma key (id gerado
  // no aparelho) ate o servidor confirmar — replay nao pode duplicar.
  CREATE_VISIT_REPORT: 'POST /visit-reports',
};

/** Le header de qualquer formato de chave (case-insensitive em runtime do
 * Next.js, mas defensivo aqui). Retorna null se ausente ou invalido. */
export function readIdempotencyKey(headers) {
  if (!headers || typeof headers !== 'object') return null;
  const raw = headers[IDEMPOTENCY_HEADER] ?? headers['Idempotency-Key'];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < IDEMPOTENCY_KEY_MIN_LEN || trimmed.length > IDEMPOTENCY_KEY_MAX_LEN) {
    return null;
  }
  return trimmed;
}

/** Combina scope da rota + actorUserId para isolar caches por usuario (T8). */
export function buildScopeKey(routeScope, actorUserId) {
  const userPart = actorUserId && typeof actorUserId === 'string' ? actorUserId : 'anon';
  return `${routeScope}:user-${userPart}`;
}

/** Persistencia de cache de idempotency. Encapsula acesso ao Prisma para
 * facilitar mock em tests. */
export class IdempotencyStore {
  constructor({ prisma }) {
    if (!prisma) throw new Error('IdempotencyStore requires prisma');
    this.prisma = prisma;
  }

  /** Retorna registro nao-expirado para (scope, key), ou null. */
  async get(scope, key) {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key } },
    });
    if (!record) return null;
    if (record.expiresAt <= new Date()) {
      // Expirado — remove silenciosamente para liberar a chave.
      try {
        await this.prisma.idempotencyRecord.delete({ where: { id: record.id } });
      } catch {
        // Se outro processo ja deletou, segue.
      }
      return null;
    }
    return record;
  }

  /** Insere o cache. Retorna `{ ...record, replay: boolean }`:
   *  - `replay: false` quando o INSERT bem-sucedido (este request foi o
   *    primeiro a gravar)
   *  - `replay: true` em UNIQUE violation (P2002 fallback) — outro
   *    request gravou primeiro; retornamos o existente.
   *  Caller usa o flag `replay` para decidir entre devolver `result`
   *  do handler ou o `responseBody` cached (B3 fix do post-#5: comparar
   *  por status code falha quando ambos coincidem mas bodies diferem). */
  async put(scope, key, statusCode, responseBody, ttlMs = IDEMPOTENCY_TTL_MS) {
    const expiresAt = new Date(Date.now() + ttlMs);
    try {
      const created = await this.prisma.idempotencyRecord.create({
        data: {
          id: randomUUID(),
          scope,
          key,
          statusCode,
          responseBody,
          expiresAt,
        },
      });
      return { ...created, replay: false };
    } catch (err) {
      if (err && err.code === 'P2002') {
        // Race: outro request ja gravou. Le e retorna o cached.
        const existing = await this.prisma.idempotencyRecord.findUnique({
          where: { scope_key: { scope, key } },
        });
        if (existing) return { ...existing, replay: true };
      }
      throw err;
    }
  }
}

/** Wrap handler com logica de cache. Se header ausente, executa direto
 * sem cache (C1). Cache hit retorna `{ status, body, idempotent: true }`.
 * Cache miss executa handler e grava resposta. */
export async function withIdempotency({ store, scope, headers, handler }) {
  if (!store) {
    // Defensivo: em ambientes sem store configurado, nao bloqueia o
    // request — apenas executa sem cache.
    return handler();
  }

  const key = readIdempotencyKey(headers);
  if (!key) {
    // C1: header opcional. Sem header, sem cache.
    return handler();
  }

  const cached = await store.get(scope, key);
  if (cached) {
    return {
      status: cached.statusCode,
      body: cached.responseBody,
      idempotent: true,
    };
  }

  // B1: cache TUDO. Capturamos HttpError (e demais) aqui para cachear
  // a resposta de erro tambem. handler() pode lancar — convertemos para
  // shape `{ status, body }` antes de armazenar.
  let result;
  try {
    result = await handler();
  } catch (err) {
    result = toHttpErrorResponse(err);
  }

  if (
    result &&
    typeof result.status === 'number' &&
    Object.prototype.hasOwnProperty.call(result, 'body')
  ) {
    // B4 fix do post-#5: schema responseBody e NOT NULL — fallback {}
    // protege contra handler futuro que retorne body undefined.
    const stored = await store.put(scope, key, result.status, result.body ?? {});
    // B3 fix do post-#5: race condition (P2002) detectada pela flag
    // `replay: true` retornada pelo store. Comparar por statusCode
    // falhava quando ambos requests retornavam mesmo status mas bodies
    // diferentes — devolvia o body do request perdedor da race.
    if (stored && stored.replay) {
      return {
        status: stored.statusCode,
        body: stored.responseBody,
        idempotent: true,
      };
    }
  }

  return result;
}
