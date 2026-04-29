'use client';

import Image from 'next/image';
import { useEffect } from 'react';

/**
 * M1: Pagina de manutencao exibida para todos os usuarios nao-ADMIN
 * quando o middleware detecta `MAINTENANCE_MODE=true` no env.
 * Bloqueia interacoes por touch/click/scroll/seleccao via inline styles
 * + classe CSS dedicada no globals.css.
 */
export default function MaintenancePage() {
  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlOverscrollBehavior = document.documentElement.style.overscrollBehavior;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyTouchAction = document.body.style.touchAction;
    const previousBodyUserSelect = document.body.style.userSelect;

    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.userSelect = 'none';

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscrollBehavior;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.touchAction = previousBodyTouchAction;
      document.body.style.userSelect = previousBodyUserSelect;
    };
  }, []);

  return (
    <main
      className="maintenance-page"
      onContextMenu={(event) => event.preventDefault()}
      onTouchMove={(event) => event.preventDefault()}
    >
      <div className="maintenance-card" role="status" aria-live="polite">
        <Image
          src="/logo-safras-branco.png"
          alt="Safras"
          width={180}
          height={60}
          priority
          className="maintenance-logo"
        />
        <div className="maintenance-divider" aria-hidden="true" />
        <h1 className="maintenance-title">Sistema em manutenção</h1>
        <p className="maintenance-message">
          Estamos atualizando o sistema para deixá-lo melhor para você.
        </p>
        <p className="maintenance-message">Em breve voltaremos com tudo pronto.</p>
        <p className="maintenance-footer">Obrigado pela compreensão.</p>
      </div>
    </main>
  );
}
