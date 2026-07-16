// Data por extenso em pt-BR a partir do relogio LOCAL.
//
// Por que nao reusar o formatDateExtenso de
// src/sale-contracts/sale-contract-pdf-service.js:
//  1. Aquele modulo importa pdf-lib — puxa-lo para um componente cliente
//     arrastaria a lib inteira para o bundle.
//  2. Ele e UTC-based de proposito: os campos de data do banco sao date-only e
//     precisam ser lidos em UTC para nao deslocar um dia. O Informativo precisa
//     do oposto — a data do dia de quem esta publicando (INF17). Ler em UTC
//     faria o informativo virar o dia as 21h no horario de Brasilia.

export const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

/**
 * Data local -> "25 de março de 2026". Usa getDate/getMonth/getFullYear (nao
 * os get*UTC*), ou seja, o dia de quem esta olhando a tela.
 */
export function formatDateExtensoLocal(date: Date): string {
  return `${date.getDate()} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
}

/**
 * Data local -> "2026-07-16". Para nome de arquivo: ordena cronologicamente na
 * pasta. Nao usar toISOString(), que converte para UTC.
 */
export function formatDateIsoLocal(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
