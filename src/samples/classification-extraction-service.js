import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import OpenAI from 'openai';

import {
  canonicalizeAspecto,
  canonicalizeBebida,
  canonicalizeCertif,
  canonicalizeHarvest,
  canonicalizePadrao,
} from './classification-canonicalization.js';
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
9. NUNCA INVENTE um valor que nao esta escrito. Alguns campos podem estar vazios (null); outros tem numeros pequenos faceis de PERDER — trate as duas situacoes com o mesmo cuidado.
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
    REGRA LOGICA: o numero manuscrito imediatamente A ESQUERDA do "=" e a \`peneira\` do fundo; o numero imediatamente A DIREITA do "=" e o \`percentual\`. Nao inverta. Os dois espacos ao redor do "=" SAO campos preenchidos a mao na maioria das fichas — procure ativamente os dois numeros.
    Extraia cada parte de forma independente: se voce le a peneira mas nao o percentual (ou vice-versa), extraia a parte que VE e deixe a OUTRA null. So retorne null para uma chave quando aquela parte estiver vazia; null para AMBAS apenas quando a celula FD inteira estiver vazia.
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
- NAO invente um valor que nao esta escrito — mas uma marca manuscrita pequena ou fraca NAO e invencao: extraia.

O array "fundos" deve sempre conter exatamente 2 objetos (representando os dois campos FD da LINHA 5). Se o segundo fundo nao foi preenchido, retorne { "peneira": null, "percentual": null } para o segundo elemento.

PROTOCOLO DE VARREDURA (faca antes de finalizar):
Percorra a ficha celula por celula, na ordem das 8 linhas. Em CADA celula pergunte primeiro: "ha algum traco de caneta ou lapis aqui?". Numeros pequenos, marcas fracas, escrita rapida e caligrafia apertada CONTAM como preenchidos e DEVEM ser extraidos. So marque null depois de confirmar que a celula nao tem nenhuma marca manuscrita. O erro mais comum nesta ficha e PERDER os numeros pequenos das peneiras, dos fundos e dos defeitos — passe os olhos em cada uma dessas celulas antes de decidir.

Retorne APENAS o JSON estruturado conforme o schema fornecido. Nenhum texto adicional.`;

// ============================================================
// CONFIG DA INFERENCIA + VERSAO DO PROMPT (telemetria)
// ============================================================

// Modelo pinado (versao datada) pra reproducibilidade: o alias 'gpt-4o' recebe
// rollout silencioso e mascararia A/B de prompt/imagem. Override por env.
const EXTRACTION_MODEL = process.env.OPENAI_EXTRACTION_MODEL ?? 'gpt-4o-2024-11-20';
const IMAGE_DETAIL = 'high';
const MAX_TOKENS = 1500;
const TEMPERATURE = 0.2;

// promptVersion: hash curto do prompt. Muda sozinho quando SYSTEM_PROMPT ou
// USER_PROMPT sao editados, permitindo atribuir variacoes de recall na
// telemetria (nullRateByCategory por promptVersion) sem versionar a mao.
const PROMPT_VERSION = crypto
  .createHash('sha1')
  .update(SYSTEM_PROMPT + USER_PROMPT)
  .digest('hex')
  .slice(0, 8);

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
            required: ['p18', 'p17', 'p16', 'mk', 'p15', 'p14', 'p13', 'p12', 'p11', 'p10'],
            properties: {
              p18: FIELD_NULLABLE_STRING,
              p17: FIELD_NULLABLE_STRING,
              p16: FIELD_NULLABLE_STRING,
              mk: FIELD_NULLABLE_STRING,
              p15: FIELD_NULLABLE_STRING,
              p14: FIELD_NULLABLE_STRING,
              p13: FIELD_NULLABLE_STRING,
              p12: FIELD_NULLABLE_STRING,
              p11: FIELD_NULLABLE_STRING,
              p10: FIELD_NULLABLE_STRING,
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

// F3.13 telemetria: mede taxa de preenchimento por categoria no JSON CRU
// retornado pela IA (antes da normalizacao posterior). Util pra cruzar com
// fewShot:true e medir efetividade do prompt sem reprocessar respostas.
function computeNullRateByCategory(parsed) {
  const cls = parsed?.classificacao ?? {};
  const ide = parsed?.identificacao ?? {};
  const peneiraKeys = ['p18', 'p17', 'p16', 'p15', 'p14', 'p13', 'p12', 'p11', 'p10', 'mk'];
  const defeitoKeys = ['imp', 'pva', 'broca', 'gpi', 'ap', 'defeito'];
  const ideKeys = ['lote', 'sacas', 'safra'];
  const textKeys = ['padrao', 'aspecto', 'certif', 'bebida', 'observacoes'];

  const peneiras = isPlainObject(cls.peneiras) ? cls.peneiras : {};
  const fundos = Array.isArray(cls.fundos) ? cls.fundos : [];
  const defeitos = isPlainObject(cls.defeitos) ? cls.defeitos : {};

  const filledPeneiras = peneiraKeys.filter(
    (k) => peneiras[k] != null && peneiras[k] !== ''
  ).length;
  const filledFundos = fundos.filter(
    (f) =>
      f &&
      ((f.peneira != null && f.peneira !== '') || (f.percentual != null && f.percentual !== ''))
  ).length;
  const filledDefeitos = defeitoKeys.filter(
    (k) => defeitos[k] != null && defeitos[k] !== ''
  ).length;
  const filledIde = ideKeys.filter((k) => ide[k] != null && ide[k] !== '').length;
  const filledTexts = textKeys.filter((k) => cls[k] != null && cls[k] !== '').length;

  return {
    peneiras: `${filledPeneiras}/${peneiraKeys.length}`,
    fundos: `${filledFundos}/2`,
    defeitos: `${filledDefeitos}/${defeitoKeys.length}`,
    identificacao: `${filledIde}/${ideKeys.length}`,
    textos: `${filledTexts}/${textKeys.length}`,
  };
}

// Mede a PERDA da normalizacao: campos que a IA preencheu (cru) e que o
// normalizer zerou (null). Antes essa perda era invisivel — a telemetria so
// media o cru, entao a culpa caia no modelo. Apos a Fase 3 (recall-first)
// este array deve ficar ~vazio. Carrega o valor bruto descartado pra debug.
function computeNormalizationDropped(rawParsed, normalized) {
  const dropped = [];
  const filled = (v) => v != null && String(v).trim() !== '';
  const check = (field, rawVal, normVal) => {
    if (filled(rawVal) && !filled(normVal)) dropped.push({ field, raw: String(rawVal).trim() });
  };

  const rawCls = isPlainObject(rawParsed?.classificacao) ? rawParsed.classificacao : {};
  const normCls = isPlainObject(normalized?.classificacao) ? normalized.classificacao : {};
  const rawIde = isPlainObject(rawParsed?.identificacao) ? rawParsed.identificacao : {};
  const normIde = isPlainObject(normalized?.identificacao) ? normalized.identificacao : {};

  for (const k of ['lote', 'sacas', 'safra']) check(`identificacao.${k}`, rawIde[k], normIde[k]);
  for (const k of ['padrao', 'aspecto', 'certif', 'catacao', 'observacoes', 'bebida']) {
    check(`classificacao.${k}`, rawCls[k], normCls[k]);
  }

  const rawPen = isPlainObject(rawCls.peneiras) ? rawCls.peneiras : {};
  const normPen = isPlainObject(normCls.peneiras) ? normCls.peneiras : {};
  for (const k of ['p18', 'p17', 'p16', 'p15', 'p14', 'p13', 'p12', 'p11', 'p10', 'mk']) {
    check(`peneiras.${k}`, rawPen[k], normPen[k]);
  }

  const rawFun = Array.isArray(rawCls.fundos) ? rawCls.fundos : [];
  const normFun = Array.isArray(normCls.fundos) ? normCls.fundos : [];
  for (let i = 0; i < 2; i += 1) {
    check(`fundos.${i}.peneira`, rawFun[i]?.peneira, normFun[i]?.peneira);
    check(`fundos.${i}.percentual`, rawFun[i]?.percentual, normFun[i]?.percentual);
  }

  const rawDef = isPlainObject(rawCls.defeitos) ? rawCls.defeitos : {};
  const normDef = isPlainObject(normCls.defeitos) ? normCls.defeitos : {};
  for (const k of ['imp', 'pva', 'broca', 'gpi', 'ap', 'defeito']) {
    check(`defeitos.${k}`, rawDef[k], normDef[k]);
  }

  return dropped;
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

// Recall-first (Fase 3): preserva o valor manuscrito BRUTO em vez de descartar
// o que nao casa o formato decimal canonico. Antes o regex /^\d+([,.]\d+)?$/
// jogava fora "1/2", "8-9", "+8", "<1", "tr" mesmo quando a IA leu certo —
// perda silenciosa nas celulas pequenas. Agora limpa so "%"/espacos das pontas
// e retorna o bruto; null APENAS pra celula vazia ou rotulo puro ecoado. A
// coercao pra numero (campos numericos do save) acontece no review/save, onde
// o operador confere. Seguro: o schema do evento de extracao e string|null.
function toNumericOrNull(value) {
  const str = toStringOrNull(value);
  if (str === null) return null;
  if (KNOWN_LABELS.has(str.toLowerCase())) return null;
  const cleaned = str.replace(/%/g, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

// Peneira do fundo: numero (ex: "13"), as vezes prefixado "P13". O prefixo
// P/p e rotulo impresso — removido. NAO aplicar rejectIfLabel aqui: "p13" esta
// em KNOWN_LABELS e zerava um valor legitimo (e o export monta "P${peneira}",
// entao preservar o prefixo geraria "PP13"). null so pra vazio ou rotulo puro.
function normalizeFundoPeneira(value) {
  const str = toStringOrNull(value);
  if (str === null) return null;
  const stripped = str.replace(/^p\.?\s*/i, '').trim();
  if (stripped.length === 0) return null;
  if (KNOWN_LABELS.has(stripped.toLowerCase())) return null;
  return stripped;
}

// ============================================================
// NORMALIZERS
// ============================================================

function normalizeIdentificacao(raw) {
  const safe = isPlainObject(raw) ? raw : {};
  return {
    lote: toStringOrNull(safe.lote),
    sacas: toStringOrNull(safe.sacas),
    // F3.13: canoniza safra ("26-27"/"2026/2027" -> "26/27").
    safra: canonicalizeHarvest(toStringOrNull(safe.safra)),
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
    peneira: normalizeFundoPeneira(safe.peneira),
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
    // F3.13: campos texto livre passam por canonicalize* apos rejectIfLabel.
    padrao: canonicalizePadrao(rejectIfLabel(toStringOrNull(safe.padrao))),
    aspecto: canonicalizeAspecto(rejectIfLabel(toStringOrNull(safe.aspecto))),
    certif: canonicalizeCertif(rejectIfLabel(toStringOrNull(safe.certif))),
    peneiras: normalizePeneiras(safe.peneiras),
    fundos: normalizeFundos(safe.fundos),
    catacao: toNumericOrNull(safe.catacao),
    defeitos: normalizeDefeitos(safe.defeitos),
    observacoes: toStringOrNull(safe.observacoes),
    bebida: canonicalizeBebida(rejectIfLabel(toStringOrNull(safe.bebida))),
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
          detail: IMAGE_DETAIL,
        },
      },
    ];

    // F3.4 + mitigacao do template binding: few-shot visual sem `assistant`
    // message. O exemplo (imagem + descricao textual dos valores extraidos) vai
    // numa user message separada com avisos explicitos contra cópia. A imagem
    // do exemplo usa `detail: 'low'` (reduz peso visual, ja so referencia);
    // a foto real continua `detail: 'high'`.
    //
    // Mudanca veio do diagnostico de template binding (Bloco F3): com a
    // estrutura anterior (assistant JSON + strict + temperature 0), a IA
    // replicava a quantidade exata de campos preenchidos da fixture (2/10
    // peneiras, 1/2 fundos) — confirmado por telemetria nullRateByCategory.
    const messages = FEW_SHOT_EXAMPLE
      ? [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${USER_PROMPT}\n\nEXEMPLO DE REFERENCIA (apenas pra ilustrar formato e estilo de extracao — NAO copie estes valores nem a quantidade de campos preenchidos):\n\nA imagem-exemplo abaixo e uma ficha SAFRAS com os seguintes valores manuscritos extraidos:\n- Lote: "5689", Sacas: "250", Safra: "26/27"\n- Padrao: "L4 P3", Aspecto: "GC", Certif: vazio\n- Peneiras: P17="38", MK="8" (demais peneiras vazias)\n- Fundos: FD1 peneira "13" percentual "3" (FD2 vazio), Catacao="33"\n- Defeitos: IMP="0,1", BROCA="1" (demais vazios)\n- Obs: "otelita", Bebida: vazio\n\nEsse exemplo mostra COMO interpretar a ficha. A quantidade de campos preenchidos varia de ficha pra ficha: algumas tem 8+ peneiras, outras 3, outras nenhuma. SEMPRE extraia o que voce VE na FOTO REAL (a segunda imagem, mais abaixo), NUNCA replique a quantidade ou os valores do exemplo.`,
              },
              {
                type: 'image_url',
                image_url: { url: FEW_SHOT_EXAMPLE.imageDataUri, detail: 'low' },
              },
            ],
          },
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

      const result = {
        identificacao: normalizeIdentificacao(parsed.identificacao),
        classificacao: normalizeClassificacao(parsed.classificacao),
        model: response.model ?? EXTRACTION_MODEL,
        processingTimeMs,
      };

      const finishReason = response.choices?.[0]?.finish_reason ?? null;

      // F3.11 + F3.13 + Fase 2: telemetria de sucesso. Emite o fill-rate do
      // JSON CRU (parsed) E do normalizado, mais o delta (campos que a IA
      // preencheu e o normalizer zerou) — antes essa perda era invisivel e a
      // culpa caia no modelo. promptVersion/finishReason/truncated permitem
      // atribuir mudancas de recall e detectar truncamento por max_tokens.
      emitExtractionEvent({
        outcome: 'success',
        model: response.model,
        requestId: response.id,
        promptVersion: PROMPT_VERSION,
        finishReason,
        truncated: finishReason === 'length',
        imageDetail: IMAGE_DETAIL,
        maxTokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        processingTimeMs,
        promptTokens: response.usage?.prompt_tokens ?? null,
        completionTokens: response.usage?.completion_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null,
        sampleId: context.sampleId ?? null,
        fewShot: FEW_SHOT_EXAMPLE !== null,
        nullRateByCategory: computeNullRateByCategory(parsed),
        nullRateByCategoryNormalized: computeNullRateByCategory(result),
        normalizationDropped: computeNormalizationDropped(parsed, result),
      });

      return result;
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
        model: EXTRACTION_MODEL,
        promptVersion: PROMPT_VERSION,
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
            model: EXTRACTION_MODEL,
            messages,
            response_format: { type: 'json_schema', json_schema: schema },
            max_tokens: MAX_TOKENS,
            temperature: TEMPERATURE,
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
