import type { ClassificationDataPayload, ClassificationFundoEntry } from '../classification-form';
import type { BlendComponentInput } from './types';

// Motor de estimativa do Playground — regras PG39–PG45, fechadas sobre dado
// real em 2026-07-27 (docs/Playground-Plano-de-Trabalho.md §4.6).
//
// O que sustenta tudo (PG40): a classificação mede o PESO de cada campo numa
// amostra de 100g de café, então todo percentual é grama por 100g — e a saca
// é a unidade de massa do sistema (não existe campo de kg). Ponderar por
// sacas é ponderar por massa, e a média ponderada campo a campo NÃO é
// aproximação: é a composição física da mistura. A incerteza que sobra não é
// do cálculo, é de a liga real ser reclassificada por uma pessoa numa
// amostra nova (P2).
//
// As consequências, que valem para os 13 campos calculados:
// - PG41: branco = 0 COM PESO CHEIO, sem renormalizar. Numa ficha real o
//   classificador anota só as peneiras com retenção; branco quer dizer "não
//   há nada aqui", não "não medido". Renormalizar afirmaria que a liga é tão
//   rica quanto o lote puro, o que é impossível quando o outro componente
//   traz metade da massa.
// - PG42: mas se NINGUÉM declarou o campo, o resultado é vazio (traço na
//   UI) — um zero ali afirmaria uma medição que não houve.
// - PG45: texto não numérico ("8-9") é outra coisa — há algo que não se
//   reduz a número. Só AQUELE componente sai do campo (aí sim renormalizando
//   entre os que têm número) e o resultado nomeia quem ficou de fora.
// - PG43: defeito usa a mesma média, mas é contagem — sai sem "%".
// - PG44: fundos combinam por RÓTULO de peneira, como uma peneira qualquer.
//
// Fora do motor por PG39: padrão, aspecto, bebida, certificado, observações,
// data e classificadores. Não são calculados nem exibidos.

export const PENEIRA_KEYS = [
  'p18',
  'p17',
  'p16',
  'p15',
  'p14',
  'p13',
  'p12',
  'p11',
  'p10',
  'mk',
] as const;
export const DEFEITO_KEYS = ['imp', 'pva', 'broca', 'gpi', 'ap', 'defeito'] as const;
export type PeneiraKey = (typeof PENEIRA_KEYS)[number];
export type DefeitoKey = (typeof DEFEITO_KEYS)[number];

/** PG43: `defeito` é o único campo do motor que não é percentual — é contagem. */
export const DEFEITO_UNITS: Record<DefeitoKey, '%' | ''> = {
  imp: '%',
  pva: '%',
  broca: '%',
  gpi: '%',
  ap: '%',
  defeito: '',
};

/** PG45: componente que ficou de fora de um campo, com o valor que o barrou. */
export type EstimateExclusion = { lotNumber: string; raw: string };

export type EstimateFieldValue =
  | { kind: 'value'; value: number; excluded: EstimateExclusion[] }
  | { kind: 'empty'; excluded: EstimateExclusion[] };

/** PG44: um fundo do resultado — rótulo da peneira + percentual combinado. */
export type EstimateFundo = { peneira: string; value: EstimateFieldValue };

export type LigaEstimate = {
  totalSacks: number;
  harvest: string | null;
  ownerLabel: string | null;
  composition: Array<{ sampleId: string; lotNumber: string; sacks: number; proportion: number }>;
  peneiras: Record<PeneiraKey, EstimateFieldValue>;
  fundos: EstimateFundo[];
  catacao: EstimateFieldValue;
  defeitos: Record<DefeitoKey, EstimateFieldValue>;
};

export interface PlaygroundEngine {
  estimateBlend(components: BlendComponentInput[]): LigaEstimate;
}

function classificationData(component: BlendComponentInput): ClassificationDataPayload | null {
  return (component.sample.latestClassification.data as ClassificationDataPayload | null) ?? null;
}

function lotNumber(component: BlendComponentInput): string {
  return component.sample.internalLotNumber ?? '—';
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** União distinta ordenada das safras (regra real de deriveBlendHarvest). */
function deriveHarvest(components: BlendComponentInput[]): string | null {
  const parts = new Set<string>();
  for (const component of components) {
    const harvest = component.sample.declared.harvest;
    if (!harvest) continue;
    for (const piece of harvest.split(',')) {
      const trimmed = piece.trim();
      if (trimmed) parts.add(trimmed);
    }
  }
  if (parts.size === 0) return null;
  return [...parts].sort().join(', ');
}

/** Unanimidade por ownerClientId (regra real): divergência/ausência → null. */
function deriveOwnerLabel(components: BlendComponentInput[]): string | null {
  const first = components[0];
  if (!first) return null;
  const firstOwnerId = first.sample.ownerClientId ?? null;
  if (!firstOwnerId) return null;
  const unanimous = components.every(
    (component) => (component.sample.ownerClientId ?? null) === firstOwnerId
  );
  if (!unanimous) return null;
  return first.sample.declared.owner ?? null;
}

/** O que um campo da ficha traz: number (peneiras/fundos) ou string (o resto). */
type FieldReading = number | string | null | undefined;

type ParsedField =
  | { kind: 'number'; value: number }
  | { kind: 'blank' }
  | { kind: 'unreadable'; raw: string };

/**
 * Parse simples (PG11, mantida): número puro com vírgula ou ponto decimal,
 * opcionalmente sufixado com `%`. NÃO interpreta intervalo ("8-9"), fração
 * ("1/2") nem desigualdade ("<1") — inventar semântica sobre texto livre
 * quebraria o P2.
 */
const NUMERIC_TEXT = /^(\d+(?:[.,]\d+)?)\s*%?$/;

function parseField(raw: FieldReading): ParsedField {
  if (raw === null || raw === undefined) return { kind: 'blank' };
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { kind: 'number', value: raw } : { kind: 'blank' };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'blank' };
  const match = NUMERIC_TEXT.exec(trimmed);
  if (!match) return { kind: 'unreadable', raw: trimmed };
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) ? { kind: 'number', value } : { kind: 'unreadable', raw: trimmed };
}

/**
 * A conta do PG40 com o tratamento de branco (PG41/PG42) e de texto ilegível
 * (PG45). Uma função só: os 13 campos calculados passam todos por aqui.
 */
function combineField(
  components: BlendComponentInput[],
  read: (data: ClassificationDataPayload | null) => FieldReading
): EstimateFieldValue {
  const excluded: EstimateExclusion[] = [];
  let weightedSum = 0;
  let weightTotal = 0;
  let anyDeclared = false;

  for (const component of components) {
    const parsed = parseField(read(classificationData(component)));
    if (parsed.kind === 'unreadable') {
      // PG45: só ESTE componente sai — o peso dele deixa o denominador e o
      // resultado presta contas de quem foi e com que valor.
      excluded.push({ lotNumber: lotNumber(component), raw: parsed.raw });
      continue;
    }
    if (parsed.kind === 'number') anyDeclared = true;
    // PG41: branco vale 0 e mantém o peso cheio.
    weightedSum += (parsed.kind === 'number' ? parsed.value : 0) * component.sacks;
    weightTotal += component.sacks;
  }

  // PG42: sem ninguém declarando, não há o que afirmar — nem zero.
  if (weightTotal === 0 || !anyDeclared) return { kind: 'empty', excluded };
  return { kind: 'value', value: round2(weightedSum / weightTotal), excluded };
}

function fundoEntries(data: ClassificationDataPayload | null): ClassificationFundoEntry[] {
  return data?.fundos ?? [];
}

/**
 * Rótulos de fundo na ordem das peneiras — do maior para o menor. Rótulo que
 * não for número vai para o fim, em ordem alfabética.
 */
function sortFundoLabels(labels: string[]): string[] {
  return [...labels].sort((a, b) => {
    const numberA = Number(a.replace(',', '.'));
    const numberB = Number(b.replace(',', '.'));
    const isNumberA = Number.isFinite(numberA);
    const isNumberB = Number.isFinite(numberB);
    if (isNumberA && isNumberB) return numberB - numberA;
    if (isNumberA) return -1;
    if (isNumberB) return 1;
    return a.localeCompare(b, 'pt-BR');
  });
}

/**
 * PG44: cada rótulo de fundo é um balde próprio e combina como qualquer
 * peneira; rótulo ausente num componente é branco, ou seja 0 com peso cheio
 * (PG41). O resultado pode acabar com MAIS fundos que os 2 slots da ficha de
 * um lote — aqui é exibição, não formulário.
 */
function combineFundos(components: BlendComponentInput[]): EstimateFundo[] {
  const labels = new Set<string>();
  for (const component of components) {
    for (const entry of fundoEntries(classificationData(component))) {
      const label = entry?.peneira?.trim();
      if (label) labels.add(label);
    }
  }
  return sortFundoLabels([...labels]).map((peneira) => ({
    peneira,
    value: combineField(components, (data) => {
      const match = fundoEntries(data).find((entry) => entry?.peneira?.trim() === peneira);
      return match ? match.percentual : null;
    }),
  }));
}

function estimateBlend(components: BlendComponentInput[]): LigaEstimate {
  const totalSacks = components.reduce((sum, component) => sum + component.sacks, 0);
  const sorted = [...components].sort((a, b) => b.sacks - a.sacks);

  const peneiras = {} as Record<PeneiraKey, EstimateFieldValue>;
  for (const key of PENEIRA_KEYS) {
    peneiras[key] = combineField(components, (data) => data?.peneiras?.[key] ?? null);
  }

  const defeitos = {} as Record<DefeitoKey, EstimateFieldValue>;
  for (const key of DEFEITO_KEYS) {
    defeitos[key] = combineField(components, (data) => data?.defeitos?.[key] ?? null);
  }

  return {
    totalSacks,
    harvest: deriveHarvest(components),
    ownerLabel: deriveOwnerLabel(components),
    composition: sorted.map((component) => ({
      sampleId: component.sample.id,
      lotNumber: lotNumber(component),
      sacks: component.sacks,
      proportion: totalSacks > 0 ? round2(component.sacks / totalSacks) : 0,
    })),
    peneiras,
    fundos: combineFundos(components),
    catacao: combineField(components, (data) => data?.catacao ?? null),
    defeitos,
  };
}

export const playgroundEngine: PlaygroundEngine = { estimateBlend };
