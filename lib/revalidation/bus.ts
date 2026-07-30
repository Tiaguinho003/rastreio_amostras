import type { RevalidationSubject } from './subjects';

// F3 do ciclo SN — o barramento de invalidacao (SN-D13).
//
// Modulo singleton, sem React: quem escreve chama `publish`, quem exibe chama
// `subscribe`. Foi a alternativa escolhida ao TanStack Query — nao pelo peso
// (~13KB e barato), mas porque adotar a lib exigiria reescrever as 8 paginas
// na fase mais arriscada do ciclo. A porta fica aberta: o dia em que a troca
// valer, os assinantes ja estao isolados atras de `useRevalidate`.

// Janela de coalescencia. Um fluxo do app costuma ser VARIAS escritas seguidas
// (criar lote -> anexar foto -> confirmar classificacao = 3 requests). Sem a
// janela, cada uma dispararia um refetch da mesma lista. 120ms e imperceptivel
// pra quem acabou de tocar no botao e colapsa o fluxo inteiro num refetch so.
const COALESCE_MS = 120;

type Listener = (subjects: RevalidationSubject[]) => void;

const listenersBySubject = new Map<RevalidationSubject, Set<Listener>>();

let pending: Set<RevalidationSubject> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  flushTimer = null;
  const batch = pending;
  pending = null;

  if (!batch || batch.size === 0) {
    return;
  }

  // Um listener inscrito em 3 assuntos do mesmo lote deve rodar UMA vez, com os
  // 3 — nao 3 vezes. Por isso agrupa por listener antes de chamar.
  const subjectsByListener = new Map<Listener, RevalidationSubject[]>();

  batch.forEach((subject) => {
    listenersBySubject.get(subject)?.forEach((listener) => {
      const accumulated = subjectsByListener.get(listener);
      if (accumulated) {
        accumulated.push(subject);
      } else {
        subjectsByListener.set(listener, [subject]);
      }
    });
  });

  subjectsByListener.forEach((subjects, listener) => {
    listener(subjects);
  });
}

/**
 * Anuncia que estes assuntos mudaram. Chamado automaticamente pelo
 * `request()` do `lib/api-client.ts` em toda escrita bem-sucedida — nenhum
 * ponto de escrita precisa lembrar de avisar (SN-D14).
 */
export function publish(subjects: readonly RevalidationSubject[]): void {
  if (subjects.length === 0) {
    return;
  }

  if (!pending) {
    pending = new Set();
  }
  subjects.forEach((subject) => pending?.add(subject));

  if (flushTimer === null) {
    flushTimer = setTimeout(flush, COALESCE_MS);
  }
}

/**
 * Inscreve um ouvinte nos assuntos dados. Devolve a funcao de cancelamento.
 * Use o hook `useRevalidate` nos componentes — isto aqui e a camada crua.
 */
export function subscribe(
  subjects: readonly RevalidationSubject[],
  listener: Listener
): () => void {
  subjects.forEach((subject) => {
    const existing = listenersBySubject.get(subject);
    if (existing) {
      existing.add(listener);
    } else {
      listenersBySubject.set(subject, new Set([listener]));
    }
  });

  return () => {
    subjects.forEach((subject) => {
      const existing = listenersBySubject.get(subject);
      if (!existing) {
        return;
      }
      existing.delete(listener);
      if (existing.size === 0) {
        listenersBySubject.delete(subject);
      }
    });
  };
}

/** Só para teste: zera ouvintes e lote pendente entre casos. */
export function resetBusForTests(): void {
  listenersBySubject.clear();
  pending = null;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}
