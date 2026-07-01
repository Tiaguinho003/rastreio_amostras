'use client';

// Header substituto exibido quando a pagina entra em MODO SELECAO. Layout:
// [X] (sair) | titulo centralizado | [spacer invisivel pra balance visual].
// Usado por:
// - /samples (criar liga, titulo default "Selecionar amostras");
// - /contratos (gerar Espelho de Corretagem, titulo "Selecionar contrato").
//
// Contador "N selecionadas" (quando ha) fica na linha do `.spv2-list-meta`
// abaixo do header.
//
// - onExit: sai do modo selecao (na page); - title: rotulo central.

interface SelectionModeHeaderProps {
  onExit: () => void;
  /** Titulo central. Default "Selecionar amostras" (uso original em /samples). */
  title?: string;
}

export function SelectionModeHeader({
  onExit,
  title = 'Selecionar amostras',
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
      <h1 className="samples-selection-header__title">{title}</h1>
      {/* Spacer invisivel com a mesma largura do botao [X] pra manter o
          titulo centralizado opticamente na linha (grid 3 cols simetrico). */}
      <span className="samples-selection-header__spacer" aria-hidden="true" />
    </header>
  );
}
