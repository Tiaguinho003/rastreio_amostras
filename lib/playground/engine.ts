import type { ClassificationDataPayload } from '../classification-form';
import type { BlendComponentInput } from './types';

// Motor de estimativa do Playground — INTERFACE + implementação STUB do
// protótipo. O contrato (PlaygroundEngine/LigaEstimate) é definitivo; a
// implementação real (parse simples PG11 + renormalização PG17 completa)
// substitui `stubEngine` na F2 sem tocar nos componentes do canvas.
//
// O stub faz só aritmética trivial e honesta:
// - composição/proporções/soma de sacas: reais;
// - safra: união distinta ordenada (regra real deriveBlendHarvest);
// - dono: unanimidade por ownerClientId (regra real deriveBlendOwner);
// - peneiras (já `number` no banco): média ponderada simples ignorando nulls;
// - catação/defeitos (texto livre): SEMPRE composição por componente — o stub
//   não interpreta texto (sem parse PG11).

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

export type EstimateCompositionPart = {
  lotNumber: string;
  raw: string | null;
  proportion: number;
};

export type EstimateFieldValue =
  | { kind: 'value'; value: number; partial: boolean }
  | { kind: 'composition'; parts: EstimateCompositionPart[] }
  | { kind: 'empty' };

export type LigaEstimate = {
  totalSacks: number;
  harvest: string | null;
  ownerLabel: string | null;
  composition: Array<{ sampleId: string; lotNumber: string; sacks: number; proportion: number }>;
  peneiras: Record<PeneiraKey, EstimateFieldValue>;
  catacao: EstimateFieldValue;
  defeitos: Record<DefeitoKey, EstimateFieldValue>;
  /** Marca do protótipo: valores vêm do stub, não do motor real (F2). */
  isStub: true;
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

function weightedNumericField(
  components: BlendComponentInput[],
  read: (data: ClassificationDataPayload) => number | null
): EstimateFieldValue {
  let weightedSum = 0;
  let weightTotal = 0;
  let missing = 0;
  for (const component of components) {
    const data = classificationData(component);
    const value = data ? read(data) : null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      weightedSum += value * component.sacks;
      weightTotal += component.sacks;
    } else {
      missing += 1;
    }
  }
  if (weightTotal === 0) return { kind: 'empty' };
  // Pesos renormalizados entre quem TEM o campo (espírito do PG17); a marca
  // `partial` sinaliza estimativa parcial quando algum componente ficou fora.
  return { kind: 'value', value: round2(weightedSum / weightTotal), partial: missing > 0 };
}

function compositionField(
  components: BlendComponentInput[],
  totalSacks: number,
  read: (data: ClassificationDataPayload) => string | null
): EstimateFieldValue {
  const parts: EstimateCompositionPart[] = [];
  let hasValue = false;
  for (const component of components) {
    const data = classificationData(component);
    const raw = data ? read(data) : null;
    if (raw !== null && raw !== '') hasValue = true;
    parts.push({
      lotNumber: lotNumber(component),
      raw: raw === '' ? null : raw,
      proportion: totalSacks > 0 ? round2(component.sacks / totalSacks) : 0,
    });
  }
  if (!hasValue) return { kind: 'empty' };
  return { kind: 'composition', parts };
}

function estimateBlend(components: BlendComponentInput[]): LigaEstimate {
  const totalSacks = components.reduce((sum, component) => sum + component.sacks, 0);
  const sorted = [...components].sort((a, b) => b.sacks - a.sacks);

  const peneiras = {} as Record<PeneiraKey, EstimateFieldValue>;
  for (const key of PENEIRA_KEYS) {
    peneiras[key] = weightedNumericField(components, (data) => data.peneiras?.[key] ?? null);
  }

  const defeitos = {} as Record<DefeitoKey, EstimateFieldValue>;
  for (const key of DEFEITO_KEYS) {
    defeitos[key] = compositionField(
      components,
      totalSacks,
      (data) => data.defeitos?.[key] ?? null
    );
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
    catacao: compositionField(components, totalSacks, (data) => data.catacao ?? null),
    defeitos,
    isStub: true,
  };
}

export const stubEngine: PlaygroundEngine = { estimateBlend };
