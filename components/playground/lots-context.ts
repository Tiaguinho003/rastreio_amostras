'use client';

import { createContext, useContext } from 'react';

import type { PlaygroundLotSource } from '../../lib/playground/lot-source';

// Fonte de lotes + lotes já gastos, distribuídos aos nodes via context. Os
// nodes do React Flow só recebem `data`, então quem precisa buscar (a busca
// embutida do node Lote, PG30) pega daqui em vez de receber por prop.
export type PlaygroundLots = {
  source: PlaygroundLotSource;
  /**
   * PG46: ids de lote já escolhidos em algum node do canvas. O mesmo lote não
   * entra duas vezes — some dos resultados da busca em vez de ser oferecido e
   * recusado depois.
   */
  usedSampleIds: ReadonlySet<string>;
};

export const PlaygroundLotsContext = createContext<PlaygroundLots | null>(null);

export function usePlaygroundLots(): PlaygroundLots {
  const value = useContext(PlaygroundLotsContext);
  if (!value) {
    throw new Error('usePlaygroundLots precisa de um PlaygroundLotsContext acima');
  }
  return value;
}
