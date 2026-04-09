import type { SampleExportField, SampleExportType } from './types';

export const SAMPLE_EXPORT_FIELDS: SampleExportField[] = [
  'internalLotNumber',
  'owner',
  'sacks',
  'harvest',
  'originLot',
  'classificationDate',
  'padrao',
  'catacao',
  'aspecto',
  'bebida',
  'broca',
  'pva',
  'imp',
  'defeito',
  'classificador',
  'observacoes',
  'classificationOriginLot',
  'peneirasPercentuais',
  'technicalType',
  'technicalScreen',
  'technicalDensity'
];

export const SAMPLE_EXPORT_FIELD_LABELS: Record<SampleExportField, string> = {
  internalLotNumber: 'Lote interno',
  owner: 'Proprietario',
  sacks: 'Quantidade de sacas',
  harvest: 'Safra',
  originLot: 'Lote de origem (registro)',
  classificationDate: 'Data da classificacao',
  padrao: 'Padrao',
  catacao: 'Catacao',
  aspecto: 'Aspecto',
  bebida: 'Bebida',
  broca: 'Broca',
  pva: 'PVA',
  imp: 'IMP',
  defeito: 'Defeito',
  classificador: 'Classificador',
  observacoes: 'Observacoes',
  classificationOriginLot: 'Lote de origem (classificacao)',
  peneirasPercentuais: 'Peneiras percentuais',
  technicalType: 'Tipo tecnico',
  technicalScreen: 'Peneira tecnica',
  technicalDensity: 'Densidade tecnica'
};

export const SAMPLE_EXPORT_TYPES: SampleExportType[] = ['COMPLETO', 'COMPRADOR_PARCIAL'];

export const SAMPLE_EXPORT_TYPE_LABELS: Record<SampleExportType, string> = {
  COMPLETO: 'Completo',
  COMPRADOR_PARCIAL: 'Comprador Parcial'
};
