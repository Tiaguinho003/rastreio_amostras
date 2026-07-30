'use client';

import { useEffect, useLayoutEffect } from 'react';

// `useLayoutEffect` avisa no console quando roda no servidor. Este alias cai pro
// `useEffect` la e mantem o comportamento de "roda antes da pintura" no cliente.
//
// Use quando o efeito PRECISA acontecer antes do browser pintar — restaurar
// scroll, por exemplo: com `useEffect` a pagina aparece no topo e da um pulo.
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;
