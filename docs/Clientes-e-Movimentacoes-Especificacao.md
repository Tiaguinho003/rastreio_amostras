# Clientes e Movimentacoes - Especificacao Base

Status: Planejado  
Escopo: especificacao funcional e tecnica base para a implementacao de clientes, proprietario, inscricoes, vendas, perdas, status comercial e auditoria  
Ultima revisao: 2026-03-19  
Documentos relacionados: `docs/Produto-e-Fluxos.md`, `docs/Arquitetura-Tecnica.md`, `docs/API-e-Contratos.md`, `docs/Deploy-e-Cloud-Build.md`

## Objetivo

Este documento consolida a logica aprovada para a evolucao do sistema com:

1. cadastro mestre de clientes;
2. vinculo obrigatorio do proprietario da amostra a um cliente;
3. registro de vendas parciais por comprador;
4. registro de perdas parciais e totais;
5. calculo automatico do status comercial da amostra;
6. trilha de auditoria para clientes, proprietario e movimentacoes.

Ele funciona como referencia unica para as proximas etapas de implementacao.

## Conceitos principais

1. `Cliente`
   Cadastro mestre usado tanto para proprietario quanto para comprador.
2. `Proprietario`
   Cliente vinculado a amostra como dono da amostra.
3. `Comprador`
   Cliente vinculado a uma movimentacao de venda.
4. `Inscricao`
   Registro fiscal ligado a um cliente. Um cliente pode ter varias inscricoes e cada inscricao pode ter endereco proprio.
5. `Movimentacao`
   Registro comercial da amostra. Na primeira versao, os tipos previstos sao `SALE` e `LOSS`.
6. `Venda`
   Movimentacao que reduz o saldo disponivel da amostra e exige comprador.
7. `Perda`
   Movimentacao que reduz o saldo disponivel da amostra, sem comprador, com motivo em texto livre.

## Regras fechadas de negocio

### Cliente e proprietario

1. Toda amostra nova deve ter um `Proprietario` vinculado a um `Cliente`.
2. O usuario nao deve manter um campo persistente separado de texto livre para proprietario em novas amostras.
3. Se o cliente nao existir no momento do cadastro da amostra, ele pode ser criado na hora por modal de cadastro rapido.
4. O campo de tela continua sendo apresentado como `Proprietario`.
5. O proprietario da amostra pode ser alterado depois, mesmo se a amostra ja tiver vendas registradas.
6. Alterar o proprietario exige motivo obrigatorio e gera auditoria.
7. A inscricao do proprietario e opcional.
8. Se o cliente nao tiver nenhuma inscricao, a amostra ainda pode ser salva normalmente.

### Comprador e venda

1. O comprador tambem e um `Cliente`.
2. O comprador nao fica salvo diretamente na amostra; ele existe apenas em registros de venda.
3. A inscricao do comprador e opcional.
4. Se o comprador nao existir, ele pode ser criado na hora por modal de cadastro rapido.
5. Uma amostra pode ter varias vendas, inclusive para compradores diferentes.
6. Cada venda exige, no minimo:
   comprador;
   quantidade de sacas;
   data;
   observacoes.
7. A quantidade de venda e sempre em sacas inteiras.
8. A data da venda pode ser passada ou futura.
9. A venda pode ser editada no mesmo registro.
10. A venda pode ter comprador e inscricao do comprador alterados na edicao.
11. Toda edicao de venda exige motivo obrigatorio.
12. Toda cancelamento de venda exige motivo obrigatorio.
13. Vendas acima do saldo disponivel da amostra devem ser bloqueadas.

### Perda

1. `Perda parcial` nao e um status comercial novo.
2. Perda deve ser tratada como uma movimentacao propria da amostra.
3. Uma amostra pode ter varias perdas em datas diferentes.
4. Cada perda exige, no minimo:
   data;
   quantidade;
   motivo em texto livre;
   observacao opcional.
5. A perda reduz o saldo disponivel da amostra.
6. A perda pode ser editada no mesmo registro.
7. Toda edicao de perda exige motivo obrigatorio.
8. Todo cancelamento de perda exige motivo obrigatorio.

### Status comercial

1. O status comercial passa a ser uma projecao automatica calculada a partir das movimentacoes ativas da amostra.
2. O sistema deve suportar os status:
   `OPEN`;
   `PARTIALLY_SOLD`;
   `SOLD`;
   `LOST`.
3. As regras aprovadas sao:
   `OPEN`: nenhuma venda e ainda existe saldo, mesmo com perda parcial;
   `PARTIALLY_SOLD`: existe ao menos uma venda ativa e o caso nao e `SOLD`;
   `SOLD`: toda a quantidade da amostra foi vendida, sem perda;
   `LOST`: nenhuma venda ativa e toda a quantidade da amostra foi perdida.
4. Se houver venda e perda e o saldo zerar, o status continua `PARTIALLY_SOLD`.
5. Se houver perda parcial sem nenhuma venda, o status continua `OPEN`.
6. Se uma venda ou perda for cancelada, o status deve ser recalculado automaticamente.

### Quantidade e saldo

1. A amostra continua tendo sua quantidade total de sacas como referencia principal.
2. O sistema deve calcular separadamente:
   quantidade vendida;
   quantidade perdida;
   saldo disponivel.
3. A quantidade total da amostra pode ser alterada depois.
4. A edicao da quantidade total deve ser bloqueada quando o novo total ficar menor do que `vendido + perdido`.

### Restricoes operacionais

1. Vendas e perdas so podem ser registradas depois que a amostra estiver `CLASSIFIED`.
2. Se a amostra estiver `INVALIDATED`, deve bloquear:
   novas vendas;
   novas perdas;
   edicao de vendas;
   edicao de perdas;
   cancelamento de vendas;
   cancelamento de perdas;
   troca de proprietario.
3. Clientes e inscricoes inativos continuam validos para historico, mas devem ficar bloqueados para novos vinculos e novas movimentacoes.

## Cliente - estrutura aprovada

### Regras gerais

1. O codigo do cliente deve ser gerado automaticamente pelo sistema.
2. O formato aprovado do codigo e sequencial simples.
3. O codigo do cliente nao pode ser editado.
4. Todos os usuarios autenticados poderao cadastrar, editar, inativar e reativar clientes.
5. Todos os usuarios autenticados poderao criar, editar e cancelar movimentacoes comerciais.
6. O telefone do cliente, na primeira versao, sera um unico telefone principal.
7. A busca de clientes no modulo proprio deve funcionar por:
   codigo;
   nome ou razao social;
   nome fantasia;
   CPF/CNPJ.
8. Na criacao rapida em modal, os campos minimos aprovados sao:
   nome;
   CPF ou CNPJ;
   flags comprador/vendedor.

### Pessoa fisica

1. `PF` deve ter estrutura propria desde o inicio.
2. Os campos-base de `PF` sao:
   nome completo;
   CPF;
   telefone;
   status;
   flags comprador/vendedor.
3. Pessoa fisica tambem pode ter inscricoes, inclusive em cenarios de produtor rural.

### Pessoa juridica

1. `PJ` deve ter estrutura propria desde o inicio.
2. Os campos-base de `PJ` sao:
   razao social;
   nome fantasia;
   CNPJ;
   telefone;
   status;
   flags comprador/vendedor.

## Inscricoes - estrutura aprovada

1. Um cliente pode existir sem nenhuma inscricao.
2. A inscricao tem status proprio `ACTIVE`/`INACTIVE`.
3. O tipo da inscricao sera texto livre na primeira versao.
4. Cada inscricao deve guardar:
   numero;
   tipo;
   endereco completo;
   bairro;
   cidade;
   UF;
   CEP;
   complemento.
5. Um cliente pode ter varias inscricoes.
6. Nao existe conceito de `inscricao principal` na primeira versao.
7. Se uma inscricao usada em amostra ou movimentacao for alterada ou inativada depois, o sistema deve continuar mostrando os dados atuais, mas deixando claro no historico que o vinculo anterior usava outra inscricao.

## Historico e auditoria

1. O sistema deve salvar snapshots de auditoria no momento do vinculo de proprietario e das movimentacoes.
2. Esses snapshots nao substituem o cadastro atual; servem apenas para historico e rastreabilidade.
3. O cadastro de clientes deve ter trilha propria de auditoria.
4. A amostra deve mostrar em sua trilha eventos como:
   proprietario alterado;
   venda criada;
   venda editada;
   venda cancelada;
   perda registrada;
   perda editada;
   perda cancelada.
5. Alteracoes de cliente, inscricao, proprietario, venda e perda exigem motivo obrigatorio.

## Interface aprovada

### Modulo de clientes

1. A primeira versao deve incluir modulo completo de clientes com:
   lista;
   busca;
   cadastro;
   edicao;
   inativacao;
   reativacao.

### Cadastro da amostra

1. O cadastro da amostra deve trocar o proprietario textual por autocomplete de cliente.
2. Quando o cliente nao for encontrado, deve abrir modal de cadastro rapido na propria tela.
3. A inscricao do proprietario deve ser selecionavel, mas opcional.

### Detalhe da amostra

1. O detalhe da amostra deve permitir alterar o proprietario por cliente, com motivo obrigatorio.
2. O detalhe da amostra deve ter uma lista unica de movimentacoes.
3. A lista unica deve mostrar vendas e perdas ativas e canceladas.
4. A lista unica deve ter filtros.
5. O detalhe da amostra deve exibir:
   quantidade total;
   quantidade vendida;
   quantidade perdida;
   saldo disponivel.

### Lista de amostras

1. A lista de amostras deve permitir filtro por proprietario.
2. A lista de amostras deve permitir filtro por comprador.
3. O dashboard, na primeira versao, nao precisa de indicadores de venda.

### Etiqueta e laudo

1. A etiqueta continua simples e segue exibindo o nome vinculado ao proprietario.
2. O laudo continua simples na primeira versao.
3. No laudo completo, o proprietario continua sendo mostrado.
4. O laudo parcial para comprador continua sem exibir proprietario.

## Direcao tecnica aprovada

### Banco

1. Criar novas tabelas para cliente, inscricao e auditoria de cliente.
2. Criar estrutura persistente para movimentacoes comerciais da amostra.
3. Adicionar `PARTIALLY_SOLD` ao enum de status comercial.
4. Adicionar na amostra os campos estruturados de proprietario-cliente.
5. Preservar `declared_owner` como espelho tecnico para compatibilidade de transicao.
6. Adicionar campos de projecao para quantidades vendida e perdida.
7. Adicionar indices para busca e filtros de clientes, proprietarios e compradores.

### Backend

1. Criar CRUD de clientes e inscricoes.
2. Criar busca de clientes para autocomplete e para modulo completo.
3. Integrar a amostra com o proprietario-cliente.
4. Criar comandos e consultas de venda.
5. Criar comandos e consultas de perda.
6. Recalcular automaticamente status comercial e saldo disponivel.
7. Emitir eventos e auditoria para proprietario e movimentacoes.

### Frontend

1. Criar modulo de clientes.
2. Atualizar tela de nova amostra.
3. Atualizar detalhe da amostra.
4. Atualizar filtros da lista de amostras.
5. Manter etiqueta e laudo com adaptacoes minimas.

## Etapas macro de implementacao

1. Banco e Prisma: novas tabelas, novos enums, novos campos na amostra, indices e `PARTIALLY_SOLD`.
2. Backend de clientes: CRUD, busca, auditoria e inscricoes.
3. Integracao da amostra com proprietario-cliente, preservando `declared_owner` como espelho tecnico.
4. Movimentacoes de venda/perda com calculo automatico de saldo e status comercial.
5. Atualizacao das telas de amostra, filtros e modulo de clientes.
6. Ajuste de laudo, etiqueta, contratos JSON Schema, documentacao e testes.

## Fora do escopo da primeira versao

1. Importacao em lote por Excel ou CSV.
2. Modulo de importacao com tratamento de duplicidades.
3. Indicadores comerciais no dashboard.
4. Enderecos ou telefones multiplos alem do escopo aprovado.
5. Campo persistente duplicado de proprietario digitado manualmente para novas amostras.

## Regras de rollout

1. A mudanca deve ser implantada primeiro em desenvolvimento local.
2. Depois deve seguir para producao via fluxo canary com migracao via Cloud Run Jobs.
3. Nao ha necessidade de importacao inicial de clientes na primeira versao.
4. Amostras antigas podem permanecer sem vinculo estruturado e ser removidas posteriormente, conforme decisao operacional.
5. O rollout deve preservar compatibilidade suficiente para nao quebrar laudo, etiqueta, listagem e historico durante a transicao.
