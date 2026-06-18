---
name: feedback-messages
description: Use this skill whenever building, editing, or reviewing user-facing feedback in the PWA — toasts, inline form errors, banners, error/info modals. Defines when to use each surface, the canonical structure of each, the pt-BR copywriting conventions, and the accessibility requirements. Source of truth para padronizar mensagens do sistema.
---

# Mensagens ao Usuário — Padrão canônico

Toda mensagem que o sistema mostra ao operador segue uma das **4 superfícies de feedback** definidas aqui. Esta skill é a fonte canônica de quando usar cada uma, da estrutura, e do copywriting em pt-BR.

> Áreas relacionadas:
>
> - **Visual de modais** (cabeçalho verde, body branco, actions) → `modals` SKILL
> - **Tokens visuais** (cores, tipografia, espaçamento) → `design-system` SKILL
> - **Acessibilidade da PWA** (safe areas, viewport) → `responsive` SKILL

## 1. Quando usar cada superfície (decision tree)

Antes de escrever uma mensagem, escolha a superfície pela **severidade × persistência**:

| Situação                                                                     | Superfície                       | Por quê                                                               |
| ---------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------- |
| Confirmação de ação ("Amostra criada")                                       | **Toast** `success`              | Feedback rápido, não-bloqueante. Auto-dismiss.                        |
| Erro de operação que não bloqueia ("Não foi possível carregar")              | **Toast** `error`                | Transitório. Operador pode retry.                                     |
| Info contextual ("Amostra removida da seleção")                              | **Toast** `info`                 | Side-effect que o operador precisa saber.                             |
| Erro de validação de campo ("Obrigatório", "Inválido")                       | **Inline error** no campo        | Erro fica ao lado do input. Some ao digitar.                          |
| Estado persistente da página ("Mais de 30 dias", "Sem conexão")              | **Banner**                       | Não-clicável (ou com close opcional). Fica enquanto o estado existir. |
| Erro bloqueante que exige ação ("Não foi possível invalidar — Liga X ativa") | **Modal** `.app-modal.is-themed` | Tem listagem, links, decisão. Toast efêmero não serve.                |
| Confirmação destrutiva ("Descartar amostra?")                                | **Modal** `.app-confirm-modal`   | Precisa do "Cancelar / Continuar" explícito.                          |

**Regra simples:** se a mensagem some sozinha em segundos → toast. Se fica enquanto algo for verdade → banner ou inline. Se exige ação do operador → modal.

## 2. Toast — feedback transiente

Implementação canônica em `lib/toast/ToastProvider.tsx`. CSS em `app/globals.css` (classes `.app-toast`, `.app-toast-viewport`, variantes `--success`/`--error`/`--info`). Não duplicar HTML — usar o hook `useToast()`.

### API

```ts
const toast = useToast();

toast.success({ title, description?, durationMs? });
toast.error({   title, description?, durationMs? });
toast.info({    title, description?, durationMs? });
toast.dismiss(id);  // fechar programaticamente
toast.clear();      // limpar todos
```

- **`title`** (obrigatório): frase curta no que aconteceu. Vai em peso 600.
- **`description`** (opcional): contexto/motivo/próximo passo. Vai em peso normal, cor mais fraca.
- **`durationMs`** (opcional): default `DEFAULT_DURATION_MS` = 4000 ms. Mensagens longas → 6000. Críticas → não auto-dismiss (passar duração grande tipo 999999 e usar `dismiss` manual).

### Variantes

| Kind      | Quando                                                                | Ícone   | Cor principal |
| --------- | --------------------------------------------------------------------- | ------- | ------------- |
| `success` | Ação completou (criou, salvou, removeu)                               | ✓ check | Verde brand   |
| `error`   | Ação falhou (network, validação, regra)                               | ⓘ alert | Vermelho      |
| `info`    | Side-effect / notificação neutra (selecionado, alterado externamente) | ⓘ info  | Azul-cinza    |

### Estrutura visual

- Posição: bottom-center mobile, bottom-right desktop (controlado por `.app-toast-viewport`).
- Stacking: até 3 visíveis (`MAX_VISIBLE` em `ToastProvider.tsx`). Excesso é descartado FIFO.
- Animação: slide-up + fade ~320ms easing.
- Conteúdo: ícone à esquerda · `title` (+ `description` opcional) · botão X de fechar.
- ARIA: `role="alert"` para `error`, `role="status"` para success/info. Viewport `aria-live="polite"`.

### Exemplos canônicos

```ts
// Sucesso de criação
toast.success({
  title: 'Amostra criada',
  description: `Lote ${lotNumber} registrado.`,
});

// Erro de network/operação
toast.error({
  title: 'Não foi possível carregar amostras',
  description: 'Verifique sua conexão e tente novamente.',
});

// Info de side-effect (ex: refetch otimista removeu seleção)
toast.info({
  title: `Amostra ${lot} removida da seleção`,
  description: 'Sem saldo disponível.',
});

// Mensagem curta autoexplicativa — description é OPCIONAL
toast.success({ title: 'Salvo' });
```

## 3. Inline form errors — validação de campo

Erros que pertencem a **um input específico** ficam **abaixo do input**, não em toast.

### Padrão

- Classe no input quando inválido: `.has-error` (ou `aria-invalid={true}`).
- Mensagem: `<p className="nsv2-inline-error">{message}</p>` ou usar `placeholder` do input pra mostrar a mensagem em cor vermelha suave (padrão atual em `NewSampleModal.tsx`).
- Mensagem some ao digitar (limpa via `clearFieldError(field)`).
- Cor: vermelho suave `#c45c5c` (não vermelho saturado — não é catástrofe).
- Sempre acompanha `aria-invalid` no input para acessibilidade.

### Estrutura recomendada (controlled form)

1. State `fieldErrors: Record<FieldName, string | null>` (reducer + dispatch).
2. Validação no submit + on-blur opcional.
3. Ao digitar, limpa o erro do campo: `dispatch({ type: 'CLEAR_FIELD_ERROR', field })`.
4. Foco automático no primeiro campo inválido após validação.

Referência completa: `components/NewSampleModal.tsx` (linhas ~133-154 = schema/state, ~520-650 = render). NÃO replicar a lógica — copiar o pattern.

### Quando NÃO usar inline

- Erro de operação assíncrona (API falhou após submit) → **toast.error** acima ou banner no topo do form.
- Erro de regra de negócio que abrange múltiplos campos → **banner inline no topo do form** (ex: `.nsv2-inline-error` standalone) ou modal.

## 4. Banner — estado persistente da página

Banner é uma faixa horizontal informando uma condição que **permanece enquanto algo for verdade**. Não some sozinho.

### Padrões existentes

| Classe                              | Quando                                     | Exemplo                                 |
| ----------------------------------- | ------------------------------------------ | --------------------------------------- |
| `.nsv2-offline-banner`              | Conexão offline em `NewSampleModal`        | "Sem conexão"                           |
| `.inf-offline-banner`               | Conexão offline no formulário `/informe`   | "Sem conexão" + envio salvo no aparelho |
| `.nsv2-inline-error` (topo de form) | Erro de submit no topo do form (não-campo) | "Este cliente PF não tem fazenda ativa" |

### Estrutura

- Largura total do contexto (página, modal).
- Cor: tom suave da semântica (verde claro pra info, vermelho claro pra erro, âmbar pra warning).
- Pode ter ícone à esquerda e/ou botão X pra fechar.
- Não usa `role="alert"` salvo se for crítico (preferir `role="status"`).

### Quando usar

- Filtro/contexto persistente da página.
- Estado de conectividade.
- Aviso global do form que abrange múltiplos campos.

## 5. Modal de erro / informativo

Modais bloqueantes são reservados para **erros que exigem decisão ou contêm conteúdo estruturado** (lista, comparação, escolha).

### Quando usar modal em vez de toast

- Operador precisa **escolher** entre N alternativas (ex: "Reclassificar?" — Sim/Não).
- Erro retorna **dados estruturados** (ex: F7.D `SAMPLE_HAS_ACTIVE_BLENDS` com lista de ligas + botão "Ver liga" por linha).
- Comparação visual (ex: `ClassificationLotMismatchModal` mostra lote esperado vs lido).
- Confirmação **destrutiva** ("Descartar?" / "Excluir?").

### Padrão visual

**Sempre** seguir a skill `modals` (`.claude/skills/modals/SKILL.md`):

- Cabeçalho verde com título curto ("Não foi possível invalidar", "Lote não confere").
- Body branco com descrição + lista/conteúdo.
- Actions: "Cancelar" (secundário) + ação principal (verde ou vermelho se danger).

### Não usar modal para

- Notificação simples sem ação requerida (use toast).
- Validação de campo (use inline).
- Estado de página (use banner).

## 6. Copywriting pt-BR

> Memória `feedback_messages_portuguese`: **todas as mensagens de UI em pt-BR**, nunca inglês.

### Tom de voz

- **Direto, sem floreio.** "Não foi possível X" > "Infelizmente ocorreu um problema ao tentar X".
- **3ª pessoa neutra.** "Amostra criada" > "Você criou a amostra".
- **Sem culpar o usuário.** "Não foi possível salvar" > "Você não conseguiu salvar".
- **Sem 'por favor' / 'desculpe' / 'oops'.** São interjeições inúteis em produto B2B operacional.

### Estrutura do title

| Tipo                   | Verbo                           | Exemplo                            |
| ---------------------- | ------------------------------- | ---------------------------------- |
| Sucesso                | Particípio passado              | "Amostra criada", "Liga revertida" |
| Erro                   | "Não foi possível + infinitivo" | "Não foi possível criar amostra"   |
| Info                   | Sujeito + ação                  | "Amostra removida da seleção"      |
| Validação inline curta | Adjetivo/substantivo            | "Obrigatório", "Inválido"          |

### Estrutura do description

Quando presente, descreva **causa** ou **próximo passo** em uma frase curta:

- Causa: "Sem saldo disponível.", "Conexão perdida.", "Liga 5658 ainda ativa."
- Próximo passo: "Tente novamente.", "Verifique sua conexão.", "Cadastre uma fazenda primeiro."

**Description é opcional.** Em mensagens autoexplicativas (`"Salvo"`, `"Sessão expirada"`), omita.

### Vocabulário consistente

| Use                   | Não use        |
| --------------------- | -------------- |
| amostra               | sample         |
| liga                  | blend          |
| sacas (abreviado: sc) | bags           |
| classificação         | classification |
| dono / proprietário   | owner          |
| filial                | unit           |
| comprador             | buyer          |
| armazém               | warehouse      |
| safra                 | harvest        |

### Exemplos do `SIM`/`NÃO`

| ❌ Evitar                                       | ✅ Preferir                          |
| ----------------------------------------------- | ------------------------------------ |
| "Oops! Algo deu errado :("                      | "Não foi possível carregar amostras" |
| "Failed to create sample"                       | "Não foi possível criar amostra"     |
| "Por favor, preencha esse campo"                | "Obrigatório"                        |
| "Você precisa selecionar pelo menos 2 amostras" | "Selecione pelo menos 2 amostras"    |
| "Sample successfully created!"                  | "Amostra criada"                     |
| "Sem conexão de internet detectada"             | "Sem conexão"                        |

## 7. Acessibilidade

| Elemento               | ARIA                                                      | Comportamento                              |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------ |
| Toast `error`          | `role="alert"`                                            | Anunciado imediatamente por screen readers |
| Toast `success`/`info` | `role="status"`                                           | Anunciado quando o usuário pausar          |
| Viewport de toasts     | `aria-live="polite"` + `aria-label="Notificações"`        | Agrupa anúncios                            |
| Input inválido         | `aria-invalid={true}` + `aria-describedby={errorId}`      | Liga input ao erro inline                  |
| Banner crítico         | `role="alert"`                                            | Conexão perdida, dados em risco            |
| Banner informativo     | `role="status"`                                           | Filtros ativos, info geral                 |
| Modal                  | `role="dialog"` + `aria-modal="true"` + `aria-labelledby` | Foco trap dentro do modal                  |

Sempre garantir que `aria-label` ou texto visível identifique a ação dos botões X (fechar). Hoje `ToastProvider.tsx:181` usa `aria-label="Fechar notificação"` corretamente.

## 8. Anti-patterns

❌ **Mensagem genérica.** "Erro" / "Algo deu errado" / "Falhou". Sempre dizer **o que** falhou. Use o catch da `ApiError` (`lib/api-client.ts`) e propague o `cause.message`.

❌ **Toast pra erro crítico bloqueante.** Se o operador precisa decidir algo, use modal. Toast some em 4s.

❌ **Description redundante.** `"Salvo" / "A amostra foi salva com sucesso."` — a description aqui só repete o title. Omita.

❌ **Validação inline aparecer no toast também.** Erro de campo é DO campo. Não duplicar em toast — confunde origem.

❌ **Inglês em produção.** Mensagens da UI em pt-BR sempre. Inglês só em logs/console técnicos.

❌ **Auto-dismiss em erros críticos.** Se o operador precisa ver e agir, use duração longa (8000+ ms) ou modal.

❌ **Misturar tom.** "Oops, não foi possível salvar :(" — escolha entre formal (recomendado pra produto B2B) ou casual. Não misture.

❌ **Toast empilhado em loop.** Se uma ação falha e re-tenta automaticamente, agrupar erros (dismissar o anterior) em vez de empilhar 10 toasts iguais.

## 9. Checklist de revisão

Ao escrever ou revisar uma mensagem, valide:

- [ ] **Superfície certa?** Toast/inline/banner/modal pela tabela §1.
- [ ] **pt-BR sem inglês?** Use o vocabulário canônico §6.
- [ ] **Title curto e direto?** Evite frases compostas. `"Não foi possível X"` ou `"X criada"`.
- [ ] **Description opcional usada bem?** Só se agrega causa ou próximo passo.
- [ ] **Tom consistente?** Sem "por favor", "oops", "infelizmente", 2ª pessoa.
- [ ] **Variante certa?** `success` apenas pra confirmação real. `error` pra falha. `info` pra info neutra.
- [ ] **ARIA correto?** Especialmente em error/modal.
- [ ] **Não duplica erro inline em toast?**
- [ ] **Mensagem do `ApiError` é propagada?** (não cair em fallback genérico se o backend já mandou um message útil)

## 10. Auditoria do projeto (snapshot 2026-05-19)

Pontos atuais que **já seguem** o padrão (use como referência):

- `app/samples/page.tsx` — toast.info pra reconciliação otimista (~linha 795), toast.error pra falha de listSamples pra liga (~linha 798), toast.info pra `showIneligibleReason` (~linha 943). Pattern title + description curto.
- `lib/toast/ToastProvider.tsx` — implementação canônica do toast viewport com ARIA correto.
- `components/NewSampleModal.tsx` — inline errors por campo + banner topo de form (`.nsv2-inline-error`).
- `components/samples/ClassificationReviewSheetBody.tsx` — erro inline de lote obrigatório no review da classificação: placeholder vermelho suave (`Obrigatório`) + `.review-field-input.has-error` + `aria-invalid`, validado **primeiro** no Avançar e com foco no campo. Erros assíncronos (resolve do lote) seguem em banner no topo (`flowError`).
- `components/samples/SampleCreatedSuccessModal.tsx` — modal de sucesso com ações claras (alternativa ao toast quando precisa de CTA).

Pontos pendentes de revisão (oportunidade ao revisar erros do sistema):

- Mensagens cruas de `ApiError` que chegam no usuário sem reformulação (ex: erros do backend retornando "validation failed" sem contexto).
- Catch blocks que mostram `error.message` direto sem traduzir pro tom da skill.
- Lugares que ainda usam `alert()` ou `console.log` em vez de toast.
- Auditoria recomendada: `grep -rn "toast\." app components lib` e revisar caso a caso contra o checklist §9.

## 11. Mudanças que disparam atualização desta skill

- Mudança na API do `ToastProvider` (novo kind, novo método, mudança de durations).
- Novo padrão de banner ou inline error introduzido no projeto.
- Mudança de vocabulário pt-BR (ex: rebrand de termo).
- Decisão UX nova sobre quando usar cada superfície.

Sempre atualizar §10 (auditoria) quando refatorar mensagens em massa.
