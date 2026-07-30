'use client';

import { useEffect, useRef } from 'react';

import { subscribe } from './bus';
import type { RevalidationSubject } from './subjects';

// F3 do ciclo SN — o hook unico de revalidacao. ABSORVEU o antigo
// `lib/use-list-revalidation.ts` (foreground + poll) e os listeners que o
// `use-recent-sends-feed.ts` mantinha por conta propria, e acrescentou a
// terceira origem, que e a que faltava: o BARRAMENTO.
//
// As tres origens e por que cada uma existe:
//
//   'publish'    — alguem escreveu no assunto. E a cura da queixa "so atualiza
//                  se eu sair e voltar da pagina": agora a tela reage a acao
//                  feita em OUTRA superficie, sem desmontar nada. NAO passa
//                  pelo throttle — mudanca conhecida nao e palpite.
//   'foreground' — o app/aba voltou ao primeiro plano. E a cura de "as vezes so
//                  saindo e voltando do app": voltar do background nao remonta
//                  nada, entao sem isto so um restart do processo atualizava.
//   'poll'       — intervalo com a pagina visivel. Pega o que outro usuario fez
//                  enquanto esta tela ficou aberta e parada.

const DEFAULT_POLL_MS = 60_000;
const DEFAULT_THROTTLE_MS = 30_000;

export type RevalidationSource = 'publish' | 'foreground' | 'poll';

export function useRevalidate({
  subjects,
  enabled,
  onRevalidate,
  pollMs = DEFAULT_POLL_MS,
  throttleMs = DEFAULT_THROTTLE_MS,
}: {
  /** Assuntos que ESTA tela exibe — inclusive os indiretos (um contrato mostra
   *  cliente e lote, entao assina os tres). E aqui que mora o leque cruzado. */
  subjects: readonly RevalidationSubject[];
  enabled: boolean;
  onRevalidate: (source: RevalidationSource) => void;
  /** `null` desliga o poll — para superfície que fica aberta o dia todo e não
   *  justifica uma request por minuto (o barramento e o foreground bastam). */
  pollMs?: number | null;
  throttleMs?: number;
}) {
  const lastRunRef = useRef<number>(Date.now());
  // Latest-ref: listeners/interval estaveis mesmo se o callback re-criar.
  const onRevalidateRef = useRef(onRevalidate);
  onRevalidateRef.current = onRevalidate;

  // Chave estavel: o chamador passa array inline (`['lotes', 'clientes']`), que
  // muda de identidade a cada render e re-rodaria o efeito sem parar.
  const subjectsKey = [...subjects].sort().join(',');

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const activeSubjects = subjectsKey ? (subjectsKey.split(',') as RevalidationSubject[]) : [];

    function run(source: RevalidationSource) {
      lastRunRef.current = Date.now();
      onRevalidateRef.current(source);
    }

    function handleReturnToForeground() {
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (Date.now() - lastRunRef.current < throttleMs) {
        return;
      }
      run('foreground');
    }

    function handleInterval() {
      if (document.visibilityState !== 'visible') {
        return;
      }
      run('poll');
    }

    const unsubscribe =
      activeSubjects.length > 0 ? subscribe(activeSubjects, () => run('publish')) : null;

    document.addEventListener('visibilitychange', handleReturnToForeground);
    window.addEventListener('focus', handleReturnToForeground);
    const intervalId = pollMs === null ? null : window.setInterval(handleInterval, pollMs);

    return () => {
      unsubscribe?.();
      document.removeEventListener('visibilitychange', handleReturnToForeground);
      window.removeEventListener('focus', handleReturnToForeground);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [enabled, pollMs, throttleMs, subjectsKey]);
}
