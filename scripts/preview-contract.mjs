import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SaleContractPdfService } from '../src/sale-contracts/sale-contract-pdf-service.js';
import { getContractIssuer } from '../src/sale-contracts/issuer-config.js';

// Preview do PDF do CONTRATO (Mercado à vista) para revisão de layout SEM gerar
// um contrato real. Monta um exemplo rico — comprador PJ + vendedor PF (dados
// vindos da fazenda/unit) + os 2 armazéns + alguns campos vazios (p/ ver os "—")
// — e escreve o PDF. Uso: node scripts/preview-contract.mjs [saida.pdf]
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = process.argv[2] || join(ROOT, 'contrato-preview.pdf');

const fakeContract = {
  id: 'preview',
  type: 'MERCADO_A_VISTA',
  contractNumber: '0001/26',
  status: 'CONFERIR',
  contractDate: '2026-06-28T00:00:00.000Z',
  purchaseNumber: 'NF-12345',
  // Comprador PJ — dados no próprio Client.
  buyerSnapshot: {
    displayName: 'Exportadora Café Premium Ltda',
    legalName: 'Exportadora Café Premium Ltda',
    cnpj: '12345678000199',
    registrationNumber: '123.456.789.000',
    addressLine: 'Av. das Indústrias, 1500',
    district: 'Distrito Industrial',
    city: 'Santos',
    state: 'SP',
    postalCode: '11095000',
  },
  // Vendedor PF — dados fiscais/endereço vêm da fazenda (unit); CPF na pessoa.
  sellerSnapshot: {
    displayName: 'João da Silva Produtor',
    fullName: 'João da Silva Produtor',
    personType: 'PF',
    cpf: '12345678901',
    cnpj: null,
    registrationNumber: null,
    addressLine: null,
    district: null,
    city: null,
    state: null,
    postalCode: null,
    unit: {
      name: 'Fazenda Boa Vista',
      cnpj: '98765432000111',
      registrationNumber: '987.654.321.000',
      addressLine: 'Rodovia BR-365, km 12, s/n',
      district: 'Zona Rural',
      city: 'Patrocínio',
      state: 'MG',
      postalCode: '38740000',
    },
  },
  // Armazém do comprador (PJ). Armazém do vendedor vazio (mostra "—").
  buyerWarehouseSnapshot: {
    displayName: 'Armazéns Gerais do Porto S/A',
    cnpj: '11222333000144',
    registrationNumber: '111.222.333.000',
    addressLine: 'Cais do Porto, Armazém 7',
    district: 'Porto',
    city: 'Santos',
    state: 'SP',
    postalCode: '11013000',
  },
  sellerWarehouseSnapshot: null,
  quantitySacks: 320,
  unitPrice: 1450.0,
  weightKg: 19200.0,
  sellerBrokeragePct: 2,
  buyerBrokeragePct: 1.5,
  agioDesagioType: null,
  agioDesagioValue: null,
  paymentCondition: '50% na retirada, 50% em 30 dias',
  paymentFormText: 'Faturado',
  modalityText: 'Retirar',
  packagingText: 'Sacaria',
  invoiceDate: '2026-07-10T00:00:00.000Z',
  paymentDate: '2026-07-25T00:00:00.000Z',
  sellerBankSnapshot: {
    bankName: 'BANCO DO BRASIL',
    agency: '1234-5',
    accountNumber: '67890-1',
    holderName: 'João da Silva Produtor',
    holderTaxId: '12345678901',
    pixKey: 'joao.produtor@email.com',
  },
  observations:
    'Café arábica tipo 6, bebida dura para melhor. Conferir umidade na retirada. ' +
    'Lote sujeito a reanálise pelo comprador no recebimento.',
  description: '', // vazio de propósito → "—"
  brokers: [],
};

const service = new SaleContractPdfService();
const { buffer } = await service.renderContractPdf(fakeContract, {
  lotNumber: '5831',
  issuer: getContractIssuer(),
});
writeFileSync(OUT, buffer);
console.log('contrato (exemplo) ->', OUT);
