import { CLIENT_PERSON_TYPES } from './client-support.js';

// Q-11/D-L (L5): helper compartilhado entre backend e frontend para
// determinar se um Client esta "incompleto" segundo a politica de
// completude fechada em Q-10c, Q-10d, Q-12, Q-13.
//
// `client` deve incluir os campos do Client. Quando `personType === 'PF'`,
// `client.units` deve estar incluido como array de unidades ATIVAS para
// avaliar Q-10d (zero unidades = incompleto) e Q-13 (recomendados em cada
// unidade).
//
// Retorna `{ complete: boolean, missing: string[] }` onde `missing` e
// uma lista de chaves canonicas (campo direto do client) ou strings
// como `units` (zero unidades) e `units[<id>].<campo>` (campo faltando
// em unidade especifica).

const PJ_RECOMMENDED_FIELDS = [
  'tradeName',
  'registrationNumber',
  'addressLine',
  'district',
  'city',
  'state',
  'postalCode',
  'complement',
  'email',
];

const PF_CLIENT_RECOMMENDED_FIELDS = ['cpf', 'email'];

const PF_UNIT_RECOMMENDED_FIELDS = [
  'cnpj',
  'phone',
  'addressLine',
  'district',
  'city',
  'state',
  'postalCode',
  'registrationNumber',
  'car',
];

function isMissing(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

export function isClientComplete(client) {
  const missing = [];

  if (!client) {
    return { complete: false, missing: ['client'] };
  }

  if (client.personType === CLIENT_PERSON_TYPES.PJ) {
    for (const field of PJ_RECOMMENDED_FIELDS) {
      if (isMissing(client[field])) {
        missing.push(field);
      }
    }
    return { complete: missing.length === 0, missing };
  }

  // PF
  for (const field of PF_CLIENT_RECOMMENDED_FIELDS) {
    if (isMissing(client[field])) {
      missing.push(field);
    }
  }

  // Q-10d: PF sem unidade = incompleto.
  const units = Array.isArray(client.units) ? client.units : [];
  const activeUnits = units.filter((unit) => unit && unit.status === 'ACTIVE');
  if (activeUnits.length === 0) {
    missing.push('units');
  }

  // Q-13: cada unidade ativa deve ter recomendados preenchidos.
  for (const unit of activeUnits) {
    for (const field of PF_UNIT_RECOMMENDED_FIELDS) {
      if (isMissing(unit[field])) {
        missing.push(`units[${unit.id}].${field}`);
      }
    }
  }

  return { complete: missing.length === 0, missing };
}
