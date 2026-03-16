# Modelo Operacional e Instalacoes

Status: Ativo  
Escopo: organizar a leitura do projeto para evitar mistura entre sistema, perfil operacional e host

## 1. A estrutura mental correta

Este projeto deve ser entendido em tres camadas:

1. **Sistema**
2. **Perfil operacional**
3. **Instalacao concreta**

Isso evita a confusao entre:

1. desenvolvimento local
2. piloto local de producao interna
3. producao real no servidor da empresa

## 2. O que e o sistema

O sistema e unico e mora no repositorio.

Inclui:

1. codigo da aplicacao
2. regras de negocio
3. frontend e backend
4. migrations
5. `compose/`
6. `scripts/runtime/`
7. `scripts/ops/`
8. `env/examples/`
9. `docs/`

Regra:

1. nao existem duas copias do sistema
2. nao existem dois projetos diferentes para dev e producao
3. o repositorio versionado representa o modelo transferivel

## 3. O que e o perfil operacional

Hoje existem apenas dois perfis reais:

1. `development`
2. `internal-production`

`development`:

1. existe para desenvolver, testar rapido e descartar com facilidade
2. aceita dados e runtime descartaveis
3. nao e referencia final de operacao

`internal-production`:

1. existe para operacao real em rede interna
2. deve ser estavel, persistente e validavel por health/smoke
3. e o mesmo perfil tanto no piloto local quanto no servidor real

Regra importante:

1. piloto local e producao real **nao** sao perfis diferentes
2. ambos sao instalacoes diferentes do mesmo perfil `internal-production`

## 4. O que e a instalacao concreta

Uma instalacao concreta e a combinacao de:

1. um host especifico
2. envs locais daquele host
3. paths persistentes daquele host
4. portas e politica de rede daquele host

Exemplos validos:

1. `development` na maquina de desenvolvimento
2. `internal-production` piloto nesta maquina local
3. `internal-production` oficial no servidor da empresa

Regra:

1. host muda, perfil nao muda
2. perfil muda, sistema nao muda

## 5. O que pertence ao repositorio e o que nao pertence

Deve ficar no repositorio:

1. arquivos canonicos do sistema
2. compose canonico
3. wrappers canonicos
4. env examples
5. documentacao operacional canonica

Nao deve ficar no repositorio:

1. `.env.development`
2. `.env.internal-production`
3. `.env.internal-production.ops`
4. uploads reais
5. backups reais
6. outbox real
7. banco real
8. caches e artefatos temporarios

Regra:

1. configuracao local pertence a instalacao
2. modelo reutilizavel pertence ao sistema

## 6. O que e especifico do host piloto atual

O piloto atual ajudou a validar o sistema, mas algumas coisas pertencem apenas a esta instalacao concreta.

Exemplos tipicos de itens que **nao** devem ser promovidos ao modelo geral:

1. IPs locais do host atual
2. referencias a Windows, WSL2, `portproxy` e firewall do Windows
3. paths especificos do host piloto
4. ajustes temporarios para viabilizar o piloto nesta maquina

Esses itens podem aparecer em notas operacionais do piloto, mas nao devem virar regra geral do projeto.

## 7. Como classificar qualquer mudanca futura

Antes de implementar uma mudanca, classifique-a em uma destas categorias:

### A. Mudanca de sistema

Exemplos:

1. correcao no Dockerfile
2. correcao de runtime
3. ajuste de healthcheck
4. regra de sessao/cookie
5. compose canonico

Destino:

1. vai para o repositorio
2. acompanha qualquer instalacao futura

### B. Mudanca de perfil operacional

Exemplos:

1. politica de deploy do `internal-production`
2. preflight oficial
3. smoke oficial
4. padrao de persistencia do `internal-production`

Destino:

1. vai para o repositorio
2. vale para qualquer host que rode aquele perfil

### C. Mudanca de instalacao concreta

Exemplos:

1. IP do host
2. path persistente do host
3. credenciais locais
4. firewall
5. proxy de rede

Destino:

1. nao vira regra geral do sistema
2. fica fora do repositorio ou documentada apenas como nota do host

## 8. Regra pratica para nao baguncar de novo

Quando surgir uma nova necessidade, sempre pergunte:

1. isso e do sistema?
2. isso e do perfil `development` ou `internal-production`?
3. isso e so deste host?

Se a resposta for "so deste host", nao promova isso como verdade geral do projeto.

## 9. Resultado esperado desta disciplina

Seguindo essa separacao:

1. o piloto local continua util
2. o modelo canonicamente valido continua transferivel
3. a passagem para o servidor real fica muito mais limpa
4. o projeto continua evoluindo sem misturar produto, operacao e gambiarra de host
