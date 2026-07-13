'use client';

import { createContext, useContext } from 'react';

import type { SimulationOutcome } from '../../lib/playground/simulation';

// Resultados da simulação distribuídos aos nodes via context — mutar
// node.data a cada recálculo remontaria os nodes; o context é derivado
// (useMemo no canvas) e os ResultadoNode leem daqui.
export type PlaygroundResults = {
  outcomes: ReadonlyMap<string, SimulationOutcome> | null;
  openDrawer: (resultNodeId: string) => void;
};

export const PlaygroundResultsContext = createContext<PlaygroundResults>({
  outcomes: null,
  openDrawer: () => {},
});

export function usePlaygroundResults(): PlaygroundResults {
  return useContext(PlaygroundResultsContext);
}
