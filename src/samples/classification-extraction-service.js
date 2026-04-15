import fs from 'node:fs';
import OpenAI from 'openai';

import { HttpError } from '../contracts/errors.js';

// ============================================================
// SYSTEM PROMPT (shared across all classification types)
// ============================================================

const SYSTEM_PROMPT = `Voce e um sistema especializado em extracao de dados manuscritos de fichas de classificacao de cafe.

CONTEXTO DA IMAGEM:
A foto mostra uma mesa de classificacao de cafe. Na cena voce encontrara:
- Uma ficha de classificacao retangular branca. No TOPO da ficha ha uma TARJA FINA com fundo bege claro contendo o NOME DO TIPO de cafe centralizado em letras impressas maiusculas (ex: "BICA", "PREPARADO", "CAF\u00c9 BAIXO"). Logo abaixo da tarja comeca o corpo da ficha com varias LINHAS de dados. A PRIMEIRA LINHA (L1) do corpo e a zona de identificacao: ela tem duas celulas com bordas mais grossas — uma celula grande a esquerda com o rotulo "LOTE" (onde fica o codigo manuscrito grande) e uma celula menor a direita com o rotulo "Sacas" (numero manuscrito). Esta e a UNICA ficha que voce deve ler.
- Graos de cafe espalhados ao redor da ficha, em um ou mais montes. IGNORE completamente os graos de cafe.
- A mesa de classificacao e uma superficie cinza escura.
- Pode haver OUTROS documentos, tabelas de referencia ou fichas de outras empresas visiveis na mesa (como tabelas da Green Coffee Association, Volcafe, ou similares). IGNORE todos os outros papeis — extraia dados SOMENTE da ficha com o layout descrito acima.

A ficha SAFRAS pode ocupar desde uma area pequena da foto (15-30%) ate a maior parte da imagem. Em qualquer caso, foque toda sua atencao na ficha e ignore todo o restante da cena.

REGRAS CRITICAS DE EXTRACAO:
1. Extraia SOMENTE valores escritos a mao (manuscritos) com caneta azul ou preta. NUNCA retorne um rotulo impresso como valor.
2. Se um campo nao tem valor manuscrito, retorne null. NAO invente, NAO copie de campos vizinhos, NAO repita rotulos.
3. Mantenha exatamente a grafia manuscrita encontrada. NAO corrija ortografia ou abreviacoes.
4. Para campos numericos: retorne APENAS o numero como string (ex: "12,5" ou "45"). NAO inclua simbolos como "%" ou unidades.
5. Para campos de texto: retorne o texto exatamente como escrito a mao.
6. Responda APENAS com JSON valido no formato especificado. Nenhum texto antes ou depois do JSON.
7. Valores manuscritos ficam ABAIXO ou AO LADO do rotulo impresso de cada campo, dentro da celula.
8. Se a escrita e ilegivel, retorne null em vez de adivinhar.
9. O campo Observacoes pode conter QUALQUER texto manuscrito (valores numericos, descricoes, abreviacoes). Extraia TODO o texto visivel nesse campo como uma unica string.
10. Campos de identificacao (lote, sacas, safra) devem aparecer dentro de "identificacao" no JSON. O campo safra TAMBEM deve ser copiado para "classificacao.safra" porque e usado nos dois lugares.`;

// ============================================================
// USER PROMPTS (one per classification type)
// ============================================================

const BICA_USER_PROMPT = `Extraia os dados manuscritos da ficha de classificacao do tipo BICA presente na foto.

COMO IDENTIFICAR A FICHA CORRETA:
Procure o cartao branco retangular com a palavra "BICA" impressa em uma TARJA FINA no topo, com fundo bege claro. Logo abaixo da tarja comeca o corpo da ficha, com a primeira linha (L1) destacada por bordas mais grossas contendo as celulas "LOTE" (esquerda, larga) e "Sacas" (direita, estreita). Ignore qualquer outro papel ou tabela na mesa.

LAYOUT DA FICHA BICA (de cima para baixo):

TARJA SUPERIOR: faixa fina com fundo bege claro, largura total, texto "BICA" impresso centralizado (ignore, e o nome do tipo).

Abaixo da tarja ha 5 LINHAS de dados seguidas de 1 LINHA de OBSERVACOES.

LINHA 1 — Identificacao (2 celulas com bordas mais grossas):
  Celula esquerda (larga, ~65% da largura): rotulo "LOTE" impresso no canto superior esquerdo. Contem o codigo do lote escrito a mao em tamanho grande — e o maior texto manuscrito da ficha. → extraia como "lote" em identificacao
  Celula direita (estreita, ~35%): rotulo "Sacas" impresso no canto superior esquerdo. Contem um numero manuscrito (ex: "100", "200", "350") indicando a quantidade de sacas. → extraia como "sacas" em identificacao

LINHA 2 — Classificacao geral (4 campos lado a lado, largura igual):
  Campo esquerdo: rotulo "Padrão" → extraia como "padrao" em classificacao
  Campo centro-esquerdo: rotulo "Safra" → extraia como "safra" (retorne o MESMO valor em identificacao.safra E em classificacao.safra)
  Campo centro-direito: rotulo "Aspecto" → extraia como "aspecto"
  Campo direito: rotulo "Certif." → extraia como "certif" (siglas como "UTZ", "RA", "FLO", "4C", "ORG", "BIO")

LINHA 3 — Catacao, defeitos e bebida (4 campos lado a lado, largura igual):
  Campo esquerdo: rotulo "Catação" → extraia como "catacao"
  Campo centro-esquerdo: rotulo "Broca" → extraia como "broca"
  Campo centro-direito: rotulo "PVA" → extraia como "pva"
  Campo direito: rotulo "Bebida" → extraia como "bebida"

Ha um pequeno espaco visual separando as linhas acima das linhas abaixo.

LINHA 4 — Peneiras e impureza (3 campos largos, cada um ocupa UM TERCO da largura):
  Campo esquerdo (terco): rotulo "P.17 %" → extraia como "p17"
  Campo centro (terco): rotulo "MK %" → extraia como "mk"
  Campo direito (terco): rotulo "Impureza" → extraia como "impureza"

LINHA 5 — Fundos (4 campos lado a lado, fundo bege claro):
  Esta linha tem fundo bege e contem DOIS pares de fundos.
  Primeiro par (fundo 1):
    Campo 1 com rotulo "Fundo Pen." → extraia o identificador manuscrito como "fundo1_peneira" (ex: "B", "C12", "13")
    Campo 2 com rotulo "%" → extraia o numero manuscrito como "fundo1_percentual" (ex: "1,5")
  Segundo par (fundo 2):
    Campo 3 com rotulo "Fundo Pen." → extraia como "fundo2_peneira"
    Campo 4 com rotulo "%" → extraia como "fundo2_percentual"
  Se apenas o primeiro fundo estiver preenchido, retorne null para fundo2_peneira e fundo2_percentual.

LINHA 6 — Observacoes (campo unico, largura total da ficha, mais alto que os demais):
  Rotulo "Observações" no canto superior esquerdo.
  Este campo pode conter QUALQUER texto manuscrito. Pode incluir:
  - Valores numericos como "Pau 2", "AP 1", "Umid 11,5"
  - Textos descritivos como "pedra", "cafe verde", "mofo"
  - Qualquer combinacao dos exemplos acima
  Extraia TODO o texto manuscrito deste campo como uma unica string.
  Mantenha a grafia exata. Separe itens visivelmente distintos por virgula.
  Se o campo estiver vazio, retorne null.
  → extraia como "observacoes"

ROTULOS IMPRESSOS DA FICHA (NUNCA retorne nenhum destes como valor extraido):
LOTE, Sacas, Certif., Certif, Certificado, BICA, Padrão, Catação, Aspecto, Bebida, Safra, Broca, PVA, Impureza, P.17 %, MK %, Fundo Pen., %, Observações

REGRAS DE FORMATO POR TIPO DE CAMPO:
- Texto (padrao, catacao, aspecto, bebida, safra): retorne exatamente como escrito. Podem ser abreviacoes curtas (ex: "VGC", "L3 P3B", "Dura", "Rio", "25/26").
- Peneiras percentuais (p17, mk, fundo1_percentual, fundo2_percentual): retorne SOMENTE o numero. Use virgula como separador decimal se escrito assim (ex: "36", "1,5", "0,8"). NAO inclua "%".
- Defeitos numericos (broca, pva, impureza): retorne SOMENTE o numero (ex: "2", "0,5", "20").
- Fundo peneira (fundo1_peneira, fundo2_peneira): retorne o identificador exatamente como escrito (ex: "B", "C12", "13", "C").
- Observacoes: retorne TODO o texto manuscrito como uma string unica.
- Lote: retorne o codigo manuscrito grande da celula "LOTE" da LINHA 1 (ex: "5487", "A-5490").
- Sacas: retorne SOMENTE o numero inteiro manuscrito da celula "Sacas" da LINHA 1 (ex: "100", "200", "350"). Se vazio, null.
- Certif: retorne as siglas manuscritas do campo "Certif." na LINHA 2, exatamente como escritas (ex: "UTZ", "RA", "FLO", "UTZ/RA", "BIO", "ORG"). Se vazio, null.

ERROS COMUNS A EVITAR:
- NAO confunda o numero "0" (zero) com a letra "O".
- NAO confunda o numero "1" com a letra "l" ou "I".
- Se um valor parece ser texto impresso e nao manuscrito, retorne null.
- Muitos campos ficam vazios (sem escrita) — retorne null para eles sem hesitar.

Retorne SOMENTE o JSON abaixo, sem texto adicional:
{
  "classificacao": {
    "padrao": "texto manuscrito ou null",
    "catacao": "valor manuscrito ou null",
    "aspecto": "texto manuscrito ou null",
    "bebida": "texto manuscrito ou null",
    "safra": "texto manuscrito ou null",
    "broca": "numero ou null",
    "pva": "numero ou null",
    "impureza": "numero ou null",
    "p17": "numero ou null",
    "mk": "numero ou null",
    "fundo1_peneira": "identificador manuscrito ou null",
    "fundo1_percentual": "numero ou null",
    "fundo2_peneira": "identificador manuscrito ou null",
    "fundo2_percentual": "numero ou null",
    "certif": "siglas manuscritas do campo Certif. ou null",
    "observacoes": "texto manuscrito completo ou null"
  },
  "identificacao": {
    "lote": "codigo manuscrito da L1 ou null",
    "sacas": "numero manuscrito da L1 ou null",
    "safra": "valor manuscrito da L2 (mesmo valor de classificacao.safra) ou null"
  }
}`;

const PREPARADO_USER_PROMPT = `Extraia os dados manuscritos da ficha de classificacao do tipo PREPARADO presente na foto.

COMO IDENTIFICAR A FICHA CORRETA:
Procure o cartao branco retangular com a palavra "PREPARADO" impressa em uma TARJA FINA no topo, com fundo bege claro. Logo abaixo da tarja comeca o corpo da ficha, com a primeira linha (L1) destacada por bordas mais grossas contendo as celulas "LOTE" (esquerda, larga) e "Sacas" (direita, estreita). Ignore qualquer outro papel ou tabela na mesa.

LAYOUT DA FICHA PREPARADO (de cima para baixo):

TARJA SUPERIOR: faixa fina com fundo bege claro, largura total, texto "PREPARADO" impresso centralizado (ignore, e o nome do tipo).

Abaixo da tarja ha 6 LINHAS de dados seguidas de 1 LINHA de OBSERVACOES.

LINHA 1 — Identificacao (2 celulas com bordas mais grossas):
  Celula esquerda (larga, ~65% da largura): rotulo "LOTE" impresso no canto superior esquerdo. Contem o codigo do lote escrito a mao em tamanho grande — e o maior texto manuscrito da ficha. → extraia como "lote" em identificacao
  Celula direita (estreita, ~35%): rotulo "Sacas" impresso no canto superior esquerdo. Contem um numero manuscrito (ex: "100", "200", "350") indicando a quantidade de sacas. → extraia como "sacas" em identificacao

LINHA 2 — Classificacao geral (4 campos lado a lado, largura igual):
  Campo esquerdo: rotulo "Padrão" → extraia como "padrao" em classificacao
  Campo centro-esquerdo: rotulo "Safra" → extraia como "safra" (retorne o MESMO valor em identificacao.safra E em classificacao.safra)
  Campo centro-direito: rotulo "Aspecto" → extraia como "aspecto"
  Campo direito: rotulo "Certif." → extraia como "certif" (siglas como "UTZ", "RA", "FLO", "4C", "ORG", "BIO")

LINHA 3 — Catacao, defeitos e bebida (4 campos lado a lado, largura igual):
  Campo esquerdo: rotulo "Catação" → extraia como "catacao"
  Campo centro-esquerdo: rotulo "Broca" → extraia como "broca"
  Campo centro-direito: rotulo "PVA" → extraia como "pva"
  Campo direito: rotulo "Bebida" → extraia como "bebida"

Ha um pequeno espaco visual separando as linhas acima das linhas abaixo.

LINHA 4 — Peneiras superiores (6 campos COMPACTADOS lado a lado, mais estreitos que as outras linhas):
  ATENCAO: esta linha tem 6 colunas de largura igual. Cada coluna e mais estreita.
  Da esquerda para a direita:
  Coluna 1: rotulo "P.19 %" → extraia como "p19"
  Coluna 2: rotulo "P.18 %" → extraia como "p18"
  Coluna 3: rotulo "P.17 %" → extraia como "p17"
  Coluna 4: rotulo "P.16 %" → extraia como "p16"
  Coluna 5: rotulo "P.15 %" → extraia como "p15"
  Coluna 6: rotulo "P.14 %" → extraia como "p14"

LINHA 5 — MK, Defeito e Impureza (3 campos lado a lado, cada um ocupa UM TERCO da largura):
  Campo esquerdo (terco): rotulo "MK %" → extraia como "mk"
  Campo centro (terco): rotulo "Defeito" → extraia como "defeito"
  Campo direito (terco): rotulo "Impureza" → extraia como "impureza"

LINHA 6 — Fundo (2 campos largos, cada um ocupa METADE da largura da ficha, fundo bege claro):
  Esta linha tem fundo bege e contem apenas UM fundo (PREPARADO nao tem fundo 2).
  Campo esquerdo (metade): rotulo "Fundo Pen." → extraia o identificador manuscrito como "fundo1_peneira" (ex: "B", "C12", "13")
  Campo direito (metade): rotulo "%" → extraia o numero manuscrito como "fundo1_percentual" (ex: "1,5")

LINHA 7 — Observacoes (campo unico, largura total da ficha):
  Rotulo "Observações" no canto superior esquerdo.
  Este campo pode conter QUALQUER texto manuscrito. Pode incluir:
  - Valores numericos como "Pau 2", "AP 1", "Umid 11,5"
  - Textos descritivos como "pedra", "cafe verde", "mofo"
  - Qualquer combinacao dos exemplos acima
  Extraia TODO o texto manuscrito deste campo como uma unica string.
  Mantenha a grafia exata. Separe itens visivelmente distintos por virgula.
  Se o campo estiver vazio, retorne null.
  → extraia como "observacoes"

ROTULOS IMPRESSOS DA FICHA (NUNCA retorne nenhum destes como valor extraido):
LOTE, Sacas, Certif., Certif, Certificado, PREPARADO, Padrão, Catação, Aspecto, Bebida, Safra, Broca, PVA, Impureza, P.19 %, P.18 %, P.17 %, P.16 %, P.15 %, P.14 %, MK %, Defeito, Fundo Pen., %, Observações

REGRAS DE FORMATO POR TIPO DE CAMPO:
- Texto (padrao, catacao, aspecto, bebida, safra): retorne exatamente como escrito. Podem ser abreviacoes curtas (ex: "VGC", "L3 P3B", "Dura", "Rio", "25/26").
- Peneiras percentuais (p19, p18, p17, p16, p15, p14, mk, fundo1_percentual): retorne SOMENTE o numero. Use virgula como separador decimal se escrito assim (ex: "36", "1,5", "0,8"). NAO inclua "%".
- Defeito (defeito): retorne SOMENTE o numero (ex: "6", "15", "20").
- Defeitos numericos (broca, pva, impureza): retorne SOMENTE o numero (ex: "2", "0,5", "20").
- Fundo peneira (fundo1_peneira): retorne o identificador exatamente como escrito (ex: "B", "C12", "13", "C").
- Observacoes: retorne TODO o texto manuscrito como uma string unica.
- Lote: retorne o codigo manuscrito grande da celula "LOTE" da LINHA 1 (ex: "5487", "A-5490").
- Sacas: retorne SOMENTE o numero inteiro manuscrito da celula "Sacas" da LINHA 1 (ex: "100", "200", "350"). Se vazio, null.
- Certif: retorne as siglas manuscritas do campo "Certif." na LINHA 2, exatamente como escritas (ex: "UTZ", "RA", "FLO", "UTZ/RA", "BIO", "ORG"). Se vazio, null.

ERROS COMUNS A EVITAR:
- NAO confunda o numero "0" (zero) com a letra "O".
- NAO confunda o numero "1" com a letra "l" ou "I".
- Se um valor parece ser texto impresso e nao manuscrito, retorne null.
- Muitos campos ficam vazios (sem escrita) — retorne null para eles sem hesitar.
- Na LINHA 4 com 6 colunas compactadas, preste atencao extra para nao confundir valores entre colunas adjacentes.

Retorne SOMENTE o JSON abaixo, sem texto adicional:
{
  "classificacao": {
    "padrao": "texto manuscrito ou null",
    "catacao": "valor manuscrito ou null",
    "aspecto": "texto manuscrito ou null",
    "bebida": "texto manuscrito ou null",
    "safra": "texto manuscrito ou null",
    "broca": "numero ou null",
    "pva": "numero ou null",
    "impureza": "numero ou null",
    "p19": "numero ou null",
    "p18": "numero ou null",
    "p17": "numero ou null",
    "p16": "numero ou null",
    "p15": "numero ou null",
    "p14": "numero ou null",
    "mk": "numero ou null",
    "defeito": "numero ou null",
    "fundo1_peneira": "identificador manuscrito ou null",
    "fundo1_percentual": "numero ou null",
    "certif": "siglas manuscritas do campo Certif. ou null",
    "observacoes": "texto manuscrito completo ou null"
  },
  "identificacao": {
    "lote": "codigo manuscrito da L1 ou null",
    "sacas": "numero manuscrito da L1 ou null",
    "safra": "valor manuscrito da L2 (mesmo valor de classificacao.safra) ou null"
  }
}`;

const LOW_CAFF_USER_PROMPT = `Extraia os dados manuscritos da ficha de classificacao do tipo CAF\u00c9 BAIXO presente na foto.

COMO IDENTIFICAR A FICHA CORRETA:
Procure o cartao branco retangular com a expressao "CAF\u00c9 BAIXO" impressa em uma TARJA FINA no topo, com fundo bege claro. Logo abaixo da tarja comeca o corpo da ficha, com a primeira linha (L1) destacada por bordas mais grossas contendo as celulas "LOTE" (esquerda, larga) e "Sacas" (direita, estreita). Ignore qualquer outro papel ou tabela na mesa.

LAYOUT DA FICHA CAF\u00c9 BAIXO (de cima para baixo):

TARJA SUPERIOR: faixa fina com fundo bege claro, largura total, texto "CAF\u00c9 BAIXO" impresso centralizado (ignore, e o nome do tipo).

Abaixo da tarja ha 6 LINHAS de dados seguidas de 1 LINHA de OBSERVACOES.

LINHA 1 — Identificacao (2 celulas com bordas mais grossas):
  Celula esquerda (larga, ~65% da largura): rotulo "LOTE" impresso no canto superior esquerdo. Contem o codigo do lote escrito a mao em tamanho grande — e o maior texto manuscrito da ficha. → extraia como "lote" em identificacao
  Celula direita (estreita, ~35%): rotulo "Sacas" impresso no canto superior esquerdo. Contem um numero manuscrito (ex: "100", "200", "350") indicando a quantidade de sacas. → extraia como "sacas" em identificacao

LINHA 2 — Classificacao geral (4 campos lado a lado, largura igual):
  Campo esquerdo: rotulo "Padrão" → extraia como "padrao" em classificacao
  Campo centro-esquerdo: rotulo "Safra" → extraia como "safra" (retorne o MESMO valor em identificacao.safra E em classificacao.safra)
  Campo centro-direito: rotulo "Aspecto" → extraia como "aspecto"
  Campo direito: rotulo "Certif." → extraia como "certif" (siglas como "UTZ", "RA", "FLO", "4C", "ORG", "BIO")

LINHA 3 — Catacao, defeitos e bebida (4 campos lado a lado, largura igual):
  Campo esquerdo: rotulo "Catação" → extraia como "catacao"
  Campo centro-esquerdo: rotulo "Broca" → extraia como "broca"
  Campo centro-direito: rotulo "PVA" → extraia como "pva"
  Campo direito: rotulo "Bebida" → extraia como "bebida"

Ha um pequeno espaco visual separando as linhas acima das linhas abaixo.

LINHA 4 — Peneiras (6 campos COMPACTADOS lado a lado, mais estreitos que as outras linhas):
  ATENCAO: esta linha tem 6 colunas de largura igual. Cada coluna e mais estreita.
  Da esquerda para a direita:
  Coluna 1: rotulo "P.15 %" → extraia como "p15"
  Coluna 2: rotulo "P.14 %" → extraia como "p14"
  Coluna 3: rotulo "P.13 %" → extraia como "p13"
  Coluna 4: rotulo "P.12 %" → extraia como "p12"
  Coluna 5: rotulo "P.11 %" → extraia como "p11"
  Coluna 6: rotulo "P.10 %" → extraia como "p10"

LINHA 5 — AP, GPI, Defeito e Impureza (4 campos lado a lado, largura igual):
  Campo esquerdo: rotulo "AP %" → extraia como "ap"
  Campo centro-esquerdo: rotulo "GPI" → extraia como "gpi"
  Campo centro-direito: rotulo "Defeito" → extraia como "defeito"
  Campo direito: rotulo "Impureza" → extraia como "impureza"

LINHA 6 — Fundos (4 campos lado a lado, fundo bege claro):
  Esta linha tem fundo bege e contem DOIS pares de fundos.
  Primeiro par (fundo 1):
    Campo 1 com rotulo "Fundo Pen." → extraia o identificador manuscrito como "fundo1_peneira" (ex: "B", "C12", "13")
    Campo 2 com rotulo "%" → extraia o numero manuscrito como "fundo1_percentual" (ex: "1,5")
  Segundo par (fundo 2):
    Campo 3 com rotulo "Fundo Pen." → extraia como "fundo2_peneira"
    Campo 4 com rotulo "%" → extraia como "fundo2_percentual"
  Se apenas o primeiro fundo estiver preenchido, retorne null para fundo2_peneira e fundo2_percentual.

LINHA 7 — Observacoes (campo unico, largura total da ficha):
  Rotulo "Observações" no canto superior esquerdo.
  Este campo pode conter QUALQUER texto manuscrito. Pode incluir:
  - Valores numericos como "Pau 2", "Umid 11,5"
  - Textos descritivos como "pedra", "cafe verde", "mofo"
  - Qualquer combinacao dos exemplos acima
  Extraia TODO o texto manuscrito deste campo como uma unica string.
  Mantenha a grafia exata. Separe itens visivelmente distintos por virgula.
  Se o campo estiver vazio, retorne null.
  → extraia como "observacoes"

ROTULOS IMPRESSOS DA FICHA (NUNCA retorne nenhum destes como valor extraido):
LOTE, Sacas, Certif., Certif, Certificado, CAF\u00c9 BAIXO, Padrão, Catação, Aspecto, Bebida, Safra, Broca, PVA, Impureza, P.15 %, P.14 %, P.13 %, P.12 %, P.11 %, P.10 %, AP %, GPI, Defeito, Fundo Pen., %, Observações

REGRAS DE FORMATO POR TIPO DE CAMPO:
- Texto (padrao, catacao, aspecto, bebida, safra): retorne exatamente como escrito. Podem ser abreviacoes curtas (ex: "VGC", "L3 P3B", "Dura", "Rio", "25/26").
- Peneiras percentuais (p15, p14, p13, p12, p11, p10, fundo1_percentual, fundo2_percentual): retorne SOMENTE o numero. Use virgula como separador decimal se escrito assim (ex: "36", "1,5", "0,8"). NAO inclua "%".
- AP percentual (ap): retorne SOMENTE o numero (ex: "85", "92,5"). NAO inclua "%".
- Defeito (defeito): retorne SOMENTE o numero (ex: "6", "15", "20").
- Defeitos numericos (broca, pva, impureza, gpi): retorne SOMENTE o numero (ex: "2", "0,5", "20").
- Fundo peneira (fundo1_peneira, fundo2_peneira): retorne o identificador exatamente como escrito (ex: "B", "C12", "13", "C").
- Observacoes: retorne TODO o texto manuscrito como uma string unica.
- Lote: retorne o codigo manuscrito grande da celula "LOTE" da LINHA 1 (ex: "5487", "A-5490").
- Sacas: retorne SOMENTE o numero inteiro manuscrito da celula "Sacas" da LINHA 1 (ex: "100", "200", "350"). Se vazio, null.
- Certif: retorne as siglas manuscritas do campo "Certif." na LINHA 2, exatamente como escritas (ex: "UTZ", "RA", "FLO", "UTZ/RA", "BIO", "ORG"). Se vazio, null.

ERROS COMUNS A EVITAR:
- NAO confunda o numero "0" (zero) com a letra "O".
- NAO confunda o numero "1" com a letra "l" ou "I".
- Se um valor parece ser texto impresso e nao manuscrito, retorne null.
- Muitos campos ficam vazios (sem escrita) — retorne null para eles sem hesitar.
- Na LINHA 4 com 6 colunas compactadas, preste atencao extra para nao confundir valores entre colunas adjacentes.

Retorne SOMENTE o JSON abaixo, sem texto adicional:
{
  "classificacao": {
    "padrao": "texto manuscrito ou null",
    "catacao": "valor manuscrito ou null",
    "aspecto": "texto manuscrito ou null",
    "bebida": "texto manuscrito ou null",
    "safra": "texto manuscrito ou null",
    "broca": "numero ou null",
    "pva": "numero ou null",
    "impureza": "numero ou null",
    "p15": "numero ou null",
    "p14": "numero ou null",
    "p13": "numero ou null",
    "p12": "numero ou null",
    "p11": "numero ou null",
    "p10": "numero ou null",
    "ap": "numero ou null",
    "gpi": "numero ou null",
    "defeito": "numero ou null",
    "fundo1_peneira": "identificador manuscrito ou null",
    "fundo1_percentual": "numero ou null",
    "fundo2_peneira": "identificador manuscrito ou null",
    "fundo2_percentual": "numero ou null",
    "certif": "siglas manuscritas do campo Certif. ou null",
    "observacoes": "texto manuscrito completo ou null"
  },
  "identificacao": {
    "lote": "codigo manuscrito da L1 ou null",
    "sacas": "numero manuscrito da L1 ou null",
    "safra": "valor manuscrito da L2 (mesmo valor de classificacao.safra) ou null"
  }
}`;

// ============================================================
// PROMPT REGISTRY (keyed by ClassificationType enum value)
// ============================================================

const USER_PROMPTS = {
  BICA: BICA_USER_PROMPT,
  PREPARADO: PREPARADO_USER_PROMPT,
  LOW_CAFF: LOW_CAFF_USER_PROMPT,
};

// ============================================================
// KNOWN LABELS (shared — covers all types to reject labels from any visible card)
// ============================================================

const KNOWN_LABELS = new Set([
  // ---- Field labels from SAFRAS classification forms (all types) ----
  'broca',
  'pva',
  'impureza',
  'imp',
  'defeitos',
  'defeito',
  'umidade',
  'padrao',
  'padrão',
  'catacao',
  'catação',
  'aspecto',
  'bebida',
  'p19',
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
  'fundo',
  'fundo1',
  'fundo2',
  'fundos',
  'peneira',
  'percentual',
  'fundo pen',
  'fundo pen.',
  'fundo %',
  'pen.',
  'pen',
  'pau',
  'ap',
  'gpi',
  'lote',
  'sacas',
  'safra',
  'data',
  'observações',
  'observacoes',
  'aproveitamento',
  'ap %',

  // ---- Punctuated labels (as printed on cards) ----
  'p.19',
  'p.18',
  'p.17',
  'p.16',
  'p.15',
  'p.14',
  'p.13',
  'p.12',
  'p.11',
  'p.10',
  'p.19 %',
  'p.18 %',
  'p.17 %',
  'p.16 %',
  'p.15 %',
  'p.14 %',
  'p.13 %',
  'p.12 %',
  'p.11 %',
  'p.10 %',
  'mk %',
  'umid.',
  'umid. %',

  // ---- Type names printed on cards ----
  'bica',
  'preparado',
  'caf\u00e9 baixo',
  'cafe baixo',

  // ---- Header field labels ----
  'lote',
  'certif',
  'certif.',
  'certificado',

  // ---- Form identifiers (legacy, still rejected defensively) ----
  'classificador',
  'safras',
  '& negocios',
  'safras & negocios',

  // ---- JSON schema placeholders (model might echo these) ----
  'string ou null',
  'null',
  'string',
  'numero manuscrito ou null',
  'valor manuscrito ou null',
  'numero ou null',
  'codigo manuscrito ou null',
  'codigo manuscrito do cabecalho ou null',
  'texto manuscrito ou null',
  'identificador manuscrito ou null',
  'texto manuscrito completo ou null',

  // ---- External reference tables that may appear in photo ----
  'green coffee',
  'volcafe',
  'grade of imperfections',
  'schedule of imperfections',
  'classificação de café',
  'classification',
]);

// ============================================================
// NORMALIZATION HELPERS
// ============================================================

const REQUEST_TIMEOUT_MS = 25_000;

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
// TYPE-SPECIFIC NORMALIZERS
// ============================================================

function normalizeClassificacaoBica(raw) {
  return {
    padrao: rejectIfLabel(toStringOrNull(raw.padrao)),
    catacao: rejectIfLabel(toStringOrNull(raw.catacao)),
    aspecto: rejectIfLabel(toStringOrNull(raw.aspecto)),
    bebida: rejectIfLabel(toStringOrNull(raw.bebida)),
    safra: rejectIfLabel(toStringOrNull(raw.safra)),
    broca: toNumericOrNull(raw.broca),
    pva: toNumericOrNull(raw.pva),
    impureza: toNumericOrNull(raw.impureza),
    p17: toNumericOrNull(raw.p17),
    mk: toNumericOrNull(raw.mk),
    fundo1_peneira: rejectIfLabel(toStringOrNull(raw.fundo1_peneira)),
    fundo1_percentual: toNumericOrNull(raw.fundo1_percentual),
    fundo2_peneira: rejectIfLabel(toStringOrNull(raw.fundo2_peneira)),
    fundo2_percentual: toNumericOrNull(raw.fundo2_percentual),
    certif: rejectIfLabel(toStringOrNull(raw.certif ?? null)),
    observacoes: toStringOrNull(raw.observacoes),
  };
}

function normalizeClassificacaoPreparado(raw) {
  return {
    padrao: rejectIfLabel(toStringOrNull(raw.padrao)),
    catacao: rejectIfLabel(toStringOrNull(raw.catacao)),
    aspecto: rejectIfLabel(toStringOrNull(raw.aspecto)),
    bebida: rejectIfLabel(toStringOrNull(raw.bebida)),
    safra: rejectIfLabel(toStringOrNull(raw.safra)),
    broca: toNumericOrNull(raw.broca),
    pva: toNumericOrNull(raw.pva),
    impureza: toNumericOrNull(raw.impureza),
    p19: toNumericOrNull(raw.p19),
    p18: toNumericOrNull(raw.p18),
    p17: toNumericOrNull(raw.p17),
    p16: toNumericOrNull(raw.p16),
    p15: toNumericOrNull(raw.p15),
    p14: toNumericOrNull(raw.p14),
    mk: toNumericOrNull(raw.mk),
    defeito: toNumericOrNull(raw.defeito),
    fundo1_peneira: rejectIfLabel(toStringOrNull(raw.fundo1_peneira)),
    fundo1_percentual: toNumericOrNull(raw.fundo1_percentual),
    certif: rejectIfLabel(toStringOrNull(raw.certif ?? null)),
    observacoes: toStringOrNull(raw.observacoes),
  };
}

function normalizeClassificacaoLowCaff(raw) {
  return {
    padrao: rejectIfLabel(toStringOrNull(raw.padrao)),
    catacao: rejectIfLabel(toStringOrNull(raw.catacao)),
    aspecto: rejectIfLabel(toStringOrNull(raw.aspecto)),
    bebida: rejectIfLabel(toStringOrNull(raw.bebida)),
    safra: rejectIfLabel(toStringOrNull(raw.safra)),
    broca: toNumericOrNull(raw.broca),
    pva: toNumericOrNull(raw.pva),
    impureza: toNumericOrNull(raw.impureza),
    p15: toNumericOrNull(raw.p15),
    p14: toNumericOrNull(raw.p14),
    p13: toNumericOrNull(raw.p13),
    p12: toNumericOrNull(raw.p12),
    p11: toNumericOrNull(raw.p11),
    p10: toNumericOrNull(raw.p10),
    ap: toNumericOrNull(raw.ap),
    gpi: toNumericOrNull(raw.gpi),
    defeito: toNumericOrNull(raw.defeito),
    fundo1_peneira: rejectIfLabel(toStringOrNull(raw.fundo1_peneira)),
    fundo1_percentual: toNumericOrNull(raw.fundo1_percentual),
    fundo2_peneira: rejectIfLabel(toStringOrNull(raw.fundo2_peneira)),
    fundo2_percentual: toNumericOrNull(raw.fundo2_percentual),
    certif: rejectIfLabel(toStringOrNull(raw.certif ?? null)),
    observacoes: toStringOrNull(raw.observacoes),
  };
}

const NORMALIZERS = {
  BICA: normalizeClassificacaoBica,
  PREPARADO: normalizeClassificacaoPreparado,
  LOW_CAFF: normalizeClassificacaoLowCaff,
};

// ============================================================
// IDENTIFICATION NORMALIZER (shared)
// ============================================================

function normalizeIdentificacao(raw) {
  return {
    lote: toStringOrNull(raw.lote),
    sacas: toStringOrNull(raw.sacas ?? null),
    safra: toStringOrNull(raw.safra ?? null),
    data: toStringOrNull(raw.data ?? null),
  };
}

// ============================================================
// EXTRACTION SERVICE
// ============================================================

export class ClassificationExtractionService {
  constructor({ apiKey }) {
    this.client = new OpenAI({ apiKey });
  }

  async extractClassificationFromPhoto(absoluteImagePath, classificationType) {
    const userPrompt = USER_PROMPTS[classificationType];
    if (!userPrompt) {
      const error = new HttpError(
        422,
        `Tipo de classificacao nao suportado para extracao: ${classificationType ?? 'nao informado'}`
      );
      error.code = 'UNSUPPORTED_TYPE';
      throw error;
    }

    const normalizer = NORMALIZERS[classificationType];

    const imageBuffer = fs.readFileSync(absoluteImagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = absoluteImagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const startTime = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await this.client.chat.completions.create(
        {
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: userPrompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${base64Image}`,
                    detail: 'high',
                  },
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 1500,
          temperature: 0,
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
        classificacao: normalizer(parsed.classificacao),
        identificacao: normalizeIdentificacao(parsed.identificacao),
        processingTimeMs,
      };
    } catch (err) {
      if (err.code === 'PARSE_ERROR' || err.code === 'UNSUPPORTED_TYPE') throw err;

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
