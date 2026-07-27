// Estado do preenchimento dos Informativos — PURO, testavel sem React.
//
// Molde: lib/samples/samples-list-reducer.ts.
//
// A peca de mercado e obrigatoria; a meteorologica e OPCIONAL (toggle
// `incluiMeteo`). Nao ha mais maquina de fases: o formulario e o preview ao vivo
// convivem numa superficie so (RD16 §2.10 R10). O que era "voltar de fase sem
// perder o digitado" saiu de graca — nada e desmontado ao alternar as secoes.
//
// As mascaras ficam no onChange do componente, como sempre estiveram: o draft
// guarda a string JA mascarada. Nada aqui reformata.

import { isBlankNumber, type VariacaoDir } from './format.ts';
import { type MercadoData } from './mercado-layout.ts';
import { type MeteoData } from './meteo-layout.ts';
import { EMPTY_SLOW_FIELDS, type SlowFields } from './slow-fields-store.ts';
import { type Size } from './story-layout.ts';

/** Qual das duas pecas — usado no destaque de erro por secao. */
export type Secao = 'mercado' | 'meteo';

/** Valores do dia do Mercado. Nunca sao pre-preenchidos (INF36). */
export interface MercadoFields {
  bolsa: string;
  variacaoDir: VariacaoDir | null;
  variacao: string;
  dolar: string;
  fisicoPreco: string;
  precoA1: string;
  precoB1: string;
  precoA2: string;
  precoB2: string;
  cprA: string;
  cprB: string;
}

/** Valores do dia do Meteorologico. Todos sao do dia — nao ha campo "lento". */
export interface MeteoFields {
  temperatura: string;
  umidade: string;
  maxima: string;
  minima: string;
  pluviosidade: string;
}

export interface InformativoDraft {
  /** Campos "lentos" do Mercado (INF36), pre-preenchidos da ultima geracao. */
  slow: SlowFields;
  mercado: MercadoFields;
  meteo: MeteoFields;
  /** false = a peca meteorologica sai fora; so o mercado e gerado. */
  incluiMeteo: boolean;
  /** Liga o destaque de erro POR SECAO: a INF28 vale dentro da secao tentada. */
  submitted: Record<Secao, boolean>;
}

export const EMPTY_MERCADO_FIELDS: MercadoFields = {
  bolsa: '',
  variacaoDir: null,
  variacao: '',
  dolar: '',
  fisicoPreco: '',
  precoA1: '',
  precoB1: '',
  precoA2: '',
  precoB2: '',
  cprA: '',
  cprB: '',
};

export const EMPTY_METEO_FIELDS: MeteoFields = {
  temperatura: '',
  umidade: '',
  maxima: '',
  minima: '',
  pluviosidade: '',
};

export type InformativoDraftAction =
  | { type: 'patch-slow'; patch: Partial<SlowFields> }
  | { type: 'patch-mercado'; patch: Partial<MercadoFields> }
  | { type: 'patch-meteo'; patch: Partial<MeteoFields> }
  | { type: 'set-inclui-meteo'; inclui: boolean }
  | { type: 'mark-submitted'; secao: Secao };

export function createInformativoDraft(initialSlow: SlowFields | null): InformativoDraft {
  return {
    slow: initialSlow ?? EMPTY_SLOW_FIELDS,
    mercado: EMPTY_MERCADO_FIELDS,
    meteo: EMPTY_METEO_FIELDS,
    incluiMeteo: true,
    submitted: { mercado: false, meteo: false },
  };
}

export function informativoDraftReducer(
  state: InformativoDraft,
  action: InformativoDraftAction
): InformativoDraft {
  switch (action.type) {
    case 'patch-slow':
      return { ...state, slow: { ...state.slow, ...action.patch } };
    case 'patch-mercado':
      return { ...state, mercado: { ...state.mercado, ...action.patch } };
    case 'patch-meteo':
      return { ...state, meteo: { ...state.meteo, ...action.patch } };
    case 'set-inclui-meteo':
      return { ...state, incluiMeteo: action.inclui };
    case 'mark-submitted':
      return { ...state, submitted: { ...state.submitted, [action.secao]: true } };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Seletores
// ---------------------------------------------------------------------------

const isEmpty = (value: string) => value.trim() === '';

/** Campos do Mercado ainda em branco (INF28: todos sao obrigatorios). */
export function missingMercado(draft: InformativoDraft): Set<string> {
  const { slow, mercado } = draft;
  const required: Array<[string, string]> = [
    ['bolsaLabel', slow.bolsaLabel],
    ['bolsa', mercado.bolsa],
    ['variacaoDir', mercado.variacaoDir ?? ''],
    ['variacao', mercado.variacao],
    ['dolar', mercado.dolar],
    ['safra', slow.safra],
    ['fisicoPreco', mercado.fisicoPreco],
    ['futuroAnoA', slow.futuroAnoA],
    ['futuroAnoB', slow.futuroAnoB],
    ['mesA1', slow.mesA1],
    ['precoA1', mercado.precoA1],
    ['mesB1', slow.mesB1],
    ['precoB1', mercado.precoB1],
    ['mesA2', slow.mesA2],
    ['precoA2', mercado.precoA2],
    ['mesB2', slow.mesB2],
    ['precoB2', mercado.precoB2],
    ['cprAnoA', slow.cprAnoA],
    ['cprAnoB', slow.cprAnoB],
    ['cprA', mercado.cprA],
    ['cprB', mercado.cprB],
  ];
  return new Set(required.filter(([, v]) => isEmpty(v)).map(([k]) => k));
}

/** Campos do Meteorologico ainda em branco, o print incluido.
 *
 * Usa isBlankNumber: um "-" solto (sinal em transito, antes do primeiro digito)
 * e campo VAZIO, nao um valor. */
export function missingMeteo(fields: MeteoFields, hasPrevisao: boolean): Set<string> {
  const missing = new Set<string>();
  const numericos: Array<[string, string]> = [
    ['temperatura', fields.temperatura],
    ['umidade', fields.umidade],
    ['maxima', fields.maxima],
    ['minima', fields.minima],
    ['pluviosidade', fields.pluviosidade],
  ];
  for (const [key, value] of numericos) {
    if (isBlankNumber(value.trim())) {
      missing.add(key);
    }
  }
  if (!hasPrevisao) {
    missing.add('previsao');
  }
  return missing;
}

/** Ha algo digitado que se perderia ao fechar? So os campos do DIA contam — os
 * lentos vem pre-preenchidos e fecha-los nao perde nada. */
export function isDraftDirty(draft: InformativoDraft): boolean {
  const { mercado, meteo } = draft;
  if (mercado.variacaoDir !== null) {
    return true;
  }
  const valores = [
    mercado.bolsa,
    mercado.variacao,
    mercado.dolar,
    mercado.fisicoPreco,
    mercado.precoA1,
    mercado.precoB1,
    mercado.precoA2,
    mercado.precoB2,
    mercado.cprA,
    mercado.cprB,
    meteo.temperatura,
    meteo.umidade,
    meteo.maxima,
    meteo.minima,
    meteo.pluviosidade,
  ];
  return valores.some((v) => v.trim() !== '');
}

export function toMercadoData(draft: InformativoDraft, dataTexto: string): MercadoData {
  const { slow, mercado } = draft;
  return {
    dataTexto,
    bolsaLabel: slow.bolsaLabel,
    bolsa: mercado.bolsa,
    variacaoDir: mercado.variacaoDir ?? 'baixa',
    variacao: mercado.variacao,
    dolar: mercado.dolar,
    safra: slow.safra,
    fisicoPreco: mercado.fisicoPreco,
    futuroAnoA: slow.futuroAnoA,
    futuroAnoB: slow.futuroAnoB,
    futuro: [
      { mesA: slow.mesA1, precoA: mercado.precoA1, mesB: slow.mesB1, precoB: mercado.precoB1 },
      { mesA: slow.mesA2, precoA: mercado.precoA2, mesB: slow.mesB2, precoB: mercado.precoB2 },
    ],
    cprAnoA: slow.cprAnoA,
    cprAnoB: slow.cprAnoB,
    cprA: mercado.cprA,
    cprB: mercado.cprB,
  };
}

/** O rotulo do registro meteorologico cobre as ultimas 24h — MAS na segunda-
 * feira ele fecha o fim de semana inteiro, entao vira 72h. Puro: recebe a data
 * LOCAL de hoje (o `hoje` do sheet) e alimenta tanto o <h3> do formulario
 * quanto o rotulo da peca. `getDay()===1` = segunda. */
export function registroEmHoras(date: Date): 24 | 72 {
  return date.getDay() === 1 ? 72 : 24;
}

/** O tamanho do print entra por fora: ele nasce do HTMLImageElement, que vive
 * no hook do picker. Duplica-lo no draft criaria duas fontes de verdade. */
export function toMeteoData(
  fields: MeteoFields,
  dataTexto: string,
  previsao: Size | null,
  registroHoras: 24 | 72
): MeteoData {
  return {
    dataTexto,
    temperatura: fields.temperatura,
    umidade: fields.umidade,
    maxima: fields.maxima,
    minima: fields.minima,
    pluviosidade: fields.pluviosidade,
    previsao,
    registroHoras,
  };
}
