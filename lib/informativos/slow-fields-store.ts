// Pre-preenchimento do Informativo (INF25/INF36).
//
// Guarda SO os campos "lentos" — anos, meses, safra e o rotulo da Bolsa NY —
// que ficam parados por semanas. Os valores do dia (dolar, bolsa, variacao,
// precos) NUNCA sao guardados: e o que impede publicar o valor de ontem por
// distracao, que num informativo de mercado e um problema de credibilidade.
//
// localStorage nao viola o P1 ("nada e salvo"): P1 fala do dominio — nada de
// banco, storage ou historico de pecas. Isto e conveniencia de digitacao, local
// ao navegador de quem publica, e o usuario pode editar tudo.

/** Os campos que sobrevivem de um dia pro outro. */
export interface SlowFields {
  bolsaLabel: string;
  safra: string;
  futuroAnoA: string;
  futuroAnoB: string;
  cprAnoA: string;
  cprAnoB: string;
  mesA1: string;
  mesB1: string;
  mesA2: string;
  mesB2: string;
}

export const EMPTY_SLOW_FIELDS: SlowFields = {
  bolsaLabel: '',
  safra: '',
  futuroAnoA: '',
  futuroAnoB: '',
  cprAnoA: '',
  cprAnoB: '',
  mesA1: '',
  mesB1: '',
  mesA2: '',
  mesB2: '',
};

const KEY = 'informativo-mercado:slow-fields:v1';

const FIELDS: Array<keyof SlowFields> = [
  'bolsaLabel',
  'safra',
  'futuroAnoA',
  'futuroAnoB',
  'cprAnoA',
  'cprAnoB',
  'mesA1',
  'mesB1',
  'mesA2',
  'mesB2',
];

export function loadSlowFields(): SlowFields | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const source = parsed as Record<string, unknown>;
    // Le campo a campo em vez de confiar no shape: um payload de uma versao
    // anterior (ou adulterado) nao deve entrar no formulario.
    const result = {} as SlowFields;
    for (const field of FIELDS) {
      const value = source[field];
      result[field] = typeof value === 'string' ? value : '';
    }
    return result;
  } catch {
    return null;
  }
}

export function saveSlowFields(slow: SlowFields): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const payload = {} as SlowFields;
    for (const field of FIELDS) {
      payload[field] = slow[field] ?? '';
    }
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Modo privado / quota: o pre-preenchimento e conveniencia, nao pode
    // derrubar a geracao da peca.
  }
}
