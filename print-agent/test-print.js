import { sendToPrinter } from './printer.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const tspl = [
  'SIZE 100 mm, 35 mm',
  'GAP 3 mm, 0 mm',
  'DIRECTION 1',
  'CLS',
  'TEXT 50,50,"4",0,1,1,"TESTE SAFRAS"',
  'TEXT 50,110,"3",0,1,1,"Impressao OK"',
  'PRINT 1,1',
].join('\r\n') + '\r\n';

console.log(`Impressora: ${config.printerName}`);
console.log('Enviando etiqueta de teste...');

try {
  sendToPrinter(config.printerName, null, tspl);
  console.log('Etiqueta impressa com sucesso!');
} catch (err) {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
}
