'use client';

import { useStore, type NodeProps } from '@xyflow/react';

import { NodeShell } from './NodeShell';

// Duas linhas que entram pela esquerda e saem como uma só.
const MisturaIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M3 7h5a5 5 0 0 1 5 5h8" />
    <path d="M3 17h5a5 5 0 0 0 5-5" />
  </svg>
);

// Node Mistura: sem configuração — a proporção vem das sacas dos nodes de
// entrada. Com menos de 2 entradas (regra real do `createBlend`) fica no estado
// incompleto, que agora é só a MOLDURA do quadrado: a frase "Conecte pelo menos
// 2 entradas" saiu na PG61, junto com as outras explicações do canvas.
export function MisturaNode({ id }: NodeProps) {
  const inputCount = useStore((store) => store.edges.filter((edge) => edge.target === id).length);

  return (
    <NodeShell
      id={id}
      icon={MisturaIcon}
      name="Mistura"
      variant={inputCount < 2 ? 'incomplete' : undefined}
      target
      source
    />
  );
}
