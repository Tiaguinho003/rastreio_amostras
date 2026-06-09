'use client';

import Image from 'next/image';

interface SplashVisualProps {
  /**
   * `false` (default) = splash de boot (animações lentas e contemplativas).
   * `true` = loader de página lenta (`.is-page-loader`): aparece mais rápido,
   * z-index logo abaixo do boot e a barra para em ~88% (indeterminado).
   */
  pageLoader?: boolean;
  /** Dispara a animação de saída (`splash-exit`) antes de desmontar. */
  exiting?: boolean;
  /** Texto sob a barra de progresso. */
  statusText?: string;
}

/**
 * Visual compartilhado do carregamento da marca: partículas (bolinhas), logo
 * SAFRAS com glow, barra de progresso e status. Usado pelo `SplashScreen`
 * (boot) e pelo loader global de página lenta (`LoadingProvider`).
 */
export function SplashVisual({
  pageLoader = false,
  exiting = false,
  statusText = 'Carregando',
}: SplashVisualProps) {
  return (
    <div
      className={`splash-screen${pageLoader ? ' is-page-loader' : ''}${
        exiting ? ' is-exiting' : ''
      }`}
      aria-hidden="true"
    >
      <div className="splash-particles">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="splash-particle" style={{ '--p': i } as React.CSSProperties} />
        ))}
      </div>

      <div className="splash-center">
        <div className="splash-logo-glow" />
        <Image
          src="/logo-safras-branco.png"
          alt=""
          width={1024}
          height={299}
          priority={!pageLoader}
          className="splash-logo"
        />
      </div>

      <div className="splash-footer">
        <div className="splash-progress-track">
          <div className="splash-progress-fill" />
        </div>
        <p className="splash-status">
          {statusText}
          <span className="splash-dots">...</span>
        </p>
      </div>
    </div>
  );
}
