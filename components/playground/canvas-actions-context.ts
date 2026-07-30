'use client';

import { createContext, useContext, type MouseEvent as ReactMouseEvent } from 'react';

/**
 * O que um node pode pedir ao canvas (PG62).
 *
 * Existe porque `nodeTypes` é declarado em module scope (recriar por render
 * remonta todos os nodes no React Flow), então não há como passar callback por
 * prop até o node. Os outros dois contextos do Simulador — `results` e `lots` —
 * carregam DADO; este carrega AÇÃO, e por isso mora em arquivo próprio.
 */
export type PlaygroundCanvasActions = {
  /**
   * O "+" do coto: abre o menu de compatíveis no ponto do clique e cria o node
   * já conectado a `sourceId`. É o mesmo menu do arraste-para-o-vazio — o "+" é
   * o caminho de quem não quer arrastar.
   */
  addFromNode: (sourceId: string, event: ReactMouseEvent<HTMLElement>) => void;
  /**
   * O "+" da barra da linha (PG64): enfia um node no MEIO de uma ligação — a
   * edge antiga morre e nascem duas. `flow` é o ponto médio da curva, onde o
   * node novo cai.
   */
  insertOnEdge: (
    edgeId: string,
    sourceId: string,
    targetId: string,
    flow: { x: number; y: number },
    event: ReactMouseEvent<HTMLElement>
  ) => void;
};

const noop: PlaygroundCanvasActions = { addFromNode: () => {}, insertOnEdge: () => {} };

export const PlaygroundCanvasActionsContext = createContext<PlaygroundCanvasActions>(noop);

export function usePlaygroundCanvasActions(): PlaygroundCanvasActions {
  return useContext(PlaygroundCanvasActionsContext);
}
