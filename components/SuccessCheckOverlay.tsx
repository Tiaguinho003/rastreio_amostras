'use client';

// Overlay de efeito TERMINAL dos modais/paineis (rodada 6 FV, generalizado no
// ciclo de unificacao 2026-07-22): cobre o sheet inteiro (header + footer) com
// um veu branco e desenha o efeito no centro. Renderizar como filho DIRETO do
// conteudo do BottomSheet (ou do modal): o position:absolute ancora no proprio
// sheet (fixed), entao o overlay cobre o painel inteiro mesmo com o corpo
// rolado.
//
// Tres variantes, um veu so — a posicao e a animacao de entrada sao as mesmas
// pra todas, so o desenho central muda:
//  - `check`     (default): circulo + tick VERDE. Toda acao de sucesso de
//                criacao/edicao (o padrao dos 14 consumidores existentes).
//  - `x`         : circulo + X VERMELHO, com rotulo. Reversao dentro do sheet
//                (ex.: cancelar envio) — nao e "sucesso de criacao", mas
//                tambem nao redireciona pra lista como o deletar/reverter.
//  - `stamp-loss`: CARIMBO de borracha VERMELHO ("slam" + rotacao). Registro de
//                PERDA — o unico efeito com carater proprio, herdado do antigo
//                modal de movimentacao (`.sdv-stamp`).
//
// A duracao unica dos overlays vive aqui pra nao divergir entre os fluxos (era
// 800/900/1000 espalhados). Quem mostra o overlay agenda o fechamento com esta
// constante.
export const SUCCESS_CHECK_MS = 900;

type SuccessCheckVariant = 'check' | 'x' | 'stamp-loss';

export function SuccessCheckOverlay({
  show,
  variant = 'check',
  label,
  fixed = false,
}: {
  show: boolean;
  variant?: SuccessCheckVariant;
  label?: string;
  /**
   * `position: fixed` no lugar do absolute padrao — pra quando o overlay NAO e
   * filho de um sheet posicionado e precisa cobrir a tela (ex.: sucesso da
   * classificacao na camera, portalado no body). Sem isto o overlay ancora no
   * proprio sheet.
   */
  fixed?: boolean;
}) {
  if (!show) return null;
  const base = `client-create-success-overlay${fixed ? ' is-fixed' : ''}`;

  if (variant === 'stamp-loss') {
    return (
      <div className={`${base} is-stamp`} role="alert" aria-live="assertive">
        <div className="sdv-stamp is-loss">
          <span className="sdv-stamp-text">{label ?? 'Perdido'}</span>
        </div>
      </div>
    );
  }

  if (variant === 'x') {
    return (
      <div className={`${base} is-negative`} role="alert" aria-live="assertive">
        <svg className="client-create-success-check is-x" viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="26" cy="26" r="24" fill="none" stroke="#c0392b" strokeWidth="2.5" />
          <path
            fill="none"
            stroke="#c0392b"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18 18 34 34M34 18 18 34"
          />
        </svg>
        {label ? <p className="client-create-success-label">{label}</p> : null}
      </div>
    );
  }

  return (
    <div className={base} aria-live="polite">
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
      {label ? <p className="client-create-success-label">{label}</p> : null}
    </div>
  );
}
