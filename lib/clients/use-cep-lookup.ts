// Q-24: hook de lookup CEP via ViaCEP. Usado em forms de cadastro/edicao
// de unidade PF e (futuro) de endereco em Client PJ.
//
// Comportamento:
// - Aciona quando o CEP atinge 8 digitos (ignora formatacao).
// - Debounce de 350ms para evitar requests durante digitacao.
// - Aborta requests anteriores se um novo CEP for digitado.
// - Erro silencioso (CEP invalido / API down) — retorna data=null e o
//   form continua aceitando preenchimento manual. Sem alert/banner.
// - ViaCEP e publico, sem auth, sem rate limit relevante.

import { useCallback, useEffect, useRef, useState } from 'react';

const VIACEP_BASE = 'https://viacep.com.br/ws';
const DEBOUNCE_MS = 350;

export type CepData = {
  postalCode: string; // 8 digitos
  addressLine: string;
  district: string;
  city: string;
  state: string;
};

export type UseCepLookupResult = {
  loading: boolean;
  data: CepData | null;
  error: 'invalid' | 'not-found' | 'network' | null;
  reset: () => void;
};

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
};

function normalizeDigits(value: string): string {
  return value.replace(/\D+/g, '');
}

export function useCepLookup(rawCep: string | null | undefined): UseCepLookupResult {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CepData | null>(null);
  const [error, setError] = useState<'invalid' | 'not-found' | 'network' | null>(null);
  const lastFetchedRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    lastFetchedRef.current = null;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    const digits = normalizeDigits(rawCep ?? '');

    // Apenas reage quando atinge 8 digitos. Menos que isso, nao toca em
    // estado nem mostra erro.
    if (digits.length !== 8) {
      if (lastFetchedRef.current !== null) {
        // CEP foi apagado/encurtado depois de ter sido lookup — limpa.
        setData(null);
        setError(null);
        lastFetchedRef.current = null;
      }
      return;
    }

    // Mesmo CEP que ja foi consultado — nao re-busca.
    if (lastFetchedRef.current === digits) {
      return;
    }

    const timer = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      setData(null);

      fetch(`${VIACEP_BASE}/${digits}/json/`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error('http');
          return res.json() as Promise<ViaCepResponse>;
        })
        .then((json) => {
          lastFetchedRef.current = digits;
          if (json.erro) {
            setError('not-found');
            setData(null);
            return;
          }
          setData({
            postalCode: digits,
            addressLine: json.logradouro ?? '',
            district: json.bairro ?? '',
            city: json.localidade ?? '',
            state: (json.uf ?? '').toUpperCase(),
          });
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          setError('network');
          setData(null);
        })
        .finally(() => {
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [rawCep]);

  return { loading, data, error, reset };
}
