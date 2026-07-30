'use client';

import { useLinkStatus } from 'next/link';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';

import {
  getNavPending,
  getServerNavPending,
  setLinkPending,
  subscribeNavPending,
} from '../lib/navigation/nav-progress';

// SN-D11 — a barra fina de navegacao. Duas pecas, um store no meio
// (`lib/navigation/nav-progress.ts`).
//
// A alternativa descartada foi `loading.tsx` por rota: e o mecanismo nativo do
// App Router e o que Instagram/WhatsApp fazem, mas ele pinta um esqueleto ANTES
// de a pagina montar — ou seja, antes de o snapshot da F3 ser lido. Desfaria o
// que a fase anterior acabou de entregar. A barra nao disputa com o conteudo: o
// snapshot pinta como hoje e ela so diz "estou indo".

// 🔴 So aparece depois deste tempo de espera. Navegacao com o chunk quente
// resolve em um frame; sem o atraso a barra piscaria em TODA troca de aba e
// viraria exatamente o ruido que o ciclo veio tirar. Numero pra ajustar no
// aparelho dele, nao no chute.
const APPEAR_DELAY_MS = 180;

// Quanto a barra fica na tela depois que a navegacao termina: o tempo de ela
// completar e sumir. Tem que cobrir a transicao de opacidade do CSS.
const FINISH_MS = 360;

type Phase = 'idle' | 'running' | 'done';

/**
 * Publica o `pending` do `<Link>` que o contem. Renderiza `null`.
 *
 * 🔴 So funciona DENTRO da arvore de um `<Link>` — e assim que o
 * `useLinkStatus` do Next e definido. Consequencia aceita nesta fase:
 * navegacao por `router.push` (menu de perfil, atalhos) nao acende a barra; o
 * caso da SN-D11 e o toque na aba.
 */
export function LinkPendingProbe() {
  const { pending } = useLinkStatus();
  const id = useId();

  useEffect(() => {
    setLinkPending(id, pending);
    return () => setLinkPending(id, false);
  }, [id, pending]);

  return null;
}

/** A barra em si. Mora no shell, uma por app. */
export function NavProgressBar() {
  const pending = useSyncExternalStore(subscribeNavPending, getNavPending, getServerNavPending);
  const [phase, setPhase] = useState<Phase>('idle');

  // Depende SO de `pending`: se `phase` entrasse nas deps, o `setPhase('done')`
  // abaixo dispararia a limpeza deste efeito e mataria o timer do 'done' antes
  // de ele rodar — a barra ficaria presa em 100%.
  useEffect(() => {
    if (!pending) {
      setPhase((current) => (current === 'running' ? 'done' : current));
      return;
    }

    const timer = setTimeout(() => setPhase('running'), APPEAR_DELAY_MS);
    // Navegacao rapida cai aqui: o timer morre antes de disparar e nada aparece.
    return () => clearTimeout(timer);
  }, [pending]);

  useEffect(() => {
    if (phase !== 'done') return;
    const timer = setTimeout(() => setPhase('idle'), FINISH_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === 'idle') {
    return null;
  }

  return (
    <div className={`fv-navprogress${phase === 'done' ? ' is-done' : ''}`} aria-hidden="true">
      <span className="fv-navprogress-bar" />
    </div>
  );
}
