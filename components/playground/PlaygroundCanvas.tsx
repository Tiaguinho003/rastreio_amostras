'use client';

import { Background, BackgroundVariant, Controls, ReactFlow } from '@xyflow/react';

import '@xyflow/react/dist/style.css';

// Canvas do Simulador: claro com grid de pontos (PG25), zoom/fit sem minimap
// (PG31). Nodes, paleta e conexoes entram nas fases seguintes; o canvas vazio
// valida pan/zoom e o carregamento lazy.
export function PlaygroundCanvas() {
  return (
    <ReactFlow nodes={[]} edges={[]} fitView>
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="#d3cec2" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
