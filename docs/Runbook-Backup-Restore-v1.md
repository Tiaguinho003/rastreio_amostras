# Runbook Backup e Restore v1

Status: Ativo  
Data: 2026-03-04  
Projeto: Rastreio Interno de Amostras

## 1. Escopo

Este runbook cobre backup e restore de:
1. Banco PostgreSQL.
2. Uploads locais (`UPLOADS_DIR`).

## 2. Scripts oficiais

1. `scripts/ops/backup-db.sh`
2. `scripts/ops/backup-uploads.sh`
3. `scripts/ops/restore-db.sh`
4. `scripts/ops/restore-uploads.sh`
5. `scripts/ops/prune-backups.sh`
6. `scripts/ops/run-backup-cycle.sh`

## 3. Variaveis de ambiente

1. `DATABASE_URL` (obrigatorio para backup/restore DB)
2. `UPLOADS_DIR` (default: `./data/uploads`)
3. `BACKUP_ROOT` (default: `./data/backups`)
4. `BACKUP_TIER` (`daily`, `weekly`, `monthly`; default: `daily`)

## 4. Politica de retencao

1. Diario: 14 backups.
2. Semanal: 8 backups.
3. Mensal: 12 backups.

Aplicacao da politica:
1. `scripts/ops/prune-backups.sh`
2. Dry-run: `scripts/ops/prune-backups.sh --dry-run`

## 5. Fluxo recomendado de backup

Execucao manual:

```bash
export DATABASE_URL="postgresql://..."
export UPLOADS_DIR="./data/uploads"
export BACKUP_ROOT="./data/backups"

scripts/ops/run-backup-cycle.sh
```

Arquivos gerados:
1. `data/backups/<tier>/db/*.sql.gz`
2. `data/backups/<tier>/uploads/*.tar.gz`
3. Arquivo `.sha256` correspondente para cada backup.

## 6. Restore de banco

Exemplo:

```bash
export DATABASE_URL="postgresql://..."
CONFIRM_RESTORE=yes scripts/ops/restore-db.sh data/backups/daily/db/rastreio-db-YYYYMMDD-HHMMSS.sql.gz
```

Notas:
1. Restore e destrutivo por padrao.
2. Para preservar schema atual: `SKIP_SCHEMA_RESET=true`.

## 7. Restore de uploads

Exemplo:

```bash
export UPLOADS_DIR="./data/uploads"
CONFIRM_RESTORE=yes scripts/ops/restore-uploads.sh data/backups/daily/uploads/rastreio-uploads-YYYYMMDD-HHMMSS.tar.gz
```

Notas:
1. Restore limpa o diretorio de uploads por padrao.
2. Para manter arquivos atuais: `SKIP_UPLOADS_CLEANUP=true`.

## 8. Automacao com systemd

Arquivos:
1. `ops/systemd/rastreio-backup.service`
2. `ops/systemd/rastreio-backup.timer`

Instalacao sugerida (host Linux):

```bash
sudo cp ops/systemd/rastreio-backup.service /etc/systemd/system/
sudo cp ops/systemd/rastreio-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rastreio-backup.timer
sudo systemctl list-timers | grep rastreio-backup
```

## 9. Teste de restore em homolog (obrigatorio)

1. Gerar backup novo (db e uploads).
2. Restaurar backup em homolog.
3. Rodar smoke test:

```bash
SMOKE_USERNAME="..." SMOKE_PASSWORD="..." scripts/ops/smoke-test.sh
```

4. Registrar tempo total de restore e resultado.

## 10. Drill automatizado BKD-003 (recomendado)

Arquivo:
1. `scripts/ops/bkd003-restore-drill.sh`

O script executa:
1. Login e criacao de baseline.
2. Backup DB e uploads.
3. Mutacao proposital de DB e uploads.
4. Restore destrutivo.
5. Smoke test.
6. Verificacao de integridade e evidencia automatica.

Pre-requisitos:
1. Stack de homolog ativa.
2. `DATABASE_URL`, `UPLOADS_DIR`, `BACKUP_ROOT`.
3. `SMOKE_USERNAME`, `SMOKE_PASSWORD`.
4. Confirmacao explicita: `DRILL_CONFIRM=yes`.

Execucao:

```bash
export DATABASE_URL="postgresql://rastreio_app:***@127.0.0.1:55433/rastreio_homolog?schema=public"
export UPLOADS_DIR="/srv/rastreio/homolog/uploads"
export BACKUP_ROOT="/srv/rastreio/homolog/backups"
export API_BASE_URL="http://localhost:3001"
export SMOKE_USERNAME="homolog_admin"
export SMOKE_PASSWORD="***"

DRILL_CONFIRM=yes scripts/ops/bkd003-restore-drill.sh
```

Evidencia gerada automaticamente em:
1. `docs/evidence/BKD-003-restore-homolog-YYYYMMDD-HHMMSS.md`

Template manual:
1. `docs/evidence/BKD-003-restore-homolog-template.md`

## 11. Override de homolog para bind mounts

Template:
1. `ops/compose/docker-compose.homolog.override.example.yml`

Uso sugerido:

```bash
cp ops/compose/docker-compose.homolog.override.example.yml /srv/rastreio/homolog/docker-compose.homolog.override.yml
docker compose -f docker-compose.prod.yml -f /srv/rastreio/homolog/docker-compose.homolog.override.yml up -d --build
```

## 12. Preflight de homolog

Arquivo:
1. `scripts/ops/homolog-preflight.sh`

Uso:

```bash
ENV_FILE=.env.homolog scripts/ops/homolog-preflight.sh
```

Saida esperada:
1. `Preflight PASSED`

## 13. Coleta de fatos do servidor

Arquivo:
1. `scripts/ops/collect-server-facts.sh`

Uso:

```bash
scripts/ops/collect-server-facts.sh
```

Saida:
1. `/tmp/rastreio-server-facts-YYYYMMDD-HHMMSS.txt`

Documento de handoff de desbloqueio:
1. `docs/Pacote-Desbloqueio-Homolog-v1.md`
