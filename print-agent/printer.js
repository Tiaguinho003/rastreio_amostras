import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as log from './logger.js';

export function sendToPrinter(printerName, _port, tsplCommands) {
  const tmpFile = join(tmpdir(), `safras-label-${Date.now()}.bin`);

  try {
    writeFileSync(tmpFile, tsplCommands, 'ascii');
    log.debug(`Enviando para impressora: ${printerName}`);
    execSync(`copy /b "${tmpFile}" "${printerName}"`, {
      stdio: 'ignore',
      shell: true,
      timeout: 10000,
    });
    log.debug('Dados enviados para impressora com sucesso');
  } catch (err) {
    const hint = err.killed
      ? 'Impressora nao respondeu em 10s. Verifique se esta ligada e conectada via USB.'
      : 'Verifique: (1) impressora ligada, (2) cabo USB conectado, (3) porta no .env correta (PRINTER_NAME).';
    throw new Error(`Falha ao enviar para "${printerName}": ${err.message}. ${hint}`);
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}
