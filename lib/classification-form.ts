import type { ExtractionResult } from './types';

// --- Types ---

export type ClassificationFormState = {
  dataClassificacao: string;
  padrao: string;
  catacao: string;
  aspecto: string;
  bebida: string;
  broca: string;
  pva: string;
  imp: string;
  classificador: string;
  defeito: string;
  umidade: string;
  observacoes: string;
  loteOrigem: string;
  peneiraP18: string;
  peneiraP17: string;
  peneiraP16: string;
  peneiraP15: string;
  peneiraP14: string;
  peneiraP13: string;
  peneiraP12: string;
  peneiraP10: string;
  peneiraMk9: string;
  peneiraMk10: string;
  peneiraMk11: string;
  fundo1Peneira: string;
  fundo1Percent: string;
  fundo2Peneira: string;
  fundo2Percent: string;
  pau: string;
  ap: string;
  gpi: string;
};

export type ClassificationSievePayload = {
  p18: number | null;
  p17: number | null;
  p16: number | null;
  p15: number | null;
  p14: number | null;
  p13: number | null;
  p12: number | null;
  p10: number | null;
  mk9: number | null;
  mk10: number | null;
  mk11: number | null;
  fundos: Array<{ peneira: string; percentual: number }> | null;
};

export type ClassificationDataPayload = {
  dataClassificacao?: string | null;
  padrao: string | null;
  catacao: string | null;
  aspecto: string | null;
  bebida: string | null;
  broca: string | null;
  pva: string | null;
  imp: string | null;
  pau: string | null;
  ap: string | null;
  gpi: string | null;
  classificador: string | null;
  peneirasPercentuais: ClassificationSievePayload | null;
  defeito: string | null;
  umidade: number | null;
  observacoes: string | null;
  loteOrigem: string | null;
};

export type ClassificationTechnicalPayload = {
  defectsCount?: number;
  moisture?: number;
  notes?: string | null;
};

export type NumericField = {
  key: keyof ClassificationFormState;
  label: string;
};

// --- Constants ---

export const EMPTY_CLASSIFICATION_FORM: ClassificationFormState = {
  dataClassificacao: '',
  padrao: '',
  catacao: '',
  aspecto: '',
  bebida: '',
  broca: '',
  pva: '',
  imp: '',
  classificador: '',
  defeito: '',
  umidade: '',
  observacoes: '',
  loteOrigem: '',
  peneiraP18: '',
  peneiraP17: '',
  peneiraP16: '',
  peneiraP15: '',
  peneiraP14: '',
  peneiraP13: '',
  peneiraP12: '',
  peneiraP10: '',
  peneiraMk9: '',
  peneiraMk10: '',
  peneiraMk11: '',
  fundo1Peneira: '',
  fundo1Percent: '',
  fundo2Peneira: '',
  fundo2Percent: '',
  pau: '',
  ap: '',
  gpi: ''
};

export const SIEVE_FIELDS: NumericField[] = [
  { key: 'peneiraP18', label: 'Peneira 18 (%)' },
  { key: 'peneiraP17', label: 'Peneira 17 (%)' },
  { key: 'peneiraP16', label: 'Peneira 16 (%)' },
  { key: 'peneiraP15', label: 'Peneira 15 (%)' },
  { key: 'peneiraP14', label: 'Peneira 14 (%)' },
  { key: 'peneiraP13', label: 'Peneira 13 (%)' },
  { key: 'peneiraP12', label: 'Peneira 12 (%)' },
  { key: 'peneiraP10', label: 'Peneira 10 (%)' },
  { key: 'peneiraMk9', label: 'Peneira MK 9 (%)' },
  { key: 'peneiraMk10', label: 'Peneira MK 10 (%)' },
  { key: 'peneiraMk11', label: 'Peneira MK 11 (%)' }
];

export const NUMERIC_FIELDS: NumericField[] = [
  { key: 'broca', label: 'Broca' },
  { key: 'pva', label: 'PVA' },
  { key: 'imp', label: 'IMP' },
  { key: 'pau', label: 'PAU' },
  { key: 'ap', label: 'AP' },
  { key: 'gpi', label: 'GPI' },
  { key: 'defeito', label: 'Defeito' },
  { key: 'umidade', label: 'Umidade' },
  ...SIEVE_FIELDS
];

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

export function validateClassificationForm(form: ClassificationFormState): string | null {
  for (const field of NUMERIC_FIELDS) {
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

export function buildClassificationDataPayload(
  form: ClassificationFormState,
  options: {
    includeAutomaticDate?: boolean;
  } = {}
): ClassificationDataPayload {
  const fundos: Array<{ peneira: string; percentual: number }> = [];
  const f1p = form.fundo1Peneira.trim();
  const f1v = parseNumberInput(form.fundo1Percent);
  if (f1p && f1v !== null) {
    fundos.push({ peneira: f1p, percentual: f1v });
  }
  const f2p = form.fundo2Peneira.trim();
  const f2v = parseNumberInput(form.fundo2Percent);
  if (f2p && f2v !== null) {
    fundos.push({ peneira: f2p, percentual: f2v });
  }

  const sieve: ClassificationSievePayload = {
    p18: parseNumberInput(form.peneiraP18),
    p17: parseNumberInput(form.peneiraP17),
    p16: parseNumberInput(form.peneiraP16),
    p15: parseNumberInput(form.peneiraP15),
    p14: parseNumberInput(form.peneiraP14),
    p13: parseNumberInput(form.peneiraP13),
    p12: parseNumberInput(form.peneiraP12),
    p10: parseNumberInput(form.peneiraP10),
    mk9: parseNumberInput(form.peneiraMk9),
    mk10: parseNumberInput(form.peneiraMk10),
    mk11: parseNumberInput(form.peneiraMk11),
    fundos: fundos.length > 0 ? fundos : null
  };

  const hasSieve = Object.values(sieve).some((value) => value !== null);
  const payload: ClassificationDataPayload = {
    padrao: form.padrao.trim() || null,
    catacao: form.catacao.trim() || null,
    aspecto: form.aspecto.trim() || null,
    bebida: form.bebida.trim() || null,
    broca: form.broca.trim() || null,
    pva: form.pva.trim() || null,
    imp: form.imp.trim() || null,
    pau: form.pau.trim() || null,
    ap: form.ap.trim() || null,
    gpi: form.gpi.trim() || null,
    classificador: form.classificador.trim() || null,
    peneirasPercentuais: hasSieve ? sieve : null,
    defeito: form.defeito.trim() || null,
    umidade: parseNumberInput(form.umidade),
    observacoes: form.observacoes.trim() || null,
    loteOrigem: form.loteOrigem.trim() || null
  };

  if (options.includeAutomaticDate) {
    payload.dataClassificacao = getTodayDateInput();
  }

  return payload;
}

export function buildTechnicalFromClassificationData(data: ClassificationDataPayload): ClassificationTechnicalPayload | undefined {
  const technical: ClassificationTechnicalPayload = {};

  if (data.defeito !== null) {
    const parsed = parseInt(data.defeito, 10);
    if (Number.isFinite(parsed)) {
      technical.defectsCount = Math.round(parsed);
    }
  }
  if (data.umidade !== null) {
    technical.moisture = data.umidade;
  }
  if (data.observacoes !== null) {
    technical.notes = data.observacoes;
  }

  return Object.keys(technical).length > 0 ? technical : undefined;
}

export function mapExtractionToForm(fields: Record<string, string | null>): Partial<ClassificationFormState> {
  const mapped: Partial<ClassificationFormState> = {};
  const fieldMap: Record<string, keyof ClassificationFormState> = {
    padrao: 'padrao',
    catacao: 'catacao',
    aspecto: 'aspecto',
    bebida: 'bebida',
    p18: 'peneiraP18',
    p17: 'peneiraP17',
    p16: 'peneiraP16',
    mk: 'peneiraMk9',
    p15: 'peneiraP15',
    p14: 'peneiraP14',
    p13: 'peneiraP13',
    p10: 'peneiraP10',
    fundo1_peneira: 'fundo1Peneira',
    fundo1_percentual: 'fundo1Percent',
    fundo2_peneira: 'fundo2Peneira',
    fundo2_percentual: 'fundo2Percent',
    defeitos: 'defeito',
    broca: 'broca',
    pva: 'pva',
    impureza: 'imp',
    pau: 'pau',
    ap: 'ap',
    gpi: 'gpi',
    umidade: 'umidade'
  };

  for (const [extractedKey, formKey] of Object.entries(fieldMap)) {
    const value = fields[extractedKey];
    if (value !== null && value !== undefined) {
      mapped[formKey] = String(value);
    }
  }

  return mapped;
}
