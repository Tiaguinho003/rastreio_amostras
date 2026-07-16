import test from 'node:test';
import assert from 'node:assert/strict';

import { formatAvisoDue } from '../lib/aviso-due.ts';

// AP31/DSB-D19: texto do prazo do card de Avisos, por proximidade (decisão do Flavio:
// "este mês/esta semana conforme os dias antes do faturamento") + "sem data" p/ "À
// definir" (D144) + "vencido" quando o faturamento já passou.
test('formatAvisoDue: buckets por proximidade + null/vencido', () => {
  assert.equal(formatAvisoDue(null), 'Sem data');
  assert.equal(formatAvisoDue(-1), 'Faturamento vencido');
  assert.equal(formatAvisoDue(-30), 'Faturamento vencido');
  assert.equal(formatAvisoDue(0), 'Vence hoje');
  assert.equal(formatAvisoDue(1), 'Vence amanhã');
  assert.equal(formatAvisoDue(2), 'Vence esta semana');
  assert.equal(formatAvisoDue(7), 'Vence esta semana');
  assert.equal(formatAvisoDue(8), 'Vence este mês');
  assert.equal(formatAvisoDue(30), 'Vence este mês');
  assert.equal(formatAvisoDue(31), 'Vence em 31 dias');
  assert.equal(formatAvisoDue(365), 'Vence em 365 dias');
});
