'use client';

interface SampleQuickCreateFabProps {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}

// FAB pra acionar criacao rapida de amostra. Reusa o CSS `.cv2-fab` ja
// usado em `/clients` (gradiente verde, posicao fixed bottom-right em
// mobile, inline no `.hero-search-wrap` em desktop via media query).
// Sem comportamento adicional — wrapper minimalista que delega
// posicionamento ao CSS responsivo existente.
export function SampleQuickCreateFab({
  onClick,
  disabled = false,
  ariaLabel = 'Cadastrar nova amostra',
}: SampleQuickCreateFabProps) {
  return (
    <button
      type="button"
      className="cv2-fab"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
    >
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    </button>
  );
}
