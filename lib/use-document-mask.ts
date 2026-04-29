'use client';

import { type ChangeEvent, useCallback, useMemo, useState } from 'react';

import { maskCnpjInput, maskCpfInput } from './client-field-formatters';
import { digitsOnly, isValidCnpjChecksum, isValidCpfChecksum } from './document-validation';

export type DocumentKind = 'cpf' | 'cnpj';

export interface UseDocumentMaskValue {
  /** valor formatado (com pontos/barras/traço) — usar como `value` do <input> */
  masked: string;
  /** valor cru (apenas digitos) — usar para enviar ao backend */
  digits: string;
  /** se houve interacao (onBlur) — controla quando exibir o erro */
  touched: boolean;
  /** mensagem de erro pra exibir inline; null se ok ou ainda nao validado */
  error: string | null;
  /** se o documento e valido (length + checksum) — para gating do submit */
  isValid: boolean;
  /** handler para o input */
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /** handler para detectar quando user terminou de digitar */
  onBlur: () => void;
  /** seta valor diretamente (uso: edicao de registro existente, reset) */
  setRaw: (value: string) => void;
  /** limpa state (string vazia + touched=false) */
  reset: () => void;
}

const EXPECTED_LENGTH: Record<DocumentKind, number> = { cpf: 11, cnpj: 14 };

function maskByKind(kind: DocumentKind, value: string): string {
  return kind === 'cpf' ? maskCpfInput(value) : maskCnpjInput(value);
}

function checksumByKind(kind: DocumentKind, digits: string): boolean {
  return kind === 'cpf' ? isValidCpfChecksum(digits) : isValidCnpjChecksum(digits);
}

function labelByKind(kind: DocumentKind): string {
  return kind === 'cpf' ? 'CPF' : 'CNPJ';
}

/**
 * Hook para input de CPF ou CNPJ com mascara visual (formato Receita) e
 * validacao de checksum. Erro so aparece apos blur — UX deixa user digitar
 * inteiro antes de queixar.
 *
 * Uso:
 * ```tsx
 * const cnpj = useDocumentMask('cnpj');
 * cnpj.setRaw(branch.cnpj ?? ''); // seed em modo edit
 * <input value={cnpj.masked} onChange={cnpj.onChange} onBlur={cnpj.onBlur} />
 * {cnpj.error ? <span>{cnpj.error}</span> : null}
 * ```
 */
export function useDocumentMask(kind: DocumentKind): UseDocumentMaskValue {
  const [raw, setRaw] = useState('');
  const [touched, setTouched] = useState(false);

  const masked = useMemo(() => maskByKind(kind, raw), [kind, raw]);
  const digits = useMemo(() => digitsOnly(masked), [masked]);
  const expected = EXPECTED_LENGTH[kind];

  const isComplete = digits.length === expected;
  const checksumOk = isComplete ? checksumByKind(kind, digits) : false;
  const isValid = digits.length === 0 ? true : checksumOk;

  const error = useMemo(() => {
    if (!touched) return null;
    if (digits.length === 0) return null;
    if (!isComplete) return `${labelByKind(kind)} incompleto`;
    if (!checksumOk) return `${labelByKind(kind)} invalido`;
    return null;
  }, [touched, digits.length, isComplete, checksumOk, kind]);

  const onChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setRaw(event.target.value);
  }, []);

  const onBlur = useCallback(() => {
    setTouched(true);
  }, []);

  const setRawExternal = useCallback((value: string) => {
    setRaw(value);
  }, []);

  const reset = useCallback(() => {
    setRaw('');
    setTouched(false);
  }, []);

  return {
    masked,
    digits,
    touched,
    error,
    isValid,
    onChange,
    onBlur,
    setRaw: setRawExternal,
    reset,
  };
}
