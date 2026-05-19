'use client';

// Liga B1.4 (Liga F1.D / F1.1): header substituto exibido em
// /samples quando o usuario entra em modo selecao para criar liga.
// Layout: [X] (sair) | "Selecionar amostras" (titulo centralizado) |
// [spacer invisivel pra balance visual].
//
// Contador "N selecionadas" foi movido pra linha do `.spv2-list-meta`
// abaixo do header (lado direito, na mesma linha do "X registros").
//
// - onExit: sai do modo selecao + limpa selectedIds (na page).

interface SelectionModeHeaderProps {
  onExit: () => void;
}

export function SelectionModeHeader({ onExit }: SelectionModeHeaderProps) {
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
      {/* Spacer invisivel com a mesma largura do botao [X] pra manter o
          titulo centralizado opticamente na linha (grid 3 cols simetrico). */}
      <span className="samples-selection-header__spacer" aria-hidden="true" />
    </header>
  );
}
