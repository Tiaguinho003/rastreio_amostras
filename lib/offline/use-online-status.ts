'use client';

import { useEffect, useState } from 'react';

// Status de conectividade reportado pelo navegador. E uma DICA, nao
// garantia: `navigator.onLine === true` pode ser wifi sem internet real.
// Por isso o envio do formulario sempre TENTA o POST primeiro e so
// enfileira quando a request falha por rede (ApiError status 0); este hook
// serve pra UI (banner, pill desabilitada) e pros gatilhos de sync.
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}
