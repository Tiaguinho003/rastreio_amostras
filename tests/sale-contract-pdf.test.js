import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getContractIssuer } from '../src/sale-contracts/issuer-config.js';
import {
  SaleContractPdfService,
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
    status: 'CONFERIR',
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
    weightKg: null,
    sellerBrokeragePct: 2,
    buyerBrokeragePct: 1.5,
    agioDesagioType: null,
    agioDesagioValue: null,
    paymentCondition: '50% na retirada',
    paymentFormText: 'Faturado',
    modalityText: 'Retirar',
    packagingText: 'Sacaria',
    invoiceDate: '2026-07-10T00:00:00.000Z',
    paymentDate: '2026-07-20T00:00:00.000Z',
    purchaseNumber: 'NF-123',
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
