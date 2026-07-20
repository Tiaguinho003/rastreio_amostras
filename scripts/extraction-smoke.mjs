import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ClassificationExtractionService } from '../src/samples/classification-extraction-service.js';
import { FormDetectionService } from '../src/samples/form-detection-service.js';

// Smoke MANUAL da extracao (fora dos quality gates): roda deteccao + extracao
// REAL na OpenAI e compara o resultado com um ground truth campo a campo.
// Uso principal: validar mudanca de prompt ANTES do canary — rodar antes e
// depois da mudanca e comparar os misses (a telemetria stderr traz tokens e
// promptVersion de cada rodada).
//
//   node scripts/extraction-smoke.mjs                          # fixture + truth padrao
//   node scripts/extraction-smoke.mjs --photo foto.jpg         # foto avulsa, sem diff
//   node scripts/extraction-smoke.mjs --photo f.jpg --truth f.json
//
// Requer OPENAI_API_KEY (process.env, .env.local ou .env na raiz).
// Cada execucao custa 1 chamada de visao (gpt-4o pinado, detail high).

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PHOTO = path.join(ROOT, 'src/samples/fixtures/extraction-example.jpg');
const DEFAULT_TRUTH = path.join(ROOT, 'src/samples/fixtures/extraction-example.json');

function parseArgs(argv) {
  const args = { photo: null, truth: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--photo') args.photo = argv[++i];
    else if (argv[i] === '--truth') args.truth = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Uso: node scripts/extraction-smoke.mjs [--photo foto.jpg] [--truth truth.json]');
      process.exit(0);
    }
  }
  return args;
}

// Chave: env do processo ou parse minimo de .env.local/.env (o script roda
// fora do Next, que e quem normalmente carrega esses arquivos).
function loadApiKey() {
  if (process.env.OPENAI_API_KEY?.trim()) return process.env.OPENAI_API_KEY.trim();
  for (const name of ['.env.local', '.env']) {
    try {
      const content = fs.readFileSync(path.join(ROOT, name), 'utf8');
      const match = content.match(/^OPENAI_API_KEY=(.*)$/m);
      if (match) {
        const value = match[1].trim().replace(/^["']|["']$/g, '');
        if (value) return value;
      }
    } catch {
      // arquivo ausente — tenta o proximo
    }
  }
  return null;
}

// Achata o shape {identificacao, classificacao} em pares [caminho, valor]
// pra diff posicional (mesma ordem da ficha).
function flattenResult(data) {
  const pairs = [];
  const ide = data?.identificacao ?? {};
  for (const k of ['lote', 'sacas', 'safra']) pairs.push([`identificacao.${k}`, ide[k] ?? null]);

  const cls = data?.classificacao ?? {};
  for (const k of ['padrao', 'aspecto', 'certif']) pairs.push([`${k}`, cls[k] ?? null]);
  const pen = cls.peneiras ?? {};
  for (const k of ['p18', 'p17', 'p16', 'mk', 'p15', 'p14', 'p13', 'p12', 'p11', 'p10']) {
    pairs.push([`peneiras.${k}`, pen[k] ?? null]);
  }
  const fundos = Array.isArray(cls.fundos) ? cls.fundos : [];
  for (let i = 0; i < 2; i += 1) {
    pairs.push([`fundos[${i}].peneira`, fundos[i]?.peneira ?? null]);
    pairs.push([`fundos[${i}].percentual`, fundos[i]?.percentual ?? null]);
  }
  pairs.push(['catacao', cls.catacao ?? null]);
  const def = cls.defeitos ?? {};
  for (const k of ['imp', 'pva', 'broca', 'gpi', 'ap', 'defeito']) {
    pairs.push([`defeitos.${k}`, def[k] ?? null]);
  }
  pairs.push(['observacoes', cls.observacoes ?? null]);
  pairs.push(['bebida', cls.bebida ?? null]);
  return pairs;
}

const args = parseArgs(process.argv);
const photoPath = args.photo ? path.resolve(args.photo) : DEFAULT_PHOTO;
// Truth padrao so vale pra foto padrao — foto avulsa sem --truth roda sem diff.
const truthPath = args.truth ? path.resolve(args.truth) : args.photo ? null : DEFAULT_TRUTH;

if (!fs.existsSync(photoPath)) {
  console.error(`Foto nao encontrada: ${photoPath}`);
  process.exit(1);
}

const apiKey = loadApiKey();
if (!apiKey) {
  console.error('OPENAI_API_KEY ausente (env, .env.local ou .env). Abortando sem custo.');
  process.exit(1);
}

console.log(`Foto: ${path.relative(ROOT, photoPath)}`);

// 1. Deteccao (mesmo servico do backend — sharp puro, sem custo de IA).
const originalBuffer = fs.readFileSync(photoPath);
const detection = await new FormDetectionService().detectAndCrop(originalBuffer);
console.log(`Deteccao: ${detection.detected ? 'ficha detectada (crop aplicado)' : 'sem crop'}`);

// 2. Extracao real (o cropped vai pra um temp — o servico le por caminho).
let extractionPath = photoPath;
let tempCrop = null;
if (detection.detected && detection.croppedBuffer) {
  tempCrop = path.join(os.tmpdir(), `extraction-smoke-${Date.now()}.jpg`);
  fs.writeFileSync(tempCrop, detection.croppedBuffer);
  extractionPath = tempCrop;
}

const service = new ClassificationExtractionService({ apiKey });
let result;
try {
  result = await service.extractClassificationFromPhoto(extractionPath);
} finally {
  if (tempCrop) fs.rmSync(tempCrop, { force: true });
}

console.log(`Modelo: ${result.model} | ${result.processingTimeMs}ms`);
console.log('(tokens e promptVersion na linha de telemetria stderr acima)');

const got = flattenResult(result);
const filled = got.filter(([, v]) => v !== null).length;
console.log(`Campos preenchidos: ${filled}/${got.length}`);

// 3. Diff contra o ground truth, quando houver.
if (truthPath) {
  if (!fs.existsSync(truthPath)) {
    console.error(`Truth nao encontrado: ${truthPath}`);
    process.exit(1);
  }
  const truth = JSON.parse(fs.readFileSync(truthPath, 'utf8'));
  const expected = new Map(flattenResult(truth));

  let exact = 0;
  const misses = [];
  const extras = [];
  for (const [field, gotValue] of got) {
    const expectedValue = expected.get(field) ?? null;
    if (expectedValue === gotValue) {
      exact += 1;
    } else if (expectedValue !== null && gotValue === null) {
      misses.push(`  MISS  ${field}: esperado "${expectedValue}", veio null`);
    } else if (expectedValue === null && gotValue !== null) {
      extras.push(`  EXTRA ${field}: veio "${gotValue}" (truth: vazio)`);
    } else {
      misses.push(`  DIFF  ${field}: esperado "${expectedValue}", veio "${gotValue}"`);
    }
  }

  console.log(`\nDiff vs ${path.relative(ROOT, truthPath)}:`);
  console.log(
    `  exatos: ${exact}/${got.length} | misses/diffs: ${misses.length} | extras: ${extras.length}`
  );
  for (const line of [...misses, ...extras]) console.log(line);
  if (misses.length === 0 && extras.length === 0) {
    console.log('  extracao bateu 100% com o ground truth.');
  }
}
