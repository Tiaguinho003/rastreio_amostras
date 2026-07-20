import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { HttpError } from '../src/contracts/errors.js';

// EXT (rodada 1): falha da IA no extract-and-prepare era Error plain com
// .code — o toHttpErrorResponse devolvia 500 "Internal server error" e o
// modal tecnico do front mostrava isso ao operador. Agora: TIMEOUT -> 504,
// demais codigos -> 502, ambos com mensagem pt-BR acionavel.

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

function buildActor(role = 'ADMIN') {
  return {
    actorType: 'USER',
    actorUserId: '00000000-0000-4000-8000-000000000001',
    role,
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test',
  };
}

function extractionServiceThatThrows(code) {
  return {
    async extractClassificationFromPhoto() {
      const error = new Error(`stub failure ${code ?? 'sem code'}`);
      if (code) error.code = code;
      throw error;
    },
  };
}

async function withTempBaseDir(run) {
  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cam-extract-err-'));
  try {
    return await run(baseDir);
  } finally {
    await fsp.rm(baseDir, { recursive: true, force: true });
  }
}

async function expectStatus(code, expectedStatus, expectedMessagePattern) {
  await withTempBaseDir(async (baseDir) => {
    const service = new SampleCommandService({
      eventService: null,
      queryService: null,
      uploadService: { baseDir },
      extractionService: extractionServiceThatThrows(code),
    });

    await assert.rejects(
      // Mode 1 (upload direto) cria o temp e chama a extracao stubada.
      service.extractAndPrepareClassification({ fileBuffer: ONE_BY_ONE_PNG }, buildActor()),
      (error) => {
        assert.equal(error instanceof HttpError, true);
        assert.equal(error.status, expectedStatus);
        assert.match(error.message, expectedMessagePattern);
        assert.equal(error.details?.errorCode, code ?? 'UNKNOWN');
        return true;
      }
    );

    // O temp criado pelo Mode 1 e limpo na falha (comportamento preservado).
    const tempEntries = await fsp.readdir(path.join(baseDir, '_temp'));
    assert.deepEqual(
      tempEntries.filter((name) => name.endsWith('.jpg')),
      []
    );
  });
}

test('extract: TIMEOUT da IA vira 504 com mensagem pt-BR', async () => {
  await expectStatus('TIMEOUT', 504, /demorou demais/);
});

test('extract: OPENAI_ERROR vira 502 com mensagem pt-BR', async () => {
  await expectStatus('OPENAI_ERROR', 502, /servico de leitura da ficha falhou/);
});

test('extract: PARSE_ERROR vira 502', async () => {
  await expectStatus('PARSE_ERROR', 502, /servico de leitura da ficha falhou/);
});

test('extract: erro sem code vira 502 com errorCode UNKNOWN', async () => {
  await expectStatus(null, 502, /servico de leitura da ficha falhou/);
});

// CAM-P1: o extract persiste o resultado BRUTO num sidecar ao lado da foto
// temp — e o que o confirm le pra emitir o evento de auditoria.

test('extract: sucesso grava sidecar CAM-P1 ao lado do temp', async () => {
  await withTempBaseDir(async (baseDir) => {
    const service = new SampleCommandService({
      eventService: null,
      queryService: null,
      uploadService: { baseDir },
      extractionService: {
        async extractClassificationFromPhoto() {
          return {
            identificacao: { lote: '5689', sacas: null, safra: null },
            classificacao: { padrao: 'L4-P3' },
            model: 'gpt-test',
            processingTimeMs: 42,
          };
        },
      },
    });

    const result = await service.extractAndPrepareClassification(
      { fileBuffer: ONE_BY_ONE_PNG },
      buildActor()
    );

    const sidecar = JSON.parse(
      await fsp.readFile(
        path.join(baseDir, '_temp', `temp-${result.photoToken}-extraction.json`),
        'utf8'
      )
    );
    assert.equal(sidecar.outcome, 'success');
    assert.equal(sidecar.model, 'gpt-test');
    assert.equal(sidecar.processingTimeMs, 42);
    assert.equal(sidecar.identificacao.lote, '5689');
    assert.equal(sidecar.classificacao.padrao, 'L4-P3');
  });
});

test('extract Mode 2: falha da IA grava sidecar de failure (auditoria do manual)', async () => {
  await withTempBaseDir(async (baseDir) => {
    const photoToken = randomUUID();
    const tempDir = path.join(baseDir, '_temp');
    await fsp.mkdir(tempDir, { recursive: true });
    await fsp.writeFile(path.join(tempDir, `temp-${photoToken}.jpg`), ONE_BY_ONE_PNG);

    const service = new SampleCommandService({
      eventService: null,
      queryService: null,
      uploadService: { baseDir },
      extractionService: extractionServiceThatThrows('TIMEOUT'),
    });

    await assert.rejects(
      service.extractAndPrepareClassification({ photoToken }, buildActor()),
      (error) => error instanceof HttpError && error.status === 504
    );

    const sidecar = JSON.parse(
      await fsp.readFile(path.join(tempDir, `temp-${photoToken}-extraction.json`), 'utf8')
    );
    assert.equal(sidecar.outcome, 'failure');
    assert.equal(sidecar.errorCode, 'TIMEOUT');
    assert.match(sidecar.errorMessage, /stub failure/);
  });
});
