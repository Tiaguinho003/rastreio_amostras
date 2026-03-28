'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function OfflinePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    function handleOnline() {
      router.replace('/dashboard');
    }

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [router]);

  function handleRetry() {
    setChecking(true);

    if (navigator.onLine) {
      router.replace('/dashboard');
      return;
    }

    setTimeout(() => setChecking(false), 1500);
  }

  return (
    <div className="offline-page">
      <div className="offline-content">
        <div className="offline-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M1 1l22 22" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        </div>
        <h1 className="offline-title">Sem conexao</h1>
        <p className="offline-description">
          Verifique sua conexao com a internet e tente novamente.
        </p>
        <button
          type="button"
          className="offline-retry-btn"
          onClick={handleRetry}
          disabled={checking}
        >
          {checking ? 'Verificando...' : 'Tentar novamente'}
        </button>
      </div>
    </div>
  );
}
