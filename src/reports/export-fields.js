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
  'certif',
  'broca',
  'pva',
  'imp',
  'ap',
  'gpi',
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
  certif: 'Certificado',
  broca: 'Broca',
  pva: 'PVA',
  imp: 'IMP',
  ap: 'AP',
  gpi: 'GPI',
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
// Mesma ordem canonica do projetor (event-contract-db-service.js): peneiras
// cheias decrescentes + MK por ultimo. (Era stale: faltava p11 e tinha mk9/10/11
// que nao existem na ficha unificada — por isso as peneiras nunca saiam.)
const PENEIRA_KEYS = ['p18', 'p17', 'p16', 'p15', 'p14', 'p13', 'p12', 'p11', 'p10', 'mk'];
// Campos excluidos do laudo unico por decisao de produto (nao devem aparecer no
// documento enviado ao comprador): proprietario (`owner`), a data da
// classificacao, os classificadores (`classificador`/`conferredBy`/`classifiers`
// — quem classificou e dado interno) e os lotes de origem internos.
const SAMPLE_EXPORT_FIELDS_EXCLUDED_FROM_REPORT = new Set([
  'owner',
  'originLot',
  'classificationOriginLot',
  'classificationDate',
  'classificador',
  'conferredBy',
  'classifiers',
]);
// Laudo unico ("Laudo Tecnico"): nao ha mais tipos (COMPLETO/COMPRADOR_PARCIAL).
// Os campos do laudo sao todos os autorizados menos os excluidos acima.
export const SAMPLE_EXPORT_FIELDS_FOR_REPORT = SAMPLE_EXPORT_FIELDS.filter(
  (field) => !SAMPLE_EXPORT_FIELDS_EXCLUDED_FROM_REPORT.has(field)
);

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

// Peneiras vivem agrupadas em `peneiras{}` (p18..p10/mk) e os fundos num array
// top-level `fundos[]` — sao fontes separadas na ficha unificada. Recebe as duas
// e concatena num unico texto pipe-separado ("P18: 12% | ... | FUNDO1 P9: 2%")
// que o renderer do PDF expande em uma row por item.
function formatSieve(peneiras, fundos) {
  const parts = [];

  if (isRecord(peneiras)) {
    for (const key of PENEIRA_KEYS) {
      const parsed = toNumberOrNull(peneiras[key]);
      if (parsed === null) {
        continue;
      }

      const printableKey = key.toUpperCase();
      parts.push(`${printableKey}: ${formatNumber(parsed)}%`);
    }
  }

  if (Array.isArray(fundos)) {
    for (let i = 0; i < fundos.length; i++) {
      const f = fundos[i];
      if (f && f.peneira && f.percentual != null) {
        // Fundo sem numeracao (FD1/FD2) e sem prefixo "P": peneira crua junta ao
        // percentual com "=" (ex.: "Fundo 13=4%"). O renderer do PDF detecta o
        // prefixo "Fundo " pra montar a linha "Fundo" | "13=4%".
        parts.push(`Fundo ${f.peneira}=${formatNumber(f.percentual)}%`);
      }
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join(' | ');
}

// Campos percentuais avulsos da ficha de classificacao (catacao + os defeitos
// IMP/PVA/BROCA/GPI/AP): na ficha todos exibem "%", entao o laudo tambem sufixa
// "%" — exceto DEFEITO (total), que e contagem e fica sem "%" (igual a ficha).
// So sufixa quando ha um digito ao qual ancorar o "%": valores de texto livre
// (ex.: "a maquina", "tr") sao preservados como estao, sem "%". Espelha o
// PERCENT_FIELD_KEYS do form (components/samples/ClassificationReviewSheetBody).
function formatPercentValue(rawValue) {
  const printable = toPrintableFieldValue(rawValue);
  if (printable === null || printable === undefined) {
    return null;
  }
  const text = String(printable);
  return /\d/.test(text) ? `${text}%` : text;
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
  // Defeitos vivem agrupados em `defeitos{}` (imp/pva/broca/gpi/ap/defeito) na
  // ficha unificada — nao no nivel raiz. Ler do sub-obj (era o bug que sumia
  // broca/pva/imp/defeito do laudo). Idem peneiras (`peneiras{}`); fundos sao
  // array top-level (`fundos[]`). Ver applyClassificationDataPatch.
  const defeitos = isRecord(classificationData.defeitos) ? classificationData.defeitos : {};

  return {
    internalLotNumber: sample.internalLotNumber,
    owner: sample.declared?.owner,
    sacks: sample.declared?.sacks,
    harvest: sample.declared?.harvest,
    originLot: sample.declared?.originLot,
    classificationDate: classificationData.dataClassificacao,
    padrao: classificationData.padrao,
    catacao: formatPercentValue(classificationData.catacao),
    aspecto: classificationData.aspecto,
    bebida: classificationData.bebida,
    certif: classificationData.certif,
    broca: formatPercentValue(defeitos.broca),
    pva: formatPercentValue(defeitos.pva),
    imp: formatPercentValue(defeitos.imp),
    ap: formatPercentValue(defeitos.ap),
    gpi: formatPercentValue(defeitos.gpi),
    defeito: defeitos.defeito,
    // `classificador` (legacy): deriva do array de classificadores; fallback
    // para string legacy armazenada em eventos antigos.
    classificador: classifiersToSingleName(classifiersList, classificationData.classificador),
    // `conferredBy` (legacy) e `classifiers` (novo) usam a mesma fonte canonica.
    conferredBy: classifiersFormatted,
    classifiers: classifiersFormatted,
    observacoes: classificationData.observacoes,
    classificationOriginLot: classificationData.loteOrigem,
    peneirasPercentuais: formatSieve(classificationData.peneiras, classificationData.fundos),
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

// Liga: valida e resolve a safra que sai no laudo. Quando a amostra tem mais de
// uma safra (string canonica separada por virgula, ex: '24/25, 25/26'), o laudo
// NAO pode imprimir a string concatenada — isso vazaria que e uma liga. Por isso
// uma escolha explicita de UMA das safras e obrigatoria. Retorna a safra
// escolhida (override de apresentacao) ou null quando ha safra unica e nada foi
// escolhido (o laudo usa o valor declarado como esta). Lanca 422 se a escolha
// for invalida ou faltar numa amostra de safra multipla.
export function normalizeReportedHarvest(rawReported, declaredHarvest) {
  const options = (typeof declaredHarvest === 'string' ? declaredHarvest : '')
    .split(/\s*,\s*/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const reported =
    rawReported === undefined || rawReported === null ? null : String(rawReported).trim();

  if (options.length > 1) {
    if (!reported) {
      throw new HttpError(
        422,
        'reportedHarvest e obrigatorio quando a amostra tem mais de uma safra'
      );
    }
    if (!options.includes(reported)) {
      throw new HttpError(422, `reportedHarvest "${reported}" nao e uma das safras da amostra`);
    }
    return reported;
  }

  if (reported && !options.includes(reported)) {
    throw new HttpError(422, `reportedHarvest "${reported}" nao e uma das safras da amostra`);
  }

  return reported && options.includes(reported) ? reported : null;
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
