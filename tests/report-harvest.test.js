import test from 'node:test';
import assert from 'node:assert/strict';

import { HttpError } from '../src/contracts/errors.js';
import {
  SAMPLE_EXPORT_FIELDS,
  SAMPLE_EXPORT_FIELDS_FOR_REPORT,
  buildHarvestBreakdown,
  buildSelectedExportFieldEntries,
  formatHarvestLabel,
  normalizeReportedHarvest,
  resolveReportedHarvestLenient,
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
  // Fundo sem numeracao/sem "P": peneira crua junta ao % com " = ".
  assert.match(sieve, /Fundo 9 = 2%/);
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

// --- safra multipla (liga): "Mix" (a escolha forcada foi revertida) ---

test('normalizeReportedHarvest: safra multipla SEM escolha retorna null (laudo renderiza Mix)', () => {
  assert.equal(normalizeReportedHarvest(null, '24/25, 25/26'), null);
});

test('normalizeReportedHarvest: safra multipla com escolha valida (share antigo) retorna a escolha', () => {
  assert.equal(normalizeReportedHarvest('25/26', '24/25, 25/26'), '25/26');
});

test('normalizeReportedHarvest: safra multipla com escolha fora do conjunto ainda lanca 422', () => {
  assert.throws(() => normalizeReportedHarvest('99/00', '24/25, 25/26'), is422);
});

test('normalizeReportedHarvest: tolera virgula sem espaco', () => {
  assert.equal(normalizeReportedHarvest('25/26', '24/25,25/26'), '25/26');
});

// --- sem safra ---

test('normalizeReportedHarvest: sem safra declarada retorna null', () => {
  assert.equal(normalizeReportedHarvest(null, null), null);
});

// --- resolveReportedHarvestLenient (laudo AO VIVO): NUNCA lanca ---

test('resolveReportedHarvestLenient: escolha presente nas opcoes retorna a escolha', () => {
  assert.equal(resolveReportedHarvestLenient('25/26', '24/25, 25/26'), '25/26');
});

test('resolveReportedHarvestLenient: escolha FORA das opcoes retorna a escolha (preserva o envio, nao lanca)', () => {
  // Caso #2: a amostra era liga e a safra escolhida foi editada/removida depois.
  assert.equal(resolveReportedHarvestLenient('25/26', '24/25'), '25/26');
  assert.equal(resolveReportedHarvestLenient('99/00', '24/25, 26/27'), '99/00');
});

test('resolveReportedHarvestLenient: sem escolha + safra unica retorna null (usa o declarado)', () => {
  assert.equal(resolveReportedHarvestLenient(null, '24/25'), null);
  assert.equal(resolveReportedHarvestLenient(undefined, '24/25'), null);
});

test('resolveReportedHarvestLenient: sem escolha + liga multi-safra retorna null (laudo renderiza Mix)', () => {
  assert.equal(resolveReportedHarvestLenient(null, '24/25, 25/26'), null);
});

test('resolveReportedHarvestLenient: sem escolha + sem safra retorna null', () => {
  assert.equal(resolveReportedHarvestLenient(null, null), null);
  assert.equal(resolveReportedHarvestLenient(null, ''), null);
});

// --- buildHarvestBreakdown (laudo "Mix"): % por safra, por sacas, ate as folhas ---
// Arvore no formato de loadBlendTree: raiz (isBlend, contributedSacks null) +
// descendentes. Folhas = nao-liga com contributedSacks. Ligas intermediarias
// (isBlend) sao ignoradas — as folhas ja somam o total (F7.7 = 100%).

test('buildHarvestBreakdown: liga simples divide a % por sacas (maior-resto soma 100)', () => {
  const tree = [
    { sampleId: 'liga', isBlend: true, contributedSacks: null, declaredHarvest: '24/25, 25/26' },
    { sampleId: 'a', isBlend: false, contributedSacks: 100, declaredHarvest: '24/25' },
    { sampleId: 'b', isBlend: false, contributedSacks: 50, declaredHarvest: '25/26' },
  ];
  const breakdown = buildHarvestBreakdown(tree);
  assert.deepEqual(breakdown, [
    { safra: '24/25', sacks: 100, pct: 66.7 },
    { safra: '25/26', sacks: 50, pct: 33.3 },
  ]);
  assert.equal(
    breakdown.reduce((sum, entry) => sum + entry.pct, 0),
    100
  );
});

test('buildHarvestBreakdown: agrupa folhas da mesma safra', () => {
  const tree = [
    { sampleId: 'liga', isBlend: true, contributedSacks: null, declaredHarvest: '24/25, 25/26' },
    { sampleId: 'a', isBlend: false, contributedSacks: 30, declaredHarvest: '24/25' },
    { sampleId: 'b', isBlend: false, contributedSacks: 30, declaredHarvest: '24/25' },
    { sampleId: 'c', isBlend: false, contributedSacks: 40, declaredHarvest: '25/26' },
  ];
  assert.deepEqual(buildHarvestBreakdown(tree), [
    { safra: '24/25', sacks: 60, pct: 60 },
    { safra: '25/26', sacks: 40, pct: 40 },
  ]);
});

test('buildHarvestBreakdown: liga-de-liga (F7.7 100%) conta so as folhas, ignora a subliga', () => {
  // Raiz G = A(60, 24/25) + subliga S(40). S = B(30, 25/26) + C(10, 26/27).
  // As folhas A,B,C somam 100 = total de G; S (isBlend) e ignorada.
  const tree = [
    {
      sampleId: 'G',
      isBlend: true,
      contributedSacks: null,
      declaredHarvest: '24/25, 25/26, 26/27',
    },
    { sampleId: 'A', isBlend: false, contributedSacks: 60, declaredHarvest: '24/25' },
    { sampleId: 'S', isBlend: true, contributedSacks: 40, declaredHarvest: '25/26, 26/27' },
    { sampleId: 'B', isBlend: false, contributedSacks: 30, declaredHarvest: '25/26' },
    { sampleId: 'C', isBlend: false, contributedSacks: 10, declaredHarvest: '26/27' },
  ];
  assert.deepEqual(buildHarvestBreakdown(tree), [
    { safra: '24/25', sacks: 60, pct: 60 },
    { safra: '25/26', sacks: 30, pct: 30 },
    { safra: '26/27', sacks: 10, pct: 10 },
  ]);
});

test('buildHarvestBreakdown: menos de 2 safras retorna [] (safra unica nao e Mix)', () => {
  const tree = [
    { sampleId: 'liga', isBlend: true, contributedSacks: null, declaredHarvest: '24/25' },
    { sampleId: 'a', isBlend: false, contributedSacks: 100, declaredHarvest: '24/25' },
    { sampleId: 'b', isBlend: false, contributedSacks: 50, declaredHarvest: '24/25' },
  ];
  assert.deepEqual(buildHarvestBreakdown(tree), []);
});

test('buildHarvestBreakdown: arvore vazia/nao-array retorna []', () => {
  assert.deepEqual(buildHarvestBreakdown([]), []);
  assert.deepEqual(buildHarvestBreakdown(null), []);
});

// --- formatHarvestLabel (etiqueta fisica de envio) ---

test('formatHarvestLabel: multi-safra vira "Mix — ..."', () => {
  assert.equal(formatHarvestLabel('24/25, 25/26'), 'Mix — 24/25, 25/26');
});

test('formatHarvestLabel: safra unica passa direto', () => {
  assert.equal(formatHarvestLabel('24/25'), '24/25');
});

test('formatHarvestLabel: null/vazio', () => {
  assert.equal(formatHarvestLabel(null), null);
  assert.equal(formatHarvestLabel(''), '');
});
