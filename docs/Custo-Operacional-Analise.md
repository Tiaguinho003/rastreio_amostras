# Análise de Custo Operacional — Sistema de Rastreio de Amostras

> **Documento MESTRE de custo** — a fonte de verdade detalhada. A cada evolução do app, o custo é
> atualizado **aqui primeiro**; depois o **PDF enxuto para o cliente**
> (`docs/assets/Custo-Operacional-Analise.pdf`) é regenerado com
> `node scripts/cost-report/build-cost-report.mjs`. Ver "Como manter e regerar" no fim.
>
> Gerado em **2026-07-12** · câmbio **R$ 5,12/US$** · região **southamerica-east1 (São Paulo)**.

## TL;DR

- **Custo total do sistema (TCO): ~R$ 231/mês** = nuvem/software R$ 193 + materiais de impressão R$ 38
  (+ R$ 1.300 de impressora, compra única) — cerca de **R$ 0,25 por amostra**.
- **Só nuvem/software: ~R$ 193/mês (US$ 37,6)** — cerca de R$ 0,21 por amostra e R$ 19 por usuário/mês.
- **Projeção 3 anos (entrada fixa):** ~R$ 267/mês **como está** ou **~R$ 185/mês gerenciado**.
- **O custo é dominado por OpenAI (43%) e Cloud SQL (30%);** o resto é ruído.
- **O que cresce na conta é quase todo lixo evitável:** imagens Docker de deploys antigos
  (42,9 GB hoje, contra 68 MB de todas as fotos reais dos usuários). Uma faxina de ~30 min
  mantém a curva quase plana e economiza ~R$ 1.861 em 3 anos.

## Parâmetros da análise

| Parâmetro | Valor                                              |
| --------- | -------------------------------------------------- |
| Usuários  | 10, uso diário                                     |
| Amostras  | 30/dia (~10.950/ano)                               |
| Clientes  | 1.000, com dados completos                         |
| Embarques | 15/mês × 10 fotos (1.800 fotos/ano)                |
| Cenário   | Entrada fixa, só acumula                           |
| Horizonte | 3 anos                                             |
| Escopo    | GCP + OpenAI + terceiros (Firebase, domínio, SMTP) |
| Moeda     | Reais (R$ 5,12/US$) com referência em Dólar        |

## Metodologia — três fontes, da mais firme à mais estimada

1. **Config real da produção (medida, não estimada).** Puxada em 2026-07-12 por comandos
   `read-only` do gcloud: tier e disco do Cloud SQL, config do Cloud Run, tamanho e conteúdo
   do bucket, tamanho do Artifact Registry, conta de billing.
2. **Análise do código-fonte.** Pipeline de upload (compressão, formatos), modelo de dados do
   Prisma (crescimento por tabela, event store append-only), pipeline de classificação OpenAI.
3. **Preços de lista de São Paulo.** Tabelas oficiais do Google Cloud e da OpenAI. Onde o preço
   exato de São Paulo não é publicado de forma extraível, uso o valor de us-central1 + prêmio
   regional e marco **(aprox.)**.

**A projeção NÃO inclui:** descontos por compromisso (CUD)/créditos; a fatura exata do console
(não há export de billing para BigQuery); crescimento do negócio (cenário à parte); seu tempo
de manutenção.

## Infraestrutura real hoje (`safras-amostras-prod`, southamerica-east1)

| Serviço           | Recurso                        | Config real                                                          | Custo/mês |
| ----------------- | ------------------------------ | -------------------------------------------------------------------- | --------- |
| Cloud SQL         | `rastreio-prod-pg`             | db-f1-micro · ZONAL · 10 GB HDD · **backups OFF** · PG16 · 24/7      | ~US$ 11   |
| Cloud Run         | `rastreio-prod-app`            | **min 0 (scale-to-zero)** · max 3 · 1 vCPU / 1 GiB · conc. 10 · gen2 | ~US$ 1    |
| Cloud Storage     | `safras-amostras-prod-runtime` | **68 MB** · 127 arquivos (109 fotos + 18 PDF) · sem lifecycle        | ~US$ 3    |
| Artifact Registry | `rastreio-production`          | **42,9 GB** · 131 imagens Docker                                     | ~US$ 4,3  |
| Secret Manager    | 9 secrets                      | DB URL, auth, bootstrap, SMTP, OpenAI, push…                         | ~US$ 0,3  |
| Cloud Build       | deploys manuais                | ~dentro do free tier (120 build-min/dia)                             | ~US$ 0    |
| Firebase Hosting  | laudo público                  | só 404 estático + rewrite → Cloud Run (no-store)                     | ~US$ 0    |

> **O achado central:** as imagens Docker de deploys antigos ocupam **~630× mais** que todas as
> fotos e PDFs reais dos usuários. As imagens de build são o maior ponto de desperdício e crescem
> a cada deploy.

## Custo atual detalhado

| Componente                                  |  R$/mês |  US$/mês |        % |
| ------------------------------------------- | ------: | -------: | -------: |
| OpenAI (classificação)                      |      83 |     16,3 |      43% |
| Cloud SQL                                   |      57 |     11,2 |      30% |
| Artifact Registry                           |      22 |      4,3 |      11% |
| Storage + egress                            |      15 |      3,0 |       8% |
| Outros (Secret/Build/Firebase/domínio/SMTP) |       9 |      1,8 |       5% |
| Cloud Run                                   |       5 |      1,0 |       3% |
| **Total**                                   | **193** | **37,6** | **100%** |

**Unit economics:** R$ 193/mês ÷ ~913 amostras/mês = **R$ 0,21 por amostra**; **R$ 19 por usuário/mês**.

## Modelo de crescimento (entrada fixa)

| Componente        |       Hoje |      Ano 1 |      Ano 2 |      Ano 3 |    Δ 3 anos |
| ----------------- | ---------: | ---------: | ---------: | ---------: | ----------: |
| Cloud SQL         |      R$ 57 |      R$ 57 |      R$ 58 |      R$ 58 |        flat |
| OpenAI            |      R$ 83 |      R$ 83 |      R$ 83 |      R$ 83 |        flat |
| Artifact Registry |      R$ 22 |      R$ 40 |      R$ 58 |      R$ 76 |     ▲ R$ 54 |
| Storage + egress  |      R$ 15 |      R$ 22 |      R$ 27 |      R$ 33 |     ▲ R$ 17 |
| Cloud Run         |       R$ 5 |       R$ 6 |       R$ 7 |       R$ 7 |        flat |
| Outros            |       R$ 9 |       R$ 9 |       R$ 9 |       R$ 9 |        flat |
| **Total /mês**    | **R$ 193** | **R$ 218** | **R$ 242** | **R$ 267** | **▲ R$ 74** |

Notas:

- **Banco não pesa:** Postgres cresce só **~200 MB/ano** (event store append-only = 65–70% disso);
  em 5 anos ~1 GB. Os binários (fotos) ficam fora do banco, no storage.
- **Fotos de embarque:** gravadas **sem compressão** (~3,5 MB × 10 por embarque), mas **expiram em 15
  dias** (EMB31 — retenção + purga oportunista, 2026-07-16), então o acervo é um **working-set
  limitado** (~15 dias), não cresce sem teto. Comprimir no upload ainda cortaria o pico ~5×, mas
  deixou de ser alavanca de acervo. Fotos de amostra já são comprimidas no cliente (canvas → JPEG,
  máx 3072px).
- **Artifact Registry** é a única linha que cresce rápido — e é 100% evitável.

## Projeção de 3 anos

| Período | Como está (R$) |  US$ | Gerenciado (R$) |  US$ | Diferença |
| ------- | -------------: | ---: | --------------: | ---: | --------: |
| Hoje    |            193 | 37,6 |             172 | 33,6 |    −R$ 20 |
| Ano 1   |            218 | 42,5 |             176 | 34,3 |    −R$ 42 |
| Ano 2   |            242 | 47,3 |             180 | 35,2 |    −R$ 62 |
| Ano 3   |            267 | 52,1 |             185 | 36,1 |    −R$ 82 |

- **Acumulado 3 anos:** R$ 8.273 (como está) vs **R$ 6.412 (gerenciado)** → economia de **R$ 1.861**.
- **Penhasco condicional (fora da linha-base):** o `db-f1-micro` tem só 0,6 GB de RAM. Se saturar,
  o upgrade para `db-g1-small` soma ~R$ 118/mês, ou `db-custom-1-3840` soma ~R$ 276/mês. É gatilho
  de performance, não de storage. Vigiar CPU/RAM/conexões.

## Custo de materiais de impressão (custo do cliente)

O cliente imprime etiquetas numa **Elgin L42 Pro** (transferência térmica, com ribbon) via print agent
local (PC Windows + USB). Os **3 tipos** de etiqueta (controle interno/amostra, envio, aprovação) são
**idênticos: 100 × 35 mm, 203 DPI**, e **todos usam ribbon** (`SET RIBBON ON` global em
`print-agent/index.js`). Passo de mídia ≈ 38 mm/etiqueta (35 mm impressos + 3 mm de gap).

### Consumo de etiquetas

| Uso                                               | Etiq./semana | /mês (×4,33) |       /ano |
| ------------------------------------------------- | -----------: | -----------: | ---------: |
| Classificação (30 boas + 10 desperdício × 5 dias) |          200 |          867 |     10.400 |
| Envio (40/semana)                                 |           40 |          173 |      2.080 |
| Aprovação (20/semana)                             |           20 |           87 |      1.040 |
| **Total**                                         |      **260** |    **1.127** | **13.520** |

### Custos

| Item                      | Base                                                  |                        Custo |
| ------------------------- | ----------------------------------------------------- | ---------------------------: |
| Etiquetas                 | R$ 220 ÷ (10 rolos × 800) = R$ 0,0275/un × 13.520/ano | **~R$ 31/mês** (~R$ 372/ano) |
| Ribbon                    | ~800 etiq./rolo → ~17 rolos/ano × R$ 5 (R$ 60 ÷ 12)   |   **~R$ 7/mês** (~R$ 85/ano) |
| Impressora Elgin L42 Pro  | compra única (capex, fora do mensal)                  |       **R$ 1.300** (uma vez) |
| **Materiais recorrentes** |                                                       | **~R$ 38/mês (~R$ 457/ano)** |

- **Ribbon (estimativa):** o rolo de etiqueta (800 × 38 mm ≈ 30 m) casa com um rolo de ribbon de ~30 m,
  e a compra pareia 12 ribbons ≈ 10 rolos → adoto **~800 etiquetas por ribbon**. Confirmar o comprimento
  real no datasheet Elgin; a linha é pequena (~R$ 3–7/mês) e pouco sensível.
- **Desperdício:** as 10 etiquetas/dia jogadas fora por má leitura (só na classificação) = 2.600/ano ≈
  **R$ 72/ano + ribbon ≈ R$ 88/ano (~R$ 7/mês)**. Reduzir a taxa de erro de impressão é economia direta.
- **Base de dias:** materiais usam **5 dias úteis/semana** (a seção de nuvem usa 30/dia contínuo —
  premissas distintas, ambas registradas).

## Custo total de propriedade (TCO)

Por implantação (uma empresa). Nuvem convertida em R$ (US$ × 5,12); materiais em R$ nativo.

|                | Nuvem (software) | Materiais (impressão) | **TCO recorrente** |
| -------------- | ---------------: | --------------------: | -----------------: |
| Recorrente/mês |          ~R$ 193 |                ~R$ 38 |    **~R$ 231/mês** |
| Recorrente/ano |        ~R$ 2.316 |               ~R$ 457 |  **~R$ 2.773/ano** |
| Capex único    |                — | R$ 1.300 (impressora) |  R$ 1.300 no ano 0 |

- Materiais = ~16% do recorrente; a nuvem ainda domina. **Unit: ~R$ 0,25/amostra · ~R$ 23/usuário/mês.**
- **TCO 3 anos** (nuvem as-is R$ 8.273 + materiais R$ 1.371 + impressora R$ 1.300) ≈ **R$ 10.944**
  (ou ~R$ 9.083 com a nuvem gerenciada — ver recomendações).

## Riscos observados

| Risco                            | Impacto                                                                  |
| -------------------------------- | ------------------------------------------------------------------------ |
| Backups do Cloud SQL desligados  | Perda de dados em falha do disco/instância. Mitigação barata (rec. 4).   |
| Artifact Registry sem limpeza    | Cresce sem teto a cada deploy; motor da curva de custo.                  |
| Fotos de embarque sem compressão | ~3,5 MB × 10 por embarque; expiram em 15 dias (EMB31) → acervo limitado. |
| Bucket sem lifecycle             | Todo o acervo fica em Standard para sempre.                              |
| db-f1-micro (0,6 GB RAM)         | Teto de performance conforme o volume cresce.                            |

## Recomendações (priorizadas por impacto)

1. **Prunar Artifact Registry + política keep-N** — economiza ~R$ 20/mês já e evita ~R$ 71/mês no
   ano 3. 43 GB de imagens Docker que ninguém usa. _(maior impacto, mais fácil)_
2. **(Menor) Compressão no upload de embarque** — as fotos vão cruas; comprimir no cliente cortaria
   ~5× o pico. **Menos urgente desde a retenção de 15 dias (EMB31)**, que já limita o acervo a um
   working-set curto em vez de acumular.
3. **Lifecycle no bucket (Autoclass / Nearline)** — move fotos antigas para classe mais barata.
4. **Ligar backups automáticos no Cloud SQL** — ~R$ 5/mês; seguro barato contra perda de dados.
5. **(Opcional) Avaliar modelo OpenAI mais novo + prompt caching** — caching do prefixo (−50% input)
   e/ou Batch API cortam 10–50% da linha OpenAI.
6. **Prunar revisões antigas do Cloud Run** (228 retidas) — higiene.

> Fazendo só a **nº 1 e a nº 3**, a curva de 3 anos cai de R$ 267/mês para ~R$ 185/mês.

## Apêndice — preços de lista (São Paulo · 2026-07-12)

| Recurso                       |          Preço unitário | Nota                               |
| ----------------------------- | ----------------------: | ---------------------------------- |
| Cloud Run — vCPU ativo        | US$ 0,00003360 / vCPU-s | SP (Tier 2) · free 180k vCPU-s/mês |
| Cloud Run — memória ativa     |  US$ 0,00000350 / GiB-s | SP (Tier 2) · free 360k GiB-s/mês  |
| Cloud Run — requisições       |           US$ 0,40 / 1M | free 2M req/mês                    |
| Cloud SQL — db-f1-micro       |          ≈ US$ 10 / mês | SP (aprox.)                        |
| Cloud SQL — db-g1-small       |          ≈ US$ 34 / mês | SP (aprox.) — próximo tier         |
| Cloud SQL — storage HDD       |    ≈ US$ 0,118 / GB-mês | SP (aprox.)                        |
| Cloud SQL — backup            |    ≈ US$ 0,105 / GB-mês | SP (aprox.) — hoje desligado       |
| Cloud Storage Standard        |      US$ 0,035 / GB-mês | SP · sem free tier na região       |
| Storage — operações Classe A  |          US$ 0,005 / 1k | GCS FUSE gera muitas               |
| Storage — egress internet     |        ≈ US$ 0,12 / GiB | Premium Tier (aprox.)              |
| Artifact Registry — storage   |       US$ 0,10 / GB-mês | global · free 0,5 GB               |
| Secret Manager — versão ativa |   US$ 0,06 / versão-mês | global · free 6                    |
| Cloud Build — build-minuto    |         US$ 0,003 / min | free 120 min/dia                   |
| OpenAI gpt-4o — input         |    US$ 2,50 / 1M tokens | imagem vira token de input         |
| OpenAI gpt-4o — output        |   US$ 10,00 / 1M tokens | —                                  |

Itens **(aprox.)** derivam do preço de us-central1 + prêmio regional; confirmar no seletor de região
das páginas oficiais antes de fechar orçamento. Valores de lista, sem descontos por compromisso.

### Premissas-chave

- **Classificações/ano:** ~13.000 (10.950 amostras × ~1,2 de retomada/reclassificação); ~US$ 0,015
  cada (gpt-4o vision, `detail: high`, 1 few-shot, ~4,2k tokens in / ~450 out).
- **Storage de fotos:** ~13–27 GB/ano (faixa: amostra comprimida ~0,6 MB medido a ~1,5 MB teórico;
  embarque cru ~3,5 MB — **mas com retenção de 15 dias, EMB31, as fotos de embarque não acumulam no
  ano: são um working-set de ~15 dias, então a projeção acima é conservadora nessa linha**). Central
  ~18 GB/ano. PDFs (laudo/contrato/espelho/etiqueta) **não são
  armazenados** — regenerados sob demanda (viram CPU do Cloud Run + egress).
- **Event store:** multiplicador ~7 eventos por amostra (registro + classificação + etiqueta +
  venda/embarque).
- **Artifact Registry (como está):** +~35 GB/ano — sensível à cadência de deploys; cai a ~0 com keep-N.
- **SMTP/domínio:** assumido ~R$ 0–8/mês (free tier). Confirmar provedor.

## Como manter e regerar

Este MD é o **mestre**. Ao evoluir o app e mudar o custo:

1. **Atualize este documento primeiro** — a seção afetada, o TCO e o registro abaixo.
2. Alinhe os números no topo de `scripts/cost-report/build-cost-report.mjs` (o gerador do PDF enxuto).
3. Regenere o PDF do cliente:

```bash
node scripts/cost-report/build-cost-report.mjs
# → docs/assets/Custo-Operacional-Analise.{html,pdf} (artefato local, gitignorado)
```

Requer `google-chrome` na máquina (headless, para imprimir o PDF). O PDF é a versão **enxuta** (1 página)
para o cliente; todo o detalhe, metodologia e projeção vivem aqui no mestre.

## Registro de atualizações

| Data       | O que mudou                                                                                  |                                 Custo recorrente |
| ---------- | -------------------------------------------------------------------------------------------- | -----------------------------------------------: |
| 2026-07-12 | Análise inicial de nuvem (GCP + OpenAI), config real da produção                             |                                      ~R$ 193/mês |
| 2026-07-12 | + materiais de impressão (impressora/etiqueta/ribbon) + TCO; MD vira mestre, PDF vira enxuto | **~R$ 231/mês** (+ R$ 1.300 impressora, uma vez) |
