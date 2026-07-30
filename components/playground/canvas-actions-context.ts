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
};

const noop: PlaygroundCanvasActions = { addFromNode: () => {} };

export const PlaygroundCanvasActionsContext = createContext<PlaygroundCanvasActions>(noop);

export function usePlaygroundCanvasActions(): PlaygroundCanvasActions {
  return useContext(PlaygroundCanvasActionsContext);
}
