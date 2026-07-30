import type { SampleSnapshot } from '../types';

// Tipos compartilhados do Playground (Simulador).
// Os módulos puros (graph.ts, engine.ts) trabalham sobre formas MÍNIMAS de
// grafo, independentes do React Flow — os componentes do canvas convertem
// nodes/edges da lib para estas formas antes de chamar os módulos.

export type PgNodeType = 'lote' | 'mistura' | 'resultado';

export type PgGraphNode = {
  id: string;
  type: PgNodeType;
  data?: {
    /** Só nodes 'lote' carregam configuração (null enquanto não escolhido). */
    sampleId?: string | null;
    sacks?: number | null;
    /**
     * PG65: node desativado. Vale para os TRÊS tipos — o node continua no
     * canvas e com as ligações intactas, e o que muda é que ele sai do
     * cálculo. Ver a regra única em `isActive`, no `graph.ts`.
     */
    disabled?: boolean;
  };
};

export type PgGraphEdge = { source: string; target: string };

/** Um componente resolvido da liga simulada: lote real + sacas contribuídas. */
export type BlendComponentInput = { sample: SampleSnapshot; sacks: number };
