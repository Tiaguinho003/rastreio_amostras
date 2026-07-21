'use client';

// Check de sucesso CANONICO dos modais/paineis (rodada 6 FV): overlay branco
// cobrindo o sheet com o circulo+tick desenhando — mesmo efeito que o
// quick-create de cliente e os fluxos de amostra ja usavam
// (.client-create-success-overlay). Toda acao de sucesso de modal mostra este
// check no lugar de frases de sucesso.
//
// Renderizar como filho DIRETO do conteudo do BottomSheet (ou do modal): o
// position:absolute ancora no proprio sheet (fixed), entao o overlay cobre o
// painel inteiro, incluindo header e footer, mesmo com o corpo rolado.
export function SuccessCheckOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="client-create-success-overlay" aria-live="polite">
      <svg className="client-create-success-check" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="24" fill="none" stroke="#2f8a3e" strokeWidth="2.5" />
        <path
          fill="none"
          stroke="#2f8a3e"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 27l7 7 15-15"
        />
      </svg>
    </div>
  );
}
