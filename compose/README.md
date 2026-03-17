# Compose Canonico

Status: Ponteiro local  
Escopo: localizar os arquivos Compose oficiais do projeto  
Ultima revisao: 2026-03-16  
Documentos relacionados: `docs/Operacao-e-Runtime.md`

## Arquivos oficiais

1. `compose/development.yml`
2. `compose/internal-production.yml`

## Regra

1. estes arquivos so fazem sentido dentro do fluxo descrito em `docs/Operacao-e-Runtime.md`;
2. `cloud-homolog` nao usa Compose; essa trilha opera por `Cloud Run` e `scripts/gcp/`;
3. `docker-compose.yml` e `docker-compose.prod.yml` permanecem apenas como compatibilidade legada.
