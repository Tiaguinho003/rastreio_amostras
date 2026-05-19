'use client';

// Liga B1.4 (Liga F1.D / F1.1): header substituto exibido em
// /samples quando o usuario entra em modo selecao para criar liga.
// Layout: [X] (sair) | "Selecionar amostras" (titulo) | contador
// clicavel.
//
// - onExit: sai do modo selecao + limpa selectedIds (na page).
// - onOpenReview: tap no contador abre o bottom-sheet de revisao
//   (B2). Em B1 mostra toast placeholder.

interface SelectionModeHeaderProps {
  selectedCount: number;
  onExit: () => void;
  onOpenReview: () => void;
}

export function SelectionModeHeader({
  selectedCount,
  onExit,
  onOpenReview,
}: SelectionModeHeaderProps) {
  return (
    <header className="samples-selection-header" role="banner">
      <button
        type="button"
        className="samples-selection-header__exit"
        aria-label="Sair do modo seleção"
        onClick={onExit}
      >
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M6 6 18 18" />
          <path d="M18 6 6 18" />
        </svg>
      </button>
      <h1 className="samples-selection-header__title">Selecionar amostras</h1>
      <button
        type="button"
        className="samples-selection-header__counter"
        aria-label={`${selectedCount} amostras selecionadas — abrir revisão`}
        onClick={onOpenReview}
      >
        <span className="samples-selection-header__counter-num">{selectedCount}</span>
        <span className="samples-selection-header__counter-label">
          {selectedCount === 1 ? 'selecionada' : 'selecionadas'}
        </span>
      </button>
    </header>
  );
}
