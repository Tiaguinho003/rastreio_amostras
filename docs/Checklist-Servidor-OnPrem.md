# Checklist do Host On-Prem

Status: Suporte operacional  
Escopo: coleta minima de dados do host para instalar `internal-production`  
Ultima revisao: 2026-03-16  
Documentos relacionados: `docs/Operacao-e-Runtime.md`

## 1. Como usar este documento

1. Preencher todos os campos marcados como obrigatorios antes da primeira instalacao `internal-production`.
2. Validar respostas com Infra e registrar responsavel por item.
3. Usar este checklist como entrada para preparar tanto o piloto persistente quanto o servidor oficial.

## 2. Dados gerais da instalacao (obrigatorio)

1. [ ] Instalacao alvo: `internal-production` piloto local ou `internal-production` servidor oficial
2. [ ] Nome do servidor (hostname):
3. [ ] Responsavel tecnico pelo host:
4. [ ] Time responsavel por backup:
5. [ ] Janela de manutencao aprovada:
6. [ ] Timezone oficial do host (esperado: `America/Sao_Paulo`):

## 3. Hardware e sistema operacional (obrigatorio)

1. [ ] CPU (modelo e numero de vCPU):
2. [ ] Memoria RAM total:
3. [ ] Disco total:
4. [ ] Disco livre atual:
5. [ ] Tipo de disco (`SSD`, `NVMe`, `HDD`):
6. [ ] Sistema de arquivos (`ext4`, `xfs`, etc):
7. [ ] Sistema operacional e versao:
8. [ ] Kernel:
9. [ ] Usuario administrativo de operacao disponivel:

Referencia inicial para MVP (ajustar apos carga real):
1. 4 vCPU
2. 8 GB RAM
3. 100 GB SSD livre para app + banco + backups locais curtos

## 4. Rede e acesso (obrigatorio)

1. [ ] IP privado:
2. [ ] IP publico (se existir):
3. [ ] DNS/domino usado pela aplicacao:
4. [ ] Acesso SSH liberado para time autorizado:
5. [ ] Portas liberadas no firewall de borda:
6. [ ] Portas liberadas no firewall local do host:
7. [ ] Acesso de saida para internet (sim/nao):
8. [ ] Existe proxy corporativo para saida (sim/nao):
9. [ ] Aplicacao sera acessada apenas por rede interna (sim/nao):

## 5. Seguranca e conformidade (obrigatorio)

1. [ ] Certificado TLS (origem e validade):
2. [ ] Processo de renovacao de certificado:
3. [ ] Politica de hardening aplicada ao host:
4. [ ] Antimalware/EDR exigido pela empresa:
5. [ ] Politica de senha e rotacao de credenciais:
6. [ ] Armazenamento de segredos (`.env`, cofre, outro):
7. [ ] Registro de auditoria de acesso administrativo:
8. [ ] Restricao de acesso ao PostgreSQL (somente rede interna):

## 6. Runtime da aplicacao (obrigatorio)

1. [ ] Docker instalado (versao):
2. [ ] Docker Compose instalado (versao):
3. [ ] Se nao usar Docker, Node.js instalado (versao alvo: 22):
4. [ ] Politica de restart automatica para servicos:
5. [ ] Limites de recursos por container/processo:
6. [ ] Diretorio persistente para uploads (`UPLOADS_DIR`) definido:
7. [ ] Diretorio persistente para backups definido:

## 7. Banco de dados PostgreSQL (obrigatorio)

1. [ ] Banco no mesmo host da app ou host dedicado:
2. [ ] Versao do PostgreSQL:
3. [ ] Host/porta do banco:
4. [ ] Nome do banco de producao:
5. [ ] Usuario de aplicacao (sem superuser):
6. [ ] Politica de senha do usuario de aplicacao:
7. [ ] Limite de conexoes:
8. [ ] Politica de vacuum/autovacuum revisada:
9. [ ] Rotina de backup de banco definida:
10. [ ] Teste de restore de banco executado:

## 8. Backup e recuperacao (obrigatorio)

1. [ ] Backup diario de banco configurado:
2. [ ] Backup diario de uploads configurado:
3. [ ] Retencao alinhada com arquitetura:
4. [ ] 14 diarios
5. [ ] 8 semanais
6. [ ] 12 mensais
7. [ ] Local secundario de armazenamento (NAS/outro servidor):
8. [ ] Criptografia dos backups em repouso:
9. [ ] Criptografia dos backups em transito:
10. [ ] Tempo de restore medido:
11. [ ] Responsavel por executar restore em incidente:

## 9. Observabilidade e operacao (obrigatorio)

1. [ ] Endpoint de healthcheck monitorado:
2. [ ] Coleta de logs da aplicacao ativa:
3. [ ] Rotacao de logs configurada:
4. [ ] Retencao de logs definida:
5. [ ] Monitoramento de disco/RAM/CPU configurado:
6. [ ] Alertas de indisponibilidade configurados:
7. [ ] Canal de alerta (email, chat, NOC):
8. [ ] Runbook de incidente publicado:

## 10. Continuidade e metas de recuperacao (obrigatorio)

1. [ ] RTO aprovado (tempo maximo de indisponibilidade):
2. [ ] RPO aprovado (perda maxima de dados):
3. [ ] Plano de rollback aprovado:
4. [ ] Procedimento de mudanca para deploy em producao:
5. [ ] Responsavel por aprovar go-live:

## 11. Matriz de portas sugerida para este projeto

1. SSH administrativo: `22/tcp` (restrito por IP/VPN)
2. HTTP aplicacao: `80/tcp` (opcional se redirecionar para HTTPS)
3. HTTPS aplicacao: `443/tcp`
4. PostgreSQL: `5432/tcp` (nao expor publicamente)

## 12. Campos minimos para iniciar configuracao tecnica

1. [ ] SO e versao
2. [ ] CPU/RAM/disco livre
3. [ ] IP + DNS
4. [ ] Politica de portas/firewall
5. [ ] Estrategia de banco (local ou dedicado)
6. [ ] Estrategia de backup (destino + retencao)
7. [ ] Metodo de TLS/certificado
8. [ ] Responsaveis operacionais (infra e aplicacao)

## 13. Resultado final do checklist

1. [ ] Aprovado para preparar a instalacao piloto `internal-production`
2. [ ] Aprovado para preparar a instalacao oficial `internal-production`
3. [ ] Pendencias abertas (listar abaixo):
4. [ ] Pendencia 1:
5. [ ] Pendencia 2:
6. [ ] Pendencia 3:
