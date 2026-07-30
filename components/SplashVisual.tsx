'use client';

import Image from 'next/image';

interface SplashVisualProps {
  /**
   * `true` = loader de página lenta (`.is-page-loader`): aparece mais rápido e
   * a barra para em ~88% (indeterminado). É o ÚNICO valor usado desde a F1 do
   * ciclo SN — o `false` (variante de boot, animações lentas) ficou sem
   * chamador quando o `SplashScreen` foi apagado.
   */
  pageLoader?: boolean;
  /** Dispara a animação de saída (`splash-exit`) antes de desmontar. */
  exiting?: boolean;
  /** Texto sob a barra de progresso. */
  statusText?: string;
}

/**
 * Visual do carregamento da marca: partículas (bolinhas), logo SAFRAS com
 * glow, barra de progresso e status. Único consumidor desde a F1 do ciclo SN:
 * o loader global de página lenta (`LoadingProvider`) — o `SplashScreen` de
 * boot foi apagado. Ambos morrem na F3 (ver
 * `docs/Shell-e-Navegacao-Plano-de-Trabalho.md` §6).
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
