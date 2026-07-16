# Informativos — Plano de Trabalho

> **Status**: **IMPLEMENTADO em 2026-07-16** — decisões **INF1–INF57** fechadas. Dois tipos (**Mercado** e **Meteorológico**) num fluxo de **3 fases** (mercado → meteorológico → revisão), na 3ª opção do leque do FAB da `/relatorios`, gerando PNGs 1080×1920. Sem migration, sem rota de API (P1). Gates verdes: **build**, lint, typecheck, format, **unit 524/524**. **Pendente: só a validação visual** — 🖥️ conferir as duas peças contra os mockups (com atenção à folga do título de 60px do meteorológico, INF47) e 📱 postar um story de teste, único jeito de confirmar a zona segura (INF8). Aberta: **Q-C3** (saca em alta res).
> **Última atualização**: 2026-07-16
> **Prefixo de decisões**: INF (INF1, INF2, ...)
> **Documento centralizado da feature**: conceito, decisões, especificação visual e fases vivem AQUI.

---

## 1. Conceito e motivação

**Elevator pitch**: o Informativo é uma peça de imagem que o usuário gera na hora — preenche os campos num modal, clica em criar e baixa o PNG pronto para publicar nas redes sociais. O padrão visual é sempre o mesmo; só os valores mudam, todo dia. Nada é gravado no sistema: o app é a gráfica, não o arquivo.

**Problema que resolve**: hoje o informativo diário é montado à mão num `.docx`. O arquivo de referência (`Informativo Mercado (3).docx`, analisado em 2026-07-16) é um **PNG de fundo de 657×989 com 19 caixas de texto flutuantes posicionadas por cima**. Isso cobra três preços:

- **Resolução**: o fundo tem 657px de largura; o Instagram quer 1080. A peça sobe abaixo do que a plataforma pede.
- **Rótulos chumbados**: `SAFRA 25/26`, `2026` e `2027` estão pintados dentro do PNG. Envelhecem, e trocar exige editar a imagem.
- **Fragilidade de digitação**: sem campo estruturado, erro passa. O `.docx` analisado tinha `R$ 1690,00` seguido de um `,00` solto (duas caixas de texto sobrepostas), resultando em `R$ 1690,00,00` publicado.

**O que o Informativo explicitamente NÃO é**:

- NÃO é um relatório do sistema — os valores são **digitados pelo usuário**, não lidos do banco (ver P3).
- NÃO é um registro: não gera Sample, evento, nem qualquer linha no banco. Não há histórico de informativos.
- NÃO é a página `/relatorios` nem a substitui — é um modal hospedado nela.
- NÃO é o laudo/contrato/etiqueta: não é documento de negócio e não tem valor probatório.

## 2. Princípios

| #   | Princípio                                                                                                | Consequência prática                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Nada é salvo.** O informativo nasce, é baixado e morre. Sem banco, sem storage, sem histórico.         | Sem tabela, sem migration, sem rota de escrita. O `localStorage` dos campos lentos (INF36) **não viola o P1**: o princípio fala do domínio, e aquilo é conveniência de digitação local ao navegador. |
| P2  | **Padrão fixo, valores variáveis.** A peça é reconhecível: o leitor acha o dado no mesmo lugar todo dia. | O layout não é configurável pelo usuário. Mudança de layout é decisão INFn, não opção de tela.                                                                                                       |
| P3  | **O app não busca os dados.** Bolsa, dólar e preços são digitados por quem publica.                      | Nenhuma integração com fonte de mercado na v1. Se um dia entrar, vira decisão própria (ver §3.3).                                                                                                    |
| P4  | **A peça é para o story.** 9:16, e o enquadramento respeita a interface do Instagram.                    | Conteúdo dentro da zona segura (§5.1). Nada crítico embaixo do @ do topo ou da barra de resposta da base.                                                                                            |
| P5  | **A feature é plural.** "Informativos" é a família; "Mercado" é o primeiro tipo.                         | Código e docs organizados por **tipo** desde o começo, com o layout parametrizado. O segundo tipo não deve exigir refatoração da casca (§4.2).                                                       |

## 3. Escopo

### 3.1 Dentro do escopo

- Modal em `/relatorios` com o fluxo de **3 fases**: **Informativo de Mercado** → **Informativo Meteorológico** (pulável) → revisão (INF53).
- Campos preenchidos à mão, com os layouts do §5 e §5-B.
- O **print da previsão** colado pelo usuário (INF45/INF52) — colar, arrastar ou escolher.
- Geração de **PNG 1080×1920** no navegador e entrega das duas peças (INF55).
- Formatação automática dos valores (elimina o erro de digitação do §1).
- Pré-preenchimento dos campos lentos do Mercado a partir da última geração (INF25).

### 3.2 Fora do escopo (explícito)

- Persistir o informativo, seus valores ou um histórico (P1).
- Buscar cotações de qualquer fonte externa ou do próprio banco (P3).
- **Buscar a previsão do tempo de uma API** — avaliado e descartado (INF45, §4.3).
- **Recortador de imagem embutido** — o usuário já recorta na ferramenta de captura (INF50).
- Publicar direto no Instagram/redes (não citado; exigiria integração e credencial).
- Editar/personalizar o layout pela tela (P2).
- Outros enquadramentos (feed 4:5, A4, PDF) — descartados pelas INF2/INF3.

### 3.3 Estacionamento (ideias futuras, sem compromisso)

- Puxar dólar/bolsa de uma fonte automática, com o usuário confirmando antes de gerar.
- Outros enquadramentos da mesma peça (feed 4:5 para post, além do story).
- Compartilhar direto via Web Share API em vez de baixar (o app já tem `lib/share-blob.ts`).

## 4. Tipos de informativo

### 4.1 Informativo de Mercado (v1)

O único tipo especificado. Estrutura de conteúdo, herdada do `.docx` atual:

| Bloco                          | Conteúdo                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------- |
| Data                           | pílula no topo                                                                |
| `RESUMO DO MERCADO`            | Bolsa NY (com mês de referência) · Variação · Dólar — 3 linhas rótulo → valor |
| `MERCADO FÍSICO — PREÇO LIVRE` | faixa da safra + 1 linha: tipo do café → preço                                |
| `MERCADO FUTURO — PREÇO LIVRE` | 2 colunas (ano A / ano B), 2 linhas cada: mês → preço                         |
| `CPR — MERCADO FUTURO`         | 2 colunas (ano A / ano B), 1 valor cada                                       |
| Rodapé                         | @, e-mail, telefone, logo                                                     |

> **CPR fica separada (INF24)**: `MERCADO FUTURO` e `CPR — MERCADO FUTURO` têm as mesmas colunas de ano, e fundi-las numa tabela só (linhas AGO / SET / CPR) economizaria ~184px de altura — o recurso mais escasso do story. **Decisão: manter separado**, porque CPR é outro produto e a fusão comunicaria algo errado. E os anos das duas seções são **campos independentes** (INF26, 4 controles): a proposta de um par único alimentar ambas foi descartada porque os anos podem divergir.

### 4.2 Informativo Meteorológico (INF44 — resolve a Q-F1)

Confirmado em 2026-07-16: o segundo tipo é o **meteorológico**, peça irmã do Mercado (mesma casca, mesma anatomia de tabela, corpo próprio). Estrutura, herdada da peça atual:

| Bloco               | Conteúdo                                               |
| ------------------- | ------------------------------------------------------ |
| Data                | pílula no topo, por extenso (igual ao Mercado — INF46) |
| _(sem barra)_       | `TEMPERATURA` · `UMIDADE RELATIVA DO AR` — 2 linhas    |
| `REGISTRO EM 24h`   | `MÁXIMA` · `MÍNIMA` · `PLUVIOSIDADE` — 3 linhas        |
| `PREVISÃO DO TEMPO` | painel branco com o **print** que o usuário cola       |
| Rodapé              | @, e-mail, telefone, logo                              |

**São 6 controles**, contra os 21 do Mercado — por isso a fase é rápida. A primeira tabela **não tem barra de título**, fiel ao original, e **não há valor herói** (INF48): os 5 números saem a 36px, ao contrário do Mercado, que destaca o preço físico a 52px verde.

**A previsão é um print colado, não uma API (INF45).** A avaliação está no §4.3.

**O P5 foi pago aqui**: até a INF44 a casca comum era uma promessa do documento, não do código — header, pílula e rodapé eram emitidos dentro do `buildMercadoLayout`. A extração para `story-layout.ts` veio antes do meteorológico, provada op a op (§9.2).

### 4.3 Por que a previsão não vem de uma API (INF45)

Avaliado em 2026-07-16, a pedido do usuário, e **descartado**. O que a apuração mostrou:

| Fonte                    | Dias  | Uso comercial  | Custo/mês | Veredito                                          |
| ------------------------ | ----- | -------------- | --------- | ------------------------------------------------- |
| **INMET** (oficial)      | —     | —              | —         | ❌ derruba a conexão (4/4 tentativas)             |
| **CPTEC/INPE** (oficial) | —     | —              | —         | ❌ XML bem-formado com **todos os campos `null`** |
| OpenWeatherMap           | 5     | ODbL, sim      | $0        | perde 2 dias                                      |
| WeatherAPI Free          | 3     | sim            | $0        | perde 4 dias                                      |
| WeatherAPI Starter       | **7** | sim            | **$7**    | única grátis-ish com os 7 dias                    |
| Open-Meteo (ECMWF)       | 7–16  | **só no pago** | **$29**   | melhor tecnicamente; +69% no TCO de R$ 231        |

O Open-Meteo é o melhor tecnicamente (sem chave, CORS liberado, respondeu em 1,1s, resolveu a altitude certa), mas o plano grátis é **explicitamente não-comercial** (_"you may only use the free API services for non-commercial purposes... Integrating our service into commercial products"_) e o app é produto comercial.

O print manual ganha em tudo o que importa aqui: **custo zero, sem chave, sem rota de servidor, sem segredo no Secret Manager, sem dependência de uptime** numa peça diária, e **sem divergir** do que os seguidores veem no próprio celular. Mantém o **P1** e a **INF13** intactos e dispensa emendar o **P3**.

Um ganho não-óbvio da API seria desenhar a faixa na identidade da marca (o print do MSN é branco e azul, estranho à paleta) — mas ele custaria os ícones, e os CDNs entregam 64px, que numa peça de 1080 borrariam do mesmo jeito que a saca da INF9.

## 5. Especificação visual — Informativo de Mercado

> Todas as medidas em pixels do canvas final (1080×1920). Valores validados no mockup aprovado em 2026-07-16. A implementação deve reproduzir esta especificação; divergência intencional vira decisão INFn.

### 5.1 Formato e zona segura

| Item                 | Valor                         |
| -------------------- | ----------------------------- |
| Canvas               | **1080 × 1920** (9:16, story) |
| Margem lateral (`M`) | 60                            |
| Zona segura vertical | **y = 180 → 1760**            |
| Fundo                | branco `#FFFFFF`              |

**Regra da zona segura (INF8)**: o Instagram cobre o topo (foto/@/hora) e a base (barra "Enviar mensagem") do story. Nenhum conteúdo legível pode cair fora de `180 → 1760`. As faixas verdes (header e rodapé) **sangram até as bordas** — fundo coberto não faz mal; texto coberto faz.

### 5.2 Paleta (INF15 — amostrada do template atual)

| Token       | Hex       | Uso                                                                   |
| ----------- | --------- | --------------------------------------------------------------------- |
| `GREEN`     | `#0E520B` | faixa do header, faixas de safra/ano, rodapé, preço em destaque       |
| `BROWN`     | `#383223` | barras de título das seções, valores das tabelas                      |
| `WHITE`     | `#FFFFFF` | fundo, texto sobre verde/marrom                                       |
| `CANVAS`    | `#F4F6F5` | preenchimento das linhas alternadas                                   |
| `BORDER`    | `#DDE2DC` | borda das células                                                     |
| `RED`       | `#C2341D` | variação de **baixa** — seta **e** valor (INF20)                      |
| `GREEN_L`   | `#186D14` | variação de **alta** — seta **e** valor (INF20) **[PROPOSTA — Q-C5]** |
| `MUTED`     | `#7C8A79` | rótulos secundários (meses)                                           |
| `SOFT`      | `#9DC9A0` | "INFORMATIVO DE" sobre o verde                                        |
| `FOOTER_TX` | `#DCE8DA` | contatos no rodapé                                                    |

O `GREEN_L` é o verde claro da pílula do template original, que tinha ficado reservado sem uso no layout novo — reaproveitá-lo mantém a cor de alta dentro da paleta da marca e distinta do `GREEN` das faixas (INF27).

> Estes tokens vivem em `COLORS`, em `lib/informativos/mercado-layout.ts` — é a fonte-da-verdade. O `#186D14` e o `#C2341D` aparecem **também** no `app/globals.css` (`.ifm-dir.is-alta/.is-baixa`), de propósito: o botão de direção mostra a cor que vai sair na peça. Mexeu num, mexeu nos dois.

### 5.3 Tipografia (INF14)

**Poppins**, pesos 400/500/600/700 — a mesma da PWA, já self-hospedada pelo `next/font/google` (`app/layout.tsx`). Nenhum arquivo de fonte novo no repo.

> **Gotcha (INF10)**: a Poppins **não tem os glifos `▲` `▼`** (verificado: 217 glifos, sem eles). Usá-los como texto faria o navegador cair num fallback, e a seta sairia diferente em cada máquina. A seta é **desenhada como polígono**.

### 5.4 Assets

| Asset                                        | Origem                                                            | Uso                            |
| -------------------------------------------- | ----------------------------------------------------------------- | ------------------------------ |
| Lockup branco (árvore + SAFRAS + & negócios) | `public/logo-safras-branco.png` (1024×299; conteúdo útil 833×265) | header (h=122) e rodapé (h=72) |

Nenhum asset novo é necessário. A saca de café do template **não é usada** (INF9).

### 5.5 Header — H3, split editorial (INF7)

Faixa `GREEN` de `y=0` a **`HB=466`** (sangra até o topo).

| Elemento         | Posição / estilo                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Lockup branco    | `x = M+4`, `y = 206`, altura **122**                                                      |
| `INFORMATIVO DE` | alinhado à **direita** em `x = W−M−4`, `y = 214` · Poppins 500, 32px, tracking 6, `SOFT`  |
| `MERCADO`        | alinhado à **direita** em `x = W−M−4`, `y = 256` · Poppins 700, 86px, tracking 2, `WHITE` |

Logo à esquerda e título à direita se equilibram: não sobra campo vazio, e o logo é grande o suficiente para ler no story.

> O header é da **casca** (`pushHeader` do `story-layout.ts`), parametrizado por `StoryHeaderSpec` — o kicker, o título, e opcionalmente tamanho/`y`/tracking. Os valores da tabela acima são os **defaults**; o meteorológico só sobrescreve os que precisa (§5-B.1).

### 5.6 Pílula da data

Retângulo arredondado **montado na borda inferior da faixa**, centrado: largura 520, `y = HB−38 → HB+38`, raio 38, preenchimento `WHITE`, contorno `GREEN` 4px. Texto Poppins 600, 30px, tracking 2, `GREEN`, centrado.

### 5.7 Corpo — auto-distribuição (INF12)

O corpo **não tem posições chumbadas**. O algoritmo:

```
top    = HB + 80          → 546
bottom = FB − 26          → 1592     (FB = 1618, topo da faixa do rodapé)
total  = Σ altura natural das 4 seções
gap    = (bottom − top − total) / (nº de seções − 1)
```

Com o conteúdo de referência: `total = 916`, `gap ≈ 43,3`.

Cada seção declara sua altura natural; a sobra vira espaço igual entre elas. Quando um rótulo cresce ou entra uma linha, o layout se acomoda em vez de quebrar.

O `MIN_GAP` (16) é o piso: abaixo dele o conteúdo não caberia. Como o texto livre é limitado por caracteres (INF37) e a peça tem número fixo de linhas, **isso não é alcançável pela UI** — o `MIN_GAP` existe como **assertiva de teste** (o caso "gordo" de `tests/informativo-mercado.test.js` prova que o pior conteúdo possível ainda cabe), não como comportamento de tela.

### 5.8 Blocos

**Barra de título de seção** (as 4): retângulo arredondado raio 14, `BROWN`, altura **56**, de `M` a `W−M`. Texto Poppins 600, 30px, tracking 2,5, `WHITE`, centrado.

**Faixa de safra/ano**: altura **46**, `GREEN`, texto Poppins 600, 28px, tracking 2, `WHITE`, centrado. Nas seções de 2 colunas, duas faixas lado a lado com sulco de 4px no meio (`mid = W/2`).

| Seção  | Altura natural   | Linhas                                                                                                                                                       |
| ------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Resumo | `56 + 3×76`      | linha h=76, fundo alternado `CANVAS`/`WHITE`, borda `BORDER`. Rótulo: Poppins 600 29px `BROWN` em `x=M+32`. Valor: Poppins 700 36px à direita em `x=W−M−32`. |
| Físico | `56 + 46 + 96`   | faixa da safra + linha h=96. Rótulo: Poppins 600 31px `BROWN`. Preço: **Poppins 700 52px `GREEN`** (o herói da peça).                                        |
| Futuro | `56 + 46 + 2×74` | 2 faixas de ano + 2 linhas h=74 × 2 colunas. Mês: Poppins 600 27px `MUTED` à esquerda. Preço: Poppins 700 34px `BROWN` à direita.                            |
| CPR    | `56 + 46 + 82`   | 2 faixas de ano + 1 linha h=82 × 2 colunas. Valor: Poppins 700 42px `BROWN`, centrado.                                                                       |

**Variação (INF10)**: valor em `RED` (negativa) e **seta em polígono** à esquerda do valor — tamanho 24, a 28px do início do texto. Triângulo para baixo se negativa, para cima se positiva.

### 5.9 Rodapé

Faixa `GREEN` de **`FB=1618`** até `y=1920` (sangra até a base). É da **casca** — vale para as duas peças.

- **Ícones de contato (INF57)**: Instagram · envelope · telefone, caixa de **24px** em `x = M+8`, centrados na linha de texto. Traço `FOOTER_TX`, `strokeWidth 2` (em unidades do viewBox 24×24, escala junto como no SVG), `lineCap`/`lineJoin` redondos.
- Contatos: 3 linhas Poppins 400, 25px, `FOOTER_TX`, em **`x = M+8+24+14 = 106`** (abre espaço para o ícone), a partir de `y = FB+52`, passo 38.
- Lockup branco h=72 à direita, `y = FB+62`.

> **Folgas medidas**: o ícone do telefone é o item mais baixo da peça — termina em `y=1758`, a **2px** do `SAFE_BOT`. É a mesma margem do texto que ele acompanha. O texto mais longo (o e-mail) termina em `x≈519` e o logo do rodapé começa em `x=786` — 267px de sobra.

**Os ícones são `PathOp`, não fonte nem PNG.** Fonte cairia em fallback (a Poppins não tem esses glifos — mesmo motivo da seta da variação, INF10); PNG borraria em 1080 (mesmo motivo da saca, INF9). O `PathOp` recebe sub-paths de um viewBox 24×24 — a convenção de ícone do app (Lucide) — e o desenhador aplica `translate` + `scale` + `Path2D`. Serve para qualquer ícone futuro na peça.

## 5-B. Especificação visual — Informativo Meteorológico

> Peça irmã: **tudo do §5 vale**, exceto o que está aqui. Formato, zona segura, paleta, tipografia, pílula e rodapé são os mesmos, e são emitidos pela mesma casca (`lib/informativos/story-layout.ts`).

### 5-B.1 Header (INF47)

Idêntico ao H3, com duas diferenças: o kicker é `INFORMATIVO` (sem o "DE") e o título é `METEOROLÓGICO` a **60px**, começando em `y=282`.

**Por que 60 e não 86**: a 86px a palavra pediria ~538px de largura e só existem ~568px à direita do logo — passaria sem folga nenhuma. A 60px o bloco fecha em `y=342`, na mesma base ótica do `MERCADO`. Em `y=256` (o default) um título de 60px terminaria em 316 e flutuaria alto.

> ⚠️ A folga de ~30px contra o logo é **fina**, e o stub de medida dos testes documenta o orçamento mas **não prova a métrica real da Poppins** — a prova é a conferência visual. Plano B, se apertar: `tracking: 0` devolve ~24px, ou cair para 56px.

### 5-B.2 Corpo — 3 seções

Faixa útil `BODY_BOTTOM − BODY_TOP = 1592 − 546 = 1046`.

| #   | Seção                 | Altura  | Composição                         |
| --- | --------------------- | ------- | ---------------------------------- |
| 1   | Temperatura / Umidade | **152** | `2 × 76` — **sem barra de título** |
| 2   | `REGISTRO EM 24h`     | **284** | `SH 56 + 3 × 76`                   |
| 3   | `PREVISÃO DO TEMPO`   | **516** | `SH 56 + PANEL_H 460`              |
|     | **Σ 952**             |         | **gap = (1046 − 952) / 2 = 47**    |

O Mercado tem gap 43,3 — irmãs, não gêmeas. Linhas: rótulo Poppins 600/29 `BROWN` à esquerda (`x = M+32`), valor Poppins **700/36** `BROWN` à direita (`x = W−M−32`). **Sem herói** (INF48).

### 5-B.3 O painel da previsão

| Item            | Valor                                       |
| --------------- | ------------------------------------------- |
| Retângulo       | `(60, 1132)`, **960 × 460**, raio **14**    |
| Fundo / borda   | `WHITE` / `BORDER` 1px                      |
| Padding interno | **12** (`PREVISAO_PAD`)                     |
| Encaixe         | `fitContain` — imagem inteira, centralizada |

- **Altura FIXA** (INF49): o layout **não flexiona** com a proporção do print. Honra o P2 — o leitor acha o dado no mesmo lugar todo dia. A sobra fica invisível porque o print do MSN tem fundo branco.
- **O painel é emitido SEMPRE**, com ou sem print. É ele que segura a altura. Há teste provando que a peça sem print tem `sectionHeights` e `gap` idênticos à peça com print.
- **Amplia sem trava** (INF50): print menor que o painel é ampliado, e o borrão é aceito — decisão explícita do usuário, que preferiu o campo cheio a uma imagem pequena e nítida. Há teste cercando isso contra um "conserto" futuro.
- **O padding dispensa um `clip()`**: num canto de raio `R`, um ponto a `(p,p)` do vértice só fica dentro do arco se `p ≥ R(1 − 1/√2) ≈ 0,293R`. Com `R=14` → `p ≥ 4,1px`; os 12 dão 3× a folga, e o desenhador continua burro. Há teste com a assertiva `imgRect ⊂ inset(panel, PREVISAO_PAD)`.
- O painel termina em `y=1592`, **168px dentro do `SAFE_BOT`**.

## 6. Campos — fixos vs. editáveis (Q-C1 resolvida em 2026-07-16)

> Convenção: **✏️ editável** = o usuário preenche. **🔒 fixo** = está no layout, não aparece no modal. **🤖 automático** = o sistema resolve sozinho.
>
> **Regra transversal (INF19)**: o usuário digita **só o número**; o sistema veste a unidade e a formatação. `292,65` → `292,65 Usc/lp`; `5,2303` → `5,2303 R$/US$`; `1960` → `R$ 1.960,00`. Nenhuma unidade, símbolo de moeda, separador de milhar ou vírgula decimal é digitado. É esta regra que fecha a classe de erro do §1 (`R$ 1690,00,00`).

### 6.1 Cabeçalho e rodapé

| Elemento                           | Status                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------- |
| Logo, `INFORMATIVO DE`, `MERCADO`  | 🔒 fixo                                                                 |
| **Data** (pílula)                  | 🤖 **automática — dia de hoje** (INF17). Formato `25 DE MARÇO DE 2026`. |
| Rodapé (@, e-mail, telefone, logo) | 🔒 fixo                                                                 |
| Barras de título das 4 seções      | 🔒 fixo (INF26)                                                         |

### 6.2 Resumo do mercado

| Linha    | Rótulo (esquerda)                            | Valor (direita)                                                   |
| -------- | -------------------------------------------- | ----------------------------------------------------------------- |
| Bolsa NY | ✏️ **texto livre**, o rótulo inteiro (INF18) | ✏️ numérico → veste `Usc/lp`                                      |
| Variação | 🔒 `VARIAÇÃO`                                | ✏️ **direção (▲alta / ▼baixa) + magnitude** → veste `pts` (INF20) |
| Dólar    | 🔒 `DÓLAR`                                   | ✏️ numérico → veste `R$/US$`                                      |

- **Bolsa NY (INF18)**: um campo só, contendo mês e ano (`Bolsa NY - mai/26`). O layout **normaliza para caixa alta**, para não destoar de `VARIAÇÃO`/`DÓLAR` ao lado.
- **Variação (INF20)**: a direção é um **botão**, não é derivada do sinal digitado. O valor é a **magnitude** — não aceita sinal, o que torna impossível o estado contraditório "baixa + `+20`". Da direção saem três coisas: a seta (▲/▼), o sinal exibido (**o menos continua aparecendo**: `▼ -20 pts`) e a **cor do valor e da seta** (`RED` na baixa, `GREEN_L` na alta — Q-C5).

### 6.3 Mercado físico — preço livre

| Elemento            | Status                              |
| ------------------- | ----------------------------------- |
| Faixa `SAFRA 25/26` | 🔒 `SAFRA` + ✏️ `25/26` (INF22)     |
| `CAFÉ TIPO 6/7`     | 🔒 fixo                             |
| Preço               | ✏️ numérico → veste formato de real |

### 6.4 Mercado futuro — preço livre

| Elemento          | Status                                   |
| ----------------- | ---------------------------------------- |
| Faixas de ano (2) | ✏️ editáveis                             |
| Meses (**4**)     | ✏️ editáveis — **um por célula** (INF23) |
| Preços (4)        | ✏️ numéricos → vestem formato de real    |

**Por que 4 meses e não 2 (INF23)**: a coluna esquerda é de um ano e a direita de outro. Ainda que hoje os dois anos cotem os mesmos meses, são cotações independentes e podem divergir.

### 6.5 CPR — mercado futuro

| Elemento          | Status                                |
| ----------------- | ------------------------------------- |
| Faixas de ano (2) | ✏️ editáveis                          |
| Valores (2)       | ✏️ numéricos → vestem formato de real |

A CPR **permanece uma seção separada** do Mercado Futuro (INF24, resolve a Q-C2).

### 6.6 Totais e consequência

**21 controles** por informativo: 5 no resumo, 2 no físico, 10 no futuro, 4 na CPR. Nenhum campo de data (automática).

Isso é bastante digitação para uma peça diária — e é o que sustenta a **INF25/INF36** (pré-preencher os campos lentos). Na prática o que muda todo dia é dólar, bolsa, variação e preços; anos, meses, safra e o rótulo da bolsa ficam parados por semanas.

**Divisão do pré-preenchimento (INF36)** — implementada em `lib/informativos/slow-fields-store.ts`:

| Grupo           | Campos                                                           | Comportamento                          |
| --------------- | ---------------------------------------------------------------- | -------------------------------------- |
| **Lentos** (10) | rótulo da Bolsa NY, safra, 4 anos, 4 meses                       | vêm da última geração (`localStorage`) |
| **Do dia** (11) | valor da bolsa, direção + magnitude da variação, dólar, 6 preços | **sempre em branco**                   |

Os anos são **4 controles**, não 2 (INF26): as duas seções são independentes e podem divergir.

### 6.7 Meteorológico — campos

Todos os rótulos são 🔒 fixos (`TEMPERATURA`, `UMIDADE RELATIVA DO AR`, `REGISTRO EM 24h`, `MÁXIMA`, `MÍNIMA`, `PLUVIOSIDADE`, `PREVISÃO DO TEMPO`). A **data é 🤖 automática**, igual ao Mercado.

| Campo            | Casas       | Sinal       | Veste |
| ---------------- | ----------- | ----------- | ----- |
| Temperatura      | 1           | ✅ negativo | `°C`  |
| Umidade do ar    | 0 (inteiro) | —           | `%`   |
| Máxima           | 1           | ✅ negativo | `°C`  |
| Mínima           | 1           | ✅ negativo | `°C`  |
| Pluviosidade     | 1           | —           | `mm`  |
| Previsão (print) | —           | —           | —     |

**São 6 controles** — e **nenhum é "lento"**: todos mudam todo dia, então o meteorológico não usa `localStorage`.

**Negativo (INF51)** — o `maskDecimalInput` do `lib/currency.ts` roda `onlyDigits` (`/\D+/g`) e **come o sinal**: mínima negativa era impossível de digitar, e numa manhã de geada no Sul de Minas a peça publicaria `1,5 °C` no lugar de `-1,5 °C` — erro de **informação**, não de layout. O `currency.ts` **não foi tocado** (é compartilhado com os contratos e cercado por `tests/currency.test.js`); o sinal é tratado por fora, no `maskDecimalSigned` do `format.ts`. Duas sutilezas que só aparecem digitando:

- lê **só o `-` inicial** — `includes('-')` tornaria `3-5` negativo;
- devolve `'-'` sozinho enquanto não há dígito, senão o sinal sumiria no instante em que fosse teclado. Esse `-` em trânsito conta como **campo vazio** (`isBlankNumber`), e é o que o `missingMeteo` usa.

Umidade e pluviosidade **não aceitam sinal** — não existem negativas.

## 7. UX do modal

Implementado em `components/informe/InformativoFormSheet.tsx` + `InformativoForm.tsx`.

- Aberto pela 3ª opção do leque do FAB, rótulo **"Informativo"** (INF31).
- **BottomSheet** (skill `modals`: ação com formulário → BottomSheet), classe `is-informe is-informativo`. No desktop o CSS global já converte todo `.bottom-sheet` em modal centrado de até 650px.
- **Três fases (INF53)**, com o título do sheet mudando em cada uma (o `.bottom-sheet-title` já tem `aria-live="polite"`, então a troca é anunciada de graça):

| Fase      | Título                      | Ações (no **footer** do BottomSheet — INF54)       |
| --------- | --------------------------- | -------------------------------------------------- |
| `mercado` | "Informativo de mercado"    | `Continuar`                                        |
| `meteo`   | "Informativo meteorológico" | `Pular` · `Revisar`                                |
| `revisao` | "Revisar e baixar"          | `Voltar` · `Baixar os dois` / `Baixar informativo` |

- **Voltar de fase não perde nada**: trocar de fase mexe só no campo `phase` do draft; nenhum campo é desmontado. Cercado por teste.
- **Descarte confirmado** ao fechar com campos preenchidos (INF41), via `onDismissAttempt` do BottomSheet. Considera também o print colado.
- Ao entregar: fecha + toast, no singular ou plural conforme o número de peças (INF42). **Cancelar** o compartilhamento mantém o sheet aberto.
- Inputs seguem a convenção do repo: `type="text"` + `inputMode`, nunca `type="number"`. Os de temperatura usam `inputMode="text"` (e não `numeric`) porque precisam do `−`.

> O tingimento verde/vermelho do toggle de direção é **estado persistente**, não feedback de toque — a mesma exceção que o `.inf-pill` já documenta no `globals.css` (skill `button-press-effect` §9). O `:active` continua só com `transform`.

## 8. Acesso e papéis

**Todo papel não-PROSPECTOR** (`INFORME_ROLES = NON_PROSPECTOR_ROLES`, ver `app/relatorios/page.tsx`) — a mesma regra da página (INF30). A proposta de restringir a ADMIN+COMMERCIAL como o Semanal foi descartada.

> **Consequência no leque (INF30)**: o `InformeCreateRadialFab` tinha um atalho — `if (!canCreateWeekly) { onCreateVisit(); return; }` — que abria a visita direto, porque sem o Semanal só sobrava uma opção. Com o Informativo liberado a todos, o leque sempre tem ≥2 opções e o atalho saiu. **Isso obrigou a tornar explícita a condição de exibir o Semanal**: era o próprio atalho que escondia a opção de quem não é autor (o leque nem abria). Sem a condição, um CLASSIFIER veria um botão que o backend recusa com 403.

## 9. Arquitetura técnica

**Renderização client-side em `<canvas>` (INF13)**, sem rota de API.

Justificativa:

- Nada é salvo (P1) — um round-trip ao servidor não compraria nada.
- A PWA já carrega a Poppins; o canvas usa a fonte já resolvida pelo navegador.
- **Evita o problema de fontes no servidor**: o repo não tem rasterizador de imagem em runtime (só `sharp`, e nenhum canvas/satori/resvg). Rasterizar no Cloud Run exigiria instalar a Poppins na imagem e depender do fontconfig — risco desnecessário.
- Custo zero: nada de CPU de servidor por peça gerada.

Fatos do repo que sustentam a escolha (verificados em 2026-07-16):

- PDFs (contrato, espelho, laudo) são desenhados à mão com **`pdf-lib`** + `StandardFonts` (Helvetica) — **não** usam Poppins e **não** servem de molde aqui.
- **`sharp`** é a única lib raster, e só em pipeline de foto/tooling de build.
- Download de arquivo já tem caminho pronto: **`lib/share-blob.ts`** (`shareOrDownloadFile`, com Web Share API e fallback de âncora).

### 9.1 Módulos (implementados)

**A casca é comum e o tipo entra como layout + campos** (P5, pago pela INF44). O eixo é `story-*` (comum) vs. `mercado-*` / `meteo-*` (por tipo).

| Arquivo                                              | Papel                                                                                                                                                                                  |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/informativos/story-layout.ts`                   | **Puro, sem canvas.** A casca: geometria, paleta, tipos de op, `textExtent`, os emissores `push*` (fundo/header/pílula/rodapé/barra/faixa/célula), `distribute`, `fitContain`/`inset`. |
| `lib/informativos/story-draw.ts`                     | O motor genérico: `drawStory(ctx, build, assets)`, `resolveFontFamily`, `makeMeasure`, `loadLogo`. Não conhece tipo nenhum.                                                            |
| `lib/informativos/mercado-layout.ts`                 | `MercadoData` + `buildMercadoLayout` — só o corpo das 4 seções.                                                                                                                        |
| `lib/informativos/meteo-layout.ts`                   | `MeteoData` + `buildMeteoLayout` — as 3 seções + o painel do print.                                                                                                                    |
| `lib/informativos/mercado-draw.ts` / `meteo-draw.ts` | Uma linha cada, amarrando o builder ao `drawStory`.                                                                                                                                    |
| `lib/informativos/informativo-draft.ts`              | **Puro.** Reducer das 3 fases + seletores (`missingMercado`, `missingMeteo`, `isDraftDirty`, `toMercadoData`, `toMeteoData`). Molde: `lib/samples/samples-list-reducer.ts`.            |
| `lib/informativos/format.ts`                         | A regra INF19 ("veste a unidade"), as máscaras e o `maskDecimalSigned` (INF51).                                                                                                        |
| `lib/informativos/use-previsao-image.ts`             | Recebe o print: objectURL + `decode()` + `revoke`.                                                                                                                                     |
| `lib/informativos/use-story-canvas.ts`               | Pinta uma peça quando ela aparece (fonte → logo → flag de cancelamento).                                                                                                               |
| `lib/informativos/slow-fields-store.ts`              | Pré-preenchimento do **Mercado** (INF36) em `localStorage`. O meteorológico não tem campo lento.                                                                                       |
| `lib/date-br.ts`                                     | `formatDateExtensoLocal` / `formatDateIsoLocal` — relógio **local**.                                                                                                                   |

Componentes: `InformativoFormSheet` (dono do estado, das canvases e do footer) → `InformativoForm` (roteador de fase) → `InformativoMercadoFields` / `InformativoMeteoFields` (+ `PrevisaoPicker`) / `InformativoRevisao`.

A separação layout↔draw existe para que a geometria (a parte com regra) seja testável **sem navegador**: o `measure` é injetado, e os testes passam um stub determinístico. Pelo mesmo motivo, `MeteoData` carrega as **dimensões** do print, não o `HTMLImageElement` — o encaixe roda em node. Não é exceção: o layout já era dono da geometria de imagem (o logo tem `LOGO_RATIO` e o layout deriva a largura).

### 9.2 Gotchas descobertos na implementação

- **Nome da fonte (`story-draw.ts`)**: o `next/font` self-hospeda a Poppins com um nome de família **hasheado** (`__Poppins_a1b2c3`). `ctx.font = '700 86px Poppins'` cairia num fallback **silenciosamente**. O `resolveFontFamily()` lê a CSS var `--font-family-sans`, que é o único lugar onde o nome real existe.
- **`await document.fonts.ready`** antes do primeiro desenho: sem isso a peça sai na fonte de fallback e troca de cara ao redesenhar. Encapsulado no `useStoryCanvas`.
- **`await img.decode()`** no logo: sem isso o primeiro desenho sai sem ele. O `loadLogo` memoiza **só o sucesso** — guardar a promise rejeitada cachearia a falha para sempre.
- **`devicePixelRatio` ignorado**: o alvo é o arquivo (1080×1920 exatos), não a tela — a exibição é escalada por CSS.
- **Máscara de 4 casas**: `maskCurrencyInput` era fixa em 2 casas e truncaria o dólar para `5,23`. Generalizada em `maskDecimalInput(value, decimals)` — API e comportamento preservados, guardados por `tests/currency.test.js`.
- **O `onlyDigits` come o sinal** (INF51) — ver §6.7.
- **objectURL NÃO contamina o canvas**: é de mesma origem, então o `toBlob()` continua funcionando. Era o risco que uma imagem de CDN externo traria (e o motivo de os ícones de uma API de meteorologia serem um problema, além dos 64px).
- **Magic bytes não se aplica ao print**: a regra 5 do CLAUDE.md amarra a validação a `src/uploads/`, onde a fronteira é o **servidor** e o arquivo é **persistido**. Aqui nada cruza o fio (P1). O `img.decode()` é, de todo modo, um gate **mais forte** — um header PNG válido com corpo corrompido passa no magic bytes e falha no decode.
- **Arquivo solto fora da caixa = perda total**: o default do browser é **navegar até o arquivo** — o PNG abriria e os 21 campos evaporariam. O `PrevisaoPicker` recusa `dragover`/`drop` no `window` enquanto vive.
- **Prova da refatoração da casca**: a extração foi verificada construindo o layout com o código de `HEAD` e com o refatorado e comparando **op a op, incluindo a ordem** (que é z-order), em 3 cenários — 177 operações idênticas. Os testes só cobrem o eixo vertical; não teriam pego uma cor ou um `x` trocado.

### 9.3 Reuso

`lib/currency.ts` (máscaras), `lib/share-blob.ts` (`shareOrDownloadFile` / `shareOrDownloadFiles`), `components/BottomSheet.tsx` (`onDismissAttempt`, `footer`), `lib/samples/samples-list-reducer.ts` (molde do reducer puro), `.inf-choice-grid`/`.inf-pill` (molde do toggle), `.fab-fan-option.is-liga` (a 3ª posição do arco **já existia** — nenhum CSS de arco novo; e o meteorológico é **fase**, não opção do leque, então as 3 posições seguem intactas), `lib/toast/ToastProvider`, `public/logo-safras-branco.png`.

- `canvas.toBlob('image/png')` → `shareOrDownloadFile`.

## 10. Ledger de decisões

| #     | Decisão                                                                                                                                                         | Motivo                                                                                                                                                                                                                                                                                                                                                                                                                     | Data       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| INF1  | O Informativo **gera imagem para download e não persiste nada** — sem banco, sem storage, sem histórico.                                                        | Definição do usuário: "as informações não precisam ser salvas, apenas deve criar e disponibilizar para baixar".                                                                                                                                                                                                                                                                                                            | 2026-07-16 |
| INF2  | Formato de saída: **PNG** (não PDF).                                                                                                                            | Instagram não aceita PDF em post/story; PNG é o que de fato sobe. PDF exigiria conversão manual antes de postar.                                                                                                                                                                                                                                                                                                           | 2026-07-16 |
| INF3  | Enquadramento: **Story 9:16, 1080×1920**. Destino é story, e só story.                                                                                          | Decisão do usuário. Descartados feed 4:5 e A4 (proporção atual).                                                                                                                                                                                                                                                                                                                                                           | 2026-07-16 |
| INF4  | O layout é **redesenhado do zero**; não reusa o PNG de fundo do `.docx`.                                                                                        | Fundo atual tem 657px de largura (ampliar p/ 1080 borra) e chumba safra/anos em imagem. Decisão do usuário: "redesenhe de forma mais organizada e apresentável".                                                                                                                                                                                                                                                           | 2026-07-16 |
| INF5  | Ponto de entrada: **modal em `/relatorios`**.                                                                                                                   | Decisão do usuário; fica junto dos outros artefatos gerados (visita, semanal). Descartados card no dashboard e rota própria.                                                                                                                                                                                                                                                                                               | 2026-07-16 |
| INF6  | Direção visual **"A — claro"**: fundo branco, faixa verde no topo, barras marrons de seção, tabelas claras.                                                     | Decisão do usuário; evolução do template atual — quem já segue reconhece a peça. Descartada a direção "B — escuro".                                                                                                                                                                                                                                                                                                        | 2026-07-16 |
| INF7  | Header **H3 (split editorial)**: lockup completo grande à esquerda + "INFORMATIVO DE / MERCADO" alinhado à direita.                                             | Decisão do usuário. Resolve o campo vazio do header e atende "logo maior". Descartadas H1 (centralizada, logo menor) e H2 (só o ícone, sem wordmark).                                                                                                                                                                                                                                                                      | 2026-07-16 |
| INF8  | **Zona segura do story** obrigatória: conteúdo legível entre `y=180` e `y=1760`; faixas verdes sangram até as bordas.                                           | O Instagram cobre topo e base com a interface dele. No layout anterior o logo (y=50) e o rodapé (y≈1780) caíam embaixo da interface e não apareceriam.                                                                                                                                                                                                                                                                     | 2026-07-16 |
| INF9  | A **saca de café sai** da peça.                                                                                                                                 | Foto de banco com 202×110 nativos, chapada no fundo branco/verde do template. Em 1080 de largura borraria. Reversível se surgir o original em alta (Q-C3).                                                                                                                                                                                                                                                                 | 2026-07-16 |
| INF10 | A **variação ganha cor e seta** (▼ vermelho / ▲ verde), com a seta **desenhada como polígono**, não como caractere.                                             | A direção é a informação mais escaneável de um informativo de mercado (hoje é texto preto igual ao resto). Polígono porque a Poppins não tem os glifos ▲▼ — viraria fallback de fonte, inconsistente entre máquinas.                                                                                                                                                                                                       | 2026-07-16 |
| INF11 | **Safra e anos viram campos** (`SAFRA 25/26`, `2026`, `2027`), deixando de ser imagem chumbada.                                                                 | Consequência do INF4; os rótulos envelheciam dentro do PNG.                                                                                                                                                                                                                                                                                                                                                                | 2026-07-16 |
| INF12 | O corpo **se auto-distribui**: mede a altura natural das seções e reparte a sobra em espaços iguais.                                                            | O layout se acomoda quando um rótulo cresce ou entra uma linha, em vez de quebrar. Altura é o recurso escasso do story.                                                                                                                                                                                                                                                                                                    | 2026-07-16 |
| INF13 | Renderização **client-side em `<canvas>`**, sem rota de API.                                                                                                    | Nada é salvo (P1); a PWA já carrega a Poppins; evita instalar fonte na imagem do Cloud Run e depender do fontconfig; custo zero de servidor.                                                                                                                                                                                                                                                                               | 2026-07-16 |
| INF14 | Tipografia **Poppins** 400/500/600/700 — a mesma da PWA, via `next/font`.                                                                                       | Coerência com o app e zero arquivo de fonte novo no repo.                                                                                                                                                                                                                                                                                                                                                                  | 2026-07-16 |
| INF15 | Paleta **amostrada do template atual** (`#0E520B`, `#186D14`, `#383223`, branco).                                                                               | Preserva a identidade da peça que já circula.                                                                                                                                                                                                                                                                                                                                                                              | 2026-07-16 |
| INF16 | A feature nasce **plural — "Informativos"**, com o de Mercado como primeiro tipo; casca comum e layout por tipo.                                                | O usuário anunciou um segundo tipo; a pasta de origem já contém um "Informativo meteorológico". Evita refatorar a casca depois.                                                                                                                                                                                                                                                                                            | 2026-07-16 |
| INF17 | **Data é automática — o dia de hoje**; não é campo. Formato `25 DE MARÇO DE 2026`.                                                                              | Decisão do usuário. Vem do relógio **local do navegador** (consequência do INF13): no servidor viria em UTC e viraria o dia às 21h, publicando a data errada à noite.                                                                                                                                                                                                                                                      | 2026-07-16 |
| INF18 | `BOLSA NY — MAI/26` é **um campo de texto livre** com o rótulo inteiro; o layout normaliza para **caixa alta**.                                                 | Decisão do usuário: como o rótulo carrega mês e ano, é mais seguro digitar tudo do que compor de partes. Caixa alta automática evita destoar do `VARIAÇÃO`/`DÓLAR` ao lado.                                                                                                                                                                                                                                                | 2026-07-16 |
| INF19 | **O usuário digita só o número; o sistema veste a unidade e a formatação** (`Usc/lp`, `pts`, `R$/US$`, formato real).                                           | Decisão do usuário. Fecha a classe de erro do `.docx` (`R$ 1690,00,00` do §1): separador de milhar, vírgula decimal e unidade deixam de ser digitáveis, logo deixam de ser erráveis.                                                                                                                                                                                                                                       | 2026-07-16 |
| INF20 | Variação: **botão de direção (▲alta/▼baixa) + magnitude**. A direção define seta, sinal exibido e **cor do valor**; o menos continua aparecendo (`▼ -20 pts`).  | Decisão do usuário. Direção explícita (em vez de derivada do sinal) impede o estado contraditório "baixa + `+20`", já que o campo não aceita sinal. Substitui a hipótese de derivar a seta do sinal (§6 original).                                                                                                                                                                                                         | 2026-07-16 |
| INF21 | Rótulos `VARIAÇÃO`, `DÓLAR`, `CAFÉ TIPO 6/7`, as 4 barras de título e o rodapé são **fixos**.                                                                   | Decisão do usuário, tabela a tabela. Não mudaram em nenhum material analisado.                                                                                                                                                                                                                                                                                                                                             | 2026-07-16 |
| INF22 | Na faixa da safra, **`SAFRA` é fixo** e só `25/26` é campo.                                                                                                     | Decisão do usuário; a palavra nunca muda. Diverge conscientemente do INF18 (onde o rótulo inteiro é digitado), porque ali o mês/ano está embutido no meio do texto.                                                                                                                                                                                                                                                        | 2026-07-16 |
| INF23 | Mercado Futuro tem **4 campos de mês** (um por célula), não 2 compartilhados entre as colunas.                                                                  | Decisão do usuário: a coluna esquerda é de um ano e a direita de outro — são cotações independentes e podem divergir, ainda que hoje coincidam.                                                                                                                                                                                                                                                                            | 2026-07-16 |
| INF24 | A **CPR permanece uma seção separada** do Mercado Futuro, com suas próprias faixas de ano.                                                                      | Decisão do usuário (resolve Q-C2). CPR é outro produto; fundir as tabelas economizaria ~184px de altura mas comunicaria algo errado.                                                                                                                                                                                                                                                                                       | 2026-07-16 |
| INF25 | **Pré-preencher a partir da última geração** é aceito em princípio; os campos pré-preenchidos seguem **editáveis**.                                             | Decisão do usuário (resolve Q-U2 no mérito). São 21 controles por peça diária, e a maioria (anos, meses, safra, rótulo da bolsa) fica parada por semanas. **Quais** campos entram fica para depois.                                                                                                                                                                                                                        | 2026-07-16 |
| INF26 | Mercado Futuro e CPR mantêm **4 controles de ano** (2 cada), não um par compartilhado. Resolve a Q-C4.                                                          | Decisão do usuário: os anos podem divergir entre as duas seções. Descartada a proposta de um par único alimentar as duas.                                                                                                                                                                                                                                                                                                  | 2026-07-16 |
| INF27 | Verde da **alta = `#186D14`** (o `GREEN_L`). Resolve a Q-C5.                                                                                                    | Decisão do usuário. É o verde da pílula do template original, que tinha ficado reservado sem uso no layout novo — mantém a cor dentro da paleta da marca e distinta do `GREEN` das faixas.                                                                                                                                                                                                                                 | 2026-07-16 |
| INF28 | **Todos os campos são obrigatórios** (resolve a Q-C6).                                                                                                          | Decisão do usuário. A peça não vai ao ar com célula vazia.                                                                                                                                                                                                                                                                                                                                                                 | 2026-07-16 |
| INF29 | Dispositivo: **os dois** — compartilhar no celular, baixar no PC.                                                                                               | Decisão do usuário. O `shareOrDownloadFile` já faz o fallback sozinho, então cobrir os dois custou quase nada. No celular o share sheet leva direto ao Instagram, sem passar por arquivo.                                                                                                                                                                                                                                  | 2026-07-16 |
| INF30 | Acesso: **todo não-PROSPECTOR** (`INFORME_ROLES`) — igual à própria página. Resolve a Q-A1.                                                                     | Decisão do usuário, sobre a proposta de restringir a ADMIN+COMMERCIAL como o Semanal. **Consequência**: o atalho `!canCreateWeekly → abre a visita direto` teve de sair (o leque agora sempre tem ≥2 opções), e a condição de exibir o Semanal virou explícita.                                                                                                                                                            | 2026-07-16 |
| INF31 | Entrada: **3ª opção do leque do FAB**, rótulo **"Informativo"**, na posição diagonal do arco (`.is-liga`). Resolve a Q-U1.                                      | Decisão do usuário: mesmo gesto de criar que já se usa. A posição diagonal já existia no CSS (usada pelo FAB de /samples) — nenhum CSS de arco novo.                                                                                                                                                                                                                                                                       | 2026-07-16 |
| INF32 | Modal em **2 etapas**: preencher → prévia + baixar.                                                                                                             | Decisão do usuário. 21 campos + uma prévia 9:16 não cabem numa tela só (no desktop o sheet é capado em 650px × `min(88dvh,44rem)`); em duas etapas a prévia fica grande o bastante para julgar.                                                                                                                                                                                                                            | 2026-07-16 |
| INF33 | **Casas decimais fixas por campo**: bolsa 2 (`292,65`), **dólar 4** (`5,2303`), variação inteiro, preços 2 — com máscara ao digitar.                            | Decisão do usuário. O dólar de 4 casas é o motivo de generalizar a máscara do `lib/currency.ts`: `maskCurrencyInput` era fixa em 2 casas e truncaria para `5,23`.                                                                                                                                                                                                                                                          | 2026-07-16 |
| INF34 | Os 4 meses do Mercado Futuro são **texto livre** (o layout força a caixa alta).                                                                                 | Decisão do usuário sobre a alternativa de uma lista JAN..DEZ. Como o mês é campo "lento" (INF36), na prática é digitado uma vez e fica.                                                                                                                                                                                                                                                                                    | 2026-07-16 |
| INF35 | A **data é travada em hoje**, sem edição.                                                                                                                       | Decisão do usuário. Confirma a INF17: um campo a menos e impossível publicar com data errada. Descartado "hoje por padrão, mas editável".                                                                                                                                                                                                                                                                                  | 2026-07-16 |
| INF36 | Pré-preenche **só os campos "lentos"** (anos, meses, safra, rótulo da Bolsa NY). Os valores do dia (dólar, bolsa, variação, preços) abrem **sempre em branco**. | Decisão do usuário. Detalha a INF25 e resolve o mérito da Q-U2. Publicar o dólar de ontem como o de hoje é problema de credibilidade — o campo em branco torna o erro impossível por distração.                                                                                                                                                                                                                            | 2026-07-16 |
| INF37 | Texto longo: **limite de caracteres**, sem encolher a fonte (resolve Q-U3).                                                                                     | Decisão do usuário. A peça sai idêntica todo dia (P2); o rótulo quase não varia (só o mês). Auto-shrink faria a peça mudar de aparência conforme o texto.                                                                                                                                                                                                                                                                  | 2026-07-16 |
| INF38 | **Variação zero não é tratada** — se acontecer, escolhe-se uma direção.                                                                                         | Decisão do usuário: não acontece na prática. Se um dia acontecer, sai `▲ +0 pts` e a gente resolve.                                                                                                                                                                                                                                                                                                                        | 2026-07-16 |
| INF39 | Safra com **máscara `NN/NN`**: digita `2526`, vira `25/26`.                                                                                                     | Decisão do usuário. Mesmo estilo das máscaras que o app já usa (CPF, telefone, moeda). Impossível sair do padrão.                                                                                                                                                                                                                                                                                                          | 2026-07-16 |
| INF40 | Na alta o **sinal de mais aparece**: `▲ +20 pts`.                                                                                                               | Decisão do usuário. Convenção de informativo de mercado e simétrico com o dia de baixa, que leva o menos.                                                                                                                                                                                                                                                                                                                  | 2026-07-16 |
| INF41 | **Confirma o descarte** ao fechar com campos preenchidos.                                                                                                       | Decisão do usuário. Mesmo padrão da Visita e do Semanal; são 21 campos digitados e o P1 não protege nada.                                                                                                                                                                                                                                                                                                                  | 2026-07-16 |
| INF42 | Após entregar a peça: **fecha o sheet + toast** "Informativo gerado". Compartilhamento **cancelado** → o sheet fica aberto.                                     | Decisão do usuário. O `cancelled` do `shareOrDownloadFile` não é erro nem sucesso — quem cancelou não quer perder os 21 campos.                                                                                                                                                                                                                                                                                            | 2026-07-16 |
| INF43 | Nome do arquivo: **`informativo-mercado-AAAA-MM-DD.png`** (data ISO).                                                                                           | Ordena cronologicamente na pasta; sem espaço nem acento. Descartado o formato BR (a pasta ordenaria todo dia 16 junto) e o nome sem data (viraria "(1)", "(2)").                                                                                                                                                                                                                                                           | 2026-07-16 |
| INF44 | O 2º tipo é o **Informativo Meteorológico** (resolve a Q-F1). Casca comum extraída **antes** dele (paga o P5).                                                  | Confirmado pelo usuário. O P5 era promessa do documento, não do código: header/pílula/rodapé viviam dentro do `buildMercadoLayout`. A extração foi provada op a op contra o código anterior (§9.2).                                                                                                                                                                                                                        | 2026-07-16 |
| INF45 | A previsão é um **print colado**, não uma API de meteorologia.                                                                                                  | Decisão do usuário após avaliação (§4.3): as fontes oficiais BR estão mortas (INMET derruba a conexão, CPTEC devolve tudo `null`) e os 7 dias com licença comercial custam $7–$29/mês. O print custa zero, sem chave/rota/segredo/uptime, e não diverge do que os seguidores veem.                                                                                                                                         | 2026-07-16 |
| INF46 | Data **por extenso** no meteorológico, unificando com o Mercado.                                                                                                | Decisão do usuário. A peça original usava `16/07/2026`; o par lido em sequência precisa da mesma pílula.                                                                                                                                                                                                                                                                                                                   | 2026-07-16 |
| INF47 | `METEOROLÓGICO` renderiza a **60px** (contra os 86 de `MERCADO`), em `y=282`.                                                                                   | A 86px a palavra pediria ~538px e só há ~568 à direita do logo. A folga de ~30px é fina e o stub dos testes **não prova** a métrica real da Poppins — a prova é visual. Plano B: `tracking: 0` (+24px) ou 56px.                                                                                                                                                                                                            | 2026-07-16 |
| INF48 | O meteorológico **não tem valor herói**: os 5 números saem a 36px.                                                                                              | Decisão do usuário: fiel ao original, onde todos os valores têm o mesmo peso. Descartado destacar a temperatura a 52px verde como o preço físico do Mercado.                                                                                                                                                                                                                                                               | 2026-07-16 |
| INF49 | O print entra num **painel branco de altura FIXA** (960×460, raio 14), contido inteiro e centralizado; o layout **não flexiona**.                               | Decisão do usuário. Honra o P2 (o leitor acha o dado no mesmo lugar todo dia) sem cortar nem distorcer a imagem. Só funciona por uma coincidência: o print do MSN tem fundo branco, então a sobra fica invisível. Raio 14 = o da barra de seção (as células são quadradas).                                                                                                                                                | 2026-07-16 |
| INF50 | O print **amplia sem trava** quando é menor que o painel; o borrão é aceito.                                                                                    | Decisão explícita do usuário, que recusou tanto bloquear quanto manter nítido-e-menor: prefere o campo cheio. Ele recorta só a linha da previsão na ferramenta de captura, então o print chega largo — daí também **não haver recortador embutido**.                                                                                                                                                                       | 2026-07-16 |
| INF51 | Temperaturas **aceitam o `−` digitado**; umidade e pluviosidade não.                                                                                            | Decisão do usuário. O `maskDecimalInput` come o sinal, e mínima negativa era impossível: numa manhã de geada a peça publicaria `1,5 °C` no lugar de `-1,5 °C`. O `lib/currency.ts` não foi tocado (compartilhado com contratos, com teste próprio) — sinal por fora.                                                                                                                                                       | 2026-07-16 |
| INF52 | Entrada do print por **colar (Ctrl+V), arrastar e escolher arquivo** — os três.                                                                                 | Cada um é o caminho curto de um contexto: no PC vira `Win+Shift+S` → `Ctrl+V` (o hábito atual do usuário); no celular o seletor abre a galeria. São poucas linhas e cobrem todos os casos.                                                                                                                                                                                                                                 | 2026-07-16 |
| INF53 | Fluxo de **3 fases** (mercado → meteorológico → revisão); o **meteorológico é pulável**, o mercado não. A INF28 passa a valer **por fase**.                     | Decisão do usuário. O mercado é a peça de todo dia; a previsão pode não estar à mão. Quem pula não pode ver os campos do meteorológico em vermelho — daí a INF28 escopada.                                                                                                                                                                                                                                                 | 2026-07-16 |
| INF54 | Revisão com as peças **empilhadas**, rolando, e as ações no **footer** do BottomSheet.                                                                          | Decisão do usuário. Lado a lado, dentro dos 650px do sheet no desktop, cada peça sairia com ~300px e os números ficariam pequenos demais para conferir — que é o que a fase existe para permitir. Footer porque o corpo rola duas peças 9:16.                                                                                                                                                                              | 2026-07-16 |
| INF55 | Cada peça da revisão tem um **"Baixar" próprio**, além do "Baixar os dois".                                                                                     | Não é redundância: cada botão é um gesto, então não dispara o aviso de "vários downloads" do Chrome — que **não tem como ser evitado** por API (é permissão por origem, e não há como detectar a negação). É também a saída quando o iOS recusa os 2 arquivos juntos.                                                                                                                                                      | 2026-07-16 |
| INF56 | O `shareOrDownloadFile` **singular NÃO delega** para o plural, apesar dos gates idênticos.                                                                      | O singular serve o contrato de venda, o laudo e o envio físico de amostra, e o `lib/share-blob.ts` **não tem teste nenhum**. Refatorar às cegas três fluxos de negócio custa mais que a duplicação. Dívida registrada.                                                                                                                                                                                                     | 2026-07-16 |
| INF57 | O rodapé ganha os **ícones de contato** (Instagram, e-mail, telefone), desenhados como **path vetorial**, os três em **traço**.                                 | Reportado pelo usuário: a peça implementada tinha só o texto. Path porque a Poppins não tem os glifos (viraria fallback, INF10) e PNG borraria em 1080 (INF9). Os três em traço **unificam** o original, que misturava — Instagram/envelope de traço e telefone num círculo chapado —, e casam com a linguagem de ícone do app (Lucide, `viewBox 24×24`, sem preenchimento). Vale para as duas peças: o rodapé é da casca. | 2026-07-16 |

## 11. Questões abertas

Cada item resolvido vira decisão INFn no §10.

### Conteúdo

- ~~**Q-C1**~~ — resolvida (2026-07-16) → **INF17–INF25**. O mapa campo a campo está no §6.
- ~~**Q-C2**~~ — resolvida → **INF24** (CPR fica separada).
- **Q-C3** — A saca de café existe em alta resolução? Se sim, volta ao layout (reverte parcialmente INF9). **Única pendência de conteúdo.**
- ~~**Q-C4**~~ — resolvida → **INF26** (4 controles de ano; podem divergir).
- ~~**Q-C5**~~ — resolvida → **INF27** (`#186D14`).
- ~~**Q-C6**~~ — resolvida → **INF28** (todos obrigatórios).

### Funcionais

- ~~**Q-F1**~~ — resolvida (2026-07-16) → **INF44** (é o **meteorológico**). Escopo no §4.2, layout no §5-B, campos no §6.7.

### UX

- ~~**Q-U1**~~ — resolvida → **INF31** (rótulo "Informativo", 3ª opção do leque).
- ~~**Q-U2**~~ — resolvida → **INF25** + **INF36** (pré-preenche só os campos lentos, em `localStorage`).
- ~~**Q-U3**~~ — resolvida → **INF37** (limite de caracteres, sem auto-shrink). O `MIN_GAP` do motor virou assertiva de teste em vez de comportamento de UI.

### Acesso

- ~~**Q-A1**~~ — resolvida → **INF30** (todo não-PROSPECTOR).

## 12. Fases de implementação

| Fase | Escopo                                                                                  | Status                    |
| ---- | --------------------------------------------------------------------------------------- | ------------------------- |
| F1   | Motor: layout puro + draw + formatadores + `date-br` + `currency` generalizado + testes | ✅ 2026-07-16 — `0f7d818` |
| F2   | Modal de 2 etapas: 21 controles, máscaras, prévia, download/share, descarte, toast, CSS | ✅ 2026-07-16 — `0a1cead` |
| F3   | 3ª opção do leque do FAB (`is-liga`) + remoção do atalho do `canCreateWeekly`           | ✅ 2026-07-16 — `100b647` |
| F4   | Pré-preenchimento dos campos lentos em `localStorage`                                   | ✅ 2026-07-16 — `bd89295` |
| F5   | Docs (INF26–INF43) + skill-maintenance                                                  | ✅ 2026-07-16             |
| —    | **`npm run build`**                                                                     | ✅ 2026-07-16 (passou)    |

**Ciclo do 2º tipo (INF44–INF56)**, 2026-07-16:

| Fase | Escopo                                                                                                                                        | Status                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| M1   | Extração da casca do story (`story-layout.ts`) — paga o P5; provada op a op                                                                   | ✅ 2026-07-16 — `20ef08b` |
| M2   | Walker de desenho genérico (`story-draw.ts`) + mapa de assets                                                                                 | ✅ 2026-07-16 — `5e9eb9b` |
| M3   | Motor do meteorológico (`meteo-layout`, `fitContain`, máscara com sinal) + 22 testes                                                          | ✅ 2026-07-16 — `03c14de` |
| M4   | Estado num reducer puro (`informativo-draft.ts`) + 22 testes                                                                                  | ✅ 2026-07-16 — `1369db2` |
| M5   | `shareOrDownloadFiles` (múltiplos arquivos)                                                                                                   | ✅ 2026-07-16 — `f3f2690` |
| M6   | Entrada do print (colar/arrastar/escolher) + `PrevisaoPicker` + campos do meteo                                                               | ✅ 2026-07-16 — `93e3e6e` |
| M7   | Fluxo de 3 fases + revisão + download conjunto + extração dos campos do mercado                                                               | ✅ 2026-07-16 — `9abee1d` |
| M8   | Docs (INF44–INF56) + skill-maintenance                                                                                                        | ✅ 2026-07-16             |
| —    | **Validação visual**: 🖥️ as duas peças (atenção à folga do título de 60px, INF47) · 📱 story de teste (confirma a INF8) · colar um print real | ⏳ **pendente**           |

> Não existe `scripts/preview-informativo.mjs` nos moldes dos `preview-*.mjs` de PDF/etiqueta: aqueles rodam em node, e canvas exige navegador. A prévia da etapa 2 é a superfície de iteração; a geometria é coberta pelos testes puros.

## 13. Validação e testes

Três arquivos, **66 casos**, todos registrados no script `test:unit` do `package.json` — 🔴 **a lista é MANUAL**; sem isso o arquivo passa localmente e **nunca roda no CI**.

| Arquivo                                   | Casos | Alvo                                                   |
| ----------------------------------------- | ----- | ------------------------------------------------------ |
| `tests/informativo-mercado.test.js`       | 19    | `buildMercadoLayout` + `format`                        |
| `tests/informativo-meteorologico.test.js` | 22    | `buildMeteoLayout` + `fitContain` + máscaras com sinal |
| `tests/informativo-draft.test.ts`         | 22    | reducer das 3 fases + seletores                        |

- **Unitário** dos motores: dados de entrada → assertivas sobre o layout calculado (alturas das seções, `gap`, nada fora da zona segura). Os módulos são puros, então não precisam de canvas real.
- **Formatação (INF19)**: número digitado → texto vestido. O caso `R$ 1690,00,00` do §1 não pode reaparecer. Inclui `-1,5` → `-1,5 °C` e o `−` solto contando como campo vazio (INF51).
- **Variação (INF20)**: para cada direção, assertivas sobre a seta (▲/▼), o sinal exibido e a cor aplicada **ao valor e à seta**.
- **`fitContain`**: proporção preservada, nunca excede o painel, centralizado, **amplia sem trava** (cerca a INF50 contra um "conserto" futuro) e devolve `null` para dimensão degenerada.
- **O P2 do painel**: a peça **sem print** tem `sectionHeights` e `gap` idênticos à peça **com print** — é o que prova que o layout não flexiona (INF49).
- **O canto arredondado**: `imgRect ⊂ inset(panel, PREVISAO_PAD)` — a assertiva que substitui um `clip()`.
- **Regressão de caber**: conteúdo de referência + um caso "gordo" → `gap` continua ≥ limiar.
- **Fases**: voltar de fase preserva o que foi digitado; pular não liga o destaque de erro da fase pulada.

**Sem cobertura, declarado em vez de fingido:**

- `shareOrDownloadFiles` — precisa de `navigator.share`/`document`, e o `lib/share-blob.ts` já não tinha teste nenhum antes (ver INF56).
- `story-draw.ts` e os componentes.
- ⚠️ A assertiva de que `METEOROLÓGICO` não invade o logo usa o **stub** de medida: ela documenta o **orçamento** de largura, **não prova** a métrica real da Poppins. Mesma classe da INF8 — a prova é visual.

**Visual (o que só o Flavio fecha):** 🖥️ conferir as duas peças em 1080×1920 contra os mockups, com atenção à folga do título de 60px (INF47) e ao print colado (a sobra branca some?); 📱 postar um story de teste — único jeito de confirmar a zona segura (INF8) na interface real do Instagram.

## 14. Changelog do documento

| Data       | Mudança                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-16 | Criação. Análise do `.docx` de referência, decisões INF1–INF16 travadas, especificação visual do Informativo de Mercado (§5) fechada a partir do mockup aprovado. Campos (Q-C1) em aberto.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-07-16 | **Q-C1 resolvida** tabela a tabela → INF17–INF25 e o §6 reescrito (mapa campo a campo, 21 controles, data automática, regra "digita só o número"). Q-C2 resolvida (INF24, CPR separada) e Q-U2 resolvida no mérito (INF25). Novas: Q-C4 (anos duplicados), Q-C5 (verde da alta), Q-C6 (campo vazio).                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-07-16 | **Plan mode + implementação (F1–F4)**. Q-C4/C5/C6/A1/U1/U2/U3 resolvidas → **INF26–INF43**. §7 (UX), §8 (acesso) e §9 (arquitetura) reescritos com o que foi construído, incluindo os gotchas descobertos (nome hasheado da Poppins, `fonts.ready`, `img.decode`, máscara de 4 casas). Fases atualizadas. Restam Q-C3 (saca) e Q-F1 (2º tipo).                                                                                                                                                                                                                                                                                                                                                  |
| 2026-07-16 | **2º tipo + fluxo de 3 fases (M1–M8)**. **Q-F1 resolvida** → **INF44–INF56**. A API de meteorologia foi avaliada e **descartada** (§4.3: fontes oficiais BR mortas; 7 dias com licença comercial custam $7–$29/mês) → o print segue manual (INF45). Novos: §4.2 (o meteorológico), §4.3 (a avaliação da API), §5-B (especificação visual), §6.7 (campos). §3, §7, §9 e §13 reescritos. O **P5 foi pago**: a casca saiu para `story-layout.ts`/`story-draw.ts`, provada op a op (177 ops idênticas). Achado sério: o `onlyDigits` do `currency.ts` **comia o sinal** — mínima negativa era impossível de digitar (INF51). `npm run build` **passou**. Resta só a validação visual; aberta: Q-C3. |
| 2026-07-16 | **INF57** — o rodapé ganhou os ícones de contato (Instagram/e-mail/telefone). Reportado pelo Flavio: a peça implementada só tinha o texto. Novo `PathOp` na casca (viewBox 24×24 → `Path2D`), serve para qualquer ícone futuro. Os três em traço, unificando o original (que misturava traço com um telefone chapado). §5.9 reescrito com as folgas medidas.                                                                                                                                                                                                                                                                                                                                    |
