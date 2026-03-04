# Arquitetura MVP v1

Status: Aprovado para implementacao inicial  
Data: 2026-02-27  
Projeto: Rastreio Interno de Amostras

## 1. Stack Principal

- Linguagem/plataforma: TypeScript + Node.js
- Aplicacao: Next.js (App Router) como fullstack
- Frontend: React + Next.js
- API: REST (rotas internas do Next.js)
- Diretriz futura: PWA-ready (leitura de QR via browser)

## 2. Arquitetura da Aplicacao

- Modelo: Monolito modular
- Modulos base: `samples`, `classification`, `ocr`, `print`, `auth`, `events`
- API: REST
- Persistencia orientada a eventos desde o inicio: tabela `Sample` (estado atual) e tabela `SampleEvent` (timeline append-only)
- Fila no MVP: nao usar RabbitMQ/SQS/Redis; usar tabela `PrintJob` no banco
- Evolucao futura prevista: Redis/BullMQ

## 3. Banco de Dados e Persistencia

- Banco principal: PostgreSQL
- ORM: Prisma
- Imagens no MVP: disco local no servidor
- Backup diario obrigatorio
- Estrutura preparada para migracao futura para S3
- Versionamento de dados: via eventos desde o MVP
- Edicao nunca sobrescreve: sempre gera novo evento

## 4. OCR e Processamento de Imagem

- OCR no MVP: interno
- Arquitetura plugavel para OCR externo (Google Vision/Azure) no futuro
- Processamento no MVP: sincrono
- Timeout definido
- Fallback manual obrigatorio
- Politica de falha: se OCR falhar, permitir preenchimento manual
- Regra critica: operacao nunca pode travar por falha de OCR
- Scores no v1: score geral e score por campo

## 5. Autenticacao, Autorizacao e Auditoria

- Login no MVP: local
- Perfis: `Admin` com acesso total e `Classificador` com Fase 1 (foto -> OCR -> conferencia -> confirmar -> gerar QR -> imprimir) e Fase 2 (iniciar classificacao -> salvar parcial -> finalizar)
- Correcoes: sempre via novo evento, com motivo obrigatorio e registro de antes/depois
- Auditoria: append-only desde o MVP; nenhum evento pode ser deletado ou sobrescrito

## 6. Infraestrutura e Deploy

- Ambiente: on-premise (servidor local no escritorio)
- Containerizacao: Docker Compose desde o inicio
- Ambientes: Dev, Homolog, Producao
- Backup diario automatico: PostgreSQL e uploads/imagens
- Retencao: 14 dias (diarios), 8 semanas (semanais), 12 meses (mensais)

## 7. Qualidade e Engenharia

- Testes obrigatorios no MVP: integracao e E2E criticos (fluxos principais)
- Padrao tecnico: TypeScript strict, ESLint, Prettier e Zod para validacao
- Observabilidade: logs estruturados e rotacao de logs; Sentry opcional
- Definicao de pronto: Fluxos da Fase 1/Fase 2 funcionais, auditoria garantida, backup configurado e testes criticos implementados

## 8. CI/CD e Fluxo de Trabalho

- Repositorio: unico
- Branching: trunk-based com branches curtas por feature
- Deploy: homolog automatico e producao manual/controlado
- Banco: Prisma Migrate com migrations versionadas, `migrate deploy` em producao e nunca usar `prisma db push` em producao

## 9. Regras Estruturais Nao Negociaveis

1. ID da amostra e unico e imutavel.
2. Sem foto nao existe registro definitivo.
3. Edicao nunca sobrescreve; sempre gera evento.
4. Sistema nunca pode travar operacao por falha de OCR.
5. Auditoria e append-only.
6. Backup diario e obrigatorio.

## 10. Observacoes de Implementacao

- Este documento e a base oficial da Arquitetura MVP v1.
- Alteracoes futuras devem ser registradas em nova versao (v1.1, v1.2, ...), mantendo historico de decisoes.
