import test from 'node:test';
import assert from 'node:assert/strict';

import { HttpError } from '../src/contracts/errors.js';
import {
  SAMPLE_EXPORT_FIELDS,
  SAMPLE_EXPORT_FIELDS_FOR_REPORT,
  buildSelectedExportFieldEntries,
  normalizeReportedHarvest,
} from '../src/reports/export-fields.js';

const is422 = (error) => error instanceof HttpError && error.status === 422;

// Detail com a ficha de classificacao no formato canonico AGRUPADO
// (defeitos{}, peneiras{}, fundos[]) — o mesmo que applyClassificationDataPatch
// projeta em latestClassificationData.
const detailFixture = () => ({
  sample: {
    internalLotNumber: '5444',
    declared: { owner: 'Fazenda X', sacks: 50, harvest: '24/25', originLot: 'L-1' },
    latestClassification: {
      data: {
        dataClassificacao: '2026-06-01',
        padrao: 'Bica corrida',
        aspecto: 'verde cana',
        catacao: 'a maquina',
        bebida: 'dura',
        certif: 'Rainforest',
        observacoes: 'amostra ok',
        // peneiras/percentuais sao numericos no payload canonico (o form envia
        // via parseNumberInput); defeitos sao string|null.
        peneiras: {
          p18: 12,
          p17: 35,
          p16: 20,
          p15: 10,
          p14: 8,
          p13: 5,
          p12: null,
          p11: null,
          p10: 3,
          mk: 5,
        },
        fundos: [
          { peneira: '9', percentual: 2 },
          { peneira: null, percentual: null },
        ],
        defeitos: { imp: '1', pva: '3', broca: '2', gpi: '0', ap: '1', defeito: null },
      },
      technical: { type: null, screen: null, density: null },
    },
  },
});

// --- mapeamento dos campos de classificacao no laudo ---

test('buildSelectedExportFieldEntries: le defeitos do sub-obj defeitos{} (fix do bug de chave)', () => {
  const entries = buildSelectedExportFieldEntries(detailFixture(), SAMPLE_EXPORT_FIELDS, {
    excludeEmpty: true,
  });
  const byId = new Map(entries.map((entry) => [entry.id, entry.value]));
  // Defeitos sao percentuais na ficha (sufixo "%" no laudo, igual ao form).
  assert.equal(byId.get('broca'), '2%');
  assert.equal(byId.get('pva'), '3%');
  assert.equal(byId.get('imp'), '1%');
  assert.equal(byId.get('ap'), '1%');
  assert.equal(byId.get('gpi'), '0%');
  // Catacao tambem e percentual, mas o "%" so ancora quando ha digito: valor
  // de texto livre ("a maquina") e preservado sem "%".
  assert.equal(byId.get('catacao'), 'a maquina');
  // defeito null -> filtrado por excludeEmpty
  assert.equal(byId.has('defeito'), false);
});

test('buildSelectedExportFieldEntries: certif (Certificado) vem do nivel raiz', () => {
  const entries = buildSelectedExportFieldEntries(detailFixture(), ['certif'], {
    excludeEmpty: true,
  });
  assert.equal(entries[0]?.label, 'Certificado');
  assert.equal(entries[0]?.value, 'Rainforest');
});

test('buildSelectedExportFieldEntries: peneirasPercentuais formata peneiras{} + fundos[] (incl. MK)', () => {
  const entries = buildSelectedExportFieldEntries(detailFixture(), ['peneirasPercentuais'], {
    excludeEmpty: true,
  });
  const sieve = entries[0]?.value ?? '';
  assert.match(sieve, /P18: 12%/);
  assert.match(sieve, /MK: 5%/);
  // Fundo sem numeracao/sem "P": peneira crua junta ao % com "=".
  assert.match(sieve, /Fundo 9=2%/);
  // peneiras nulas (p12/p11) nao aparecem
  assert.equal(/P12:/.test(sieve), false);
  assert.equal(/P11:/.test(sieve), false);
});

test('SAMPLE_EXPORT_FIELDS_FOR_REPORT: laudo unico exclui owner/data/lotes/classificadores e inclui os campos do laudo', () => {
  const fields = SAMPLE_EXPORT_FIELDS_FOR_REPORT;
  // proprietario e dados internos nao saem no laudo unico (decisao de produto)
  assert.equal(fields.includes('owner'), false);
  assert.equal(fields.includes('classificationDate'), false);
  assert.equal(fields.includes('originLot'), false);
  assert.equal(fields.includes('classificationOriginLot'), false);
  assert.equal(fields.includes('classifiers'), false);
  assert.equal(fields.includes('conferredBy'), false);
  // campos do laudo
  assert.ok(fields.includes('certif'));
  assert.ok(fields.includes('ap'));
  assert.ok(fields.includes('gpi'));
});

// --- safra unica ---

test('normalizeReportedHarvest: safra unica sem escolha retorna null', () => {
  assert.equal(normalizeReportedHarvest(null, '24/25'), null);
  assert.equal(normalizeReportedHarvest(undefined, '24/25'), null);
});

test('normalizeReportedHarvest: safra unica com escolha valida retorna a escolha', () => {
  assert.equal(normalizeReportedHarvest('24/25', '24/25'), '24/25');
});

test('normalizeReportedHarvest: safra unica com escolha invalida lanca 422', () => {
  assert.throws(() => normalizeReportedHarvest('25/26', '24/25'), is422);
});

// --- safra multipla (liga): anti-vazamento ---

test('normalizeReportedHarvest: safra multipla SEM escolha lanca 422 (anti-vazamento)', () => {
  assert.throws(() => normalizeReportedHarvest(null, '24/25, 25/26'), is422);
});

test('normalizeReportedHarvest: safra multipla com escolha valida retorna a escolha', () => {
  assert.equal(normalizeReportedHarvest('25/26', '24/25, 25/26'), '25/26');
});

test('normalizeReportedHarvest: safra multipla com escolha fora do conjunto lanca 422', () => {
  assert.throws(() => normalizeReportedHarvest('99/00', '24/25, 25/26'), is422);
});

test('normalizeReportedHarvest: tolera virgula sem espaco', () => {
  assert.equal(normalizeReportedHarvest('25/26', '24/25,25/26'), '25/26');
});

// --- sem safra ---

test('normalizeReportedHarvest: sem safra declarada retorna null', () => {
  assert.equal(normalizeReportedHarvest(null, null), null);
});
