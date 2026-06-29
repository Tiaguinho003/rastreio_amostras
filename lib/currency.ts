// Helpers de moeda/decimal em formato brasileiro (ex.: 1.250,00).
//
// Dois modos de entrada, deliberadamente diferentes:
//  - Mascara de moeda (maskCurrencyInput): para campos em R$ (preco, agio).
//    Acumula os digitos como CENTAVOS, preenchendo da direita — digitar
//    "125000" mostra "1.250,00". Elimina a ambiguidade do separador.
//  - Texto livre (parseDecimalBr): para campos que NAO sao centavos (peso em
//    Kg, corretagem em %), onde "60" deve valer 60 e nao 0,60.
//
// Reusa o padrao Intl.NumberFormat('pt-BR', ...) ja usado em
// components/contracts/SaleContractCard.tsx. Segue o estilo das mascaras de
// lib/client-field-formatters.ts (maskCpfInput, maskPhoneInput, ...).

const BR_DECIMAL = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function onlyDigits(value: string): string {
  return String(value ?? '').replace(/\D+/g, '');
}

/**
 * Mascara de moeda: pega so os digitos do input e formata como centavos.
 * Ex.: "1" -> "0,01"; "125000" -> "1.250,00"; "" -> "". Cap em 13 digitos
 * (ate 99.999.999.999,99 — bem acima do Decimal(12,2) do banco).
 */
export function maskCurrencyInput(value: string): string {
  const digits = onlyDigits(value).slice(0, 13);
  if (digits === '') {
    return '';
  }
  return BR_DECIMAL.format(Number(digits) / 100);
}

/**
 * String mascarada -> numero em reais, ou null se vazia. Inverte a
 * maskCurrencyInput (o valor exibido sempre tem 2 casas).
 */
export function parseCurrencyInput(value: string): number | null {
  const digits = onlyDigits(value);
  if (digits === '') {
    return null;
  }
  return Number(digits) / 100;
}

/**
 * Numero (em reais) -> string mascarada "1.250,00". Usado para pre-preencher
 * campos com mascara a partir de um valor ja salvo. null/invalido -> "".
 */
export function formatCurrencyValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return '';
  }
  return BR_DECIMAL.format(n);
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
