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
  'umidade',
  'aspectoCor',
  'classificador',
  'observacoes',
  'classificationOriginLot',
  'peneirasPercentuais',
  'technicalType',
  'technicalScreen',
  'technicalDensity'
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
  umidade: 'Umidade',
  aspectoCor: 'Aspecto da cor',
  classificador: 'Classificador',
  observacoes: 'Observacoes',
  classificationOriginLot: 'Lote de origem (classificacao)',
  peneirasPercentuais: 'Peneiras percentuais',
  technicalType: 'Tipo tecnico',
  technicalScreen: 'Peneira tecnica',
  technicalDensity: 'Densidade tecnica'
};

const SAMPLE_EXPORT_FIELD_SET = new Set(SAMPLE_EXPORT_FIELDS);
const SAMPLE_EXPORT_TYPE_SET = new Set(SAMPLE_EXPORT_TYPES);
const PENEIRA_KEYS = ['p18', 'p17', 'p16', 'mk', 'p15', 'p14', 'p13', 'p10', 'fundo'];
const SAMPLE_EXPORT_FIELDS_EXCLUDED_FROM_REPORT = new Set(['originLot', 'classificationOriginLot']);
const SAMPLE_EXPORT_FIELDS_ALLOWED_FOR_REPORT = SAMPLE_EXPORT_FIELDS.filter(
  (field) => !SAMPLE_EXPORT_FIELDS_EXCLUDED_FROM_REPORT.has(field)
);
const SAMPLE_EXPORT_FIELDS_BY_TYPE = {
  COMPLETO: [...SAMPLE_EXPORT_FIELDS_ALLOWED_FOR_REPORT],
  COMPRADOR_PARCIAL: SAMPLE_EXPORT_FIELDS_ALLOWED_FOR_REPORT.filter((field) => field !== 'owner')
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
    maximumFractionDigits: 2
  }).format(parsed);
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

  if (parts.length === 0) {
    return null;
  }

  return parts.join(' | ');
}

function buildFieldValueMap(detail) {
  const sample = detail.sample;
  const classificationData = isRecord(sample.latestClassification?.data) ? sample.latestClassification.data : {};
  const technical = isRecord(sample.latestClassification?.technical) ? sample.latestClassification.technical : {};

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
    umidade: classificationData.umidade,
    aspectoCor: classificationData.aspectoCor,
    classificador: classificationData.classificador,
    observacoes: classificationData.observacoes,
    classificationOriginLot: classificationData.loteOrigem,
    peneirasPercentuais: formatSieve(classificationData.peneirasPercentuais),
    technicalType: technical.type,
    technicalScreen: technical.screen,
    technicalDensity: technical.density
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
      value: printableValue
    });
  }

  return entries;
}
