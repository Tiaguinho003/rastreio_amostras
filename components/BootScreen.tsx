'use client';

import { useEffect, useState } from 'react';

import { shouldShowBootMark, touchLastSeen } from '../lib/boot/last-seen';
import { useIsomorphicLayoutEffect } from '../lib/use-isomorphic-layout-effect';

// F5 do ciclo SN — a entrada do app (SN-D2 / §3.5).
//
// SAO DUAS CAMADAS, e a separacao e o desenho inteiro:
//
// A) A CAIXA VERDE, incondicional. Vem no HTML SERVIDO, entao a primeira
//    pintura do documento ja e verde — nunca branco. E ela que casa com a tela
//    verde nativa do SO (`background_color` do manifest, o mesmo #1f5d43): as
//    duas viram uma tela so, sem costura. Nao espera nada e nao decide nada.
//
// B) O LOGO, condicional. Entra POR CIMA do verde, depois da hidratacao. E por
//    isso que ele pode ser decidido em layout effect sem piscar: aparecer sobre
//    verde e a animacao pretendida, nao um flash. Isso dispensa o <script>
//    inline (e o `suppressHydrationWarning` no <html>) que um seletor de tema
//    exigiria.
//
// 🔴 O ERRO QUE ISTO NAO PODE REPETIR: o splash antigo, apagado na F1, tinha
// `MIN_SPLASH_MS 1200 + EXIT_ANIMATION_MS 700` = piso de 1,9s EM TODO BOOT,
// porque acoplava apresentacao a espera. Aqui a caixa verde nao segura nada (o
// app carrega por baixo dela) e o logo so aparece uma vez a cada 4h.

/** Quanto o logo fica a vista. */
const MARK_HOLD_MS = 650;

/** A saida da caixa verde. Tem que bater com a transicao do CSS. */
const BOOT_FADE_MS = 260;

// A tela e rara por design (1x a cada 4h), entao nao da pra valida-la
// esperando: `?splash=force` forca a marca uma vez. Lido de
// `window.location.search` em vez de `useSearchParams` — o hook exigiria um
// <Suspense> no layout RAIZ, e este componente e a primeira coisa dentro dele.
const FORCE_PARAM = 'splash';
const FORCE_VALUE = 'force';

type Phase = 'boot' | 'mark' | 'leaving' | 'gone';

export function BootScreen() {
  const [phase, setPhase] = useState<Phase>('boot');

  useIsomorphicLayoutEffect(() => {
    const forced =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get(FORCE_PARAM) === FORCE_VALUE;

    const show = forced || shouldShowBootMark(Date.now());
    // Carimbar DEPOIS de decidir: carimbar antes zeraria o tempo fora e a tela
    // nunca apareceria.
    touchLastSeen();
    setPhase(show ? 'mark' : 'leaving');
  }, []);

  // 🔴 A dep e SO `phase`. Com qualquer outra, o `setPhase` abaixo dispararia a
  // limpeza do proprio efeito e mataria o timer que ele acabou de agendar —
  // mesmo erro que o `NavProgressBar` da F4 evita pelo mesmo motivo.
  useEffect(() => {
    if (phase === 'mark') {
      const timer = setTimeout(() => setPhase('leaving'), MARK_HOLD_MS);
      return () => clearTimeout(timer);
    }

    if (phase === 'leaving') {
      const timer = setTimeout(() => setPhase('gone'), BOOT_FADE_MS);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [phase]);

  // O carimbo acompanha o app pelo resto do documento. Sao os mesmos eventos
  // que o `use-revalidate.ts` escuta, mas o listener e proprio: aquele existe
  // por assinante, e uma tela sem assinante nenhum nao carimbaria nada.
  useEffect(() => {
    const stamp = () => touchLastSeen();
    document.addEventListener('visibilitychange', stamp);
    window.addEventListener('pagehide', stamp);
    return () => {
      document.removeEventListener('visibilitychange', stamp);
      window.removeEventListener('pagehide', stamp);
    };
  }, []);

  if (phase === 'gone') {
    return null;
  }

  return (
    <div className={`fv-boot${phase === 'leaving' ? ' is-leaving' : ''}`} aria-hidden="true">
      {phase === 'mark' ? (
        // 🔴 <img> cru, NUNCA next/image: nao ha config de `images`, entao o
        // componente pediria /_next/image?url=… — que NAO esta no cache do
        // service worker. O `STATIC_PATHS` do sw.js cacheia este caminho, e e
        // isso que faz a tela pintar offline.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="fv-boot-logo" src="/logo-safras-branco.png" alt="" />
      ) : null}
    </div>
  );
}
