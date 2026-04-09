import type { ClientPersonType } from './types';

function onlyDigits(value: string | null | undefined) {
  return String(value ?? '').replace(/\D+/g, '');
}

export function maskCpfInput(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  }

  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function maskCnpjInput(value: string) {
  const digits = onlyDigits(value).slice(0, 14);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 5) {
    return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  }

  if (digits.length <= 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }

  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }

  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function maskPhoneInput(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (!digits) {
    return '';
  }

  if (digits.length <= 2) {
    return `(${digits}`;
  }

  const areaCode = digits.slice(0, 2);
  const rest = digits.slice(2);

  if (digits.length <= 6) {
    return `(${areaCode})${rest}`;
  }

  if (digits.length <= 10) {
    return `(${areaCode})${rest.slice(0, 4)}-${rest.slice(4)}`;
  }

  return `(${areaCode})${rest.slice(0, 5)}-${rest.slice(5)}`;
}

export function maskDocumentInput(value: string, personType: ClientPersonType) {
  return personType === 'PF' ? maskCpfInput(value) : maskCnpjInput(value);
}

export function formatCpf(value: string | null | undefined) {
  const digits = onlyDigits(value);

  if (!digits) {
    return null;
  }

  if (digits.length !== 11) {
    return String(value).trim();
  }

  return maskCpfInput(digits);
}

export function formatCnpj(value: string | null | undefined) {
  const digits = onlyDigits(value);

  if (!digits) {
    return null;
  }

  if (digits.length !== 14) {
    return String(value).trim();
  }

  return maskCnpjInput(digits);
}

export function formatPhone(value: string | null | undefined) {
  const digits = onlyDigits(value);

  if (!digits) {
    return null;
  }

  if (digits.length !== 10 && digits.length !== 11) {
    return String(value).trim();
  }

  return maskPhoneInput(digits);
}

export function formatClientDocument(
  value: string | null | undefined,
  personType?: ClientPersonType | null
) {
  const digits = onlyDigits(value);

  if (!digits) {
    return null;
  }

  if (personType === 'PF' || digits.length === 11) {
    return formatCpf(digits);
  }

  if (personType === 'PJ' || digits.length === 14) {
    return formatCnpj(digits);
  }

  return String(value).trim();
}
