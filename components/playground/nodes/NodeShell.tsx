'use client';

import { Handle, NodeToolbar, Position, useReactFlow, useStore } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { AddNodeButton } from '../AddNodeButton';
import { usePlaygroundCanvasActions } from '../canvas-actions-context';

// Casca comum dos 3 nodes (PG61). Antes cada node desenhava a própria caixa, e
// o que variava era só o miolo — agora o que varia é só o miolo de verdade:
// ícone, nome e o que vai abaixo dele.
//
// A forma é QUADRADA e igual para os três (branco com borda verde): o tipo se lê
// pelo ícone e pelo nome, não pela cor. Saiu a linha de acento colorida por tipo
// (PG34 continua valendo fora do canvas, nos cartões do painel e no menu de
// compatíveis) e saiu a frase que explicava cada node — o canvas não é manual.
//
// O nome mora FORA do quadrado, embaixo. Isso mantém o quadrado limpo com o
// nome podendo ser longo ("Lote 6228"), e é o que abre espaço para o que cada
// node precisa pendurar ali (as sacas do Lote, o erro do Resultado).

/**
 * Sair do node e ENTRAR na barra atravessa o vão de 8px do `offset`, e nesse
 * caminho o `mouseleave` do node dispara. A folga segura a barra aberta até o
 * `mouseenter` dela chegar.
 */
const HOVER_GRACE_MS = 140;

export type NodeShellVariant = 'incomplete' | 'error' | 'ready';

export function NodeShell({
  id,
  icon,
  name,
  variant,
  target = false,
  source = false,
  corner,
  children,
}: {
  id: string;
  icon: ReactNode;
  name: ReactNode;
  variant?: NodeShellVariant;
  /** Porta de entrada, à esquerda. Sem ela o quadrado vira "gatilho" (PG62). */
  target?: boolean;
  /** Porta de saída, à direita. */
  source?: boolean;
  /** Selo no canto do quadrado (o check do Resultado). */
  corner?: ReactNode;
  /** Vai ABAIXO do nome (sacas do Lote, mensagem de erro). */
  children?: ReactNode;
}) {
  const { deleteElements, setEdges } = useReactFlow();
  const { addFromNode } = usePlaygroundCanvasActions();
  // Dois seletores de valor PRIMITIVO em vez de um objeto com os dois: o
  // `useStore` compara o retorno por identidade, e um objeto novo a cada
  // chamada re-renderizaria o node a cada tique do canvas.
  //
  // "Desativar" só existe com o que desativar — item ausente quando não cabe,
  // nunca desabilitado (mesma regra do menu ⋯ das listas).
  const connected = useStore((store) =>
    store.edges.some((edge) => edge.source === id || edge.target === id)
  );
  // PG62: o coto com "+" é a OFERTA de conectar, e some quando a saída já tem
  // para onde ir — sobra a linha da edge, saindo do círculo.
  const hasOutgoing = useStore((store) => store.edges.some((edge) => edge.source === id));

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

  const variantClass = variant === 'error' ? ' has-error' : variant ? ` is-${variant}` : '';
  // Sem porta de entrada, o node é uma FONTE: nada chega nele, e o lado esquerdo
  // arredondado diz isso de longe — a forma faz o trabalho que uma legenda faria
  // (é o desenho do node-gatilho do n8n). Hoje só o Lote cai aqui.
  const triggerClass = target ? '' : ' is-trigger';

  return (
    <div className="pg-node" onMouseEnter={show} onMouseLeave={hide}>
      {/* `NodeToolbar` do React Flow: portala, acompanha o node no pan/zoom e
          não é recortado por nada. Fazer à mão custaria as três coisas. */}
      <NodeToolbar
        isVisible={hovered}
        position={Position.Top}
        offset={8}
        className="pg-node-tools nodrag nopan"
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {connected ? (
          <button
            type="button"
            aria-label="Desativar node"
            title="Desativar — solta o node do fluxo"
            onClick={() =>
              setEdges((current) =>
                current.filter((edge) => edge.source !== id && edge.target !== id)
              )
            }
          >
            {/* Elo partido: as duas metades sem o meio. */}
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 17H7A5 5 0 0 1 7 7h2" />
              <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
            </svg>
          </button>
        ) : null}
        <button
          type="button"
          className="is-danger"
          aria-label="Deletar node"
          title="Deletar node"
          // `deleteElements` leva as edges do node junto — não sobra edge solta.
          onClick={() => void deleteElements({ nodes: [{ id }] })}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 7h16" />
            <path d="M9 7V5h6v2" />
            <path d="M6 7l1 13h10l1-13" />
          </svg>
        </button>
      </NodeToolbar>

      <div className={`pg-node-box${variantClass}${triggerClass}`}>
        {target ? <Handle type="target" position={Position.Left} /> : null}
        <span className="pg-node-icon" aria-hidden="true">
          {icon}
        </span>
        {corner}
        {/* PG62: a porta de saída é o CÍRCULO na borda, e ele fica SEMPRE — é
            dali que a edge nasce e é de onde se puxa a próxima, porque um node
            pode alimentar mais de um destino. O que some ao conectar é o coto:
            a linha curta e o "+", que são a oferta, não a porta. Na PG61 o "+"
            ERA a porta, e por isso não podia sumir: a âncora da edge saltaria
            de volta para a borda do quadrado. */}
        {source ? <Handle type="source" position={Position.Right} /> : null}
        {source && !hasOutgoing ? (
          <span className="pg-node-stub">
            <AddNodeButton
              variant="stub"
              label="Conectar a um node novo"
              onOpen={(event) => addFromNode(id, event)}
            />
          </span>
        ) : null}
      </div>

      <span className="pg-node-name">{name}</span>
      {children}
    </div>
  );
}
