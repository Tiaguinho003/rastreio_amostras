// Q-11/D-L (L5): helper compartilhado para determinar se um Client esta
// "incompleto" segundo a politica fechada em Q-10c, Q-10d, Q-12, Q-13.
// Espelha src/clients/client-helpers.js (backend) — mesma logica em TS para
// uso no frontend. Manter as duas versoes em sincronia: se uma mudar, a
// outra deve mudar junto.

import type { ClientSummary, ClientUnitSummary } from '../types';

// Q-27 (override de Q-12 e Q-10c): `email` foi RETIRADO da lista de
// recomendados. Mantem-se sincronizado com src/clients/client-helpers.js
// e src/clients/client-service.js (buildCompletenessWhere).
const PJ_RECOMMENDED_FIELDS = [
  'tradeName',
  'registrationNumber',
  'addressLine',
  'district',
  'city',
  'state',
  'postalCode',
  'complement',
] as const;

const PF_CLIENT_RECOMMENDED_FIELDS = ['cpf'] as const;

// 14.3.C: 'cnpj' e 'phone' removidos — fazendas raramente tem CNPJ proprio
// e telefone proprio (geralmente reusa do dono).
const PF_UNIT_RECOMMENDED_FIELDS = [
  'addressLine',
  'district',
  'city',
  'state',
  'postalCode',
  'registrationNumber',
  'car',
] as const;

export type CompletenessResult = {
  complete: boolean;
  missing: string[];
};

function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

export function isClientComplete(client: ClientSummary | null | undefined): CompletenessResult {
  if (!client) {
    return { complete: false, missing: ['client'] };
  }

  const missing: string[] = [];

  if (client.personType === 'PJ') {
    for (const field of PJ_RECOMMENDED_FIELDS) {
      if (isMissing((client as unknown as Record<string, unknown>)[field])) {
        missing.push(field);
      }
    }
    return { complete: missing.length === 0, missing };
  }

  for (const field of PF_CLIENT_RECOMMENDED_FIELDS) {
    if (isMissing((client as unknown as Record<string, unknown>)[field])) {
      missing.push(field);
    }
  }

  const units: ClientUnitSummary[] = Array.isArray(client.units) ? client.units : [];
  const activeUnits = units.filter((u) => u && u.status === 'ACTIVE');
  if (activeUnits.length === 0) {
    missing.push('units');
  }

  for (const unit of activeUnits) {
    for (const field of PF_UNIT_RECOMMENDED_FIELDS) {
      if (isMissing((unit as unknown as Record<string, unknown>)[field])) {
        missing.push(`units[${unit.id}].${field}`);
      }
    }
  }

  return { complete: missing.length === 0, missing };
}

const FIELD_LABELS: Record<string, string> = {
  tradeName: 'Nome fantasia',
  registrationNumber: 'Inscrição Estadual',
  addressLine: 'Endereço',
  district: 'Bairro',
  city: 'Cidade',
  state: 'UF',
  postalCode: 'CEP',
  complement: 'Complemento',
  email: 'E-mail',
  cpf: 'CPF',
  units: 'Pelo menos uma filial',
  cnpj: 'CNPJ',
  phone: 'Telefone',
  car: 'CAR',
  client: 'Cliente',
};

export function labelForMissing(key: string): string {
  if (key.startsWith('units[')) {
    const match = key.match(/^units\[[^\]]+\]\.(.+)$/);
    if (match) {
      return FIELD_LABELS[match[1]] ?? match[1];
    }
  }
  return FIELD_LABELS[key] ?? key;
}

export function unitIdFromMissing(key: string): string | null {
  const match = key.match(/^units\[([^\]]+)\]\..+$/);
  return match ? match[1] : null;
}
