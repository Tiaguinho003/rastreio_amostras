// Formatadores e mascaras do Informativo (INF19): o usuario digita SO o
// numero; a unidade e a formatacao sao do layout. E o que fecha a classe de
// erro do .docx original, que publicou "R$ 1690,00,00" — separador de milhar,
// virgula decimal e unidade deixam de ser digitaveis, logo deixam de ser
// erraveis.
//
// Casas por campo (INF33): bolsa 2 (292,65), dolar 4 (5,2303), variacao
// inteiro (20), precos 2 (R$ 1.960,00), temperatura 1 (15,5), umidade inteiro
// (68), pluviosidade 1 (0,0).

import { formatDecimalValue, maskDecimalInput } from '../currency.ts';

export type VariacaoDir = 'alta' | 'baixa';

export const DECIMALS = {
  bolsa: 2,
  dolar: 4,
  variacao: 0,
  preco: 2,
  temperatura: 1,
  umidade: 0,
  pluviosidade: 1,
} as const;

// Limites de caracteres (INF37): o campo trava no que cabe na celula, em vez
// de encolher a fonte — a peca sai identica todo dia (P2). Derivados da §5:
// medidos com a tipografia real contra a largura util da celula.
export const MAX_LEN = {
  bolsaLabel: 24, // "BOLSA NY — MAI/26" = 17
  mes: 5, // "AGO" = 3; folga p/ "AGO/26"
  ano: 4,
  safra: 5, // "25/26" mascarado
} as const;

/** "292,65" -> "292,65 Usc/lp". Vazio -> "". */
export function formatUsc(masked: string): string {
  return masked === '' ? '' : `${masked} Usc/lp`;
}

/** "5,2303" -> "5,2303 R$/US$". Vazio -> "". */
export function formatDolar(masked: string): string {
  return masked === '' ? '' : `${masked} R$/US$`;
}

/** "1.960,00" -> "R$ 1.960,00". Vazio -> "". */
export function formatPreco(masked: string): string {
  return masked === '' ? '' : `R$ ${masked}`;
}

/**
 * Direcao + magnitude -> "▲ +20 pts" / "▼ -20 pts" (INF20/INF40). O sinal vem
 * da DIRECAO, nunca do que foi digitado: o campo so aceita a magnitude, o que
 * torna impossivel o estado contraditorio "baixa + +20". A seta nao entra
 * aqui — e desenhada como poligono (INF10, a Poppins nao tem os glifos ▲▼).
 */
export function formatVariacao(dir: VariacaoDir, masked: string): string {
  if (masked === '') {
    return '';
  }
  return `${dir === 'alta' ? '+' : '-'}${masked} pts`;
}

/** "15,5" -> "15,5 °C". Vazio (ou so o sinal) -> "". */
export function formatTemperatura(masked: string): string {
  return isBlankNumber(masked) ? '' : `${masked} °C`;
}

/** "68" -> "68 %". Vazio -> "". */
export function formatUmidade(masked: string): string {
  return isBlankNumber(masked) ? '' : `${masked} %`;
}

/** "0,0" -> "0,0 mm". Vazio -> "". */
export function formatPluviosidade(masked: string): string {
  return isBlankNumber(masked) ? '' : `${masked} mm`;
}

/** Campo sem numero: vazio ou so o sinal em transito ("-"). */
export function isBlankNumber(masked: string): boolean {
  return masked === '' || masked === '-';
}

/**
 * Mascara decimal que ACEITA negativo — para as temperaturas (geada).
 *
 * O maskDecimalInput do lib/currency.ts roda onlyDigits (/\D+/g) e come o
 * sinal, entao "-1,5" viraria "1,5": numa manha de geada a peca publicaria a
 * minima com o sinal trocado. O currency.ts nao pode mudar (e compartilhado com
 * os contratos e cercado por tests/currency.test.js), entao o sinal e tratado
 * aqui, por fora.
 *
 * Le SO o "-" inicial: `includes('-')` tornaria "3-5" negativo. Enquanto nao ha
 * digito, devolve "-" sozinho — senao o sinal sumiria no instante em que fosse
 * teclado e seria impossivel digitar um negativo. Esse "-" em transito conta
 * como campo VAZIO (ver isBlankNumber).
 */
export function maskDecimalSigned(value: string, decimals: number): string {
  const raw = String(value ?? '');
  const negative = raw.trimStart().startsWith('-');
  const masked = maskDecimalInput(raw, decimals);
  if (masked === '') {
    return negative ? '-' : '';
  }
  return negative ? `-${masked}` : masked;
}

/** Mascara da safra (INF39): "2526" -> "25/26". */
export function maskSafraInput(value: string): string {
  const digits = String(value ?? '')
    .replace(/\D+/g, '')
    .slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** Mascara do ano: so digitos, 4 no maximo. */
export function maskAnoInput(value: string): string {
  return String(value ?? '')
    .replace(/\D+/g, '')
    .slice(0, MAX_LEN.ano);
}

/** Texto livre em caixa alta, limitado (INF18/INF37). */
export function maskUpperInput(value: string, maxLen: number): string {
  return String(value ?? '')
    .toUpperCase()
    .slice(0, maxLen);
}

export const maskBolsa = (value: string) => maskDecimalInput(value, DECIMALS.bolsa);
export const maskDolar = (value: string) => maskDecimalInput(value, DECIMALS.dolar);
export const maskVariacao = (value: string) => maskDecimalInput(value, DECIMALS.variacao);
export const maskPreco = (value: string) => maskDecimalInput(value, DECIMALS.preco);

// Temperaturas aceitam negativo (geada); umidade e chuva, nao — nao existem.
export const maskTemperatura = (value: string) => maskDecimalSigned(value, DECIMALS.temperatura);
export const maskUmidade = (value: string) => maskDecimalInput(value, DECIMALS.umidade);
export const maskPluviosidade = (value: string) => maskDecimalInput(value, DECIMALS.pluviosidade);

export const formatBolsaValue = (value: number) => formatDecimalValue(value, DECIMALS.bolsa);
