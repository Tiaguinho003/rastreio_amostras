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

// Q.cls.2.7: ficha unificada agrupada — peneiras sub-obj, fundos array
// de 2, defeitos sub-obj. Espelha o schema CLASSIFICATION_COMPLETED.
export type ClassificationPeneirasPayload = {
  p18: number | null;
  p17: number | null;
  p16: number | null;
  p15: number | null;
  p14: number | null;
  p13: number | null;
  p12: number | null;
  p11: number | null;
  p10: number | null;
  mk: number | null;
};

export type ClassificationFundoEntry = {
  peneira: string | null;
  percentual: number | null;
};

export type ClassificationDefeitosPayload = {
  imp: string | null;
  pva: string | null;
  broca: string | null;
  gpi: string | null;
  ap: string | null;
  defeito: string | null;
};

export type ClassificationDataPayload = {
  dataClassificacao?: string | null;
  padrao: string | null;
  aspecto: string | null;
  certif: string | null;
  catacao: string | null;
  observacoes: string | null;
  bebida: string | null;
  peneiras: ClassificationPeneirasPayload | null;
  // Sempre 2 elementos quando nao-null (peneira/percentual podem ser null
  // individualmente). Schema do evento exige minItems:2 maxItems:2.
  fundos: [ClassificationFundoEntry, ClassificationFundoEntry] | null;
  defeitos: ClassificationDefeitosPayload | null;
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

// Q.cls.2.7: validacao e numerica apenas para peneiras + percentuais dos
// fundos (campos numericos no payload). Os 6 campos de defeitos viraram
// texto livre, sem validacao numerica.
const NUMERIC_FORM_KEYS: Array<keyof ClassificationFormState> = [
  'peneiraP18',
  'peneiraP17',
  'peneiraP16',
  'peneiraP15',
  'peneiraP14',
  'peneiraP13',
  'peneiraP12',
  'peneiraP11',
  'peneiraP10',
  'peneiraMk',
  'fundo1Percent',
  'fundo2Percent',
];

export function validateClassificationForm(
  form: ClassificationFormState,
  // _classificationType nao e mais usado (ficha unificada — todos os
  // campos sao validos pra qualquer tipo). Argumento mantido por compat
  // com chamadas existentes; sera removido no cleanup do TYPE_CONFIGS.
  _classificationType?: ClassificationType | null
): string | null {
  for (const key of NUMERIC_FORM_KEYS) {
    const raw = form[key].trim();
    if (!raw) continue;
    const parsed = Number(raw.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      return `Valor numerico invalido em ${key}.`;
    }
  }
  return null;
}

export function buildClassificationDataPayload(
  form: ClassificationFormState,
  options: {
    includeAutomaticDate?: boolean;
    // _classificationType ignorado — ficha unificada serializa os 22
    // campos sempre. Mantido por compat com chamadas existentes.
    classificationType?: ClassificationType | null;
  } = {}
): ClassificationDataPayload {
  const peneiras: ClassificationPeneirasPayload = {
    p18: parseNumberInput(form.peneiraP18),
    p17: parseNumberInput(form.peneiraP17),
    p16: parseNumberInput(form.peneiraP16),
    p15: parseNumberInput(form.peneiraP15),
    p14: parseNumberInput(form.peneiraP14),
    p13: parseNumberInput(form.peneiraP13),
    p12: parseNumberInput(form.peneiraP12),
    p11: parseNumberInput(form.peneiraP11),
    p10: parseNumberInput(form.peneiraP10),
    mk: parseNumberInput(form.peneiraMk),
  };
  const hasAnyPeneira = Object.values(peneiras).some((v) => v !== null);

  const fundo1: ClassificationFundoEntry = {
    peneira: form.fundo1Peneira.trim() || null,
    percentual: parseNumberInput(form.fundo1Percent),
  };
  const fundo2: ClassificationFundoEntry = {
    peneira: form.fundo2Peneira.trim() || null,
    percentual: parseNumberInput(form.fundo2Percent),
  };
  const hasAnyFundo =
    fundo1.peneira !== null ||
    fundo1.percentual !== null ||
    fundo2.peneira !== null ||
    fundo2.percentual !== null;

  const defeitos: ClassificationDefeitosPayload = {
    imp: form.imp.trim() || null,
    pva: form.pva.trim() || null,
    broca: form.broca.trim() || null,
    gpi: form.gpi.trim() || null,
    ap: form.ap.trim() || null,
    defeito: form.defeito.trim() || null,
  };
  const hasAnyDefeito = Object.values(defeitos).some((v) => v !== null);

  const payload: ClassificationDataPayload = {
    padrao: form.padrao.trim() || null,
    aspecto: form.aspecto.trim() || null,
    certif: form.certif.trim() || null,
    catacao: form.catacao.trim() || null,
    observacoes: form.observacoes.trim() || null,
    bebida: form.bebida.trim() || null,
    peneiras: hasAnyPeneira ? peneiras : null,
    fundos: hasAnyFundo ? [fundo1, fundo2] : null,
    defeitos: hasAnyDefeito ? defeitos : null,
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

  // Q.cls.2.7: defeito agora vive em data.defeitos.defeito (sub-obj).
  // Pode ser texto livre — tenta parsear como int pra preencher
  // defectsCount mas tolera string nao-numerica (fica undefined).
  const defeitoText = data.defeitos?.defeito ?? null;
  if (defeitoText !== null) {
    const parsed = parseInt(defeitoText, 10);
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
