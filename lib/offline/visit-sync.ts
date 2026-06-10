import { ApiError, createVisitReport } from '../api-client';
import type { SessionData } from '../types';
import {
  listVisitOutbox,
  removeVisitFromOutbox,
  updateVisitOutboxEntry,
  countVisitOutbox,
} from './visit-outbox';

// Sincronizacao da fila offline de informes de visita.
// Processa em serie (ordem cronologica de preenchimento), com lock de
// concorrencia: gatilhos simultaneos (mount + evento online + voltar pro
// app) compartilham o mesmo flush em vez de duplicar envios. Cada POST vai
// com Idempotency-Key = id da entrada — mesmo que dois aparelhos/abas
// disparem juntos, o servidor grava uma vez so.

export interface VisitSyncResult {
  /** Enviados e confirmados nesta rodada. */
  sent: number;
  /** Ainda na fila (rede caiu no meio, 5xx, ou erros permanentes). */
  remaining: number;
  /** Rejeitados pelo servidor com 4xx (≠401) — ficam na fila com lastError. */
  failed: number;
  /** Encontrou 401: sessao venceu; parar e pedir novo login. */
  authExpired: boolean;
}

// Disparado UMA vez por rodada com resultado relevante (enviou, falhou ou
// sessao expirou). Quem anuncia ao usuario e um unico listener global (no
// AppShell) — gatilhos concorrentes compartilham o flush pelo lock e nao
// geram toast duplicado.
export const VISIT_SYNC_COMPLETED_EVENT = 'rastreio:visit-sync-completed';

function emitSyncCompleted(result: VisitSyncResult): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (result.sent > 0 || result.failed > 0 || result.authExpired) {
    window.dispatchEvent(new CustomEvent(VISIT_SYNC_COMPLETED_EVENT, { detail: result }));
  }
}

let syncInFlight: Promise<VisitSyncResult> | null = null;

export function flushVisitOutbox(session: SessionData): Promise<VisitSyncResult> {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = doFlush(session).finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function doFlush(session: SessionData): Promise<VisitSyncResult> {
  const entries = await listVisitOutbox(session.user.id);
  // Ordem cronologica de preenchimento — o Resumo recebe na ordem real.
  entries.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  let sent = 0;
  let failed = 0;
  let authExpired = false;

  for (const entry of entries) {
    try {
      await createVisitReport(session, entry.payload, { idempotencyKey: entry.id });
      await removeVisitFromOutbox(entry.id);
      sent += 1;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        // Sessao venceu entre o preenchimento e o sync: mantem tudo na
        // fila e avisa o caller pra pedir novo login.
        authExpired = true;
        break;
      }

      if (
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 401
      ) {
        // Rejeicao permanente (ex: 422). Nao deveria acontecer — o form
        // valida antes de enfileirar — mas se acontecer a entrada fica na
        // fila com o erro registrado, visivel no contador, sem travar as
        // demais.
        failed += 1;
        await updateVisitOutboxEntry({
          ...entry,
          attempts: entry.attempts + 1,
          lastError: `${cause.status}: ${cause.message}`,
        });
        continue;
      }

      // Rede caiu (status 0), 5xx ou erro inesperado: condicao transitoria
      // global — para a rodada inteira e tenta de novo no proximo gatilho.
      break;
    }
  }

  const remaining = await countVisitOutbox(session.user.id);
  const result = { sent, remaining, failed, authExpired };
  emitSyncCompleted(result);
  return result;
}
