'use client';

import { useStore, type NodeProps } from '@xyflow/react';

import { NodeShell } from './NodeShell';
import { NODE_ICONS } from './icons';

// Node Mistura: sem configuração — a proporção vem das sacas dos nodes de
// entrada. Com menos de 2 entradas (regra real do `createBlend`) fica no estado
// incompleto, que agora é só a MOLDURA do quadrado: a frase "Conecte pelo menos
// 2 entradas" saiu na PG61, junto com as outras explicações do canvas.
export function MisturaNode({ id, data }: NodeProps) {
  const inputCount = useStore((store) => store.edges.filter((edge) => edge.target === id).length);

  return (
    <NodeShell
      id={id}
      icon={NODE_ICONS.mistura}
      name="Mistura"
      variant={inputCount < 2 ? 'incomplete' : undefined}
      disabled={Boolean(data?.disabled)}
      target
      source
    />
  );
}
