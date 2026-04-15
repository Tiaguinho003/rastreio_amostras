// Normalizacao e comparacao dos campos de identificacao da amostra extraidos de
// fichas de classificacao (via OCR) com os valores ja cadastrados no sistema.
//
// Todas as funcoes retornam valores canonicos (ou null quando vazio) para que a
// comparacao seja semantica e nao sensivel a formato (espacos, case, separador
// de safra, etc.).

export type IdentificationField = 'lot' | 'sacks' | 'harvest';

export type IdentificationDivergence = {
  field: IdentificationField;
  extracted: string | number | null;
  stored: string | number | null;
};

export type ExtractedIdentification = {
  lote?: string | null;
  sacas?: string | null;
  safra?: string | null;
};

export type StoredIdentification = {
  internalLotNumber?: string | null;
  declaredSacks?: number | null;
  declaredHarvest?: string | null;
};

/**
 * Normaliza um numero de lote:
 * - trim
 * - uppercase
 * - colapsa espacos internos duplicados em um unico espaco
 * - retorna null se vazio
 */
export function normalizeLot(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = String(value).trim().toUpperCase();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.replace(/\s+/g, ' ');
}

/**
 * Normaliza uma quantidade de sacas:
 * - aceita string ou number
 * - se string, remove caracteres nao numericos exceto separador decimal (. ou ,)
 * - converte virgula decimal em ponto
 * - retorna inteiro (Math.round) ou null se invalido/vazio
 */
export function normalizeSacks(value: string | number | null | undefined): number | null {
  if (value == null) {
    return null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return Math.round(value);
  }

  const trimmed = String(value).trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Mantem apenas digitos, sinal de menos, ponto e virgula.
  const cleaned = trimmed.replace(/[^\d.,-]/g, '').replace(',', '.');
  if (cleaned.length === 0 || cleaned === '-' || cleaned === '.') {
    return null;
  }

  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.round(parsed);
}

/**
 * Normaliza uma safra para o formato canonico "XX/YY":
 * - substitui separadores -, _, \, . por /
 * - remove espacos internos
 * - se matcha "(\d{2,4})/(\d{2,4})", abrevia ambos para os 2 ultimos digitos
 * - se nao der match, retorna a string limpa (sem quebrar)
 * - retorna null se vazio
 */
export function normalizeHarvest(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = String(value).trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Unifica separadores e remove qualquer espaco interno.
  const unified = trimmed.replace(/[-_\\.]/g, '/').replace(/\s+/g, '');
  if (unified.length === 0) {
    return null;
  }

  const match = unified.match(/^(\d{2,4})\/(\d{2,4})$/);
  if (match) {
    const start = match[1].slice(-2);
    const end = match[2].slice(-2);
    return `${start}/${end}`;
  }

  return unified;
}

function toComparableExtracted(
  field: IdentificationField,
  extracted: string | null | undefined
): { normalized: string | number | null; original: string | null } {
  if (extracted == null) {
    return { normalized: null, original: null };
  }
  const original = String(extracted);
  switch (field) {
    case 'lot':
      return { normalized: normalizeLot(original), original };
    case 'sacks':
      return { normalized: normalizeSacks(original), original };
    case 'harvest':
      return { normalized: normalizeHarvest(original), original };
  }
}

/**
 * Compara a identificacao extraida (ex.: de OCR) com a identificacao ja
 * cadastrada da amostra. Retorna a lista de campos que divergem.
 *
 * Regras:
 * - Se o valor extraido for null/vazio (apos normalizacao), NAO conta como
 *   divergencia — assumimos que o OCR pode ter falhado e nao queremos bloquear.
 * - Se o valor extraido tiver conteudo e o cadastrado for null/vazio, conta
 *   como divergencia.
 * - A comparacao e feita apos a normalizacao (lowercase/trim/separadores).
 */
export function compareIdentification(
  extracted: ExtractedIdentification,
  stored: StoredIdentification
): IdentificationDivergence[] {
  const divergences: IdentificationDivergence[] = [];

  const fields: Array<{
    field: IdentificationField;
    extracted: string | null | undefined;
    storedNormalized: string | number | null;
    storedOriginal: string | number | null;
  }> = [
    {
      field: 'lot',
      extracted: extracted.lote ?? null,
      storedNormalized: normalizeLot(stored.internalLotNumber ?? null),
      storedOriginal: stored.internalLotNumber ?? null,
    },
    {
      field: 'sacks',
      extracted: extracted.sacas ?? null,
      storedNormalized: normalizeSacks(stored.declaredSacks ?? null),
      storedOriginal: stored.declaredSacks ?? null,
    },
    {
      field: 'harvest',
      extracted: extracted.safra ?? null,
      storedNormalized: normalizeHarvest(stored.declaredHarvest ?? null),
      storedOriginal: stored.declaredHarvest ?? null,
    },
  ];

  for (const entry of fields) {
    const { normalized: extractedNormalized, original: extractedOriginal } = toComparableExtracted(
      entry.field,
      entry.extracted
    );

    // Extraido vazio/nulo -> nao bloqueia.
    if (extractedNormalized == null) {
      continue;
    }

    if (extractedNormalized !== entry.storedNormalized) {
      divergences.push({
        field: entry.field,
        extracted: extractedOriginal ?? extractedNormalized,
        stored: entry.storedOriginal,
      });
    }
  }

  return divergences;
}
