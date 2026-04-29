// Helper de geracao de CNPJ valido (com digitos verificadores Receita Federal).
// Usado em fixtures de tests para garantir que os documentos passem checksum
// apos F6.1.

const WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function calcDigit(digits, weights) {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) {
    sum += Number(digits[i]) * weights[i];
  }
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

/**
 * Gera 14 digitos de CNPJ valido. Garante cnpj_root (8 primeiros digitos)
 * unico por seed para nao colidir com uq_client_cnpj_root.
 *
 * @param seed Numero >= 1; vira primeiros 8 digitos como `seed.padStart(8, '1')`.
 * @param branchSeq Filial (1=matriz, 2,3,...). Default 1.
 * @returns string com 14 digitos numericos.
 */
export function generateValidCnpj(seed, branchSeq = 1) {
  if (!Number.isInteger(seed) || seed < 1) {
    throw new Error('seed deve ser inteiro >= 1');
  }
  if (!Number.isInteger(branchSeq) || branchSeq < 1) {
    throw new Error('branchSeq deve ser inteiro >= 1');
  }

  // Raiz: 8 digitos com seed deslocado pra evitar 00000000 (sequencia homogenea
  // rejeitada pelo checksum).
  const root = String(10_000_000 + seed)
    .padStart(8, '0')
    .slice(-8);
  const order = String(branchSeq).padStart(4, '0');
  const base = root + order; // 12 digitos

  const d1 = calcDigit(base, WEIGHTS_1);
  const d2 = calcDigit(base + d1, WEIGHTS_2);
  return base + String(d1) + String(d2);
}

/**
 * CPFs validos hardcoded (nao sao reais — apenas passam checksum).
 * Use em fixtures de tests que precisam de CPF.
 */
export const VALID_CPFS = [
  '01617970832', // 016.179.708-32
  '12345678909', // 123.456.789-09
  '52998224725', // 529.982.247-25
  '11144477735', // 111.444.777-35
  '39053344705', // 390.533.447-05
];

const CPF_WEIGHTS_1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
const CPF_WEIGHTS_2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Gera 11 digitos de CPF valido a partir de seed numerico.
 *
 * @param seed Numero >= 1.
 * @returns string com 11 digitos numericos.
 */
export function generateValidCpf(seed) {
  if (!Number.isInteger(seed) || seed < 1) {
    throw new Error('seed deve ser inteiro >= 1');
  }
  const base = String(100_000_000 + seed)
    .padStart(9, '0')
    .slice(-9);
  const d1 = calcDigit(base, CPF_WEIGHTS_1);
  const d2 = calcDigit(base + String(d1), CPF_WEIGHTS_2);
  return base + String(d1) + String(d2);
}
