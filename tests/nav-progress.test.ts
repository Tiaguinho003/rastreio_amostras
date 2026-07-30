import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getNavPending,
  getServerNavPending,
  resetNavProgressForTests,
  setLinkPending,
  subscribeNavPending,
} from '../lib/navigation/nav-progress.ts';

// F4 do ciclo SN — o store da barra de navegacao (SN-D11). Logica pura, sem
// DOM: cabe no test:unit. O que ele guarda nao e um booleano, e o CONJUNTO de
// links pendentes — e disso que saem os casos abaixo.

test('comeca apagado e o servidor nunca ve navegacao em curso', () => {
  resetNavProgressForTests();
  assert.equal(getNavPending(), false);
  assert.equal(getServerNavPending(), false);
});

test('um link pendente acende, o mesmo link resolvido apaga', () => {
  resetNavProgressForTests();
  setLinkPending('a', true);
  assert.equal(getNavPending(), true);
  setLinkPending('a', false);
  assert.equal(getNavPending(), false);
});

test('so o ULTIMO link a terminar apaga a barra', () => {
  resetNavProgressForTests();
  setLinkPending('a', true);
  setLinkPending('b', true);
  setLinkPending('a', false);
  // 'b' ainda esta navegando: apagar aqui seria o caso do toque duplo, em que a
  // barra sumiria com a navegacao ainda em curso.
  assert.equal(getNavPending(), true);
  setLinkPending('b', false);
  assert.equal(getNavPending(), false);
});

test('avisa so quando o valor MUDA', () => {
  resetNavProgressForTests();
  let calls = 0;
  const unsubscribe = subscribeNavPending(() => {
    calls += 1;
  });

  setLinkPending('a', true);
  setLinkPending('b', true); // segue pendente — nao avisa de novo
  assert.equal(calls, 1);

  setLinkPending('a', false); // 'b' segura — nao avisa
  assert.equal(calls, 1);

  setLinkPending('b', false);
  assert.equal(calls, 2);

  unsubscribe();
  setLinkPending('c', true);
  assert.equal(calls, 2);
});

test('resolver link que nunca acendeu nao avisa ninguem', () => {
  resetNavProgressForTests();
  let calls = 0;
  const unsubscribe = subscribeNavPending(() => {
    calls += 1;
  });

  // A limpeza do efeito do probe roda mesmo quando o link nunca ficou pendente.
  setLinkPending('a', false);
  assert.equal(calls, 0);
  assert.equal(getNavPending(), false);

  unsubscribe();
});
