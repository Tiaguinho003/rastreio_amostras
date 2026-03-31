import { loadConfig } from './config.js';
import { setLevel, info, error } from './logger.js';
import { login } from './auth.js';
import { startPolling } from './poller.js';

async function main() {
  const config = loadConfig();
  setLevel(config.logLevel);

  info('=== Safras Print Agent v1.0.0 ===');
  info(`Backend:    ${config.backendUrl}`);
  info(`Impressora: ${config.printerName}`);
  info(`Printer ID: ${config.printerId}`);
  info(`Intervalo:  ${config.pollIntervalMs}ms`);
  info(`Retry:      ${config.printRetryCount}x (delay base: ${config.printRetryDelayMs}ms)`);
  info('');

  try {
    await login(config);
  } catch (err) {
    error(`Falha no login inicial: ${err.message}`);
    process.exit(1);
  }

  await startPolling(config);
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
