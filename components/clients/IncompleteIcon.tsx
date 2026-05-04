// 14.4.B: SVG reutilizavel — triangulo de aviso amarelo. Usado no badge
// dos cards (com pulsacao) e no chip de filtro de incompletos.
// Cor #f59e0b (amber-500) consistente cross-device, evitando variacoes do
// emoji nativo entre iOS/Android.

type IncompleteIconProps = {
  className?: string;
  ariaHidden?: boolean;
};

export function IncompleteIcon({ className, ariaHidden = true }: IncompleteIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={ariaHidden}
      focusable="false"
    >
      <path
        d="M12 2 L22 20 L2 20 Z"
        fill="#f59e0b"
        stroke="#92400e"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <line x1="12" y1="9" x2="12" y2="14" stroke="#000" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.1" fill="#000" />
    </svg>
  );
}
