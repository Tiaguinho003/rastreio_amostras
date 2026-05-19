import test from 'node:test';
import assert from 'node:assert/strict';

import { mapEligibilityReasonToLabel } from '../lib/samples/eligibility-labels.ts';

// Liga B1.1: garante mapeamento estável dos reasons em pt-BR (F1.B).
// Os labels são usados em tooltips no card inelegível + toast quando
// sample selecionada vira inelegível (após refetch otimista).

test('mapEligibilityReasonToLabel maps INVALIDATED to pt-BR label', () => {
  assert.equal(mapEligibilityReasonToLabel('INVALIDATED'), 'Amostra inválida');
});

test('mapEligibilityReasonToLabel maps NOT_CLASSIFIED to pt-BR label', () => {
  assert.equal(mapEligibilityReasonToLabel('NOT_CLASSIFIED'), 'Aguardando classificação');
});

test('mapEligibilityReasonToLabel maps NO_BALANCE to pt-BR label', () => {
  assert.equal(mapEligibilityReasonToLabel('NO_BALANCE'), 'Sem saldo disponível');
});

test('mapEligibilityReasonToLabel returns null for null reason (eligible sample)', () => {
  assert.equal(mapEligibilityReasonToLabel(null), null);
});
