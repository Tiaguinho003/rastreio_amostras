import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ClassificationExtractionService } from '../src/samples/classification-extraction-service.js';

// ============================================================
// Helpers
// ============================================================

function buildService(mockChatCompletionsCreate) {
  const service = new ClassificationExtractionService({ apiKey: 'sk-test-fake' });
  // Substitui o cliente OpenAI por um mock minimo. As chamadas internas
  // de extractClassificationFromPhoto so usam this.client.chat.completions.create.
  service.client = {
    chat: {
      completions: {
        create: mockChatCompletionsCreate,
      },
    },
  };
  return service;
}

function writeFakeImage() {
  const file = path.join(os.tmpdir(), `fake-${Date.now()}-${Math.random()}.jpg`);
  fs.writeFileSync(file, Buffer.from([0xff, 0xd8, 0xff, 0xe0])); // JPEG magic bytes
  return file;
}

function buildOpenAIResponse(content) {
  return {
    choices: [
      {
        message: {
          content: typeof content === 'string' ? content : JSON.stringify(content),
        },
      },
    ],
  };
}

function buildExtractedFields(overrides = {}) {
  return {
    identificacao: {
      lote: '5567',
      sacas: '150',
      safra: '25/26',
      ...overrides.identificacao,
    },
    classificacao: {
      padrao: 'P3B',
      aspecto: 'verde',
      certif: 'UTZ',
      peneiras: {
        p18: '12,5',
        p17: '23,8',
        p16: null,
        p15: null,
        p14: null,
        p13: null,
        p12: null,
        p11: null,
        p10: null,
        mk: '5',
      },
      fundos: [
        { peneira: '13', percentual: '8' },
        { peneira: null, percentual: null },
      ],
      catacao: '0,5',
      defeitos: {
        imp: '2',
        pva: '5',
        broca: '3',
        gpi: null,
        ap: null,
        defeito: null,
      },
      observacoes: 'amostra ok',
      bebida: 'DURA',
      ...overrides.classificacao,
    },
  };
}

// ============================================================
// Tests
// ============================================================

test('extractClassificationFromPhoto envia prompt unico, image_url e json_schema strict', async () => {
  let captured = null;
  const create = async (params) => {
    captured = params;
    return buildOpenAIResponse(buildExtractedFields());
  };

  const service = buildService(create);
  const imagePath = writeFakeImage();
  try {
    await service.extractClassificationFromPhoto(imagePath);
  } finally {
    fs.unlinkSync(imagePath);
  }

  assert.equal(captured.model, 'gpt-4o');
  assert.equal(captured.temperature, 0.2);
  assert.equal(captured.max_tokens, 1500);

  // response_format usa json_schema strict (nao json_object livre).
  assert.equal(captured.response_format.type, 'json_schema');
  assert.equal(captured.response_format.json_schema.strict, true);
  assert.equal(captured.response_format.json_schema.name, 'classification_extraction');

  // Schema exige 'identificacao' e 'classificacao' como top-level.
  const schemaProps = captured.response_format.json_schema.schema.properties;
  assert.ok(schemaProps.identificacao);
  assert.ok(schemaProps.classificacao);

  // Schema da classificacao agrupa peneiras, fundos array, defeitos.
  const classifProps = schemaProps.classificacao.properties;
  assert.equal(classifProps.peneiras.type, 'object');
  assert.equal(classifProps.fundos.type, 'array');
  assert.equal(classifProps.defeitos.type, 'object');

  // F3.4 (revisado pos-template-binding): few-shot sem `assistant` message.
  // Com fixture: 3 mensagens (system + user-exemplo + user-real).
  // Sem fixture (CI sem assets): 2 mensagens (system + user-real).
  const expectedLen = captured.messages.length === 3 ? 3 : 2;
  assert.equal(captured.messages.length, expectedLen);
  assert.equal(captured.messages[0].role, 'system');

  // A ultima mensagem e sempre o user-real com a foto a ser extraida.
  const realUserMessage = captured.messages[expectedLen - 1];
  assert.equal(realUserMessage.role, 'user');
  const realUserContent = realUserMessage.content;
  assert.ok(Array.isArray(realUserContent));
  assert.equal(realUserContent[0].type, 'text');
  assert.equal(realUserContent[1].type, 'image_url');
  assert.match(realUserContent[1].image_url.url, /^data:image\/(jpeg|png);base64,/);
  assert.equal(realUserContent[1].image_url.detail, 'high');

  // Quando few-shot ativo, mensagem intermediaria e user-exemplo (NUNCA assistant).
  if (expectedLen === 3) {
    assert.equal(captured.messages[1].role, 'user');
    // Conteudo do exemplo: texto descritivo + image_url em detail 'low'.
    const exampleContent = captured.messages[1].content;
    assert.ok(Array.isArray(exampleContent));
    assert.equal(exampleContent[0].type, 'text');
    assert.equal(exampleContent[1].type, 'image_url');
    assert.equal(exampleContent[1].image_url.detail, 'low');
  }
});

test('normaliza resposta com estrutura agrupada (peneiras, fundos array, defeitos)', async () => {
  const create = async () => buildOpenAIResponse(buildExtractedFields());
  const service = buildService(create);
  const imagePath = writeFakeImage();

  let result;
  try {
    result = await service.extractClassificationFromPhoto(imagePath);
  } finally {
    fs.unlinkSync(imagePath);
  }

  assert.deepEqual(result.identificacao, {
    lote: '5567',
    sacas: '150',
    safra: '25/26',
  });

  // Peneiras como sub-objeto com 10 chaves fixas.
  assert.equal(result.classificacao.peneiras.p18, '12,5');
  assert.equal(result.classificacao.peneiras.p17, '23,8');
  assert.equal(result.classificacao.peneiras.p10, null);
  assert.equal(result.classificacao.peneiras.mk, '5');

  // Fundos como array de 2 objetos.
  assert.ok(Array.isArray(result.classificacao.fundos));
  assert.equal(result.classificacao.fundos.length, 2);
  assert.deepEqual(result.classificacao.fundos[0], { peneira: '13', percentual: '8' });
  assert.deepEqual(result.classificacao.fundos[1], { peneira: null, percentual: null });

  // Defeitos como sub-objeto.
  assert.equal(result.classificacao.defeitos.imp, '2');
  assert.equal(result.classificacao.defeitos.gpi, null);
  assert.equal(result.classificacao.defeitos.defeito, null);

  assert.equal(result.classificacao.observacoes, 'amostra ok');
  assert.equal(result.classificacao.bebida, 'DURA');
});

test('fundos sempre retornam exatamente 2 elementos (mesmo se IA retornar 0/1/3)', async () => {
  const cases = [
    {
      input: [],
      expected: [
        { peneira: null, percentual: null },
        { peneira: null, percentual: null },
      ],
    },
    {
      input: [{ peneira: '13', percentual: '8' }],
      expected: [
        { peneira: '13', percentual: '8' },
        { peneira: null, percentual: null },
      ],
    },
    {
      input: [
        { peneira: '13', percentual: '8' },
        { peneira: '11', percentual: '5' },
        { peneira: '10', percentual: '2' },
      ],
      expected: [
        { peneira: '13', percentual: '8' },
        { peneira: '11', percentual: '5' },
      ],
    },
  ];

  for (const c of cases) {
    const create = async () =>
      buildOpenAIResponse(buildExtractedFields({ classificacao: { fundos: c.input } }));
    const service = buildService(create);
    const imagePath = writeFakeImage();

    let result;
    try {
      result = await service.extractClassificationFromPhoto(imagePath);
    } finally {
      fs.unlinkSync(imagePath);
    }

    assert.equal(result.classificacao.fundos.length, 2);
    assert.deepEqual(result.classificacao.fundos, c.expected);
  }
});

test('rejectIfLabel descarta quando IA retorna um label conhecido como valor', async () => {
  const create = async () =>
    buildOpenAIResponse(
      buildExtractedFields({
        classificacao: {
          padrao: 'PADR.', // label impresso ecoado
          aspecto: 'asp.', // case-insensitive
          certif: 'CERT.',
          bebida: 'BEB.',
          fundos: [
            { peneira: 'FD', percentual: '8' }, // peneira ecoou label "FD"
            { peneira: null, percentual: null },
          ],
        },
      })
    );

  const service = buildService(create);
  const imagePath = writeFakeImage();

  let result;
  try {
    result = await service.extractClassificationFromPhoto(imagePath);
  } finally {
    fs.unlinkSync(imagePath);
  }

  assert.equal(result.classificacao.padrao, null);
  assert.equal(result.classificacao.aspecto, null);
  assert.equal(result.classificacao.certif, null);
  assert.equal(result.classificacao.bebida, null);
  assert.equal(result.classificacao.fundos[0].peneira, null);
  assert.equal(result.classificacao.fundos[0].percentual, '8'); // percentual numerico nao foi label
});

test('toNumericOrNull rejeita valores nao-numericos em campos numericos', async () => {
  const create = async () =>
    buildOpenAIResponse(
      buildExtractedFields({
        classificacao: {
          peneiras: {
            p18: 'abc', // texto invalido
            p17: '12,5', // ok
            p16: '5%', // % e descartado, sobra "5"
            p15: '', // string vazia
            p14: null,
            p13: null,
            p12: null,
            p11: null,
            p10: null,
            mk: null,
          },
          catacao: 'P10', // label conhecido
          defeitos: {
            imp: '2,5',
            pva: 'IMP.', // label
            broca: null,
            gpi: null,
            ap: null,
            defeito: null,
          },
        },
      })
    );

  const service = buildService(create);
  const imagePath = writeFakeImage();

  let result;
  try {
    result = await service.extractClassificationFromPhoto(imagePath);
  } finally {
    fs.unlinkSync(imagePath);
  }

  assert.equal(result.classificacao.peneiras.p18, null); // 'abc' rejeitado
  assert.equal(result.classificacao.peneiras.p17, '12,5');
  assert.equal(result.classificacao.peneiras.p16, '5'); // % removido
  assert.equal(result.classificacao.peneiras.p15, null); // string vazia
  assert.equal(result.classificacao.catacao, null); // label rejeitado
  assert.equal(result.classificacao.defeitos.imp, '2,5');
  assert.equal(result.classificacao.defeitos.pva, null); // label rejeitado
});

test('lanca PARSE_ERROR quando OpenAI retorna conteudo vazio', async () => {
  const create = async () => ({ choices: [{ message: { content: '' } }] });
  const service = buildService(create);
  const imagePath = writeFakeImage();

  try {
    await assert.rejects(
      () => service.extractClassificationFromPhoto(imagePath),
      (error) => {
        assert.equal(error.code, 'PARSE_ERROR');
        return true;
      }
    );
  } finally {
    fs.unlinkSync(imagePath);
  }
});

test('lanca PARSE_ERROR quando JSON e invalido', async () => {
  const create = async () => buildOpenAIResponse('isto nao e json');
  const service = buildService(create);
  const imagePath = writeFakeImage();

  try {
    await assert.rejects(
      () => service.extractClassificationFromPhoto(imagePath),
      (error) => {
        assert.equal(error.code, 'PARSE_ERROR');
        return true;
      }
    );
  } finally {
    fs.unlinkSync(imagePath);
  }
});

test('lanca PARSE_ERROR quando faltam chaves obrigatorias', async () => {
  const create = async () =>
    buildOpenAIResponse({ identificacao: { lote: '5', sacas: null, safra: null } });
  // Sem 'classificacao' top-level.

  const service = buildService(create);
  const imagePath = writeFakeImage();

  try {
    await assert.rejects(
      () => service.extractClassificationFromPhoto(imagePath),
      (error) => {
        assert.equal(error.code, 'PARSE_ERROR');
        assert.match(error.message, /missing required keys/i);
        return true;
      }
    );
  } finally {
    fs.unlinkSync(imagePath);
  }
});

test('lanca TIMEOUT quando AbortController dispara', async () => {
  const create = async (_params, options) => {
    // Simula AbortError sintetizando um throw quando signal e abortado.
    return new Promise((_resolve, reject) => {
      const handler = () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      };
      if (options.signal.aborted) {
        handler();
        return;
      }
      options.signal.addEventListener('abort', handler);
    });
  };

  const service = buildService(create);
  const imagePath = writeFakeImage();

  // Mock REQUEST_TIMEOUT_MS isn't trivially mockable; trigger abort manualmente
  // via injecao. Em vez disso, simulamos a partir do client retornando AbortError direto.
  service.client.chat.completions.create = async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  };

  try {
    await assert.rejects(
      () => service.extractClassificationFromPhoto(imagePath),
      (error) => {
        assert.equal(error.code, 'TIMEOUT');
        return true;
      }
    );
  } finally {
    fs.unlinkSync(imagePath);
  }
});
