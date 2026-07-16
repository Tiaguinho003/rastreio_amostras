// Helpers de moeda/decimal em formato brasileiro (ex.: 1.250,00).
//
// Dois modos de entrada, deliberadamente diferentes:
//  - Mascara de casas fixas (maskDecimalInput): acumula os digitos como a
//    menor unidade, preenchendo da direita — com 2 casas, digitar "125000"
//    mostra "1.250,00". Elimina a ambiguidade do separador. maskCurrencyInput
//    e o caso de 2 casas (R$: preco, agio); o Informativo de Mercado usa 4
//    casas no dolar (5,2303) e 2 na bolsa (292,65).
//  - Texto livre (parseDecimalBr): para campos que NAO sao centavos (peso em
//    Kg, corretagem em %), onde "60" deve valer 60 e nao 0,60.
//
// Reusa o padrao Intl.NumberFormat('pt-BR', ...) ja usado em
// components/contracts/SaleContractCard.tsx. Segue o estilo das mascaras de
// lib/client-field-formatters.ts (maskCpfInput, maskPhoneInput, ...).

// Cap de digitos da mascara: ate 99.999.999.999,99 com 2 casas — bem acima do
// Decimal(12,2) do banco. Mantido como total de digitos p/ nao mudar o
// comportamento historico de maskCurrencyInput.
const MASK_MAX_DIGITS = 13;

const formatterCache = new Map<number, Intl.NumberFormat>();

function brFormatter(decimals: number): Intl.NumberFormat {
  const cached = formatterCache.get(decimals);
  if (cached) {
    return cached;
  }
  const created = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  formatterCache.set(decimals, created);
  return created;
}

function onlyDigits(value: string): string {
  return String(value ?? '').replace(/\D+/g, '');
}

/**
 * Mascara de casas fixas: pega so os digitos do input e formata preenchendo da
 * direita. Com decimals=2: "1" -> "0,01"; "125000" -> "1.250,00"; "" -> "".
 * Com decimals=4: "52303" -> "5,2303". Com decimals=0: "1960" -> "1.960".
 */
export function maskDecimalInput(value: string, decimals: number): string {
  const digits = onlyDigits(value).slice(0, MASK_MAX_DIGITS);
  if (digits === '') {
    return '';
  }
  return brFormatter(decimals).format(Number(digits) / 10 ** decimals);
}

/**
 * String mascarada -> numero, ou null se vazia. Inverte a maskDecimalInput
 * (o valor exibido sempre tem `decimals` casas).
 */
export function parseDecimalInput(value: string, decimals: number): number | null {
  const digits = onlyDigits(value);
  if (digits === '') {
    return null;
  }
  return Number(digits) / 10 ** decimals;
}

/**
 * Numero -> string mascarada com casas fixas. Usado para pre-preencher campos
 * com mascara a partir de um valor ja salvo. null/invalido -> "".
 */
export function formatDecimalValue(
  value: number | string | null | undefined,
  decimals: number
): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return '';
  }
  return brFormatter(decimals).format(n);
}

/**
 * Mascara de moeda (2 casas): "125000" -> "1.250,00". Caso particular da
 * maskDecimalInput.
 */
export function maskCurrencyInput(value: string): string {
  return maskDecimalInput(value, 2);
}

/**
 * String mascarada -> numero em reais, ou null se vazia. Inverte a
 * maskCurrencyInput (o valor exibido sempre tem 2 casas).
 */
export function parseCurrencyInput(value: string): number | null {
  return parseDecimalInput(value, 2);
}

/**
 * Numero (em reais) -> string mascarada "1.250,00". Usado para pre-preencher
 * campos com mascara a partir de um valor ja salvo. null/invalido -> "".
 */
export function formatCurrencyValue(value: number | string | null | undefined): string {
  return formatDecimalValue(value, 2);
}

/**
 * Parser robusto para texto livre em formato BR (peso, corretagem).
 * Regras:
 *  - tem ',': a virgula e decimal e o ponto e separador de milhar.
 *  - so ponto(s): um unico ponto seguido de 1-2 digitos e decimal ("1.5",
 *    "10.25"); qualquer outro caso (1 ponto + 3 digitos, ou varios pontos) e
 *    separador de milhar ("1.250" -> 1250, "1.234.567" -> 1234567).
 *  - so digitos: inteiro.
 * Retorna null se vazio ou nao-numerico.
 */
export function parseDecimalBr(value: string): number | null {
  const raw = String(value ?? '')
    .trim()
    .replace(/\s+/g, '');
  if (raw === '' || !/^[0-9.,]+$/.test(raw)) {
    return null;
  }

  let normalized: string;
  if (raw.includes(',')) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else {
    const dotCount = (raw.match(/\./g) ?? []).length;
    if (dotCount === 1) {
      const afterDot = raw.slice(raw.indexOf('.') + 1);
      normalized = afterDot.length === 1 || afterDot.length === 2 ? raw : raw.replace(/\./g, '');
    } else if (dotCount > 1) {
      normalized = raw.replace(/\./g, '');
    } else {
      normalized = raw;
    }
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
