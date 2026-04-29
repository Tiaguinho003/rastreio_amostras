import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClientDisplayName,
  normalizeCreateBranchInput,
  normalizeCreateClientInput,
  normalizeLookupClientsInput,
  normalizeRegistrationCanonical,
  normalizeUpdateClientInput,
} from '../src/clients/client-support.js';

test('normalizeRegistrationCanonical removes formatting and lowercases content', () => {
  assert.equal(normalizeRegistrationCanonical(' 00.2864/015-0010 '), '0028640150010');
  assert.equal(normalizeRegistrationCanonical('ABC-123/x'), 'abc123x');
});

test('buildClientDisplayName resolves PF and PJ names correctly', () => {
  assert.equal(
    buildClientDisplayName({
      personType: 'PF',
      fullName: 'Francisco Sales',
    }),
    'Francisco Sales'
  );

  assert.equal(
    buildClientDisplayName({
      personType: 'PJ',
      legalName: 'Atlantica Exportacao e Importacao S/A',
    }),
    'Atlantica Exportacao e Importacao S/A'
  );
});

test('normalizeCreateClientInput enforces PF shape and canonical document', () => {
  const { data, commercialUserIds, branches } = normalizeCreateClientInput({
    personType: 'PF',
    fullName: '  Francisco Sales Darcadia ',
    cpf: '016.179.708-32',
    phone: '35 99999-0000',
    isBuyer: false,
    isSeller: true,
  });

  assert.equal(data.personType, 'PF');
  assert.equal(data.fullName, 'Francisco Sales Darcadia');
  assert.equal(data.cpf, '01617970832');
  assert.equal(data.phone, '35999990000');
  assert.equal(data.legalName, null);
  assert.deepEqual(commercialUserIds, []);
  assert.deepEqual(branches, []);
});

test('normalizeCreateClientInput accepts PF clients without cpf', () => {
  const { data } = normalizeCreateClientInput({
    personType: 'PF',
    fullName: 'Francisco Sales Darcadia',
    phone: '35 99999-0000',
    isBuyer: false,
    isSeller: true,
  });

  assert.equal(data.cpf, null);
  assert.equal(data.fullName, 'Francisco Sales Darcadia');
});

test('normalizeCreateClientInput accepts PJ clients without branches (transient state)', () => {
  const { data, branches } = normalizeCreateClientInput({
    personType: 'PJ',
    legalName: 'Coopercitrus',
    phone: '35 99999-0000',
    isBuyer: true,
    isSeller: true,
  });

  assert.equal(data.legalName, 'Coopercitrus');
  assert.deepEqual(branches, []);
});

test('normalizeCreateClientInput accepts PJ with branches[] inline (B3)', () => {
  const { data, branches } = normalizeCreateClientInput({
    personType: 'PJ',
    legalName: 'Coopercitrus',
    phone: '35 99999-0000',
    isBuyer: true,
    isSeller: true,
    branches: [
      { isPrimary: true, cnpj: '03.936.815/0001-75' },
      { cnpj: '03.936.815/0002-56', city: 'Belo Horizonte', state: 'MG' },
    ],
  });

  assert.equal(data.legalName, 'Coopercitrus');
  assert.equal(branches.length, 2);
  assert.equal(branches[0].isPrimary, true);
  assert.equal(branches[0].cnpj, '03936815000175');
  assert.equal(branches[1].isPrimary, false);
  assert.equal(branches[1].cnpj, '03936815000256');
});

test('normalizeCreateClientInput rejects branches[] with multiple isPrimary=true', () => {
  assert.throws(
    () =>
      normalizeCreateClientInput({
        personType: 'PJ',
        legalName: 'Coopercitrus',
        phone: '35 99999-0000',
        isBuyer: true,
        isSeller: true,
        branches: [
          { isPrimary: true, cnpj: '03.936.815/0001-75' },
          { isPrimary: true, cnpj: '03.936.815/0002-56' },
        ],
      }),
    /only one branch can be isPrimary/
  );
});

test('normalizeCreateClientInput rejects cnpj at client level (F5.2)', () => {
  assert.throws(
    () =>
      normalizeCreateClientInput({
        personType: 'PJ',
        legalName: 'Coopercitrus',
        cnpj: '03.936.815/0001-75',
        phone: '35 99999-0000',
        isBuyer: true,
        isSeller: true,
      }),
    /cnpj cannot be provided/
  );
});

test('normalizeCreateClientInput still rejects malformed cpf', () => {
  assert.throws(
    () =>
      normalizeCreateClientInput({
        personType: 'PF',
        fullName: 'Francisco Sales Darcadia',
        cpf: '123',
        phone: '35 99999-0000',
        isBuyer: false,
        isSeller: true,
      }),
    /cpf is invalid/
  );
});

test('normalizeCreateClientInput rejects invalid phone lengths', () => {
  assert.throws(
    () =>
      normalizeCreateClientInput({
        personType: 'PF',
        fullName: 'Francisco Sales Darcadia',
        cpf: '016.179.708-32',
        phone: '(35)999-000',
        isBuyer: false,
        isSeller: true,
      }),
    /phone is invalid/
  );
});

test('normalizeUpdateClientInput supports switching from PF to PJ (cnpj fica em branch)', () => {
  const result = normalizeUpdateClientInput(
    {
      personType: 'PJ',
      legalName: 'G A S Comercio de Cafe Sociedade LTDA',
      tradeName: 'G A S Comercio de Cafe Sociedade LTDA',
      isBuyer: true,
      isSeller: true,
      reasonText: 'corrigir cadastro',
    },
    {
      personType: 'PF',
      fullName: 'Cliente Antigo',
      legalName: null,
      tradeName: null,
      cpf: '01617970832',
      phone: null,
      isBuyer: false,
      isSeller: true,
    }
  );

  assert.equal(result.reasonText, 'corrigir cadastro');
  assert.equal(result.data.personType, 'PJ');
  assert.equal(result.data.legalName, 'G A S Comercio de Cafe Sociedade LTDA');
  assert.equal(result.data.tradeName, 'G A S Comercio de Cafe Sociedade LTDA');
  assert.equal(result.data.fullName, null);
  assert.equal(result.data.cpf, null);
});

test('normalizeCreateClientInput accepts payload when both buyer and seller are false', () => {
  const { data } = normalizeCreateClientInput({
    personType: 'PJ',
    legalName: 'Atlantica',
    phone: '(35) 99999-0000',
    isBuyer: false,
    isSeller: false,
  });
  assert.equal(data.isBuyer, false);
  assert.equal(data.isSeller, false);
});

test('normalizeCreateBranchInput validates address fields and canonicaliza registration', () => {
  const { data } = normalizeCreateBranchInput({
    registrationNumber: '0028640150010',
    registrationType: 'estadual',
    addressLine: 'Av. Oliveira Rezende, 1397',
    district: 'JD Bernadete',
    city: 'Sao Sebastiao do Paraiso',
    state: 'mg',
    postalCode: '37950-078',
    complement: '',
  });

  assert.equal(data.registrationNumberCanonical, '0028640150010');
  assert.equal(data.state, 'MG');
  assert.equal(data.complement, null);
});

test('normalizeLookupClientsInput enforces minimum search length and fixed limit', () => {
  const normalized = normalizeLookupClientsInput({
    search: 'atl',
    kind: 'buyer',
    limit: 999,
  });

  assert.equal(normalized.search, 'atl');
  assert.equal(normalized.kind, 'buyer');
  assert.equal(normalized.limit, 8);

  assert.throws(
    () =>
      normalizeLookupClientsInput({
        search: 'a',
        kind: 'owner',
      }),
    /search must have at least 2 characters/
  );
});
