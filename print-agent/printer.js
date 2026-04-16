import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as log from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_PRINT_SCRIPT = join(__dirname, 'raw-print.ps1');

export function sendToPrinter(printerName, _port, tsplCommands) {
  const tmpFile = join(tmpdir(), `safras-label-${Date.now()}.bin`);

  try {
    writeFileSync(tmpFile, tsplCommands, 'ascii');
    log.debug(`Enviando para impressora: ${printerName}`);

    const result = execFileSync(
      'powershell',
      [
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        RAW_PRINT_SCRIPT,
        '-FilePath',
        tmpFile,
        '-PrinterName',
        printerName,
      ],
      {
        encoding: 'utf-8',
        timeout: 60000,
      }
    );

    const output = result.trim();
    if (output !== 'OK') {
      throw new Error(`Impressora retornou: ${output}`);
    }

    log.debug('Dados enviados para impressora com sucesso');
  } catch (err) {
    const hint = err.killed
      ? 'Impressora/spooler nao respondeu em 60s. Verifique se a impressora esta ligada, pronta e conectada.'
      : 'Verifique: (1) impressora ligada, (2) cabo USB conectado, (3) nome da impressora no .env correto (PRINTER_NAME).';
    throw new Error(`Falha ao enviar para "${printerName}": ${err.message}. ${hint}`);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {}
  }
}
