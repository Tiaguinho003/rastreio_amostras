import { sendToPrinter } from './printer.js';
import { buildLabel } from './label.js';
import { loadConfig } from './config.js';

const config = loadConfig();

const mockJob = {
  sampleId: 'test-sample-001',
  printAction: 'PRINT',
  attemptNumber: 1,
  sample: {
    id: 'test-sample-001',
    internalLotNumber: 'A-0042',
    qrValue: 'A-0042',
    version: 1,
    declared: {
      owner: 'Fazenda São João',
      sacks: 25,
    }
  }
};

console.log(`Impressora: ${config.printerName}`);
console.log('Gerando etiqueta de teste...');

const tspl = buildLabel(mockJob);
console.log(`Tamanho: ${tspl.length} bytes`);

try {
  sendToPrinter(config.printerName, null, tspl);
  console.log('Etiqueta impressa com sucesso!');
} catch (err) {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
}
