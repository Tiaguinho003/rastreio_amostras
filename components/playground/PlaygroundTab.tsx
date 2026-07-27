'use client';

import { ReactFlowProvider } from '@xyflow/react';

import type { SessionData } from '../../lib/types';
import { PlaygroundCanvas } from './PlaygroundCanvas';

// Entry lazy da aba Simulador (PG5): montado via next/dynamic {ssr:false} na
// pagina — o chunk do React Flow so baixa ao abrir a aba no desktop. O
// Provider habilita hooks da lib (screenToFlowPosition etc.) nos filhos.
// A `session` desce ate aqui pra alimentar a busca real de lotes (PG30).
export function PlaygroundTab({ session }: { session: SessionData }) {
  return (
    <ReactFlowProvider>
      <PlaygroundCanvas session={session} />
    </ReactFlowProvider>
  );
}
