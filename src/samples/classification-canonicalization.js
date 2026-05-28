// F3.13: normalizacao canonica dos campos texto livre da classificacao.
// Aplicado na saida da extracao da IA (e em qualquer caminho que grave esses
// campos) pra que o filtro futuro em /samples encontre todas as variacoes de
// grafia. Forward-only — amostras antigas mantem o que ja foi salvo.
//
// Padrao alinhado com lib/sample-identification.ts (normalizeLot, normalizeHarvest).

/**
 * Canoniza o campo `padrao`.
 * - trim + uppercase
 * - remove hifens (e quaisquer espacos cercando o hifen)
 * - insere 1 espaco entre tokens consecutivos sem separador (L4P3 -> L4 P3)
 * - colapsa espacos multiplos em 1
 *
 * Ex: "l4 - p3" -> "L4 P3"; "L-4P-3" -> "L4 P3"; "L 4 P 3" -> "L 4 P 3"
 */
export function canonicalizePadrao(value) {
  if (value == null) return null;
  let s = String(value).trim().toUpperCase();
  if (s.length === 0) return null;
  s = s.replace(/\s*-\s*/g, '');
  s = s.replace(/([A-Z]\d+)(?=[A-Z])/g, '$1 ');
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > 0 ? s : null;
}

/**
 * Canoniza o campo `aspecto`.
 * - trim + uppercase
 * - remove pontos e espacos internos
 *
 * Ex: "g.c." -> "GC"; "G C" -> "GC"; "gc" -> "GC"
 */
export function canonicalizeAspecto(value) {
  if (value == null) return null;
  const s = String(value)
    .trim()
    .toUpperCase()
    .replace(/[\s.]+/g, '');
  return s.length > 0 ? s : null;
}

/**
 * Canoniza o campo `bebida`.
 * - trim + uppercase
 * - colapsa espacos
 *
 * Ex: "dura" -> "DURA"; "Mole" -> "MOLE"
 */
export function canonicalizeBebida(value) {
  if (value == null) return null;
  const s = String(value).trim().toUpperCase().replace(/\s+/g, ' ');
  return s.length > 0 ? s : null;
}

/**
 * Canoniza o campo `certif`.
 * - trim + uppercase
 * - remove pontos
 * - colapsa espacos
 *
 * Ex: "u.t.z." -> "UTZ"; "Rainforest Alliance" -> "RAINFOREST ALLIANCE"
 */
export function canonicalizeCertif(value) {
  if (value == null) return null;
  const s = String(value).trim().toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ');
  return s.length > 0 ? s : null;
}

/**
 * Canoniza o campo `safra`.
 * Mesma logica de `lib/sample-identification.ts:normalizeHarvest`, mas em JS
 * (backend nao importa de lib/*.ts pra nao quebrar test:unit com strip-types).
 *
 * - substitui separadores [-_.] por /
 * - remove espacos internos
 * - se matcha (\d{2,4})/(\d{2,4}), abrevia para os 2 ultimos digitos
 *
 * Ex: "26-27" -> "26/27"; "2026/2027" -> "26/27"; " 26 / 27 " -> "26/27"
 */
export function canonicalizeHarvest(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed.length === 0) return null;
  // So abrevia pra "AA/AA" quando o valor JA parece uma safra (2 grupos de
  // digitos separados por -, _, . ou /). Antes substituia [-_.] por "/" CEGO
  // antes de testar, manglando valores nao-safra ("5.5" -> "5/5"). Agora casa
  // os separadores direto e, fora desse caso, preserva o bruto trimado.
  const match = trimmed.replace(/\s+/g, '').match(/^(\d{2,4})[-_./](\d{2,4})$/);
  if (match) {
    const start = match[1].slice(-2);
    const end = match[2].slice(-2);
    return `${start}/${end}`;
  }
  return trimmed;
}
