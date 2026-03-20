import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClientDisplayName,
  normalizeCreateClientInput,
  normalizeCreateRegistrationInput,
  normalizeLookupClientsInput,
  normalizeRegistrationCanonical,
  normalizeUpdateClientInput
} from '../src/clients/client-support.js';

test('normalizeRegistrationCanonical removes formatting and lowercases content', () => {
  assert.equal(normalizeRegistrationCanonical(' 00.2864/015-0010 '), '0028640150010');
  assert.equal(normalizeRegistrationCanonical('ABC-123/x'), 'abc123x');
});

test('buildClientDisplayName resolves PF and PJ names correctly', () => {
  assert.equal(
    buildClientDisplayName({
      personType: 'PF',
      fullName: 'Francisco Sales'
    }),
    'Francisco Sales'
  );

  assert.equal(
    buildClientDisplayName({
      personType: 'PJ',
      legalName: 'Atlantica Exportacao e Importacao S/A'
    }),
    'Atlantica Exportacao e Importacao S/A'
  );
});

test('normalizeCreateClientInput enforces PF shape and canonical document', () => {
  const normalized = normalizeCreateClientInput({
    personType: 'PF',
    fullName: '  Francisco Sales Darcadia ',
    cpf: '016.179.708-32',
    phone: '35 99999-0000',
    isBuyer: false,
    isSeller: true
  });

  assert.equal(normalized.personType, 'PF');
  assert.equal(normalized.fullName, 'Francisco Sales Darcadia');
  assert.equal(normalized.cpf, '01617970832');
  assert.equal(normalized.documentCanonical, '01617970832');
  assert.equal(normalized.legalName, null);
  assert.equal(normalized.cnpj, null);
});

test('normalizeUpdateClientInput supports switching from PF to PJ', () => {
  const result = normalizeUpdateClientInput(
    {
      personType: 'PJ',
      legalName: 'G A S Comercio de Cafe Sociedade LTDA',
      tradeName: 'G A S Comercio de Cafe Sociedade LTDA',
      cnpj: '26.543.626/0001-38',
      isBuyer: true,
      isSeller: true,
      reasonText: 'corrigir cadastro'
    },
    {
      personType: 'PF',
      fullName: 'Cliente Antigo',
      legalName: null,
      tradeName: null,
      cpf: '01617970832',
      cnpj: null,
      phone: null,
      isBuyer: false,
      isSeller: true
    }
  );

  assert.equal(result.reasonText, 'corrigir cadastro');
  assert.equal(result.data.personType, 'PJ');
  assert.equal(result.data.legalName, 'G A S Comercio de Cafe Sociedade LTDA');
  assert.equal(result.data.tradeName, 'G A S Comercio de Cafe Sociedade LTDA');
  assert.equal(result.data.cnpj, '26543626000138');
  assert.equal(result.data.fullName, null);
  assert.equal(result.data.cpf, null);
});

test('normalizeCreateClientInput rejects payload when both buyer and seller are false', () => {
  assert.throws(
    () =>
      normalizeCreateClientInput({
        personType: 'PJ',
        legalName: 'Atlantica',
        cnpj: '03.936.815/0001-75',
        isBuyer: false,
        isSeller: false
      }),
    /At least one of isBuyer or isSeller must be true/
  );
});

test('normalizeCreateRegistrationInput validates required address fields', () => {
  const normalized = normalizeCreateRegistrationInput({
    registrationNumber: '0028640150010',
    registrationType: 'estadual',
    addressLine: 'Av. Oliveira Rezende, 1397',
    district: 'JD Bernadete',
    city: 'Sao Sebastiao do Paraiso',
    state: 'mg',
    postalCode: '37950-078',
    complement: ''
  });

  assert.equal(normalized.registrationNumberCanonical, '0028640150010');
  assert.equal(normalized.state, 'MG');
  assert.equal(normalized.complement, null);
});

test('normalizeLookupClientsInput enforces minimum search length and fixed limit', () => {
  const normalized = normalizeLookupClientsInput({
    search: 'atl',
    kind: 'buyer',
    limit: 999
  });

  assert.equal(normalized.search, 'atl');
  assert.equal(normalized.kind, 'buyer');
  assert.equal(normalized.limit, 8);

  assert.throws(
    () =>
      normalizeLookupClientsInput({
        search: 'a',
        kind: 'owner'
      }),
    /search must have at least 2 characters/
  );
});
