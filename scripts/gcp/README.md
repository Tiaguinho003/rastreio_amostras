# Scripts GCP

Status: Ponteiro local  
Escopo: wrappers operacionais para a homologacao no Google Cloud  
Ultima revisao: 2026-03-16  
Documentos relacionados: `docs/Homologacao-Google-Cloud.md`, `docs/Operacao-e-Runtime.md`

## Scripts oficiais

1. `scripts/gcp/preflight.sh`
2. `scripts/gcp/build-image.sh`
3. `scripts/gcp/deploy-cloud-homolog.sh`
4. `scripts/gcp/execute-job.sh`
5. `scripts/gcp/smoke.sh`

## Regra

1. esses scripts usam `.env.cloud-homolog` e `.env.cloud-homolog.ops`;
2. o deploy de `cloud-homolog` nao usa Compose;
3. build, deploy e jobs devem seguir o fluxo descrito em `docs/Homologacao-Google-Cloud.md`.
