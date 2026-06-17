'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { markActivePath } from '../lib/navigation/route-history';

// Mantem atualizada a "rota ativa" (ver lib/navigation/route-history). Montado
// uma vez no layout (arvore persistente, nao desmonta entre rotas). Atualiza SO
// dentro de um efeito (pos-commit) pra que uma pagina nova consiga ler, no
// proprio render, a rota que ela deixou. Nao renderiza nada.
export function RouteHistoryTracker() {
  const pathname = usePathname();
  useEffect(() => {
    markActivePath(pathname);
  }, [pathname]);
  return null;
}
