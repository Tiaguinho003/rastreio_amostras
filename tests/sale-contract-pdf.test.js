import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PDFDocument } from 'pdf-lib';

import { getContractIssuer } from '../src/sale-contracts/issuer-config.js';
import { buildEspelhoSnapshot } from '../src/sale-contracts/sale-contract-support.js';
import {
  SaleContractPdfService,
  formatCep,
  formatCurrencyBRL,
  formatDateBR,
  formatDocument,
  formatMonthYearExtenso,
} from '../src/sale-contracts/sale-contract-pdf-service.js';

function fakeContract(overrides = {}) {
  return {
    id: 'c1',
    type: 'MERCADO_A_VISTA',
    contractNumber: '0001/26',
    status: 'EMITIDO',
    contractDate: '2026-06-26T00:00:00.000Z',
    sellerSnapshot: {
      displayName: 'Vendedor X',
      cnpj: '12345678000199',
      registrationNumber: '123456',
      addressLine: 'Rua A, 100',
      district: 'Centro',
      city: 'Guaxupé',
      state: 'MG',
    },
    buyerSnapshot: {
      displayName: 'Comprador Y',
      cnpj: '98765432000111',
      city: 'Santos',
      state: 'SP',
    },
    buyerWarehouseSnapshot: null,
    sellerWarehouseSnapshot: null,
    quantitySacks: 10,
    unitPrice: 1234.56,
    totalValue: 12345.6,
    weightKg: null,
    sellerBrokeragePct: 2,
    sellerBrokerageValue: 246.91,
    buyerBrokeragePct: 1.5,
    buyerBrokerageValue: 185.18,
    agioDesagioType: null,
    agioDesagioValue: null,
    paymentCondition: '50% na retirada',
    paymentFormText: 'Faturado',
    modalityText: 'Retirar',
    packagingText: 'Sacaria',
    invoiceDate: '2026-07-10T00:00:00.000Z',
    paymentDate: '2026-07-20T00:00:00.000Z',
    purchaseNumber: 'NF-123',
    // Snapshot PRE-D141 de proposito (com compeCode): trava a compat do render
    // de contratos antigos; snapshots novos saem so com bankName.
    sellerBankSnapshot: {
      bankName: 'Banco Teste',
      compeCode: '001',
      agency: '0001',
      accountNumber: '12345-6',
      holderName: 'Vendedor X',
      holderTaxId: '12345678000199',
      pixKey: 'chave@pix',
    },
    observations: 'Observação de teste.',
    description: 'Descrição de teste.',
    brokers: [],
    ...overrides,
  };
}

test('renderContractPdf produz um PDF válido (%PDF) e não-trivial', async () => {
  const service = new SaleContractPdfService();
  const { buffer, checksumSha256 } = await service.renderContractPdf(fakeContract(), {
    lotNumber: '20001',
    issuer: getContractIssuer(),
  });
  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(buffer.length > 1500);
  assert.match(checksumSha256, /^[0-9a-f]{64}$/);
});

test('renderContractPdf lida com opcionais nulos (sem armazéns/observações/peso)', async () => {
  const service = new SaleContractPdfService();
  const { buffer } = await service.renderContractPdf(
    fakeContract({
      observations: null,
      description: null,
      purchaseNumber: null,
      weightKg: null,
      buyerWarehouseSnapshot: null,
      sellerWarehouseSnapshot: null,
    }),
    { lotNumber: null, issuer: getContractIssuer() }
  );
  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
});

test('renderContractPdf/renderEspelhoPdf: datas planejadas "À definir" (null, D144) não quebram', async () => {
  const service = new SaleContractPdfService();
  const contract = fakeContract({ type: 'FUTURO', invoiceDate: null, paymentDate: null });
  const { buffer } = await service.renderContractPdf(contract, {
    lotNumber: null,
    issuer: getContractIssuer(),
  });
  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  const snapshot = buildEspelhoSnapshot(contract, 'seller');
  assert.equal(snapshot.paymentDate, null, 'pagamento "À definir" chega ao snapshot como null');
  const espelho = await service.renderEspelhoPdf(snapshot, {
    issuer: getContractIssuer(),
    generatedAt: new Date('2026-07-29T15:00:00.000Z'),
  });
  assert.equal(espelho.buffer.subarray(0, 5).toString('latin1'), '%PDF-');
});

test('formatCurrencyBRL', () => {
  const out = formatCurrencyBRL(1234.5);
  assert.ok(out.startsWith('R$'));
  assert.ok(out.includes('1.234,50'));
  assert.equal(formatCurrencyBRL(null), null);
});

test('formatDateBR: dd/mm/aaaa em UTC', () => {
  assert.equal(formatDateBR('2026-06-26T00:00:00.000Z'), '26/06/2026');
  assert.equal(formatDateBR(null), null);
});

test('formatMonthYearExtenso', () => {
  assert.equal(formatMonthYearExtenso('2026-06-26T00:00:00.000Z'), 'junho de 2026');
  assert.equal(formatMonthYearExtenso('2026-01-15T00:00:00.000Z'), 'janeiro de 2026');
});

test('formatDocument: CPF e CNPJ', () => {
  assert.equal(formatDocument('12345678901'), '123.456.789-01');
  assert.equal(formatDocument('12345678000199'), '12.345.678/0001-99');
  assert.equal(formatDocument(null), null);
});

test('renderContractPdf: o documento cabe em UMA página (com todos os campos + armazéns)', async () => {
  const service = new SaleContractPdfService();
  const { buffer } = await service.renderContractPdf(
    fakeContract({
      buyerWarehouseSnapshot: {
        displayName: 'Armazém do Comprador S/A',
        cnpj: '11222333000144',
        registrationNumber: '111222333',
        addressLine: 'Cais do Porto, Armazém 7',
        district: 'Porto',
        city: 'Santos',
        state: 'SP',
        postalCode: '11013000',
      },
      sellerWarehouseSnapshot: {
        displayName: 'Armazém do Vendedor S/A',
        cnpj: '55666777000122',
        registrationNumber: '555666777',
        addressLine: 'Rodovia BR-365, km 12',
        district: 'Zona Rural',
        city: 'Patrocínio',
        state: 'MG',
        postalCode: '38740000',
      },
      observations: 'Observação longa '.repeat(40),
      description: 'Descrição longa '.repeat(40),
    }),
    { lotNumber: '20001', issuer: getContractIssuer() }
  );
  const doc = await PDFDocument.load(buffer);
  assert.equal(doc.getPageCount(), 1);
});

// RC-D103: o espelho renderiza de um SNAPSHOT, nao da view do contrato. Os testes
// abaixo passam pelo buildEspelhoSnapshot de proposito — e o caminho de producao, e
// e o que faz a asserção sobre o snapshot (no unit) valer para o papel.
// `generatedAt` fixo: sem ele o checksum mudaria de um dia para o outro.
const GENERATED_AT = new Date('2026-07-29T15:00:00.000Z');

function espelhoOpts() {
  return { issuer: getContractIssuer(), generatedAt: GENERATED_AT };
}

test('renderEspelhoPdf (vendedor): PDF válido (%PDF) e não-trivial', async () => {
  const service = new SaleContractPdfService();
  const { buffer, checksumSha256 } = await service.renderEspelhoPdf(
    buildEspelhoSnapshot(fakeContract(), 'seller'),
    espelhoOpts()
  );
  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(buffer.length > 1200);
  assert.match(checksumSha256, /^[0-9a-f]{64}$/);
});

test('renderEspelhoPdf: vendedor x comprador geram documentos diferentes (CLIENTE + comissão por lado)', async () => {
  const service = new SaleContractPdfService();
  const seller = await service.renderEspelhoPdf(
    buildEspelhoSnapshot(fakeContract(), 'seller'),
    espelhoOpts()
  );
  const buyer = await service.renderEspelhoPdf(
    buildEspelhoSnapshot(fakeContract(), 'buyer'),
    espelhoOpts()
  );
  assert.notEqual(seller.checksumSha256, buyer.checksumSha256);
});

test('renderEspelhoPdf: cabe em UMA página e lida com opcionais nulos', async () => {
  const service = new SaleContractPdfService();
  const { buffer } = await service.renderEspelhoPdf(
    buildEspelhoSnapshot(
      fakeContract({ agioDesagioType: null, agioDesagioValue: null, purchaseNumber: null }),
      'buyer'
    ),
    espelhoOpts()
  );
  const doc = await PDFDocument.load(buffer);
  assert.equal(doc.getPageCount(), 1);
});

// A auditoria achou que o caminho do agio no PDF nunca era exercido: o teste que se
// chamava "lida com agio" passava agioDesagioType NULO. Aqui ele e exercido de fato.
test('renderEspelhoPdf: com ágio cabe em UMA página e muda o documento', async () => {
  const service = new SaleContractPdfService();
  const comAgio = fakeContract({ agioDesagioType: 'AGIO', agioDesagioValue: 50 });
  const { buffer, checksumSha256 } = await service.renderEspelhoPdf(
    buildEspelhoSnapshot(comAgio, 'seller'),
    espelhoOpts()
  );
  const doc = await PDFDocument.load(buffer);
  assert.equal(doc.getPageCount(), 1);
  const semAgio = await service.renderEspelhoPdf(
    buildEspelhoSnapshot(fakeContract(), 'seller'),
    espelhoOpts()
  );
  assert.notEqual(checksumSha256, semAgio.checksumSha256);
});

// RC-D103: o mesmo snapshot + a mesma data sempre produzem o MESMO documento. E o que
// sustenta a promessa "reabrir um espelho guardado entrega o papel que foi entregue".
test('renderEspelhoPdf: snapshot igual => bytes iguais (releitura determinística)', async () => {
  const service = new SaleContractPdfService();
  const snapshot = buildEspelhoSnapshot(fakeContract(), 'seller');
  const a = await service.renderEspelhoPdf(snapshot, espelhoOpts());
  const b = await service.renderEspelhoPdf(structuredClone(snapshot), espelhoOpts());
  assert.equal(a.checksumSha256, b.checksumSha256);
  // ...e a data de geracao E o que muda quando so ela muda.
  const outroDia = await service.renderEspelhoPdf(snapshot, {
    issuer: getContractIssuer(),
    generatedAt: new Date('2026-08-30T15:00:00.000Z'),
  });
  assert.notEqual(a.checksumSha256, outroDia.checksumSha256);
});

test('formatCep: 8 dígitos -> #####-###', () => {
  assert.equal(formatCep('37800000'), '37800-000');
  assert.equal(formatCep('37800-000'), '37800-000');
  assert.equal(formatCep(null), null);
  assert.equal(formatCep(''), null);
  assert.equal(formatCep('123'), '123');
});

test('renderContractPdf: parte PF consolida os dados da fazenda (unit fallback)', async () => {
  const service = new SaleContractPdfService();
  const { buffer } = await service.renderContractPdf(
    fakeContract({
      sellerSnapshot: {
        displayName: 'João Produtor',
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
          cnpj: '11222333000144',
          registrationNumber: '987654',
          addressLine: 'Fazenda Boa Vista, s/n',
          district: 'Zona Rural',
          city: 'Patrocínio',
          state: 'MG',
          postalCode: '38740000',
        },
      },
    }),
    { lotNumber: '20002', issuer: getContractIssuer() }
  );
  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
});
