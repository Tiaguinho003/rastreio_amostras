// Q-11/D-L (L5): helper compartilhado para determinar se um Client esta
// "incompleto" segundo a politica fechada em Q-10c, Q-10d, Q-12, Q-13.
// Espelha src/clients/client-helpers.js (backend) — mesma logica em TS para
// uso no frontend. Manter as duas versoes em sincronia: se uma mudar, a
// outra deve mudar junto.

import type { ClientSummary, ClientUnitSummary } from '../types';

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
] as const;

const PF_CLIENT_RECOMMENDED_FIELDS = ['cpf', 'email'] as const;

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
  units: 'Pelo menos uma fazenda',
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
