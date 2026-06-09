// Liga: derivacao canonica da safra de uma liga a partir das safras das
// origens. Cada origem contribui seu declaredHarvest; o conjunto distinto,
// ordenado e juntado com ', ' vira a safra da liga (ex: '24/25' quando todas
// compartilham, '24/25, 25/26' quando divergem). null quando nenhuma origem
// declara safra.
//
// IMPORTANTE: faz split por virgula de cada entrada ANTES de deduplicar.
// Quando uma origem e ela mesma uma liga, seu declaredHarvest ja pode ser uma
// string concatenada ('24/25, 25/26'); sem o split, ela entraria como um unico
// item e poderia gerar duplicatas (ex: '24/25, 24/25, 25/26') ao combinar com
// outra origem '24/25'. O split + dedup garante safras individuais distintas.
//
// Usado por createBlend (derivacao na criacao) e pela propagacao reativa de
// safra (recalculo quando uma origem e editada).

const HARVEST_SEPARATOR = ', ';

/**
 * Deriva a safra canonica de uma liga a partir das safras das origens.
 *
 * @param {Array<string|null|undefined>} harvestStrings - safras das origens
 *   diretas. Cada item pode ser null/vazio ou ja-concatenado ('24/25, 25/26').
 * @returns {string|null} safra canonica ('24/25, 25/26') ou null se nenhuma
 *   origem declara safra.
 */
export function deriveBlendHarvest(harvestStrings) {
  const distinct = new Set();
  for (const entry of harvestStrings) {
    if (entry == null) continue;
    for (const part of String(entry).split(/\s*,\s*/)) {
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        distinct.add(trimmed);
      }
    }
  }
  if (distinct.size === 0) return null;
  return Array.from(distinct).sort().join(HARVEST_SEPARATOR);
}
