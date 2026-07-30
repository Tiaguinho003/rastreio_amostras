import test from 'node:test';
import assert from 'node:assert/strict';

import { publish, resetBusForTests, subscribe } from '../lib/revalidation/bus.ts';
import { subjectForPath } from '../lib/revalidation/subjects.ts';
import type { RevalidationSubject } from '../lib/revalidation/subjects.ts';

// F3 do ciclo SN — o barramento de invalidacao (SN-D13) e o mapa
// caminho->assunto (SN-D14). E logica pura, sem DOM: cabe no test:unit.
//
// O barramento coalesce por 120ms, entao todo caso precisa esperar a janela.
const COALESCE_WAIT_MS = 200;
const settle = () => new Promise((resolve) => setTimeout(resolve, COALESCE_WAIT_MS));

test('mapa caminho->assunto cobre os caminhos de escrita do app', () => {
  assert.equal(subjectForPath('/samples/create'), 'lotes');
  assert.equal(subjectForPath('/samples/abc-123/movements'), 'lotes');
  assert.equal(subjectForPath('/classification/confirm'), 'lotes');
  assert.equal(subjectForPath('/clients/abc/units/def'), 'clientes');
  assert.equal(subjectForPath('/brokers/abc'), 'corretores');
  assert.equal(subjectForPath('/sale-contracts/abc/washout'), 'contratos');
  assert.equal(subjectForPath('/approval-labels'), 'contratos');
  assert.equal(subjectForPath('/financeiro'), 'corretagem');
  assert.equal(subjectForPath('/visit-reports/abc'), 'relatorios');
  assert.equal(subjectForPath('/weekly-reports'), 'relatorios');
  assert.equal(subjectForPath('/informe-feed'), 'relatorios');
  assert.equal(subjectForPath('/users/me/profile'), 'usuarios');
});

test('mapa ignora query string e caminho sem assunto', () => {
  assert.equal(subjectForPath('/samples/resolve?code=X'), 'lotes');
  assert.equal(subjectForPath('/clients/lookup?term=ab'), 'clientes');
  // Estes nao alimentam lista nenhuma da UI — publicar seria ruido.
  assert.equal(subjectForPath('/auth/login'), null);
  assert.equal(subjectForPath('/dashboard/avisos'), null);
  assert.equal(subjectForPath('/push/subscriptions'), null);
  assert.equal(subjectForPath('/print-queue/pending'), null);
  assert.equal(subjectForPath('/contract-lookups'), null);
  assert.equal(subjectForPath(''), null);
  assert.equal(subjectForPath('/'), null);
});

test('entrega a quem assina o assunto e ignora quem nao assina', async () => {
  resetBusForTests();
  const recebidos: RevalidationSubject[][] = [];
  const outroCard: RevalidationSubject[][] = [];

  subscribe(['lotes'], (subjects) => recebidos.push(subjects));
  subscribe(['usuarios'], (subjects) => outroCard.push(subjects));

  publish(['lotes']);
  await settle();

  assert.deepEqual(recebidos, [['lotes']]);
  assert.deepEqual(outroCard, []);
});

test('coalesce a rajada: N escritas no mesmo assunto viram UM disparo', async () => {
  resetBusForTests();
  let disparos = 0;
  subscribe(['lotes'], () => {
    disparos += 1;
  });

  // O molde do fluxo real: criar lote -> anexar foto -> confirmar classificacao.
  publish(['lotes']);
  publish(['lotes']);
  publish(['lotes']);
  await settle();

  assert.equal(disparos, 1);
});

test('ouvinte de varios assuntos roda UMA vez com o lote inteiro', async () => {
  resetBusForTests();
  const lotes: RevalidationSubject[][] = [];
  subscribe(['contratos', 'clientes', 'lotes'], (subjects) => lotes.push([...subjects].sort()));

  publish(['contratos']);
  publish(['clientes']);
  await settle();

  assert.equal(lotes.length, 1);
  assert.deepEqual(lotes[0], ['clientes', 'contratos']);
});

test('cancelar a inscricao para de entregar', async () => {
  resetBusForTests();
  let disparos = 0;
  const unsubscribe = subscribe(['lotes'], () => {
    disparos += 1;
  });

  publish(['lotes']);
  await settle();
  assert.equal(disparos, 1);

  unsubscribe();
  publish(['lotes']);
  await settle();
  assert.equal(disparos, 1);
});

test('publicar sem assunto nenhum nao dispara nada', async () => {
  resetBusForTests();
  let disparos = 0;
  subscribe(['lotes'], () => {
    disparos += 1;
  });

  publish([]);
  await settle();

  assert.equal(disparos, 0);
});
