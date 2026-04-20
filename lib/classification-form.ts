import type { ClassificationType } from './types';

// --- Types ---

export type ClassificationFormState = {
  dataClassificacao: string;
  padrao: string;
  catacao: string;
  aspecto: string;
  bebida: string;
  safra: string;
  broca: string;
  pva: string;
  imp: string;
  ap: string;
  gpi: string;
  defeito: string;
  certif: string;
  observacoes: string;
  peneiraP19: string;
  peneiraP18: string;
  peneiraP17: string;
  peneiraP16: string;
  peneiraMk: string;
  peneiraP15: string;
  peneiraP14: string;
  peneiraP13: string;
  peneiraP12: string;
  peneiraP11: string;
  peneiraP10: string;
  fundo1Peneira: string;
  fundo1Percent: string;
  fundo2Peneira: string;
  fundo2Percent: string;
};

export type ClassificationSievePayload = {
  p19: number | null;
  p18: number | null;
  p17: number | null;
  p16: number | null;
  mk: number | null;
  p15: number | null;
  p14: number | null;
  p13: number | null;
  p12: number | null;
  p11: number | null;
  p10: number | null;
  fundos: Array<{ peneira: string; percentual: number }> | null;
};

export type ClassificationDataPayload = {
  dataClassificacao?: string | null;
  padrao: string | null;
  catacao: string | null;
  aspecto: string | null;
  bebida: string | null;
  safra: string | null;
  broca: string | null;
  pva: string | null;
  imp: string | null;
  ap: string | null;
  gpi: string | null;
  peneirasPercentuais: Partial<ClassificationSievePayload> | null;
  defeito: string | null;
  certif: string | null;
  observacoes: string | null;
};

export type ClassificationTechnicalPayload = {
  defectsCount?: number;
  notes?: string | null;
};

export type NumericField = {
  key: keyof ClassificationFormState;
  label: string;
};

// --- Constants ---

export const CLASSIFICATION_TYPE_LABEL: Record<ClassificationType, string> = {
  PREPARADO: 'PREPARADO',
  LOW_CAFF: 'CAFÉ BAIXO',
  BICA: 'BICA',
};

export const EMPTY_CLASSIFICATION_FORM: ClassificationFormState = {
  dataClassificacao: '',
  padrao: '',
  catacao: '',
  aspecto: '',
  bebida: '',
  safra: '',
  broca: '',
  pva: '',
  imp: '',
  ap: '',
  gpi: '',
  defeito: '',
  certif: '',
  observacoes: '',
  peneiraP19: '',
  peneiraP18: '',
  peneiraP17: '',
  peneiraP16: '',
  peneiraMk: '',
  peneiraP15: '',
  peneiraP14: '',
  peneiraP13: '',
  peneiraP12: '',
  peneiraP11: '',
  peneiraP10: '',
  fundo1Peneira: '',
  fundo1Percent: '',
  fundo2Peneira: '',
  fundo2Percent: '',
};

// --- All fields (fallback for detail page / historical data) ---

export const ALL_SIEVE_FIELDS: NumericField[] = [
  { key: 'peneiraP19', label: 'P.19 (%)' },
  { key: 'peneiraP18', label: 'P.18 (%)' },
  { key: 'peneiraP17', label: 'P.17 (%)' },
  { key: 'peneiraP16', label: 'P.16 (%)' },
  { key: 'peneiraMk', label: 'MK (%)' },
  { key: 'peneiraP15', label: 'P.15 (%)' },
  { key: 'peneiraP14', label: 'P.14 (%)' },
  { key: 'peneiraP13', label: 'P.13 (%)' },
  { key: 'peneiraP12', label: 'P.12 (%)' },
  { key: 'peneiraP11', label: 'P.11 (%)' },
  { key: 'peneiraP10', label: 'P.10 (%)' },
];

export const ALL_NUMERIC_FIELDS: NumericField[] = [
  { key: 'broca', label: 'Broca' },
  { key: 'pva', label: 'PVA' },
  { key: 'imp', label: 'Impureza' },
  { key: 'ap', label: 'AP (%)' },
  { key: 'gpi', label: 'GPI' },
  { key: 'defeito', label: 'Defeito' },
  ...ALL_SIEVE_FIELDS,
];

// Backward-compatible aliases
export const SIEVE_FIELDS = ALL_SIEVE_FIELDS;
export const NUMERIC_FIELDS = ALL_NUMERIC_FIELDS;

// --- Type-specific configuration ---

export interface ClassificationTypeConfig {
  sieveFields: NumericField[];
  defectFields: NumericField[];
  hasFundo2: boolean;
  hasDefeito: boolean;
  extractionFieldMap: Record<string, keyof ClassificationFormState>;
  sieveKeys: string[];
}

export const TYPE_CONFIGS: Record<ClassificationType, ClassificationTypeConfig> = {
  PREPARADO: {
    sieveFields: [
      { key: 'peneiraP19', label: 'P.19 (%)' },
      { key: 'peneiraP18', label: 'P.18 (%)' },
      { key: 'peneiraP17', label: 'P.17 (%)' },
      { key: 'peneiraP16', label: 'P.16 (%)' },
      { key: 'peneiraP15', label: 'P.15 (%)' },
      { key: 'peneiraP14', label: 'P.14 (%)' },
      { key: 'peneiraMk', label: 'MK (%)' },
    ],
    defectFields: [
      { key: 'broca', label: 'Broca' },
      { key: 'pva', label: 'PVA' },
      { key: 'imp', label: 'Impureza' },
      { key: 'defeito', label: 'Defeito' },
    ],
    hasFundo2: false,
    hasDefeito: true,
    sieveKeys: ['p19', 'p18', 'p17', 'p16', 'p15', 'p14', 'mk'],
    extractionFieldMap: {
      padrao: 'padrao',
      catacao: 'catacao',
      aspecto: 'aspecto',
      bebida: 'bebida',
      safra: 'safra',
      broca: 'broca',
      pva: 'pva',
      impureza: 'imp',
      p19: 'peneiraP19',
      p18: 'peneiraP18',
      p17: 'peneiraP17',
      p16: 'peneiraP16',
      p15: 'peneiraP15',
      p14: 'peneiraP14',
      mk: 'peneiraMk',
      defeito: 'defeito',
      fundo1_peneira: 'fundo1Peneira',
      fundo1_percentual: 'fundo1Percent',
      certif: 'certif',
      observacoes: 'observacoes',
    },
  },
  LOW_CAFF: {
    sieveFields: [
      { key: 'peneiraP15', label: 'P.15 (%)' },
      { key: 'peneiraP14', label: 'P.14 (%)' },
      { key: 'peneiraP13', label: 'P.13 (%)' },
      { key: 'peneiraP12', label: 'P.12 (%)' },
      { key: 'peneiraP11', label: 'P.11 (%)' },
      { key: 'peneiraP10', label: 'P.10 (%)' },
    ],
    defectFields: [
      { key: 'broca', label: 'Broca' },
      { key: 'pva', label: 'PVA' },
      { key: 'imp', label: 'Impureza' },
      { key: 'ap', label: 'AP (%)' },
      { key: 'gpi', label: 'GPI' },
      { key: 'defeito', label: 'Defeito' },
    ],
    hasFundo2: true,
    hasDefeito: true,
    sieveKeys: ['p15', 'p14', 'p13', 'p12', 'p11', 'p10'],
    extractionFieldMap: {
      padrao: 'padrao',
      catacao: 'catacao',
      aspecto: 'aspecto',
      bebida: 'bebida',
      safra: 'safra',
      broca: 'broca',
      pva: 'pva',
      impureza: 'imp',
      p15: 'peneiraP15',
      p14: 'peneiraP14',
      p13: 'peneiraP13',
      p12: 'peneiraP12',
      p11: 'peneiraP11',
      p10: 'peneiraP10',
      ap: 'ap',
      gpi: 'gpi',
      defeito: 'defeito',
      fundo1_peneira: 'fundo1Peneira',
      fundo1_percentual: 'fundo1Percent',
      fundo2_peneira: 'fundo2Peneira',
      fundo2_percentual: 'fundo2Percent',
      certif: 'certif',
      observacoes: 'observacoes',
    },
  },
  BICA: {
    sieveFields: [
      { key: 'peneiraP17', label: 'P.17 (%)' },
      { key: 'peneiraMk', label: 'MK (%)' },
    ],
    defectFields: [
      { key: 'broca', label: 'Broca' },
      { key: 'pva', label: 'PVA' },
      { key: 'imp', label: 'Impureza' },
    ],
    hasFundo2: true,
    hasDefeito: false,
    sieveKeys: ['p17', 'mk'],
    extractionFieldMap: {
      padrao: 'padrao',
      catacao: 'catacao',
      aspecto: 'aspecto',
      bebida: 'bebida',
      safra: 'safra',
      broca: 'broca',
      pva: 'pva',
      impureza: 'imp',
      p17: 'peneiraP17',
      mk: 'peneiraMk',
      fundo1_peneira: 'fundo1Peneira',
      fundo1_percentual: 'fundo1Percent',
      fundo2_peneira: 'fundo2Peneira',
      fundo2_percentual: 'fundo2Percent',
      certif: 'certif',
      observacoes: 'observacoes',
    },
  },
};

export function getTypeConfig(
  classificationType: ClassificationType | null | undefined
): ClassificationTypeConfig | null {
  if (!classificationType) return null;
  return TYPE_CONFIGS[classificationType] ?? null;
}

// --- Functions ---

export function parseNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function getTodayDateInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function validateClassificationForm(
  form: ClassificationFormState,
  classificationType?: ClassificationType | null
): string | null {
  const config = classificationType ? TYPE_CONFIGS[classificationType] : null;
  const fieldsToValidate: NumericField[] = config
    ? [...config.sieveFields, ...config.defectFields]
    : ALL_NUMERIC_FIELDS;

  for (const field of fieldsToValidate) {
    const raw = form[field.key].trim();
    if (!raw) {
      continue;
    }

    const parsed = Number(raw.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      return `${field.label} deve ser um numero valido.`;
    }
  }

  return null;
}

const ALL_SIEVE_KEYS = [
  'p19',
  'p18',
  'p17',
  'p16',
  'mk',
  'p15',
  'p14',
  'p13',
  'p12',
  'p11',
  'p10',
] as const;

const SIEVE_FORM_KEY_TO_PAYLOAD: Record<string, string> = {
  peneiraP19: 'p19',
  peneiraP18: 'p18',
  peneiraP17: 'p17',
  peneiraP16: 'p16',
  peneiraMk: 'mk',
  peneiraP15: 'p15',
  peneiraP14: 'p14',
  peneiraP13: 'p13',
  peneiraP12: 'p12',
  peneiraP11: 'p11',
  peneiraP10: 'p10',
};

export function buildClassificationDataPayload(
  form: ClassificationFormState,
  options: {
    includeAutomaticDate?: boolean;
    classificationType?: ClassificationType | null;
  } = {}
): ClassificationDataPayload {
  const config = options.classificationType ? TYPE_CONFIGS[options.classificationType] : null;
  const activeSieveKeys = new Set(config ? config.sieveKeys : ALL_SIEVE_KEYS);

  // Build fundos
  const fundos: Array<{ peneira: string; percentual: number }> = [];
  const f1p = form.fundo1Peneira.trim();
  const f1v = parseNumberInput(form.fundo1Percent);
  if (f1p && f1v !== null) {
    fundos.push({ peneira: f1p, percentual: f1v });
  }
  if (!config || config.hasFundo2) {
    const f2p = form.fundo2Peneira.trim();
    const f2v = parseNumberInput(form.fundo2Percent);
    if (f2p && f2v !== null) {
      fundos.push({ peneira: f2p, percentual: f2v });
    }
  }

  // Build sieves — only include active sieve keys
  const sieve: Record<string, number | null> = {};
  for (const [formKey, payloadKey] of Object.entries(SIEVE_FORM_KEY_TO_PAYLOAD)) {
    if (activeSieveKeys.has(payloadKey)) {
      sieve[payloadKey] = parseNumberInput(form[formKey as keyof ClassificationFormState]);
    }
  }
  (sieve as Record<string, unknown>).fundos = fundos.length > 0 ? fundos : null;

  const hasSieve = Object.values(sieve).some((value) => value !== null);
  const payload: ClassificationDataPayload = {
    padrao: form.padrao.trim() || null,
    catacao: form.catacao.trim() || null,
    aspecto: form.aspecto.trim() || null,
    bebida: form.bebida.trim() || null,
    safra: form.safra.trim() || null,
    broca: form.broca.trim() || null,
    pva: form.pva.trim() || null,
    imp: form.imp.trim() || null,
    ap: !config || config.defectFields.some((f) => f.key === 'ap') ? form.ap.trim() || null : null,
    gpi:
      !config || config.defectFields.some((f) => f.key === 'gpi') ? form.gpi.trim() || null : null,
    peneirasPercentuais: hasSieve ? (sieve as Partial<ClassificationSievePayload>) : null,
    defeito: !config || config.hasDefeito ? form.defeito.trim() || null : null,
    certif: form.certif.trim() || null,
    observacoes: form.observacoes.trim() || null,
  };

  if (options.includeAutomaticDate) {
    payload.dataClassificacao = getTodayDateInput();
  }

  return payload;
}

export function buildTechnicalFromClassificationData(
  data: ClassificationDataPayload
): ClassificationTechnicalPayload | undefined {
  const technical: ClassificationTechnicalPayload = {};

  if (data.defeito !== null && data.defeito !== undefined) {
    const parsed = parseInt(data.defeito, 10);
    if (Number.isFinite(parsed)) {
      technical.defectsCount = Math.round(parsed);
    }
  }
  if (data.observacoes !== null) {
    technical.notes = data.observacoes;
  }

  return Object.keys(technical).length > 0 ? technical : undefined;
}

// Universal fallback map (superset of all types)
const UNIVERSAL_EXTRACTION_MAP: Record<string, keyof ClassificationFormState> = {
  padrao: 'padrao',
  catacao: 'catacao',
  aspecto: 'aspecto',
  bebida: 'bebida',
  safra: 'safra',
  broca: 'broca',
  pva: 'pva',
  impureza: 'imp',
  p19: 'peneiraP19',
  p18: 'peneiraP18',
  p17: 'peneiraP17',
  p16: 'peneiraP16',
  mk: 'peneiraMk',
  p15: 'peneiraP15',
  p14: 'peneiraP14',
  p13: 'peneiraP13',
  p12: 'peneiraP12',
  p11: 'peneiraP11',
  p10: 'peneiraP10',
  fundo1_peneira: 'fundo1Peneira',
  fundo1_percentual: 'fundo1Percent',
  fundo2_peneira: 'fundo2Peneira',
  fundo2_percentual: 'fundo2Percent',
  defeito: 'defeito',
  ap: 'ap',
  gpi: 'gpi',
  certif: 'certif',
  observacoes: 'observacoes',
};

export function mapExtractionToForm(
  fields: Record<string, string | null>,
  classificationType?: ClassificationType | null
): Partial<ClassificationFormState> {
  const config = classificationType ? TYPE_CONFIGS[classificationType] : null;
  const fieldMap = config ? config.extractionFieldMap : UNIVERSAL_EXTRACTION_MAP;

  const mapped: Partial<ClassificationFormState> = {};
  for (const [extractedKey, formKey] of Object.entries(fieldMap)) {
    const value = fields[extractedKey];
    if (value !== null && value !== undefined) {
      mapped[formKey] = String(value);
    }
  }

  return mapped;
}
