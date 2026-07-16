# Informativos — Plano de Trabalho

> **Status**: **IMPLEMENTADO em 2026-07-16** (F1–F4, commits `0f7d818`..`bd89295`, **não pushados**) — decisões INF1–INF43 fechadas. Motor + modal de 2 etapas no leque do FAB da `/relatorios`, gerando o PNG 1080×1920. Sem migration, sem rota de API (P1). Gates verdes (unit 476/476, lint, typecheck, format). **Pendente: `npm run build` (o `next dev` estava ativo) e a validação visual — 🖥️ conferir a peça contra o mockup e 📱 postar um story de teste, único jeito de confirmar a zona segura (INF8).** Abertas: Q-C3 (saca em alta res), Q-F1 (2º tipo).
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

### 3.1 Dentro do escopo (v1)

- Modal em `/relatorios` que gera o **Informativo de Mercado**.
- Campos preenchidos à mão, com o layout do §5.
- Geração de **PNG 1080×1920** no navegador e download do arquivo.
- Formatação automática dos valores monetários (elimina o erro de digitação do §1).
- Pré-preenchimento a partir da última geração (INF25), com os campos seguindo editáveis.

### 3.2 Fora do escopo (explícito)

- Persistir o informativo, seus valores ou um histórico (P1).
- Buscar cotações de qualquer fonte externa ou do próprio banco (P3).
- Publicar direto no Instagram/redes (não citado; exigiria integração e credencial).
- Editar/personalizar o layout pela tela (P2).
- Outros enquadramentos (feed 4:5, A4, PDF) — descartados pelas INF2/INF3.
- O **segundo tipo de informativo** — anunciado pelo usuário, ainda sem escopo (Q-F1).

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

### 4.2 Segundo tipo (futuro — Q-F1)

O usuário anunciou um segundo tipo, sem escopo definido ainda. A pasta de origem (`Instagram_Safras/Informativos/`) contém um `Informativo meteorológico (1).jpg`, o que **sugere** — sem confirmação — que seja o meteorológico.

Consequência de projeto (P5): a casca (modal, seleção de tipo, motor de render, download) deve ser comum, e cada tipo entra como um **layout + um conjunto de campos**. O tipo não deve ser um `if` espalhado.

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

Faixa `GREEN` de **`FB=1618`** até `y=1920` (sangra até a base).

- Contatos: 3 linhas Poppins 400, 25px, `FOOTER_TX`, em `x = M+8`, a partir de `y = FB+52`, passo 38 → última linha em `y≈1728`, **dentro da zona segura**.
- Lockup branco h=72 à direita, `y = FB+62`.

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

## 7. UX do modal

Implementado em `components/informe/InformativoFormSheet.tsx` + `InformativoForm.tsx`.

- Aberto pela 3ª opção do leque do FAB, rótulo **"Informativo"** (INF31).
- **BottomSheet** (skill `modals`: ação com formulário → BottomSheet), classe `is-informe is-informativo`. No desktop o CSS global já converte todo `.bottom-sheet` em modal centrado de até 650px.
- **Duas etapas (INF32)**: 1) os 21 controles; 2) a peça renderizada + `Voltar e ajustar` / `Baixar informativo`.
- **Descarte confirmado** ao fechar com campos preenchidos (INF41), via `onDismissAttempt` do BottomSheet.
- Ao entregar: fecha + toast "Informativo gerado" (INF42). **Cancelar** o compartilhamento mantém o sheet aberto.
- Inputs seguem a convenção do repo: `type="text"` + `inputMode`, nunca `type="number"`.

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

| Arquivo                                 | Papel                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/informativos/mercado-layout.ts`    | **Puro, sem canvas.** Constantes da §5 + `buildMercadoLayout(data, measure)` → lista de ops posicionadas + `gap`. É o que os testes atacam. |
| `lib/informativos/mercado-draw.ts`      | `drawMercado(ctx, data, logo)` — percorre as ops e pinta. Sem regra.                                                                        |
| `lib/informativos/format.ts`            | A regra INF19 ("veste a unidade") + as máscaras da peça.                                                                                    |
| `lib/informativos/slow-fields-store.ts` | Pré-preenchimento (INF36) em `localStorage`.                                                                                                |
| `lib/date-br.ts`                        | `formatDateExtensoLocal` / `formatDateIsoLocal` — relógio **local**.                                                                        |

A separação layout↔draw existe para que a geometria (a parte com regra) seja testável **sem navegador**: o `measure` é injetado, e os testes passam um stub determinístico.

### 9.2 Gotchas descobertos na implementação

- **Nome da fonte (`mercado-draw.ts`)**: o `next/font` self-hospeda a Poppins com um nome de família **hasheado** (`__Poppins_a1b2c3`). `ctx.font = '700 86px Poppins'` cairia num fallback **silenciosamente**. O `resolveFontFamily()` lê a CSS var `--font-family-sans`, que é o único lugar onde o nome real existe.
- **`await document.fonts.ready`** antes do primeiro desenho: sem isso a peça sai na fonte de fallback e troca de cara ao redesenhar.
- **`await img.decode()`** no logo: sem isso o primeiro desenho sai sem ele.
- **`devicePixelRatio` ignorado**: o alvo é o arquivo (1080×1920 exatos), não a tela — a exibição é escalada por CSS.
- **Máscara de 4 casas**: `maskCurrencyInput` era fixa em 2 casas e truncaria o dólar para `5,23`. Generalizada em `maskDecimalInput(value, decimals)`, com `maskCurrencyInput` virando o caso de 2 casas — API e comportamento preservados, guardados por `tests/currency.test.js`.

### 9.3 Reuso

`lib/currency.ts` (máscaras), `lib/share-blob.ts` (`shareOrDownloadFile`), `components/BottomSheet.tsx` (`onDismissAttempt`, `footer`), `.inf-choice-grid`/`.inf-pill` (molde do toggle), `.fab-fan-option.is-liga` (a 3ª posição do arco **já existia**, usada pelo FAB de `/samples` — nenhum CSS de arco novo), `lib/toast/ToastProvider`, `public/logo-safras-branco.png`.

- `canvas.toBlob('image/png')` → `shareOrDownloadFile`.

## 10. Ledger de decisões

| #     | Decisão                                                                                                                                                         | Motivo                                                                                                                                                                                                                                                          | Data       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| INF1  | O Informativo **gera imagem para download e não persiste nada** — sem banco, sem storage, sem histórico.                                                        | Definição do usuário: "as informações não precisam ser salvas, apenas deve criar e disponibilizar para baixar".                                                                                                                                                 | 2026-07-16 |
| INF2  | Formato de saída: **PNG** (não PDF).                                                                                                                            | Instagram não aceita PDF em post/story; PNG é o que de fato sobe. PDF exigiria conversão manual antes de postar.                                                                                                                                                | 2026-07-16 |
| INF3  | Enquadramento: **Story 9:16, 1080×1920**. Destino é story, e só story.                                                                                          | Decisão do usuário. Descartados feed 4:5 e A4 (proporção atual).                                                                                                                                                                                                | 2026-07-16 |
| INF4  | O layout é **redesenhado do zero**; não reusa o PNG de fundo do `.docx`.                                                                                        | Fundo atual tem 657px de largura (ampliar p/ 1080 borra) e chumba safra/anos em imagem. Decisão do usuário: "redesenhe de forma mais organizada e apresentável".                                                                                                | 2026-07-16 |
| INF5  | Ponto de entrada: **modal em `/relatorios`**.                                                                                                                   | Decisão do usuário; fica junto dos outros artefatos gerados (visita, semanal). Descartados card no dashboard e rota própria.                                                                                                                                    | 2026-07-16 |
| INF6  | Direção visual **"A — claro"**: fundo branco, faixa verde no topo, barras marrons de seção, tabelas claras.                                                     | Decisão do usuário; evolução do template atual — quem já segue reconhece a peça. Descartada a direção "B — escuro".                                                                                                                                             | 2026-07-16 |
| INF7  | Header **H3 (split editorial)**: lockup completo grande à esquerda + "INFORMATIVO DE / MERCADO" alinhado à direita.                                             | Decisão do usuário. Resolve o campo vazio do header e atende "logo maior". Descartadas H1 (centralizada, logo menor) e H2 (só o ícone, sem wordmark).                                                                                                           | 2026-07-16 |
| INF8  | **Zona segura do story** obrigatória: conteúdo legível entre `y=180` e `y=1760`; faixas verdes sangram até as bordas.                                           | O Instagram cobre topo e base com a interface dele. No layout anterior o logo (y=50) e o rodapé (y≈1780) caíam embaixo da interface e não apareceriam.                                                                                                          | 2026-07-16 |
| INF9  | A **saca de café sai** da peça.                                                                                                                                 | Foto de banco com 202×110 nativos, chapada no fundo branco/verde do template. Em 1080 de largura borraria. Reversível se surgir o original em alta (Q-C3).                                                                                                      | 2026-07-16 |
| INF10 | A **variação ganha cor e seta** (▼ vermelho / ▲ verde), com a seta **desenhada como polígono**, não como caractere.                                             | A direção é a informação mais escaneável de um informativo de mercado (hoje é texto preto igual ao resto). Polígono porque a Poppins não tem os glifos ▲▼ — viraria fallback de fonte, inconsistente entre máquinas.                                            | 2026-07-16 |
| INF11 | **Safra e anos viram campos** (`SAFRA 25/26`, `2026`, `2027`), deixando de ser imagem chumbada.                                                                 | Consequência do INF4; os rótulos envelheciam dentro do PNG.                                                                                                                                                                                                     | 2026-07-16 |
| INF12 | O corpo **se auto-distribui**: mede a altura natural das seções e reparte a sobra em espaços iguais.                                                            | O layout se acomoda quando um rótulo cresce ou entra uma linha, em vez de quebrar. Altura é o recurso escasso do story.                                                                                                                                         | 2026-07-16 |
| INF13 | Renderização **client-side em `<canvas>`**, sem rota de API.                                                                                                    | Nada é salvo (P1); a PWA já carrega a Poppins; evita instalar fonte na imagem do Cloud Run e depender do fontconfig; custo zero de servidor.                                                                                                                    | 2026-07-16 |
| INF14 | Tipografia **Poppins** 400/500/600/700 — a mesma da PWA, via `next/font`.                                                                                       | Coerência com o app e zero arquivo de fonte novo no repo.                                                                                                                                                                                                       | 2026-07-16 |
| INF15 | Paleta **amostrada do template atual** (`#0E520B`, `#186D14`, `#383223`, branco).                                                                               | Preserva a identidade da peça que já circula.                                                                                                                                                                                                                   | 2026-07-16 |
| INF16 | A feature nasce **plural — "Informativos"**, com o de Mercado como primeiro tipo; casca comum e layout por tipo.                                                | O usuário anunciou um segundo tipo; a pasta de origem já contém um "Informativo meteorológico". Evita refatorar a casca depois.                                                                                                                                 | 2026-07-16 |
| INF17 | **Data é automática — o dia de hoje**; não é campo. Formato `25 DE MARÇO DE 2026`.                                                                              | Decisão do usuário. Vem do relógio **local do navegador** (consequência do INF13): no servidor viria em UTC e viraria o dia às 21h, publicando a data errada à noite.                                                                                           | 2026-07-16 |
| INF18 | `BOLSA NY — MAI/26` é **um campo de texto livre** com o rótulo inteiro; o layout normaliza para **caixa alta**.                                                 | Decisão do usuário: como o rótulo carrega mês e ano, é mais seguro digitar tudo do que compor de partes. Caixa alta automática evita destoar do `VARIAÇÃO`/`DÓLAR` ao lado.                                                                                     | 2026-07-16 |
| INF19 | **O usuário digita só o número; o sistema veste a unidade e a formatação** (`Usc/lp`, `pts`, `R$/US$`, formato real).                                           | Decisão do usuário. Fecha a classe de erro do `.docx` (`R$ 1690,00,00` do §1): separador de milhar, vírgula decimal e unidade deixam de ser digitáveis, logo deixam de ser erráveis.                                                                            | 2026-07-16 |
| INF20 | Variação: **botão de direção (▲alta/▼baixa) + magnitude**. A direção define seta, sinal exibido e **cor do valor**; o menos continua aparecendo (`▼ -20 pts`).  | Decisão do usuário. Direção explícita (em vez de derivada do sinal) impede o estado contraditório "baixa + `+20`", já que o campo não aceita sinal. Substitui a hipótese de derivar a seta do sinal (§6 original).                                              | 2026-07-16 |
| INF21 | Rótulos `VARIAÇÃO`, `DÓLAR`, `CAFÉ TIPO 6/7`, as 4 barras de título e o rodapé são **fixos**.                                                                   | Decisão do usuário, tabela a tabela. Não mudaram em nenhum material analisado.                                                                                                                                                                                  | 2026-07-16 |
| INF22 | Na faixa da safra, **`SAFRA` é fixo** e só `25/26` é campo.                                                                                                     | Decisão do usuário; a palavra nunca muda. Diverge conscientemente do INF18 (onde o rótulo inteiro é digitado), porque ali o mês/ano está embutido no meio do texto.                                                                                             | 2026-07-16 |
| INF23 | Mercado Futuro tem **4 campos de mês** (um por célula), não 2 compartilhados entre as colunas.                                                                  | Decisão do usuário: a coluna esquerda é de um ano e a direita de outro — são cotações independentes e podem divergir, ainda que hoje coincidam.                                                                                                                 | 2026-07-16 |
| INF24 | A **CPR permanece uma seção separada** do Mercado Futuro, com suas próprias faixas de ano.                                                                      | Decisão do usuário (resolve Q-C2). CPR é outro produto; fundir as tabelas economizaria ~184px de altura mas comunicaria algo errado.                                                                                                                            | 2026-07-16 |
| INF25 | **Pré-preencher a partir da última geração** é aceito em princípio; os campos pré-preenchidos seguem **editáveis**.                                             | Decisão do usuário (resolve Q-U2 no mérito). São 21 controles por peça diária, e a maioria (anos, meses, safra, rótulo da bolsa) fica parada por semanas. **Quais** campos entram fica para depois.                                                             | 2026-07-16 |
| INF26 | Mercado Futuro e CPR mantêm **4 controles de ano** (2 cada), não um par compartilhado. Resolve a Q-C4.                                                          | Decisão do usuário: os anos podem divergir entre as duas seções. Descartada a proposta de um par único alimentar as duas.                                                                                                                                       | 2026-07-16 |
| INF27 | Verde da **alta = `#186D14`** (o `GREEN_L`). Resolve a Q-C5.                                                                                                    | Decisão do usuário. É o verde da pílula do template original, que tinha ficado reservado sem uso no layout novo — mantém a cor dentro da paleta da marca e distinta do `GREEN` das faixas.                                                                      | 2026-07-16 |
| INF28 | **Todos os campos são obrigatórios** (resolve a Q-C6).                                                                                                          | Decisão do usuário. A peça não vai ao ar com célula vazia.                                                                                                                                                                                                      | 2026-07-16 |
| INF29 | Dispositivo: **os dois** — compartilhar no celular, baixar no PC.                                                                                               | Decisão do usuário. O `shareOrDownloadFile` já faz o fallback sozinho, então cobrir os dois custou quase nada. No celular o share sheet leva direto ao Instagram, sem passar por arquivo.                                                                       | 2026-07-16 |
| INF30 | Acesso: **todo não-PROSPECTOR** (`INFORME_ROLES`) — igual à própria página. Resolve a Q-A1.                                                                     | Decisão do usuário, sobre a proposta de restringir a ADMIN+COMMERCIAL como o Semanal. **Consequência**: o atalho `!canCreateWeekly → abre a visita direto` teve de sair (o leque agora sempre tem ≥2 opções), e a condição de exibir o Semanal virou explícita. | 2026-07-16 |
| INF31 | Entrada: **3ª opção do leque do FAB**, rótulo **"Informativo"**, na posição diagonal do arco (`.is-liga`). Resolve a Q-U1.                                      | Decisão do usuário: mesmo gesto de criar que já se usa. A posição diagonal já existia no CSS (usada pelo FAB de /samples) — nenhum CSS de arco novo.                                                                                                            | 2026-07-16 |
| INF32 | Modal em **2 etapas**: preencher → prévia + baixar.                                                                                                             | Decisão do usuário. 21 campos + uma prévia 9:16 não cabem numa tela só (no desktop o sheet é capado em 650px × `min(88dvh,44rem)`); em duas etapas a prévia fica grande o bastante para julgar.                                                                 | 2026-07-16 |
| INF33 | **Casas decimais fixas por campo**: bolsa 2 (`292,65`), **dólar 4** (`5,2303`), variação inteiro, preços 2 — com máscara ao digitar.                            | Decisão do usuário. O dólar de 4 casas é o motivo de generalizar a máscara do `lib/currency.ts`: `maskCurrencyInput` era fixa em 2 casas e truncaria para `5,23`.                                                                                               | 2026-07-16 |
| INF34 | Os 4 meses do Mercado Futuro são **texto livre** (o layout força a caixa alta).                                                                                 | Decisão do usuário sobre a alternativa de uma lista JAN..DEZ. Como o mês é campo "lento" (INF36), na prática é digitado uma vez e fica.                                                                                                                         | 2026-07-16 |
| INF35 | A **data é travada em hoje**, sem edição.                                                                                                                       | Decisão do usuário. Confirma a INF17: um campo a menos e impossível publicar com data errada. Descartado "hoje por padrão, mas editável".                                                                                                                       | 2026-07-16 |
| INF36 | Pré-preenche **só os campos "lentos"** (anos, meses, safra, rótulo da Bolsa NY). Os valores do dia (dólar, bolsa, variação, preços) abrem **sempre em branco**. | Decisão do usuário. Detalha a INF25 e resolve o mérito da Q-U2. Publicar o dólar de ontem como o de hoje é problema de credibilidade — o campo em branco torna o erro impossível por distração.                                                                 | 2026-07-16 |
| INF37 | Texto longo: **limite de caracteres**, sem encolher a fonte (resolve Q-U3).                                                                                     | Decisão do usuário. A peça sai idêntica todo dia (P2); o rótulo quase não varia (só o mês). Auto-shrink faria a peça mudar de aparência conforme o texto.                                                                                                       | 2026-07-16 |
| INF38 | **Variação zero não é tratada** — se acontecer, escolhe-se uma direção.                                                                                         | Decisão do usuário: não acontece na prática. Se um dia acontecer, sai `▲ +0 pts` e a gente resolve.                                                                                                                                                             | 2026-07-16 |
| INF39 | Safra com **máscara `NN/NN`**: digita `2526`, vira `25/26`.                                                                                                     | Decisão do usuário. Mesmo estilo das máscaras que o app já usa (CPF, telefone, moeda). Impossível sair do padrão.                                                                                                                                               | 2026-07-16 |
| INF40 | Na alta o **sinal de mais aparece**: `▲ +20 pts`.                                                                                                               | Decisão do usuário. Convenção de informativo de mercado e simétrico com o dia de baixa, que leva o menos.                                                                                                                                                       | 2026-07-16 |
| INF41 | **Confirma o descarte** ao fechar com campos preenchidos.                                                                                                       | Decisão do usuário. Mesmo padrão da Visita e do Semanal; são 21 campos digitados e o P1 não protege nada.                                                                                                                                                       | 2026-07-16 |
| INF42 | Após entregar a peça: **fecha o sheet + toast** "Informativo gerado". Compartilhamento **cancelado** → o sheet fica aberto.                                     | Decisão do usuário. O `cancelled` do `shareOrDownloadFile` não é erro nem sucesso — quem cancelou não quer perder os 21 campos.                                                                                                                                 | 2026-07-16 |
| INF43 | Nome do arquivo: **`informativo-mercado-AAAA-MM-DD.png`** (data ISO).                                                                                           | Ordena cronologicamente na pasta; sem espaço nem acento. Descartado o formato BR (a pasta ordenaria todo dia 16 junto) e o nome sem data (viraria "(1)", "(2)").                                                                                                | 2026-07-16 |

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

- **Q-F1** — Qual é o **segundo tipo** de informativo e qual seu conteúdo? (A pasta de origem sugere meteorológico, sem confirmação.) Ver §4.2.

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
| —    | **`npm run build`** (não rodado: o `next dev` estava ativo)                             | ⏳ pendente               |
| —    | **Validação visual**: 🖥️ peça vs. mockup · 📱 story de teste (confirma a INF8)          | ⏳ pendente               |
| F6   | Segundo tipo de informativo                                                             | Q-F1 (sem escopo)         |

> Não existe `scripts/preview-informativo.mjs` nos moldes dos `preview-*.mjs` de PDF/etiqueta: aqueles rodam em node, e canvas exige navegador. A prévia da etapa 2 é a superfície de iteração; a geometria é coberta pelos testes puros.

## 13. Validação e testes

Implementados em **`tests/informativo-mercado.test.js`** (18 casos), registrados no script `test:unit` do `package.json` — a lista é manual; sem isso o arquivo não roda no CI.

- **Unitário** do motor de desenho: dados de entrada → assertivas sobre o layout calculado (alturas das seções, `gap`, nada fora da zona segura). O módulo é puro, então não precisa de canvas real para as assertivas de geometria.
- **Formatação (INF19)**: número digitado → texto vestido. `1960` → `R$ 1.960,00`; `292,65` → `292,65 Usc/lp`; `5,2303` → `5,2303 R$/US$`. O caso `R$ 1690,00,00` do §1 não pode reaparecer.
- **Variação (INF20)**: para cada direção, assertivas sobre a seta (▲/▼), o sinal exibido e a cor aplicada **ao valor e à seta**. O campo de magnitude rejeita sinal.
- **Regressão de caber**: conteúdo de referência + um caso "gordo" (rótulos longos) → `gap` continua ≥ limiar.
- **Visual**: 🖥️ conferir o PNG gerado em 1080×1920 e 📱 postar um story de teste para validar a zona segura na interface real do Instagram — é o único jeito de confirmar a INF8.

## 14. Changelog do documento

| Data       | Mudança                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-16 | Criação. Análise do `.docx` de referência, decisões INF1–INF16 travadas, especificação visual do Informativo de Mercado (§5) fechada a partir do mockup aprovado. Campos (Q-C1) em aberto.                                                                                                                                                     |
| 2026-07-16 | **Q-C1 resolvida** tabela a tabela → INF17–INF25 e o §6 reescrito (mapa campo a campo, 21 controles, data automática, regra "digita só o número"). Q-C2 resolvida (INF24, CPR separada) e Q-U2 resolvida no mérito (INF25). Novas: Q-C4 (anos duplicados), Q-C5 (verde da alta), Q-C6 (campo vazio).                                           |
| 2026-07-16 | **Plan mode + implementação (F1–F4)**. Q-C4/C5/C6/A1/U1/U2/U3 resolvidas → **INF26–INF43**. §7 (UX), §8 (acesso) e §9 (arquitetura) reescritos com o que foi construído, incluindo os gotchas descobertos (nome hasheado da Poppins, `fonts.ready`, `img.decode`, máscara de 4 casas). Fases atualizadas. Restam Q-C3 (saca) e Q-F1 (2º tipo). |
