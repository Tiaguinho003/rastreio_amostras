'use client';

import { useEffect, useState } from 'react';

// Valor "atrasado": reflete `value` so depois de `delayMs` sem novas mudancas.
// Cancela o timer pendente a cada mudanca (e no unmount), entao so o ULTIMO
// valor de uma rajada vinga. Base da busca com debounce da lista de /relatorios
// (evita um refetch por tecla) e, adiante, do preview ao vivo do Informativo
// (evita repintar o canvas a cada tecla).
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
