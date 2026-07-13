// Formatação de exibição dos percentuais da ficha de classificação
// (peneiras, catação, defeitos IMP/PVA/BROCA/GPI/AP, percentual de fundo).
//
// Convenção (auditoria 2026-07-13, CL19): o MESMO valor deve ler igual em
// toda superfície — card da lista, detalhe e laudo. Espelha o
// formatPercentValue do laudo (src/reports/export-fields.js): sufixa "%"
// só quando há um dígito ao qual ancorar; texto livre ("a maquina", "tr")
// passa como está; valor que já termina em "%" não ganha outro.
export function formatPercentDisplay(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text === '') return null;
  if (!/\d/.test(text) || text.endsWith('%')) return text;
  return `${text}%`;
}
