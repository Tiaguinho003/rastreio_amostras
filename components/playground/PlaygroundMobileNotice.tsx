'use client';

// Aviso mobile do Simulador (PG7/PG35): a aba existe no mobile, mas o canvas
// e desktop-only. Estado vazio elegante + CTA de volta pra lista de Lotes.
// Import ESTATICO na pagina — nao carrega nada do React Flow.
export function PlaygroundMobileNotice({ onVerLotes }: { onVerLotes: () => void }) {
  return (
    <div className="pg-mobile-notice" role="status">
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <rect x="2.5" y="4" width="19" height="13" rx="2" />
        <path d="M8 20.5h8" />
        <path d="M12 17v3.5" />
      </svg>
      <h3>O Simulador foi feito para telas grandes</h3>
      <p>Acesse pelo computador para montar simulações de liga no canvas.</p>
      <button type="button" onClick={onVerLotes}>
        Ver lotes
      </button>
    </div>
  );
}
