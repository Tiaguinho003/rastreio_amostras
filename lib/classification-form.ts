import type { ClassificationType, ExtractedClassificationFields } from './types';

// ----------------------------------------------------------------------
// Q.cls.2 ficha unificada — modelo TS do form + payloads enviados pro
// backend. Espelha o schema CLASSIFICATION_COMPLETED.payload da
// classificacao (peneiras/fundos/defeitos agrupados, sem safra/p19/
// deprecated). Tipo da classificacao (BICA/PREPARADO/BAIXO/ESCOLHA, apos
// Q.types) virou metadata pos-extracao — todos os campos sao validos pra
// qualquer tipo.
// ----------------------------------------------------------------------

// --- Form state ---

// 22 campos editaveis no ReviewModal + dataClassificacao (set pelo
// backend automaticamente). Sem peneiraP19 e safra (removidos no
// cleanup Q.cls.2.7 — peneira P19 nao existe na ficha unificada,
// safra vive em sample.declaredHarvest).
export type ClassificationFormState = {
  dataClassificacao: string;
  padrao: string;
  catacao: string;
  aspecto: string;
  bebida: string;
  broca: string;
  pva: string;
  imp: string;
  ap: string;
  gpi: string;
  defeito: string;
  certif: string;
  observacoes: string;
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

export const EMPTY_CLASSIFICATION_FORM: ClassificationFormState = {
  dataClassificacao: '',
  padrao: '',
  catacao: '',
  aspecto: '',
  bebida: '',
  broca: '',
  pva: '',
  imp: '',
  ap: '',
  gpi: '',
  defeito: '',
  certif: '',
  observacoes: '',
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

// --- Payload types (mapeiam o schema do evento) ---

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

// --- Constants ---

export const CLASSIFICATION_TYPE_LABEL: Record<ClassificationType, string> = {
  BICA: 'BICA',
  PREPARADO: 'PREPARADO',
  BAIXO: 'BAIXO',
  ESCOLHA: 'ESCOLHA',
  CONILON: 'CONILON',
};

// Campos do form que vao pra peneiras + percentuais dos fundos (number
// no payload final). Validados pra serem numericos parseaveis.
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

// Mapeia chaves do extractedFields (o que o backend retorna ao extrair
// a foto via IA) pras chaves do ClassificationFormState. Universal —
// extracao e type-agnostic na Q.cls.2 (1 prompt cobre os 4 tipos).
const EXTRACTION_FIELD_MAP: Record<string, keyof ClassificationFormState> = {
  padrao: 'padrao',
  catacao: 'catacao',
  aspecto: 'aspecto',
  bebida: 'bebida',
  broca: 'broca',
  pva: 'pva',
  // Chave 'imp' (nao 'impureza'): a extracao emite defeitos.imp. Antes era
  // 'impureza' e nunca casava com o valor extraido.
  imp: 'imp',
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

// --- Helpers ---

function parseNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
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

// --- Validation ---

// Rotulos humanos pros campos numericos — usados na mensagem de erro pra o
// operador localizar o campo no review sheet (em vez da chave interna do form).
const NUMERIC_FIELD_LABELS: Partial<Record<keyof ClassificationFormState, string>> = {
  peneiraP18: 'Peneira P18',
  peneiraP17: 'Peneira P17',
  peneiraP16: 'Peneira P16',
  peneiraP15: 'Peneira P15',
  peneiraP14: 'Peneira P14',
  peneiraP13: 'Peneira P13',
  peneiraP12: 'Peneira P12',
  peneiraP11: 'Peneira P11',
  peneiraP10: 'Peneira P10',
  peneiraMk: 'Peneira MK',
  fundo1Percent: 'Fundo 1 (%)',
  fundo2Percent: 'Fundo 2 (%)',
};

// Valida os campos numericos (peneiras + percentuais dos fundos) que o save
// grava como number 0-100 (schema Ajv-enforced). Com a extracao recall-first
// preservando valores brutos ("8-9", "1/2"), e aqui que um valor nao-numerico
// e barrado — chamado no "Avancar" do review (campo visivel) e no save final.
export function validateClassificationForm(form: ClassificationFormState): string | null {
  for (const key of NUMERIC_FORM_KEYS) {
    const raw = form[key].trim();
    if (!raw) continue;
    const label = NUMERIC_FIELD_LABELS[key] ?? key;
    const parsed = Number(raw.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      return `Valor invalido em ${label}: "${raw}". Corrija para um numero.`;
    }
    if (parsed < 0 || parsed > 100) {
      return `${label} deve estar entre 0 e 100 (valor: "${raw}").`;
    }
  }
  return null;
}

// --- Payload builders ---

export function buildClassificationDataPayload(
  form: ClassificationFormState,
  options: { includeAutomaticDate?: boolean } = {}
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

  // defeito agora vive em data.defeitos.defeito (sub-obj). Pode ser
  // texto livre — tenta parsear como int pra preencher defectsCount mas
  // tolera string nao-numerica (fica undefined).
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

// --- Extraction mapping ---

// Achata o extractedFields ANINHADO (peneiras{}, fundos[], defeitos{}) que a
// IA retorna pras chaves flat que o EXTRACTION_FIELD_MAP usa. Antes o map lia
// `fields['p18']` direto num objeto onde a peneira morava em
// `fields.peneiras.p18` -> as 10 peneiras, 4 campos de fundos e 6 defeitos
// NUNCA pre-preenchiam o review sheet (independente da qualidade da IA). Os
// campos de nivel raiz (padrao, aspecto, certif, catacao, observacoes, bebida)
// sempre funcionaram. Robusto a shape ja-flat e a campos ausentes.
function flattenExtractedFields(
  fields: ExtractedClassificationFields | Record<string, unknown> | null | undefined
): Record<string, string | null> {
  const flat: Record<string, string | null> = {};
  if (!fields || typeof fields !== 'object') return flat;
  const src = fields as Record<string, unknown>;

  // Nivel raiz: copia valores string/null diretamente (padrao, aspecto, certif,
  // catacao, observacoes, bebida). Objetos/arrays aninhados sao ignorados aqui
  // e expandidos abaixo.
  for (const [key, value] of Object.entries(src)) {
    if (value === null || typeof value === 'string') flat[key] = value;
  }

  // peneiras{} -> p18..p10, mk ; defeitos{} -> imp, pva, broca, gpi, ap, defeito
  for (const groupKey of ['peneiras', 'defeitos'] as const) {
    const group = src[groupKey];
    if (group && typeof group === 'object' && !Array.isArray(group)) {
      for (const [key, value] of Object.entries(group as Record<string, unknown>)) {
        if (value === null || typeof value === 'string') flat[key] = value;
      }
    }
  }

  // fundos[] -> fundo1_peneira/fundo1_percentual, fundo2_peneira/fundo2_percentual
  const fundos = Array.isArray(src.fundos) ? src.fundos : [];
  fundos.slice(0, 2).forEach((fundo, index) => {
    if (!fundo || typeof fundo !== 'object') return;
    const f = fundo as Record<string, unknown>;
    const slot = index + 1;
    if (f.peneira === null || typeof f.peneira === 'string') {
      flat[`fundo${slot}_peneira`] = f.peneira as string | null;
    }
    if (f.percentual === null || typeof f.percentual === 'string') {
      flat[`fundo${slot}_percentual`] = f.percentual as string | null;
    }
  });

  return flat;
}

export function mapExtractionToForm(
  fields: ExtractedClassificationFields
): Partial<ClassificationFormState> {
  const flat = flattenExtractedFields(fields);
  const mapped: Partial<ClassificationFormState> = {};
  for (const [extractedKey, formKey] of Object.entries(EXTRACTION_FIELD_MAP)) {
    const value = flat[extractedKey];
    if (value !== null && value !== undefined) {
      mapped[formKey] = String(value);
    }
  }
  return mapped;
}
