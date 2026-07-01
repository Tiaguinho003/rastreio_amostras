'use client';

import { useEffect, useState } from 'react';

// Mantem o ultimo valor NAO-nulo montado por `delayMs` apos ele virar null —
// pra dar tempo do slide-down de saida de um <BottomSheet> completar antes do
// unmount (o sheet fica montado ~ANIMATION_MS animando o close; se o pai
// desmonta na hora, o slide-down e cortado). Uso:
//
//   const rendered = useDelayedValue(target, ANIMATION_MS);
//   {rendered ? <Sheet open={target != null} data={rendered} /> : null}
//
// `open` reflete a intencao AO VIVO (fecha imediato, dispara o slide-down);
// `rendered` segura os dados/JSX durante a animacao. Pra flags booleanas use
// `useDelayedValue(flag || null, ANIMATION_MS)`.
export function useDelayedValue<T>(value: T | null, delayMs: number): T | null {
  const [rendered, setRendered] = useState<T | null>(value);
  useEffect(() => {
    if (value != null) {
      setRendered(value);
      return;
    }
    const timer = window.setTimeout(() => setRendered(null), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return rendered;
}
