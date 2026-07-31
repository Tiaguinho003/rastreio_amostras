---
name: tests
description: Use this skill when writing, running, or debugging tests. Covers test structure, conventions, and how to add new tests.
---

## Framework

- `node --test` nativo (Node 22). **NAO usar Jest, Vitest, ou outro framework.**
- Assertions: `node:assert/strict` (`assert.strictEqual`, `assert.deepStrictEqual`, `assert.throws`, etc.)
- Coverage: `c8` (devDependency), rodar com `npx c8 node --test ...`

## Categorias de teste

1. **Contratos** (`npm run test:contracts`) — `tests/event-contract.test.js`. Valida que JSON schemas em `docs/schemas/events/v1/` estao corretos e que o event-validator aceita/rejeita payloads esperados.
2. **Unitarios** (`npm run test:unit`) — testam funcoes puras em isolamento (auth, cookies, uploads, roles, rate-limiter, client-support, normalizadores, services sem I/O). Lista canonica dos arquivos esta no script `test:unit` do `package.json`.
3. **Integracao com DB** (`npm run test:integration:db`) — requerem PostgreSQL rodando. Testam fluxos completos via services. Rodam com `--test-concurrency=1`.

## Onde ficam os testes

- `tests/` na raiz do projeto (flat, nao nested)
- Nomes: `<nome>.test.js` (unit/contract) ou `<nome>.integration.test.js` (integracao)
- Unit tests tambem podem ser `.test.ts`: o `test:unit` roda com
  `--experimental-strip-types` e o tsconfig tem `allowImportingTsExtensions`
  (imports de `.ts` precisam da extensao explicita — ex.
  `tests/samples-list-reducer.test.ts`, que importa
  `lib/samples/samples-list-reducer.ts`)
- Helpers em `tests/helpers/`

## Como adicionar um teste novo

1. Criar arquivo em `tests/` seguindo a convencao de nome
2. Importar `node:test` e `node:assert/strict`:
   ```js
   import test from 'node:test';
   import assert from 'node:assert/strict';
   ```
3. Se for unit test, adicionar o arquivo na lista de `test:unit` no `package.json` (lista explicita)
4. Se for integration test, o glob `tests/**/*.integration.test.js` pega automaticamente
5. Rodar: `node --test tests/meu-novo.test.js` para testar isolado
6. Verificar CI: `npm run test`

## Padroes

- Testes de integracao criam dados proprios e limpam ao final (TRUNCATE no beforeEach)
- Testes de contrato usam `tests/helpers/event-builders.js` para construir eventos
- 🔴 **Data fixa que o relogio ultrapassa = bomba-relogio.** Um fixture com data absoluta proxima
  (`paymentDate: '2026-07-20'`) afirmando "previsto/agendado" passa ate a data chegar e quebra
  sozinho depois, sem nada no codigo mudar. Ja aconteceu 2x no `sale-contract.integration.test.js`.
  Quando a asserta e sobre um ESTADO derivado do relogio (previsto/atrasado/realizado, "vence em N
  dias", janelas de retencao), ancorar em hoje com **`tests/helpers/relative-dates.js`**:
  `bizDay(offset)` (rola fim de semana pra tras — DSB-D7),
  `calendarDay(offset)` (dia real, sem roll — feeds de faturamento/pagamento, DSB-D18) e
  `dayKey(date)`. **A janela da consulta tambem tem de ser ancorada**, senao uma janela fixa acaba
  cobrindo a data movel e o "fora da janela" vira falso-negativo. Se a data e so um dado que vai e
  volta, data fixa serve
- ⚠️ **Nao "resolver" bomba-relogio afrouxando a asserta.** Aceitar os dois estados
  (`typeKey === 'x_overdue' ? 'atrasado' : 'previsto'`) faz o teste parar de quebrar **e** parar de
  provar — foi exatamente o que tinha acontecido no feed de faturamento
- **Cliente semeado que precisa passar pelo `resolveOwnerBinding` real** (suites de API, que montam o
  `ClientService` de verdade) tem de nascer `status: 'ACTIVE'` **e** `isSeller: true` — o binding
  recusa inativo e nao-vendedor. So o `INACTIVE` "so pra satisfazer a FK" e suficiente quando o teste
  usa mock de client service (ex.: `buyerClientId` em `sample-blend-cascade`)
- Uploads em testes: usar PNG 1x1 real (magic bytes validos), **nunca** `Buffer.from('texto')`
- Exemplo de buffer PNG valido:

  ```js
  const tinyPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8f5i8AAAAASUVORK5CYII=',
    'base64'
  );
  ```

- **Logica de navegador sem DOM.** O runner e Node puro — nao ha `window`, `localStorage` nem jsdom,
  e nao vamos adicionar. Para testar modulo que fala com o navegador, instalar um duble em
  `globalThis.window` no corpo do teste e apagar no `test.afterEach`. So funciona porque o modulo
  confere `typeof window` **na chamada**, nao no import — se ele ler no topo do arquivo, o duble
  chega tarde. Molde: `tests/boot-last-seen.test.ts` (`installWindow('ok' | 'throws' | 'none')`), que
  cobre os tres estados que importam: storage bom, storage que **lanca** (modo privado/quota) e SSR.
- **Funcao que depende do relogio recebe `now` por parametro** (`shouldShowBootMark(now)`), com
  `Date.now()` so como default. Sai de graca o controle do tempo no teste, sem fake timers e sem a
  bomba-relogio acima — e o codigo de producao nao paga nada por isso.

## Contagem atual

- Rodar `npm run test` para contagem atualizada. Testes divididos em contracts, unit e integration.
- Todos verdes em CI (GitHub Actions, PostgreSQL via Docker)
