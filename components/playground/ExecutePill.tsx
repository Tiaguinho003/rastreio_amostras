'use client';

import { Panel } from '@xyflow/react';

// Pill de execução: flutuante no TOPO central do canvas (pedido do Flavio —
// a PG28 original punha na base, molde do "Test workflow" do n8n). A 1ª
// execução é manual; depois o recálculo é automático (PG14) — o botão
// permanece como âncora do ritual.
export function ExecutePill({ onExecute, disabled }: { onExecute: () => void; disabled: boolean }) {
  return (
    <Panel position="top-center">
      <button type="button" className="pg-execute-pill" onClick={onExecute} disabled={disabled}>
        <span aria-hidden="true">▶</span> Executar
      </button>
    </Panel>
  );
}
