import fs from 'node:fs';
import OpenAI from 'openai';

const SYSTEM_PROMPT = `Voce e um sistema de extracao de dados de fichas de classificacao de cafe.
Analise a imagem da ficha de classificacao (cartao 99x95mm preenchido a mao) e extraia todos os campos visiveis.
Responda APENAS com JSON valido no formato especificado.
Se um campo nao for legivel ou nao existir na ficha, retorne null para esse campo.
Para campos numericos, retorne como string (ex: "12,5" ou "45").
Mantenha exatamente a grafia encontrada na ficha para campos de texto.`;

const USER_PROMPT = `Extraia os dados desta ficha de classificacao de cafe.

Retorne um JSON com esta estrutura exata:
{
  "classificacao": {
    "padrao": "string ou null",
    "catacao": "string ou null",
    "aspecto": "string ou null",
    "bebida": "string ou null",
    "p18": "string ou null",
    "p17": "string ou null",
    "p16": "string ou null",
    "mk": "string ou null",
    "p15": "string ou null",
    "p14": "string ou null",
    "p13": "string ou null",
    "p10": "string ou null",
    "fundo1_peneira": "string ou null",
    "fundo1_percentual": "string ou null",
    "fundo2_peneira": "string ou null",
    "fundo2_percentual": "string ou null",
    "defeitos": "string ou null",
    "broca": "string ou null",
    "pva": "string ou null",
    "impureza": "string ou null",
    "pau": "string ou null",
    "ap": "string ou null",
    "gpi": "string ou null",
    "umidade": "string ou null"
  },
  "identificacao": {
    "lote": "string ou null",
    "sacas": "string ou null",
    "safra": "string ou null",
    "data": "string ou null"
  }
}`;

const REQUEST_TIMEOUT_MS = 15_000;

export class ClassificationExtractionService {
  constructor({ apiKey }) {
    this.client = new OpenAI({ apiKey });
  }

  async extractClassificationFromPhoto(absoluteImagePath) {
    const imageBuffer = fs.readFileSync(absoluteImagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = absoluteImagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const startTime = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await this.client.chat.completions.create(
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: USER_PROMPT },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${base64Image}`,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          response_format: { type: 'json_object' },
          max_tokens: 1000,
          temperature: 0.1
        },
        { signal: controller.signal }
      );

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        const error = new Error('Empty response from OpenAI');
        error.code = 'PARSE_ERROR';
        throw error;
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        const error = new Error('Invalid JSON response from OpenAI');
        error.code = 'PARSE_ERROR';
        throw error;
      }

      if (!parsed.classificacao || !parsed.identificacao) {
        const error = new Error('Response missing required keys: classificacao, identificacao');
        error.code = 'PARSE_ERROR';
        throw error;
      }

      const processingTimeMs = Date.now() - startTime;

      return {
        classificacao: normalizeClassificacao(parsed.classificacao),
        identificacao: normalizeIdentificacao(parsed.identificacao),
        processingTimeMs
      };
    } catch (err) {
      if (err.code === 'PARSE_ERROR') throw err;

      if (err.name === 'AbortError' || controller.signal.aborted) {
        const error = new Error('OpenAI request timed out');
        error.code = 'TIMEOUT';
        throw error;
      }

      const error = new Error(err.message ?? 'OpenAI API error');
      error.code = 'OPENAI_ERROR';
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function toStringOrNull(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function normalizeClassificacao(raw) {
  return {
    padrao: toStringOrNull(raw.padrao),
    catacao: toStringOrNull(raw.catacao),
    aspecto: toStringOrNull(raw.aspecto),
    bebida: toStringOrNull(raw.bebida),
    p18: toStringOrNull(raw.p18),
    p17: toStringOrNull(raw.p17),
    p16: toStringOrNull(raw.p16),
    mk: toStringOrNull(raw.mk),
    p15: toStringOrNull(raw.p15),
    p14: toStringOrNull(raw.p14),
    p13: toStringOrNull(raw.p13),
    p10: toStringOrNull(raw.p10),
    fundo1_peneira: toStringOrNull(raw.fundo1_peneira),
    fundo1_percentual: toStringOrNull(raw.fundo1_percentual),
    fundo2_peneira: toStringOrNull(raw.fundo2_peneira),
    fundo2_percentual: toStringOrNull(raw.fundo2_percentual),
    defeitos: toStringOrNull(raw.defeitos),
    broca: toStringOrNull(raw.broca),
    pva: toStringOrNull(raw.pva),
    impureza: toStringOrNull(raw.impureza),
    pau: toStringOrNull(raw.pau),
    ap: toStringOrNull(raw.ap),
    gpi: toStringOrNull(raw.gpi),
    umidade: toStringOrNull(raw.umidade)
  };
}

function normalizeIdentificacao(raw) {
  return {
    lote: toStringOrNull(raw.lote),
    sacas: toStringOrNull(raw.sacas),
    safra: toStringOrNull(raw.safra),
    data: toStringOrNull(raw.data)
  };
}
