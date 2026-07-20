'use client';

import { useEffect, useState } from 'react';

// Gate JS de desktop (breakpoint canonico 901px — Design-Language §8). Mesmo
// padrao que vivia inline em samples/ContratosPanel/dashboard; extraido na FV
// (RD14) pra tabela institucional de /cadastros. SSR/primeiro paint: false
// (mobile-first) — quem consome deve tolerar o flip pos-hydration.
const DESKTOP_MQ = '(min-width: 901px)';

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isDesktop;
}
