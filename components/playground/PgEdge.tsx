'use client';

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { usePlaygroundCanvasActions } from './canvas-actions-context';

/**
 * A carência ao sair da linha — o número do n8n. É o que dá tempo de viajar do
 * traço de 2px até a barra que apareceu no meio dele. Bem maior que a do node
 * (140ms) porque aqui o alvo de origem é uma linha, não um quadrado: sair dela
 * é fácil demais.
 */
const HOVER_GRACE_MS = 600;

// A linha do Simulador (PG64). Era a edge padrão do React Flow: um traço bezier
// cinza, sem seta e sem nada para fazer nela — apagar uma ligação só dava
// selecionando e apertando Delete, que ninguém descobre.
//
// Agora ela é um OBJETO: tem sentido (seta), tem área de clique de verdade
// (`interactionWidth`, 40px contra os 2px que se veem) e, ao passar o mouse,
// oferece as duas coisas que se quer fazer com uma ligação — apagá-la, ou
// enfiar um node no meio dela.
export function PgEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}: EdgeProps) {
  const { deleteElements } = useReactFlow();
  const { insertOnEdge } = usePlaygroundCanvasActions();
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  // 🔴 O hover mora AQUI, não no canvas. Guardar `hoveredEdgeId` lá em cima
  // re-renderizaria TODAS as edges a cada passagem do mouse por qualquer uma.
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<number | null>(null);

  const clearLeave = () => {
    if (leaveTimer.current === null) return;
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
  };
  const show = useCallback(() => {
    clearLeave();
    setHovered(true);
  }, []);
  const hide = useCallback(() => {
    clearLeave();
    leaveTimer.current = window.setTimeout(() => setHovered(false), HOVER_GRACE_MS);
  }, []);
  useEffect(() => clearLeave, []);

  return (
    <>
      {/* Os eventos ficam no `<g>` e não no `<BaseEdge>`: é o `<g>` que envolve
          também a path invisível de interação, que é onde o mouse de fato
          encosta. Na path visível de 2px quase não se acerta. */}
      <g onMouseEnter={show} onMouseLeave={hide}>
        <BaseEdge
          id={id}
          path={path}
          markerEnd={markerEnd}
          className={hovered ? 'pg-edge is-hovered' : 'pg-edge'}
          interactionWidth={40}
        />
      </g>

      {hovered ? (
        <EdgeLabelRenderer>
          <div
            className="pg-edge-tools nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            // A barra segura a si mesma: sem isto, os 600ms correriam enquanto o
            // mouse já estivesse em cima dela (ela não é a linha, então o
            // `mouseleave` do `<g>` já disparou).
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            <button
              type="button"
              aria-label="Inserir um node nesta ligação"
              title="Inserir um node aqui"
              onClick={(event) => insertOnEdge(id, source, target, { x: labelX, y: labelY }, event)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              className="is-danger"
              aria-label="Deletar esta ligação"
              title="Deletar ligação"
              onClick={() => void deleteElements({ edges: [{ id }] })}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 7h16" />
                <path d="M9 7V5h6v2" />
                <path d="M6 7l1 13h10l1-13" />
              </svg>
            </button>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
