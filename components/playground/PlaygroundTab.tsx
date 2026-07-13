'use client';

import { ReactFlowProvider } from '@xyflow/react';

import { PlaygroundCanvas } from './PlaygroundCanvas';

// Entry lazy da aba Simulador (PG5): montado via next/dynamic {ssr:false} na
// pagina — o chunk do React Flow so baixa ao abrir a aba no desktop. O
// Provider habilita hooks da lib (screenToFlowPosition etc.) nos filhos.
export function PlaygroundTab() {
  return (
    <ReactFlowProvider>
      <PlaygroundCanvas />
    </ReactFlowProvider>
  );
}
