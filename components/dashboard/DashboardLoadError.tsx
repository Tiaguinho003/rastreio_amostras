'use client';

// Erro de carregamento do dashboard + ação de retry (decisão: mostrar erro + retry
// em vez de skeleton/vazio eterno). Reusa a classe canônica `.dashboard-error-banner`
// (skill feedback-messages, role="status") e acrescenta o botão "Tentar novamente".
// `compact` = uso DENTRO de um card (o donut usa o banner cheio no topo da página;
// os cards de envios/eventos usam o compacto no corpo).
export function DashboardLoadError({
  message,
  onRetry,
  compact = false,
}: {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`dashboard-error-banner${compact ? ' is-compact' : ''}`} role="status">
      <span className="dashboard-error-text">{message}</span>
      {onRetry ? (
        <button type="button" className="dashboard-error-retry" onClick={onRetry}>
          Tentar novamente
        </button>
      ) : null}
    </div>
  );
}
