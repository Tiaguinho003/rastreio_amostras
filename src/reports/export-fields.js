import { HttpError } from '../contracts/errors.js';

export const SAMPLE_EXPORT_FIELDS = [
  'internalLotNumber',
  'owner',
  'sacks',
  'harvest',
  'originLot',
  'classificationDate',
  'padrao',
  'catacao',
  'aspecto',
  'bebida',
  'broca',
  'pva',
  'imp',
  'defeito',
  'classificador',
  'conferredBy',
  'classifiers',
  'observacoes',
  'classificationOriginLot',
  'peneirasPercentuais',
  'technicalType',
  'technicalScreen',
  'technicalDensity',
];

export const SAMPLE_EXPORT_TYPES = ['COMPLETO', 'COMPRADOR_PARCIAL'];

export const SAMPLE_EXPORT_FIELD_LABELS = {
  internalLotNumber: 'Lote interno',
  owner: 'Proprietario',
  sacks: 'Quantidade de sacas',
  harvest: 'Safra',
  originLot: 'Lote de origem (registro)',
  classificationDate: 'Data da classificacao',
  padrao: 'Padrao',
  catacao: 'Catacao',
  aspecto: 'Aspecto',
  bebida: 'Bebida',
  broca: 'Broca',
  pva: 'PVA',
  imp: 'IMP',
  defeito: 'Defeito',
  classificador: 'Classificador',
  conferredBy: 'Conferido por',
  classifiers: 'Classificadores',
  observacoes: 'Observacoes',
  classificationOriginLot: 'Lote de origem (classificacao)',
  peneirasPercentuais: 'Peneiras percentuais',
  technicalType: 'Tipo tecnico',
  technicalScreen: 'Peneira tecnica',
  technicalDensity: 'Densidade tecnica',
};

const SAMPLE_EXPORT_FIELD_SET = new Set(SAMPLE_EXPORT_FIELDS);
const SAMPLE_EXPORT_TYPE_SET = new Set(SAMPLE_EXPORT_TYPES);
const PENEIRA_KEYS = [
  'p18',
  'p17',
  'p16',
  'p15',
  'p14',
  'p13',
  'p12',
  'p10',
  'mk9',
  'mk10',
  'mk11',
];
const SAMPLE_EXPORT_FIELDS_EXCLUDED_FROM_REPORT = new Set(['originLot', 'classificationOriginLot']);
const SAMPLE_EXPORT_FIELDS_ALLOWED_FOR_REPORT = SAMPLE_EXPORT_FIELDS.filter(
  (field) => !SAMPLE_EXPORT_FIELDS_EXCLUDED_FROM_REPORT.has(field)
);
const SAMPLE_EXPORT_FIELDS_BY_TYPE = {
  COMPLETO: [...SAMPLE_EXPORT_FIELDS_ALLOWED_FOR_REPORT],
  COMPRADOR_PARCIAL: SAMPLE_EXPORT_FIELDS_ALLOWED_FOR_REPORT.filter((field) => field !== 'owner'),
};

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toNumberOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value) {
  const parsed = toNumberOrNull(value);
  if (parsed === null) {
    return null;
  }

  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 2,
  }).format(parsed);
}

function formatClassifiersArray(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const names = value
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const name = typeof entry.fullName === 'string' ? entry.fullName.trim() : '';
      return name.length > 0 ? name : null;
    })
    .filter((name) => name !== null);
  if (names.length === 0) {
    return null;
  }
  // Pipe-separado para o renderer expandir em multiplas rows (mesmo padrao
  // usado por formatSieve / peneirasPercentuais).
  return names.join('|');
}

function resolveClassifiersList(classificationData) {
  // Novo canonico: `classificadores`. Fallback: `conferidoPor` (eventos
  // antigos pre-migration on-read).
  if (Array.isArray(classificationData.classificadores)) {
    return classificationData.classificadores;
  }
  if (Array.isArray(classificationData.conferidoPor)) {
    return classificationData.conferidoPor;
  }
  return null;
}

function classifiersToSingleName(classifiersList, legacyString) {
  // Usado pelo field `classificador` legacy: retorna o primeiro nome (ou
  // nomes joinados se houver multiplos). Fallback para string legacy.
  const list = Array.isArray(classifiersList) ? classifiersList : null;
  if (list && list.length > 0) {
    const names = list
      .map((entry) =>
        isRecord(entry) && typeof entry.fullName === 'string' ? entry.fullName.trim() : ''
      )
      .filter((n) => n.length > 0);
    if (names.length > 0) return names.join(', ');
  }
  if (typeof legacyString === 'string' && legacyString.trim().length > 0) {
    return legacyString.trim();
  }
  return null;
}

function formatSieve(value) {
  if (!isRecord(value)) {
    return null;
  }

  const parts = [];
  for (const key of PENEIRA_KEYS) {
    const parsed = toNumberOrNull(value[key]);
    if (parsed === null) {
      continue;
    }

    const printableKey = key.toUpperCase();
    parts.push(`${printableKey}: ${formatNumber(parsed)}%`);
  }

  if (Array.isArray(value.fundos)) {
    for (let i = 0; i < value.fundos.length; i++) {
      const f = value.fundos[i];
      if (f && f.peneira && f.percentual != null) {
        parts.push(`FUNDO${i + 1} P${f.peneira}: ${formatNumber(f.percentual)}%`);
      }
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join(' | ');
}

function buildFieldValueMap(detail) {
  const sample = detail.sample;
  const classificationData = isRecord(sample.latestClassification?.data)
    ? sample.latestClassification.data
    : {};
  const technical = isRecord(sample.latestClassification?.technical)
    ? sample.latestClassification.technical
    : {};

  const classifiersList = resolveClassifiersList(classificationData);
  const classifiersFormatted = formatClassifiersArray(classifiersList);

  return {
    internalLotNumber: sample.internalLotNumber,
    owner: sample.declared?.owner,
    sacks: sample.declared?.sacks,
    harvest: sample.declared?.harvest,
    originLot: sample.declared?.originLot,
    classificationDate: classificationData.dataClassificacao,
    padrao: classificationData.padrao,
    catacao: classificationData.catacao,
    aspecto: classificationData.aspecto,
    bebida: classificationData.bebida,
    broca: classificationData.broca,
    pva: classificationData.pva,
    imp: classificationData.imp,
    defeito: classificationData.defeito,
    // `classificador` (legacy): deriva do array de classificadores; fallback
    // para string legacy armazenada em eventos antigos.
    classificador: classifiersToSingleName(classifiersList, classificationData.classificador),
    // `conferredBy` (legacy) e `classifiers` (novo) usam a mesma fonte canonica.
    conferredBy: classifiersFormatted,
    classifiers: classifiersFormatted,
    observacoes: classificationData.observacoes,
    classificationOriginLot: classificationData.loteOrigem,
    peneirasPercentuais: formatSieve(classificationData.peneirasPercentuais),
    technicalType: technical.type,
    technicalScreen: technical.screen,
    technicalDensity: technical.density,
  };
}

function toPrintableFieldValue(rawValue) {
  if (typeof rawValue === 'number') {
    return formatNumber(rawValue);
  }

  if (typeof rawValue === 'string') {
    return rawValue.trim() || null;
  }

  return rawValue ?? null;
}

function normalizeFieldToken(raw) {
  if (typeof raw !== 'string') {
    throw new HttpError(422, 'each export field must be a string');
  }

  const normalized = raw.trim();
  if (!normalized) {
    throw new HttpError(422, 'export field cannot be empty');
  }

  if (!SAMPLE_EXPORT_FIELD_SET.has(normalized)) {
    throw new HttpError(422, `Unsupported export field: ${normalized}`);
  }

  return normalized;
}

export function normalizeSelectedExportFields(input) {
  if (input === undefined || input === null) {
    return [...SAMPLE_EXPORT_FIELDS];
  }

  if (!Array.isArray(input)) {
    throw new HttpError(422, 'fields must be an array');
  }

  const selected = new Set();
  for (const token of input) {
    selected.add(normalizeFieldToken(token));
  }

  return SAMPLE_EXPORT_FIELDS.filter((field) => selected.has(field));
}

export function normalizeSampleExportType(input) {
  if (input === undefined || input === null) {
    return 'COMPLETO';
  }

  if (typeof input !== 'string') {
    throw new HttpError(422, 'exportType must be a string');
  }

  const normalized = input.trim().toUpperCase();
  if (!normalized) {
    throw new HttpError(422, 'exportType cannot be empty');
  }

  if (!SAMPLE_EXPORT_TYPE_SET.has(normalized)) {
    throw new HttpError(422, `Unsupported export type: ${normalized}`);
  }

  return normalized;
}

export function resolveSampleExportFieldsForType(exportType) {
  const normalized = normalizeSampleExportType(exportType);
  return [...SAMPLE_EXPORT_FIELDS_BY_TYPE[normalized]];
}

export function buildSelectedExportFieldEntries(detail, selectedFields, options = {}) {
  const { excludeEmpty = false } = options;
  const values = buildFieldValueMap(detail);

  const entries = [];
  for (const field of selectedFields) {
    const label = SAMPLE_EXPORT_FIELD_LABELS[field] ?? field;
    const printableValue = toPrintableFieldValue(values[field]);

    if (excludeEmpty && (printableValue === null || printableValue === undefined)) {
      continue;
    }

    entries.push({
      id: field,
      label,
      value: printableValue,
    });
  }

  return entries;
}
