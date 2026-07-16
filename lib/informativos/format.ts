// Formatadores e mascaras do Informativo (INF19): o usuario digita SO o
// numero; a unidade e a formatacao sao do layout. E o que fecha a classe de
// erro do .docx original, que publicou "R$ 1690,00,00" — separador de milhar,
// virgula decimal e unidade deixam de ser digitaveis, logo deixam de ser
// erraveis.
//
// Casas por campo (INF33): bolsa 2 (292,65), dolar 4 (5,2303), variacao
// inteiro (20), precos 2 (R$ 1.960,00).

import { formatDecimalValue, maskDecimalInput } from '../currency.ts';

export type VariacaoDir = 'alta' | 'baixa';

export const DECIMALS = {
  bolsa: 2,
  dolar: 4,
  variacao: 0,
  preco: 2,
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

export const formatBolsaValue = (value: number) => formatDecimalValue(value, DECIMALS.bolsa);
