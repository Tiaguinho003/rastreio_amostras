import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderSamplePdf } from '../src/reports/sample-pdf-report-service.js';

// Preview do PDF do laudo (LAUDO TECNICO) para revisao de layout SEM precisar de
// uma amostra real no banco. Monta dados-exemplo (iguais ao mockup) + uma foto de
// teste e escreve o PDF. Gera as 2 variantes: classificada e sem classificacao.
// Uso: node scripts/preview-laudo.mjs [saida.pdf]
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUB = join(ROOT, 'public');
const OUT = process.argv[2] || join(ROOT, 'laudo-preview.pdf');

const photoBytes = readFileSync(join(PUB, 'login-coffee-beans.png'));

const selectedFieldEntries = [
  { id: 'harvest', label: 'Safra', value: '26/27' },
  { id: 'sacks', label: 'Quantidade de sacas', value: '31' },
  { id: 'padrao', label: 'Padrão', value: 'L3-P3B' },
  { id: 'catacao', label: 'Catação', value: '23%' },
  { id: 'aspecto', label: 'Aspecto', value: 'FC' },
  { id: 'broca', label: 'Broca', value: '0,5%' },
  { id: 'imp', label: 'IMP', value: '0,1%' },
  { id: 'peneirasPercentuais', label: 'Peneiras', value: 'P17: 11% | MK: 12% | Fundo 13 = 6%' },
];

const common = {
  sample: { internalLotNumber: '5831' },
  selectedFieldEntries,
  issuedAtIso: '2026-06-28T12:00:00.000Z',
  // cabecalho = imagem unica; arvore verde do rodape = icon-safras
  headerImagePath: join(PUB, 'laudo-header.png'),
  iconPath: join(PUB, 'icon-safras.png'),
};

const classified = await renderSamplePdf({
  ...common,
  classificationAttachment: { mimeType: 'image/png' },
  classificationPhotoBytes: photoBytes,
});
writeFileSync(OUT, classified);
console.log('classificado        ->', OUT);

const unclassified = await renderSamplePdf({
  ...common,
  selectedFieldEntries: selectedFieldEntries.filter((e) => ['harvest', 'sacks'].includes(e.id)),
  classificationAttachment: null,
  classificationPhotoBytes: null,
  unclassified: true,
});
const OUT2 = OUT.replace(/\.pdf$/, '-sem-classif.pdf');
writeFileSync(OUT2, unclassified);
console.log('sem classificação   ->', OUT2);
