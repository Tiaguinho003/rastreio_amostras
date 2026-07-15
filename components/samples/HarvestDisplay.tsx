'use client';

// Liga (safra "Mix"): quando uma liga tem 2+ safras distintas, a safra deixa de
// ser mostrada como string concatenada ("24/25, 25/26") e vira um badge "Mix" +
// as safras ao lado. Tom ambar, distinto do lilas "Liga" (BlendBadge) e do
// verde/vermelho de status. Safra unica passa direto (sem badge). Componente
// unico usado em todas as telas que exibem a safra de uma amostra (card,
// detalhe, linhas de origem, modais).

import { splitHarvests } from '../../lib/sample-identification';

export function MixHarvestBadge({ className }: { className?: string }) {
  const composed = ['mix-badge', className].filter(Boolean).join(' ');
  return (
    <span className={composed} role="img" aria-label="Mix de safras">
      Mix
    </span>
  );
}

interface HarvestDisplayProps {
  harvest: string | null | undefined;
  /** Mostra as safras ao lado do badge Mix (detalhe, linhas). O card usa false
      (so o badge — as safras aparecem no detalhe). */
  showMixSafras?: boolean;
  /** Texto quando nao ha safra declarada. */
  fallback?: string;
}

export function HarvestDisplay({
  harvest,
  showMixSafras = true,
  fallback = '—',
}: HarvestDisplayProps) {
  const safras = splitHarvests(harvest);
  if (safras.length === 0) {
    return <>{fallback}</>;
  }
  if (safras.length === 1) {
    return <>{safras[0]}</>;
  }
  return (
    <span className="mix-harvest">
      <MixHarvestBadge />
      {showMixSafras ? <span className="mix-harvest-safras">{safras.join(' · ')}</span> : null}
    </span>
  );
}
