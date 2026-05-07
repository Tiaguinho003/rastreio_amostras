// Prisma 6 com prisma.config.ts deixa de auto-carregar .env. Para que o CLI
// (`prisma migrate`, `prisma db seed`, etc.) enxergue DATABASE_URL no
// desenvolvimento local, recarregamos o .env via API nativa do Node 20+.
// Em CI/prod as envs ja vem injetadas, entao o arquivo pode nao existir.
import { loadEnvFile } from 'node:process';

import { defineConfig } from 'prisma/config';

try {
  loadEnvFile();
} catch {
  // .env ausente — segue o jogo (env ja deve estar no ambiente).
}

export default defineConfig({
  migrations: {
    seed: 'node prisma/seed.js',
  },
});
