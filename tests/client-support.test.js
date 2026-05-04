import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClientDisplayName,
  buildClientLegalName,
  normalizeCreateUnitInput,
  normalizeCreateClientInput,
  normalizeLookupClientsInput,
  normalizeRegistrationCanonical,
  normalizeUpdateClientInput,
} from '../src/clients/client-support.js';
import { isClientComplete } from '../src/clients/client-helpers.js';

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

test('Q-26: buildClientDisplayName em PJ prefere tradeName quando existe', () => {
  assert.equal(
    buildClientDisplayName({
      personType: 'PJ',
      legalName: 'COOPERCITRUS COOPERATIVA DE PRODUTORES RURAIS LTDA',
      tradeName: 'Coopercitrus',
    }),
    'Coopercitrus'
  );

  assert.equal(
    buildClientDisplayName({
      personType: 'PJ',
      legalName: 'Empresa Sem Fantasia LTDA',
      tradeName: null,
    }),
    'Empresa Sem Fantasia LTDA'
  );

  assert.equal(
    buildClientLegalName({
      personType: 'PJ',
      legalName: 'COOPERCITRUS COOPERATIVA DE PRODUTORES RURAIS LTDA',
      tradeName: 'Coopercitrus',
    }),
    'COOPERCITRUS COOPERATIVA DE PRODUTORES RURAIS LTDA',
    'buildClientLegalName ignora tradeName e retorna razao social'
  );

  assert.equal(
    buildClientLegalName({ personType: 'PF', fullName: 'Joao Silva' }),
    'Joao Silva',
    'PF: legalName helper retorna fullName (sem distincao)'
  );
});

test('Q-11/Q-27: isClientComplete marca PJ incompleto se faltar qualquer recomendado (email NAO conta)', () => {
  const completePj = {
    personType: 'PJ',
    legalName: 'Empresa Completa LTDA',
    tradeName: 'Completa',
    cnpj: '12345678000199',
    registrationNumber: '123456789',
    addressLine: 'Rua Principal, 100',
    district: 'Centro',
    city: 'Sao Paulo',
    state: 'SP',
    postalCode: '01000000',
    complement: 'Sala 1',
    // email omitido — Q-27 confirma 100% opcional, sem aviso de incompleto
  };
  const result = isClientComplete(completePj);
  assert.equal(result.complete, true);
  assert.deepEqual(result.missing, []);

  // Q-27: email null/vazio NAO marca PJ como incompleto
  const noEmailPj = { ...completePj, email: null };
  const noEmailResult = isClientComplete(noEmailPj);
  assert.equal(noEmailResult.complete, true);
  assert.ok(!noEmailResult.missing.includes('email'));

  // Outros recomendados continuam disparando incompleto
  const incompletePj = { ...completePj, complement: '' };
  const result2 = isClientComplete(incompletePj);
  assert.equal(result2.complete, false);
  assert.ok(result2.missing.includes('complement'));
  assert.ok(!result2.missing.includes('email'), 'email NAO eh recomendado pos-Q-27');
});

test('Q-11/Q-27: isClientComplete marca PF incompleto so por cpf/units (email NAO conta)', () => {
  // PF sem cpf — incompleto. email NAO consta nas missing.
  const r1 = isClientComplete({ personType: 'PF', fullName: 'Joao' });
  assert.equal(r1.complete, false);
  assert.ok(r1.missing.includes('cpf'));
  assert.ok(r1.missing.includes('units'));
  assert.ok(!r1.missing.includes('email'), 'Q-27: email opcional em PF tambem');

  // PF com cpf mas sem unidade — incompleto pelas units
  const r2 = isClientComplete({
    personType: 'PF',
    fullName: 'Joao',
    cpf: '12345678901',
    units: [],
  });
  assert.equal(r2.complete, false);
  assert.deepEqual(r2.missing, ['units']);

  // PF com cpf + 1 unidade ATIVA completa = COMPLETO (sem email)
  const r2b = isClientComplete({
    personType: 'PF',
    fullName: 'Joao',
    cpf: '12345678901',
    units: [
      {
        id: 'unit-1',
        status: 'ACTIVE',
        name: 'Fazenda Boa Vista',
        cnpj: '12345678000199',
        phone: '35999990000',
        addressLine: 'Estrada Rural',
        district: 'Zona Rural',
        city: 'Varginha',
        state: 'MG',
        postalCode: '37000000',
        registrationNumber: 'IE-1',
        car: 'CAR-1',
      },
    ],
  });
  assert.equal(r2b.complete, true);

  // PF com 1 unidade ATIVA mas faltando recomendados na unidade — incompleto
  const r3 = isClientComplete({
    personType: 'PF',
    fullName: 'Joao',
    cpf: '12345678901',
    units: [
      {
        id: 'unit-1',
        status: 'ACTIVE',
        name: 'Fazenda Boa Vista',
        // sem nenhum recomendado preenchido
      },
    ],
  });
  assert.equal(r3.complete, false);
  // 14.3.C: cnpj e phone foram REMOVIDOS dos recomendados (filiais raramente
  // tem CNPJ proprio e telefone proprio). Outros recomendados continuam.
  assert.ok(!r3.missing.some((m) => m.startsWith('units[unit-1].cnpj')));
  assert.ok(!r3.missing.some((m) => m.startsWith('units[unit-1].phone')));
  assert.ok(r3.missing.some((m) => m.startsWith('units[unit-1].addressLine')));
  assert.ok(r3.missing.some((m) => m.startsWith('units[unit-1].car')));

  // PF com unidade INATIVA conta como sem unidade ATIVA
  const r4 = isClientComplete({
    personType: 'PF',
    fullName: 'Joao',
    cpf: '12345678901',
    units: [{ id: 'u', status: 'INACTIVE', name: 'Fazenda' }],
  });
  assert.equal(r4.complete, false);
  assert.ok(r4.missing.includes('units'));
});

test('normalizeCreateClientInput enforces PF shape and canonical document', () => {
  const { data, commercialUserIds, units } = normalizeCreateClientInput({
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
  assert.deepEqual(units, []);
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

test('L5: PJ create stores cnpj/endereco/IE direct in Client', () => {
  const { data, units } = normalizeCreateClientInput({
    personType: 'PJ',
    legalName: 'Coopercitrus',
    cnpj: '03.936.815/0001-75',
    addressLine: 'Av. das Acacias, 100',
    city: 'Belo Horizonte',
    state: 'mg',
    registrationNumber: '0028640150010',
    phone: '35 99999-0000',
    email: 'comercial@coopercitrus.com.br',
    isBuyer: true,
    isSeller: true,
  });

  assert.equal(data.legalName, 'Coopercitrus');
  assert.equal(data.cnpj, '03936815000175');
  assert.equal(data.cnpjRoot, '03936815');
  assert.equal(data.cnpjOrder, '0001');
  assert.equal(data.city, 'Belo Horizonte');
  assert.equal(data.state, 'MG');
  assert.equal(data.registrationNumberCanonical, '0028640150010');
  assert.equal(data.email, 'comercial@coopercitrus.com.br');
  assert.deepEqual(units, []);
});

test('L5: PJ create rejects units[]', () => {
  assert.throws(
    () =>
      normalizeCreateClientInput({
        personType: 'PJ',
        legalName: 'Coopercitrus',
        cnpj: '03.936.815/0001-75',
        phone: '35 99999-0000',
        isBuyer: true,
        isSeller: true,
        units: [{ name: 'Filial 1' }],
      }),
    /PJ_HAS_NO_UNITS|PJ clients do not have units/
  );
});

test('L5: PJ create rejects without cnpj', () => {
  assert.throws(
    () =>
      normalizeCreateClientInput({
        personType: 'PJ',
        legalName: 'Coopercitrus',
        phone: '35 99999-0000',
        isBuyer: true,
        isSeller: true,
      }),
    /cnpj is required for PJ|PJ_REQUIRES_CNPJ/
  );
});

test('L5: PF create accepts units[] (fazendas) without isPrimary', () => {
  const { data, units } = normalizeCreateClientInput({
    personType: 'PF',
    fullName: 'Francisco Sales',
    cpf: '016.179.708-32',
    phone: '35 99999-0000',
    isBuyer: false,
    isSeller: true,
    units: [
      { name: 'Fazenda Sao Joao', city: 'Sao Sebastiao', state: 'mg', car: 'MG-12345' },
      { name: 'Fazenda Bom Retiro' },
    ],
  });

  assert.equal(data.fullName, 'Francisco Sales');
  assert.equal(units.length, 2);
  assert.equal(units[0].name, 'Fazenda Sao Joao');
  assert.equal(units[0].state, 'MG');
  assert.equal(units[0].car, 'MG-12345');
  assert.equal(units[1].name, 'Fazenda Bom Retiro');
});

test('L5: PF unit rejects isPrimary in input', () => {
  assert.throws(
    () =>
      normalizeCreateClientInput({
        personType: 'PF',
        fullName: 'Francisco Sales',
        cpf: '016.179.708-32',
        phone: '35 99999-0000',
        isBuyer: false,
        isSeller: true,
        units: [{ name: 'Fazenda', isPrimary: true }],
      }),
    /isPrimary cannot be provided/
  );
});

test('L5: PF unit requires name', () => {
  assert.throws(
    () =>
      normalizeCreateClientInput({
        personType: 'PF',
        fullName: 'Francisco Sales',
        cpf: '016.179.708-32',
        phone: '35 99999-0000',
        isBuyer: false,
        isSeller: true,
        units: [{ city: 'Sao Sebastiao' }],
      }),
    /name is required/
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

test('L5: rejects malformed email at create', () => {
  assert.throws(
    () =>
      normalizeCreateClientInput({
        personType: 'PJ',
        legalName: 'Coopercitrus',
        cnpj: '03.936.815/0001-75',
        phone: '35 99999-0000',
        email: 'naoeumemail',
        isBuyer: true,
        isSeller: true,
      }),
    /email is invalid/
  );
});

test('L5: normalizeUpdateClientInput LOCKS personType (no PF<->PJ switch)', () => {
  assert.throws(
    () =>
      normalizeUpdateClientInput(
        {
          personType: 'PJ',
          legalName: 'G A S Comercio',
          isBuyer: true,
          isSeller: true,
          reasonText: 'tentando trocar',
        },
        {
          personType: 'PF',
          fullName: 'Cliente Antigo',
          cpf: '01617970832',
          phone: null,
          isBuyer: false,
          isSeller: true,
        }
      ),
    /personType cannot be changed|CLIENT_PERSON_TYPE_LOCKED/
  );
});

test('normalizeCreateClientInput accepts payload when both buyer and seller are false', () => {
  const { data } = normalizeCreateClientInput({
    personType: 'PJ',
    legalName: 'Atlantica',
    cnpj: '03.936.815/0001-75',
    phone: '(35) 99999-0000',
    isBuyer: false,
    isSeller: false,
  });
  assert.equal(data.isBuyer, false);
  assert.equal(data.isSeller, false);
});

test('L5: normalizeCreateUnitInput validates address fields, canonicaliza registration, accepts car', () => {
  const { data } = normalizeCreateUnitInput({
    name: 'Fazenda Sao Joao',
    registrationNumber: '0028640150010',
    car: 'MG-9876',
    addressLine: 'Av. Oliveira Rezende, 1397',
    district: 'JD Bernadete',
    city: 'Sao Sebastiao do Paraiso',
    state: 'mg',
    postalCode: '37950-078',
    complement: '',
  });

  assert.equal(data.name, 'Fazenda Sao Joao');
  assert.equal(data.registrationNumberCanonical, '0028640150010');
  assert.equal(data.car, 'MG-9876');
  assert.equal(data.state, 'MG');
  assert.equal(data.complement, null);
});

test('L5: normalizeCreateUnitInput rejects registrationType (dropped under L5)', () => {
  assert.throws(
    () =>
      normalizeCreateUnitInput({
        name: 'Fazenda',
        registrationType: 'estadual',
      }),
    /registrationType cannot be provided/
  );
});

test('L5: normalizeCreateUnitInput rejects cnpjOrder (dropped under L5)', () => {
  assert.throws(
    () =>
      normalizeCreateUnitInput({
        name: 'Fazenda',
        cnpjOrder: '0001',
      }),
    /cnpjOrder cannot be provided/
  );
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
