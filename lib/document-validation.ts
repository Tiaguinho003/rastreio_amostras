// F6.1: validacao de CPF/CNPJ via algoritmo da Receita Federal (digitos
// verificadores). Espelhada do backend (`src/clients/client-support.js`)
// para feedback inline no frontend antes do submit.
//
// Rejeita sequencias homogeneas (00000000000, 11111111111, etc.) que
// matematicamente passam mod 11 mas nao sao documentos validos.

const CNPJ_WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function calcCpfDigit(digits: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) {
    sum += Number(digits[i]) * weights[i];
  }
  return ((sum * 10) % 11) % 10;
}

function calcCnpjDigit(digits: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) {
    sum += Number(digits[i]) * weights[i];
  }
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

export function isValidCpfChecksum(digits: string): boolean {
  if (typeof digits !== 'string' || digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  const d1 = calcCpfDigit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== Number(digits[9])) return false;
  const d2 = calcCpfDigit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === Number(digits[10]);
}

export function isValidCnpjChecksum(digits: string): boolean {
  if (typeof digits !== 'string' || digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  const d1 = calcCnpjDigit(digits, CNPJ_WEIGHTS_1);
  if (d1 !== Number(digits[12])) return false;
  const d2 = calcCnpjDigit(digits, CNPJ_WEIGHTS_2);
  return d2 === Number(digits[13]);
}

export function digitsOnly(value: string): string {
  return String(value ?? '').replace(/\D+/g, '');
}
