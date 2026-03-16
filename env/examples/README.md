# Env Examples Canonicos

Arquivos canonicos desta fase:

1. `env/examples/development.env.example` -> copiar para `.env.development`
2. `env/examples/internal-production.env.example` -> copiar para `.env.internal-production`
3. `env/examples/internal-production.ops.env.example` -> copiar para `.env.internal-production.ops`

Objetivo:

1. Separar `development` do runtime e da operacao de `internal-production`.
2. Manter `.env.internal-production.ops` como overlay operacional enxuto, sem duplicar variaveis que ja pertencem ao runtime.
3. Manter os arquivos raiz antigos apenas como compatibilidade temporaria.

Compatibilidade preservada:

1. `.env.example`
2. `.env.prod.example`
3. `.env.homolog.example`

Esses arquivos legados ainda permanecem no repositorio, mas nao sao mais o caminho canonico introduzido nesta fase.
