import { loadConfig } from './config.js';
import { setLevel, info, warn, error } from './logger.js';
import { login } from './auth.js';
import { startPolling } from './poller.js';
import { sendToPrinter } from './printer.js';

function calibratePrinter(config) {
  const tspl =
    [
      'SIZE 100 mm, 35 mm',
      'GAP 3 mm, 0 mm',
      'DIRECTION 1',
      'REFERENCE 0,0',
      'OFFSET 0 mm',
      'SHIFT 0',
      'DENSITY 10',
      'SET TEAR ON',
      'SET RIBBON ON',
      'GAPDETECT',
    ].join('\r\n') + '\r\n';

  info('Calibrando sensor de gap da impressora...');
  try {
    sendToPrinter(config.printerName, null, tspl);
    info('Calibracao concluida');
  } catch (err) {
    warn(`Calibracao falhou: ${err.message}. Continuando mesmo assim.`);
  }
}

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

  calibratePrinter(config);

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
