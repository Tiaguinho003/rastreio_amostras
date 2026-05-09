'use client';

import { useViewportSync } from '../lib/use-viewport-sync';

// Componente vazio que apenas executa o hook useViewportSync.
// Mantemos como componente pra poder ser inserido no layout root
// como qualquer outro client component (sem precisar tornar todo
// RootLayout client-side).
export function ViewportSync() {
  useViewportSync();
  return null;
}
