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
2. **Unitarios** (`npm run test:unit`) — testam funcoes puras em isolamento: auth, cookies, uploads, roles, rate-limiter, client-support.
3. **Integracao com DB** (`npm run test:integration:db`) — requerem PostgreSQL rodando. Testam fluxos completos via services. Rodam com `--test-concurrency=1`.

## Onde ficam os testes

- `tests/` na raiz do projeto (flat, nao nested)
- Nomes: `<nome>.test.js` (unit/contract) ou `<nome>.integration.test.js` (integracao)
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
- Uploads em testes: usar PNG 1x1 real (magic bytes validos), **nunca** `Buffer.from('texto')`
- Exemplo de buffer PNG valido:
  ```js
  const tinyPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8f5i8AAAAASUVORK5CYII=',
    'base64'
  );
  ```

## Contagem atual

- Rodar `npm run test` para contagem atualizada. Testes divididos em contracts, unit e integration.
- Todos verdes em CI (GitHub Actions, PostgreSQL via Docker)
