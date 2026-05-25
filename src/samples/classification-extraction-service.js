import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import OpenAI from 'openai';

import { emitExtractionEvent } from './extraction-telemetry.js';

import { HttpError } from '../contracts/errors.js';

// ============================================================
// SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `Voce e um sistema especializado em extracao de dados manuscritos de fichas de classificacao de cafe.

CONTEXTO DA IMAGEM:
A foto mostra uma mesa de classificacao de cafe. Na cena voce encontrara:
- A ficha de classificacao SAFRAS — um cartao retangular branco com bordas pretas, dividido em celulas tabulares (descrita em detalhe no prompt do usuario). E a UNICA ficha que voce deve ler.
- Graos de cafe espalhados ao redor da ficha, em um ou mais montinhos. IGNORE completamente os graos.
- A mesa de classificacao e geralmente uma superficie cinza escura.
- Pode haver OUTROS documentos, tabelas de referencia ou fichas de outras empresas visiveis (Green Coffee Association, Volcafe, ou similares). IGNORE todos os outros papeis — extraia dados SOMENTE da ficha SAFRAS descrita no prompt.

A ficha SAFRAS pode ocupar de 15-30% ate a maior parte da imagem. Em qualquer caso, foque toda sua atencao na ficha e ignore o restante da cena.

REGRAS CRITICAS DE EXTRACAO:
1. Extraia SOMENTE valores escritos a mao (manuscritos) com caneta ou lapis. NUNCA retorne um rotulo impresso como valor.
2. Se um campo NAO TEM valor manuscrito, retorne null. NAO invente, NAO copie de campos vizinhos, NAO repita rotulos.
3. Mantenha exatamente a grafia manuscrita encontrada. NAO corrija ortografia ou abreviacoes.
4. Para campos numericos: retorne APENAS o numero como string (ex: "12,5" ou "45"). NAO inclua simbolos como "%" ou unidades.
5. Para campos de texto: retorne o texto exatamente como escrito a mao.
6. Valores manuscritos ficam ABAIXO ou AO LADO do rotulo impresso de cada celula.
7. Se a escrita e ilegivel, retorne null em vez de adivinhar.
8. Virgula brasileira: numeros decimais usam VIRGULA (ex: "12,5"), nao ponto.
9. NUNCA INVENTE: muitos campos ficam vazios. E ESPERADO. Retorne null sem hesitar.
10. INSTRUCAO PRIORITARIA PARA EXTRACAO ATIVA:
    Se uma celula contem QUALQUER numero, letra, ou marca manuscrita visivel (mesmo que pequena, desbotada, em caligrafia rapida ou parcialmente sobrescrita), voce DEVE extrair esse valor. Null e SOMENTE para celulas verdadeiramente vazias — sem nenhuma marca manuscrita.
    Busque ativamente por escritas pequenas em CADA celula da ficha antes de decidir por null. NAO assuma que celulas vazias sao o padrao — em fichas reais, varias celulas tem valores manuscritos que precisam ser extraidos.`;

// ============================================================
// USER PROMPT (ficha unificada Q.cls.2)
// ============================================================

const USER_PROMPT = `Extraia os dados manuscritos da ficha de classificacao SAFRAS presente na foto.

COMO IDENTIFICAR A FICHA CORRETA:
A ficha e uma TABELA RETANGULAR pequena (geralmente proporcao proxima de 1:1, levemente mais larga que alta), com:
- Bordas PRETAS FINAS em todas as celulas internas (linhas que dividem cada celula).
- Bordas PRETAS GROSSAS no contorno externo da ficha (linhas-guia de corte da impressao, mais espessas que as linhas internas).
- Fundo BRANCO em todas as celulas.
- 8 LINHAS de celulas empilhadas verticalmente, cada linha dividida em 2-5 celulas.
- Labels impressos em CAIXA ALTA, NEGRITO, no canto SUPERIOR ESQUERDO de cada celula.
- O resto de cada celula e em branco (espaco para preenchimento manuscrito).

Se houver MULTIPLAS fichas semelhantes na imagem (varias recortadas lado a lado), foque APENAS na ficha mais bem enquadrada / mais nitida / mais central. Ignore qualquer outro papel ou tabela na mesa que nao tenha esta estrutura tabular caracteristica.

LAYOUT DA FICHA (8 LINHAS, de cima para baixo):

LINHA 1 — CABECALHO (3 celulas, larguras aproximadas 47% / 27% / 27%):
  Celula 1 (mais larga, a esquerda): rotulo "LOTE" no canto superior esquerdo. Contem o numero do LOTE escrito a mao em tamanho grande — geralmente o maior texto manuscrito da ficha. Tipicamente um numero de 4-5 digitos (ex: "5567", "5640"). → identificacao.lote
  Celula 2 (centro): rotulo "SCS" no canto superior esquerdo (abreviacao de "Sacas"). Contem um numero manuscrito inteiro (ex: "100", "200", "350"). → identificacao.sacas
  Celula 3 (a direita): rotulo "SAFRA" no canto superior esquerdo. Contem a safra manuscrita, tipicamente no formato "AA/AA" (ex: "25/26", "24/25"). → identificacao.safra

LINHA 2 — IDENTIFICACAO (3 celulas iguais, ~33% cada):
  Celula 1: rotulo "PADR." (Padrao) — texto livre manuscrito. → classificacao.padrao
  Celula 2: rotulo "ASP." (Aspecto) — texto livre manuscrito. → classificacao.aspecto
  Celula 3: rotulo "CERT." (Certificacao). Pode conter siglas como "UTZ", "RA", "FLO", "4C", "ORG", "BIO", ou texto livre. → classificacao.certif

LINHA 3 — PRIMEIRA LINHA DE PENEIRAS (5 celulas iguais, 20% cada):
  Cada celula tem rotulo "P18", "P17", "P16", "MK", "P15" (da esquerda pra direita).
  Atencao: o MK aparece nesta linha (4a posicao, entre P16 e P15), NAO na proxima. Cada uma contem um percentual manuscrito (ex: "12,5", "8", "0,5"). Sem o simbolo "%".
  Para CADA uma das 5 celulas (P18, P17, P16, MK, P15): verifique individualmente se ha qualquer numero manuscrito. Se houver, EXTRAIA. Se a celula esta verdadeiramente vazia (sem nenhuma escrita), retorne null. Em fichas reais e comum que 2 a 6 peneiras estejam preenchidas — NAO presuma que peneiras vazias sao o padrao; olhe cada uma com atencao antes de retornar null.
  → classificacao.peneiras.p18, p17, p16, mk, p15 (na ordem visual da linha)

LINHA 4 — SEGUNDA LINHA DE PENEIRAS (5 celulas iguais, 20% cada):
  Cada celula tem rotulo "P14", "P13", "P12", "P11", "P10" (da esquerda pra direita).
  Mesmo formato da LINHA 3. Esta linha NAO contem MK (MK fica na LINHA 3).
  Para CADA uma das 5 celulas (P14, P13, P12, P11, P10): verifique individualmente se ha qualquer numero manuscrito e EXTRAIA quando houver. Em fichas reais e comum que algumas peneiras desta linha estejam preenchidas — analise celula por celula antes de retornar null.
  → classificacao.peneiras.p14, p13, p12, p11, p10 (na ordem visual da linha)

LINHA 5 — FUNDOS + CATACAO (3 celulas, larguras ~37% / 37% / 27%):
  Celulas 1 e 2 (FUNDOS): cada uma tem rotulo "FD" no canto superior esquerdo. Cada celula esta dividida visualmente em 3 partes lado a lado:
    - A ESQUERDA, o operador escreve a PENEIRA do fundo (geralmente um numero como "13", "11").
    - No CENTRO, ha um simbolo "=" IMPRESSO (NAO e manuscrito — ignore).
    - A DIREITA, o operador escreve a PORCENTAGEM (ex: "8", "1,5"). Pode haver um "%" decorativo impresso no canto direito da celula (NAO e manuscrito).
    REGRA LOGICA OBRIGATORIA: o numero manuscrito imediatamente A ESQUERDA do "=" e a \`peneira\` do fundo; o numero manuscrito imediatamente A DIREITA do "=" e o \`percentual\`. Nao inverta. Se faltar qualquer um dos dois, retorne null para AMBOS os campos daquele fundo.
    Se uma das celulas FD nao foi preenchida, retorne null para ambas as chaves daquele fundo.
    → classificacao.fundos[0]: { peneira, percentual } (primeira celula FD da esquerda)
    → classificacao.fundos[1]: { peneira, percentual } (segunda celula FD)
  Celula 3 (CAT.): rotulo "CAT." (Catacao). Contem um percentual manuscrito (numero). Sem "%". → classificacao.catacao

LINHA 6 — DEFEITOS PRINCIPAIS (3 celulas iguais):
  Celula 1: rotulo "IMP." (Impureza) — numero manuscrito. → classificacao.defeitos.imp
  Celula 2: rotulo "PVA" (Pretos/Verdes/Ardidos) — numero manuscrito. → classificacao.defeitos.pva
  Celula 3: rotulo "BROCA" — numero manuscrito. → classificacao.defeitos.broca

LINHA 7 — DEFEITOS COMPLEMENTARES (3 celulas iguais):
  Celula 1: rotulo "GPI" (Grao Perfeito Inteiro) — numero manuscrito. → classificacao.defeitos.gpi
  Celula 2: rotulo "AP" (Aproveitamento) — numero manuscrito. → classificacao.defeitos.ap
  Celula 3: rotulo "DEF." (Defeito) — texto livre manuscrito (pode ser numero, descricao curta, ou ambos). → classificacao.defeitos.defeito

LINHA 8 — FINAL (2 celulas, larguras 67% / 33%):
  Celula 1 (mais larga): rotulo "OBS." (Observacoes). Texto livre manuscrito completo — pode ser uma palavra, frase, ou multiplas notas. Mantenha grafia exata. Separe itens visivelmente distintos por virgula. → classificacao.observacoes
  Celula 2: rotulo "BEB." (Bebida) — texto manuscrito (ex: "DURA", "RIO", "MOLE", "RIADA"). → classificacao.bebida

REGRAS DE FORMATO POR TIPO DE CAMPO:
- Lote: codigo manuscrito grande do canto superior esquerdo da L1 (ex: "5567", "5640"). String.
- Sacas: numero inteiro manuscrito da celula SCS (ex: "100"). String.
- Safra: texto manuscrito da celula SAFRA (ex: "25/26"). String.
- Padrao, Aspecto, Certif: texto livre manuscrito.
- Peneiras (p18..p10, mk): SOMENTE o numero (ex: "12,5", "8"). Sem "%".
- Fundos: peneira e geralmente numero (ex: "13"); percentual e numero (ex: "8", "1,5"). Sem "%".
- Catacao: SOMENTE o numero (ex: "0,5", "2"). Sem "%".
- Defeitos numericos (imp, pva, broca, gpi, ap): SOMENTE o numero.
- Defeito (def.): texto livre manuscrito.
- Observacoes: TODO o texto manuscrito como string unica.
- Bebida: texto manuscrito como esta.

ROTULOS IMPRESSOS DA FICHA (NUNCA retorne nenhum destes como valor extraido):
SCS, SAFRA, PADR., ASP., CERT., P18, P17, P16, P15, P14, P13, P12, P11, P10, MK, FD, =, %, CAT., IMP., PVA, BROCA, GPI, AP, DEF., OBS., BEB.

ERROS COMUNS A EVITAR:
- NAO confunda o numero "0" (zero) com a letra "O".
- NAO confunda o numero "1" com a letra "l" minuscula ou "I" maiuscula.
- NAO confunda "8" com "B".
- Se um valor parece TEXTO IMPRESSO e nao MANUSCRITO, retorne null.
- MUITOS campos ficam vazios (sem escrita). E NORMAL. Retorne null SEM HESITAR.
- NAO infira valores que nao estao escritos. Se esta vazio, e null.

O array "fundos" deve sempre conter exatamente 2 objetos (representando os dois campos FD da LINHA 5). Se o segundo fundo nao foi preenchido, retorne { "peneira": null, "percentual": null } para o segundo elemento.

Retorne APENAS o JSON estruturado conforme o schema fornecido. Nenhum texto adicional.`;

// ============================================================
// JSON SCHEMA (structured output, strict mode)
// ============================================================

const FIELD_NULLABLE_STRING = { type: ['string', 'null'] };

const EXTRACTION_SCHEMA = {
  name: 'classification_extraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['identificacao', 'classificacao'],
    properties: {
      identificacao: {
        type: 'object',
        additionalProperties: false,
        required: ['lote', 'sacas', 'safra'],
        properties: {
          lote: FIELD_NULLABLE_STRING,
          sacas: FIELD_NULLABLE_STRING,
          safra: FIELD_NULLABLE_STRING,
        },
      },
      classificacao: {
        type: 'object',
        additionalProperties: false,
        required: [
          'padrao',
          'aspecto',
          'certif',
          'peneiras',
          'fundos',
          'catacao',
          'defeitos',
          'observacoes',
          'bebida',
        ],
        properties: {
          padrao: FIELD_NULLABLE_STRING,
          aspecto: FIELD_NULLABLE_STRING,
          certif: FIELD_NULLABLE_STRING,
          peneiras: {
            type: 'object',
            additionalProperties: false,
            required: ['p18', 'p17', 'p16', 'p15', 'p14', 'p13', 'p12', 'p11', 'p10', 'mk'],
            properties: {
              p18: FIELD_NULLABLE_STRING,
              p17: FIELD_NULLABLE_STRING,
              p16: FIELD_NULLABLE_STRING,
              p15: FIELD_NULLABLE_STRING,
              p14: FIELD_NULLABLE_STRING,
              p13: FIELD_NULLABLE_STRING,
              p12: FIELD_NULLABLE_STRING,
              p11: FIELD_NULLABLE_STRING,
              p10: FIELD_NULLABLE_STRING,
              mk: FIELD_NULLABLE_STRING,
            },
          },
          fundos: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['peneira', 'percentual'],
              properties: {
                peneira: FIELD_NULLABLE_STRING,
                percentual: FIELD_NULLABLE_STRING,
              },
            },
          },
          catacao: FIELD_NULLABLE_STRING,
          defeitos: {
            type: 'object',
            additionalProperties: false,
            required: ['imp', 'pva', 'broca', 'gpi', 'ap', 'defeito'],
            properties: {
              imp: FIELD_NULLABLE_STRING,
              pva: FIELD_NULLABLE_STRING,
              broca: FIELD_NULLABLE_STRING,
              gpi: FIELD_NULLABLE_STRING,
              ap: FIELD_NULLABLE_STRING,
              defeito: FIELD_NULLABLE_STRING,
            },
          },
          observacoes: FIELD_NULLABLE_STRING,
          bebida: FIELD_NULLABLE_STRING,
        },
      },
    },
  },
};

// ============================================================
// KNOWN LABELS (rejected when accidentally extracted as values)
// ============================================================

const KNOWN_LABELS = new Set([
  // Cabeçalho
  'scs',
  'safra',
  'lote',
  'sacas',
  // Identificação
  'padr',
  'padr.',
  'padrao',
  'padrão',
  'asp',
  'asp.',
  'aspecto',
  'cert',
  'cert.',
  'certif',
  'certif.',
  'certificado',
  // Peneiras
  'p18',
  'p17',
  'p16',
  'p15',
  'p14',
  'p13',
  'p12',
  'p11',
  'p10',
  'mk',
  'p.18',
  'p.17',
  'p.16',
  'p.15',
  'p.14',
  'p.13',
  'p.12',
  'p.11',
  'p.10',
  // Fundos + catação
  'fd',
  'fundo',
  'fundos',
  'cat',
  'cat.',
  'catacao',
  'catação',
  // Defeitos
  'imp',
  'imp.',
  'impureza',
  'pva',
  'broca',
  'gpi',
  'ap',
  'def',
  'def.',
  'defeito',
  'defeitos',
  // Final
  'obs',
  'obs.',
  'observacoes',
  'observações',
  'beb',
  'beb.',
  'bebida',
  // Símbolos
  '%',
  '=',
  // Tipos (atuais e legados — operador pode escrever a tipagem em algum lugar errado)
  'bica',
  'preparado',
  'baixo',
  'café baixo',
  'cafe baixo',
  'low_caff',
  'escolha',
  // Contexto irrelevante (cabeçalhos/papéis externos)
  'safras',
  'safras & negocios',
  'green coffee',
  'volcafe',
  'classificação de café',
  'classification',
  'classificador',
  // Schema noise (modelo pode ecoar)
  'string',
  'null',
  'string ou null',
  'numero ou null',
  'texto manuscrito ou null',
  'codigo manuscrito ou null',
  'numero manuscrito ou null',
  'identificador manuscrito ou null',
  'valor manuscrito ou null',
]);

// ============================================================
// HELPERS
// ============================================================

const REQUEST_TIMEOUT_MS = 25_000;

// F3.4: few-shot visual. Carrega no module init imagem-exemplo + JSON-resposta
// pra ancorar a IA num caso real. Singleton cacheado — nao re-le o disco em
// cada extracao. Se a fixture nao carregar (dev sem arquivo ou prod sem COPY
// no Dockerfile), retorna null e degrada graciosamente pra extracao sem few-shot.
const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function loadFewShotExample() {
  try {
    const imageBuffer = fs.readFileSync(path.join(FIXTURES_DIR, 'extraction-example.jpg'));
    const responseJson = fs.readFileSync(
      path.join(FIXTURES_DIR, 'extraction-example.json'),
      'utf8'
    );
    return {
      imageDataUri: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`,
      responseText: JSON.stringify(JSON.parse(responseJson)),
    };
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        tag: 'classification.extraction.fewshot',
        outcome: 'fixture_load_failed',
        message: err.message,
      }) + '\n'
    );
    return null;
  }
}

const FEW_SHOT_EXAMPLE = loadFewShotExample();

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringOrNull(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function rejectIfLabel(value) {
  if (value === null) return null;
  if (KNOWN_LABELS.has(value.toLowerCase())) return null;
  return value;
}

function toNumericOrNull(value) {
  const str = toStringOrNull(value);
  if (str === null) return null;
  if (KNOWN_LABELS.has(str.toLowerCase())) return null;
  const cleaned = str.replace(/%/g, '').trim();
  if (cleaned.length === 0) return null;
  if (/^\d+([,.]\d+)?$/.test(cleaned)) return cleaned;
  return null;
}

// ============================================================
// NORMALIZERS
// ============================================================

function normalizeIdentificacao(raw) {
  const safe = isPlainObject(raw) ? raw : {};
  return {
    lote: toStringOrNull(safe.lote),
    sacas: toStringOrNull(safe.sacas),
    safra: toStringOrNull(safe.safra),
  };
}

function normalizePeneiras(raw) {
  const safe = isPlainObject(raw) ? raw : {};
  return {
    p18: toNumericOrNull(safe.p18),
    p17: toNumericOrNull(safe.p17),
    p16: toNumericOrNull(safe.p16),
    p15: toNumericOrNull(safe.p15),
    p14: toNumericOrNull(safe.p14),
    p13: toNumericOrNull(safe.p13),
    p12: toNumericOrNull(safe.p12),
    p11: toNumericOrNull(safe.p11),
    p10: toNumericOrNull(safe.p10),
    mk: toNumericOrNull(safe.mk),
  };
}

function normalizeFundoItem(item) {
  const safe = isPlainObject(item) ? item : {};
  return {
    peneira: rejectIfLabel(toStringOrNull(safe.peneira)),
    percentual: toNumericOrNull(safe.percentual),
  };
}

function normalizeFundos(raw) {
  // Sempre retornamos exatamente 2 elementos. Modelo pode retornar 0/1/3+;
  // os slots ausentes viram { peneira: null, percentual: null }, e qualquer
  // excedente e descartado. Decisao: 2 fundos e parte intrinseca da ficha.
  const arr = Array.isArray(raw) ? raw : [];
  return [normalizeFundoItem(arr[0]), normalizeFundoItem(arr[1])];
}

function normalizeDefeitos(raw) {
  const safe = isPlainObject(raw) ? raw : {};
  return {
    imp: toNumericOrNull(safe.imp),
    pva: toNumericOrNull(safe.pva),
    broca: toNumericOrNull(safe.broca),
    gpi: toNumericOrNull(safe.gpi),
    ap: toNumericOrNull(safe.ap),
    // "Def." e texto livre (decisao Q.cls.2 — pode conter numero, descricao
    // curta, ou ambos). Por isso toStringOrNull, nao toNumericOrNull.
    defeito: toStringOrNull(safe.defeito),
  };
}

function normalizeClassificacao(raw) {
  const safe = isPlainObject(raw) ? raw : {};
  return {
    padrao: rejectIfLabel(toStringOrNull(safe.padrao)),
    aspecto: rejectIfLabel(toStringOrNull(safe.aspecto)),
    certif: rejectIfLabel(toStringOrNull(safe.certif)),
    peneiras: normalizePeneiras(safe.peneiras),
    fundos: normalizeFundos(safe.fundos),
    catacao: toNumericOrNull(safe.catacao),
    defeitos: normalizeDefeitos(safe.defeitos),
    observacoes: toStringOrNull(safe.observacoes),
    bebida: rejectIfLabel(toStringOrNull(safe.bebida)),
  };
}

// ============================================================
// EXTRACTION SERVICE
// ============================================================

export class ClassificationExtractionService {
  constructor({ apiKey }) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Extrai dados manuscritos de uma foto de ficha de classificacao SAFRAS.
   * Fase Q.cls.2: prompt e schema unicos (type-agnostic). O tipo
   * (BICA/PREPARADO/BAIXO/ESCOLHA) e metadata pos-extracao e nao influencia
   * a IA.
   */
  async extractClassificationFromPhoto(absoluteImagePath, context = {}) {
    const imageBuffer = fs.readFileSync(absoluteImagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = absoluteImagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const startTime = Date.now();
    const realUserContent = [
      { type: 'text', text: USER_PROMPT },
      {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${base64Image}`,
          detail: 'high',
        },
      },
    ];

    // F3.4: few-shot visual quando a fixture carregou no module init.
    // 4 mensagens (system + user-exemplo + assistant-exemplo + user-real).
    // Fallback transparente sem few-shot se fixture indisponivel.
    const messages = FEW_SHOT_EXAMPLE
      ? [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: USER_PROMPT },
              {
                type: 'image_url',
                image_url: { url: FEW_SHOT_EXAMPLE.imageDataUri, detail: 'high' },
              },
            ],
          },
          { role: 'assistant', content: FEW_SHOT_EXAMPLE.responseText },
          { role: 'user', content: realUserContent },
        ]
      : [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: realUserContent },
        ];

    try {
      const response = await this._callOpenAIWithRetry(messages, EXTRACTION_SCHEMA);

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

      if (!isPlainObject(parsed) || !parsed.identificacao || !parsed.classificacao) {
        const error = new Error('Response missing required keys: identificacao, classificacao');
        error.code = 'PARSE_ERROR';
        throw error;
      }

      const processingTimeMs = Date.now() - startTime;

      // F3.11: telemetria de sucesso.
      emitExtractionEvent({
        outcome: 'success',
        model: response.model,
        requestId: response.id,
        processingTimeMs,
        promptTokens: response.usage?.prompt_tokens ?? null,
        completionTokens: response.usage?.completion_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null,
        sampleId: context.sampleId ?? null,
        fewShot: FEW_SHOT_EXAMPLE !== null,
      });

      return {
        identificacao: normalizeIdentificacao(parsed.identificacao),
        classificacao: normalizeClassificacao(parsed.classificacao),
        processingTimeMs,
      };
    } catch (err) {
      // F3.11: telemetria de falha. TIMEOUT ja vem marcado pela funcao privada.
      let errorCode = err.code ?? null;
      if (!errorCode) {
        if (err instanceof HttpError) {
          errorCode = 'HTTP_ERROR';
        } else {
          errorCode = 'OPENAI_ERROR';
        }
      }
      emitExtractionEvent({
        outcome: 'failure',
        errorCode,
        errorMessage: err.message ?? null,
        processingTimeMs: Date.now() - startTime,
        sampleId: context.sampleId ?? null,
        fewShot: FEW_SHOT_EXAMPLE !== null,
      });

      if (err.code === 'PARSE_ERROR' || err.code === 'TIMEOUT') throw err;

      // Mantem HttpError (caso seja lancado em algum ponto futuro) com seu codigo.
      if (err instanceof HttpError) throw err;

      const error = new Error(err.message ?? 'OpenAI API error');
      error.code = 'OPENAI_ERROR';
      throw error;
    }
  }

  // F3.7: chamada OpenAI com 1 retry em 429/5xx (backoff fixo 1.5s).
  // Timeout (AbortError) e demais erros nao retentam — propagam marcados.
  // Cada tentativa cria seu proprio AbortController pra evitar reuso de
  // signal ja aborted entre tentativas.
  async _callOpenAIWithRetry(messages, schema) {
    const RETRY_DELAY_MS = 1500;
    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        return await this.client.chat.completions.create(
          {
            model: 'gpt-4o',
            messages,
            response_format: { type: 'json_schema', json_schema: schema },
            max_tokens: 1500,
            temperature: 0,
          },
          { signal: controller.signal }
        );
      } catch (err) {
        if (err.name === 'AbortError' || controller.signal.aborted) {
          const error = new Error('OpenAI request timed out');
          error.code = 'TIMEOUT';
          throw error;
        }
        const status = err.status ?? err.response?.status;
        const isRetriable = status === 429 || (status >= 500 && status < 600);
        if (!isRetriable || attempt === MAX_ATTEMPTS) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      } finally {
        clearTimeout(timeout);
      }
    }
    // unreachable — o loop sempre return ou throw
    throw new Error('OpenAI retry loop exhausted unexpectedly');
  }
}
