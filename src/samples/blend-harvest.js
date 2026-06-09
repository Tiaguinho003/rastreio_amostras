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

/**
 * Deriva o proprietario de uma liga a partir das origens. Regra de UNANIMIDADE:
 * se TODAS as origens tem o mesmo `ownerClientId` (nao-nulo), a liga herda esse
 * dono; qualquer origem sem dono OU donos divergentes -> liga sem dono (null).
 * A unanimidade e SEMPRE por `ownerClientId` (o id e a verdade); o nome
 * (`declaredOwner`) e o snapshot da 1a origem (todas tem o mesmo id quando
 * unanime). Usado por createBlend e pela propagacao reativa do proprietario.
 *
 * @param {Array<{ownerClientId: string|null, declaredOwner: string|null}>} origins
 * @returns {{ownerClientId: string|null, declaredOwner: string|null}}
 */
export function deriveBlendOwner(origins) {
  if (!Array.isArray(origins) || origins.length === 0) {
    return { ownerClientId: null, declaredOwner: null };
  }
  const ids = origins.map((origin) => origin?.ownerClientId ?? null);
  const distinct = new Set(ids);
  // Divergentes (size > 1) ou a unica e nula -> sem dono.
  if (distinct.size !== 1 || ids[0] === null) {
    return { ownerClientId: null, declaredOwner: null };
  }
  return { ownerClientId: ids[0], declaredOwner: origins[0]?.declaredOwner ?? null };
}
