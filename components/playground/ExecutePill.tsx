'use client';

import { Panel } from '@xyflow/react';

// Pill de execução (PG28/PG36): flutuante na base central do canvas, molde do
// "Test workflow" do n8n. A 1ª execução é manual; depois o recálculo é
// automático (PG14) — o botão permanece como âncora do ritual.
export function ExecutePill({ onExecute, disabled }: { onExecute: () => void; disabled: boolean }) {
  return (
    <Panel position="bottom-center">
      <button type="button" className="pg-execute-pill" onClick={onExecute} disabled={disabled}>
        <span aria-hidden="true">▶</span> Executar
      </button>
    </Panel>
  );
}
