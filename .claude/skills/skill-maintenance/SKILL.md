---
name: skill-maintenance
description: Use this skill at the END of any session that modified code, configuration, or project structure. Verifies that all skills remain accurate after changes.
---

# Verificacao pos-sessao de skills

Ao final de qualquer sessao que modificou codigo, configuracao ou estrutura do projeto, seguir este checklist para garantir que as skills continuam precisas.

## 1. O que mudou nesta sessao?

Listar arquivos modificados: `git diff --name-only HEAD~N` (onde N = numero de commits da sessao).

## 2. Mapa de impacto

Para cada arquivo modificado, verificar se alguma skill faz referencia a ele:

| Arquivo modificado     | Skills potencialmente impactadas                                   |
| ---------------------- | ------------------------------------------------------------------ |
| `package.json`         | conventions (scripts, deps), tests (scripts), prisma (seed config) |
| `eslint.config.mjs`    | conventions (ESLint config)                                        |
| `prisma/schema.prisma` | prisma (models, enums, convencoes)                                 |
| `prisma.config.ts`     | prisma (seed config)                                               |
| `next.config.mjs`      | conventions (headers, seguranca), deploy (headers validation)      |
| `tests/**`             | tests (categorias, padroes)                                        |
| `scripts/gcp/**`       | deploy (scripts, antipadroes)                                      |
| `.github/workflows/**` | conventions (CI), tests (CI)                                       |
| `src/auth/**`          | conventions (seguranca)                                            |
| `src/uploads/**`       | conventions (magic bytes)                                          |
| `CLAUDE.md`            | referencia central, verificar consistencia                         |

Frente de UI (o kit FV se espalha por varias skills — conferir a dona da peca que mudou):

| Arquivo modificado                                                                        | Skills potencialmente impactadas                                   |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `app/globals.css`                                                                         | css-architecture (onde a regra foi), design-system (tokens/atomos) |
| `app/globals.css` — bloco `.fv-table*`/`.fv-kpi*`/`.fv-toolbar*`                          | data-tables                                                        |
| `app/globals.css` — bloco `.fv-form-*`/`.fv-choice*`                                      | forms                                                              |
| `app/globals.css` — tiers de z-index, scrim, `.side-sheet`, `.fv-panel-*`                 | containers                                                         |
| `components/BottomSheet.tsx`, `components/DetailOverlay.tsx`                              | containers                                                         |
| `app/(app)/samples/page.tsx`, `components/clients/ClientsBrowser.tsx`                     | data-tables                                                        |
| `components/SuccessCheckOverlay.tsx`, `ClientLookupField.tsx`, `ChipMultiSelectField.tsx` | forms                                                              |
| `lib/use-desktop.ts`                                                                      | responsive, data-tables                                            |
| `components/**` (visual)                                                                  | design-system, responsive, button-press-effect                     |
| Fase de redesenho concluida                                                               | page-redesign-cycle, containers §8 (status da pagina)              |

## 3. Verificar skills impactadas

Para cada skill potencialmente impactada: ler o SKILL.md e verificar se as afirmacoes ainda estao corretas. Se alguma afirmacao concreta (nome de arquivo, comando, versao, configuracao) foi invalidada, corrigir.

## 4. Regra de ouro

Se a mudanca adicionou algo novo ao projeto que nao esta coberto por nenhuma skill, avaliar se deve ser adicionado a uma skill existente ou se justifica uma skill nova.

## 5. Nao fazer

- Nao atualizar datas ("ultima revisao")
- Nao adicionar changelogs nas skills
- Nao fazer mudancas cosmeticas
- So corrigir fatos concretos que mudaram
