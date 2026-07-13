import type { SampleSnapshot } from '../types';
import type { BlendComponentInput, PgGraphEdge, PgGraphNode, PgNodeType } from './types';

// Grafo → domínio do Playground (puro, testável com node --test).
// Regras espelhadas do domínio real: PG13 (cascata com resultado inteiro),
// PG16 (mesmo lote 2× na mesma Mistura bloqueado), ≥2 entradas por Mistura
// (regra do createBlend real).

const VALID_PAIRS: ReadonlySet<string> = new Set([
  'lote->mistura',
  'mistura->mistura',
  'mistura->resultado',
  'alvo->combinacoes',
]);

/** Nodes de saída aceitam uma única edge de entrada. */
const SINGLE_INPUT_TYPES: ReadonlySet<PgNodeType> = new Set(['resultado', 'combinacoes']);

export type ConnectionRejectionReason =
  | 'SELF'
  | 'INVALID_PAIR'
  | 'DUPLICATE_EDGE'
  | 'DUPLICATE_LOT_IN_MIX'
  | 'INPUT_OCCUPIED'
  | 'CYCLE';

export type ConnectionVerdict = { ok: true } | { ok: false; reason: ConnectionRejectionReason };

function indexNodes(nodes: PgGraphNode[]): Map<string, PgGraphNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

/** O alvo alcança a origem seguindo edges de saída? (detecção de ciclo) */
function reaches(edges: PgGraphEdge[], from: string, to: string): boolean {
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === to) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges) {
      if (edge.source === current) stack.push(edge.target);
    }
  }
  return false;
}

export function validateConnection(
  nodes: PgGraphNode[],
  edges: PgGraphEdge[],
  candidate: PgGraphEdge
): ConnectionVerdict {
  if (candidate.source === candidate.target) return { ok: false, reason: 'SELF' };
  const byId = indexNodes(nodes);
  const source = byId.get(candidate.source);
  const target = byId.get(candidate.target);
  if (!source || !target) return { ok: false, reason: 'INVALID_PAIR' };
  if (!VALID_PAIRS.has(`${source.type}->${target.type}`)) {
    return { ok: false, reason: 'INVALID_PAIR' };
  }
  if (edges.some((edge) => edge.source === candidate.source && edge.target === candidate.target)) {
    return { ok: false, reason: 'DUPLICATE_EDGE' };
  }
  if (
    SINGLE_INPUT_TYPES.has(target.type) &&
    edges.some((edge) => edge.target === candidate.target)
  ) {
    return { ok: false, reason: 'INPUT_OCCUPIED' };
  }
  // PG16: o mesmo lote real não entra 2× na MESMA Mistura (só direto — via
  // cascata é permitido, como no domínio real onde a liga é outro sample).
  if (source.type === 'lote' && target.type === 'mistura') {
    const sampleId = source.data?.sampleId ?? null;
    if (sampleId) {
      const duplicate = edges.some((edge) => {
        if (edge.target !== candidate.target) return false;
        const other = byId.get(edge.source);
        return other?.type === 'lote' && (other.data?.sampleId ?? null) === sampleId;
      });
      if (duplicate) return { ok: false, reason: 'DUPLICATE_LOT_IN_MIX' };
    }
  }
  if (
    source.type === 'mistura' &&
    target.type === 'mistura' &&
    reaches(edges, candidate.target, candidate.source)
  ) {
    return { ok: false, reason: 'CYCLE' };
  }
  return { ok: true };
}

export type CompositionFailureReason = 'NO_MIX' | 'MIX_NEEDS_TWO_INPUTS' | 'UNCONFIGURED_LOT';

export type CompositionResult =
  | { ok: true; components: BlendComponentInput[] }
  | { ok: false; reason: CompositionFailureReason; nodeId: string };

/**
 * Achata o grafo a partir de um node Resultado até os lotes de origem,
 * agregando sacas por lote (o mesmo lote pode chegar por ramos diferentes da
 * cascata — soma, como o overcommit permitido do domínio real).
 */
export function resolveComposition(
  nodes: PgGraphNode[],
  edges: PgGraphEdge[],
  resultNodeId: string,
  lotsById: ReadonlyMap<string, SampleSnapshot>
): CompositionResult {
  const byId = indexNodes(nodes);
  const mixEdge = edges.find(
    (edge) => edge.target === resultNodeId && byId.get(edge.source)?.type === 'mistura'
  );
  if (!mixEdge) return { ok: false, reason: 'NO_MIX', nodeId: resultNodeId };

  const totals = new Map<string, number>();
  const visited = new Set<string>();

  function collect(mixId: string): CompositionResult | null {
    // Ciclos são barrados na conexão (validateConnection); o guard evita loop
    // infinito caso um grafo inválido chegue aqui por outra via.
    if (visited.has(mixId)) return null;
    visited.add(mixId);
    const inputs = edges.filter((edge) => edge.target === mixId);
    if (inputs.length < 2) return { ok: false, reason: 'MIX_NEEDS_TWO_INPUTS', nodeId: mixId };
    for (const edge of inputs) {
      const source = byId.get(edge.source);
      if (!source) continue;
      if (source.type === 'lote') {
        const sampleId = source.data?.sampleId ?? null;
        const sacks = source.data?.sacks ?? null;
        if (!sampleId || typeof sacks !== 'number' || sacks < 1 || !lotsById.has(sampleId)) {
          return { ok: false, reason: 'UNCONFIGURED_LOT', nodeId: source.id };
        }
        totals.set(sampleId, (totals.get(sampleId) ?? 0) + sacks);
      } else if (source.type === 'mistura') {
        // PG13: a mistura aninhada contribui com o resultado INTEIRO.
        const failure = collect(source.id);
        if (failure) return failure;
      }
    }
    return null;
  }

  const failure = collect(mixEdge.source);
  if (failure) return failure;

  const components: BlendComponentInput[] = [];
  for (const [sampleId, sacks] of totals) {
    const sample = lotsById.get(sampleId);
    if (sample) components.push({ sample, sacks });
  }
  return { ok: true, components };
}
