'use client';

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import { useCallback, useRef, useState, type DragEvent } from 'react';

import '@xyflow/react/dist/style.css';

import {
  validateConnection,
  type ConnectionRejectionReason,
  type ConnectionVerdict,
} from '../../lib/playground/graph';
import type { PgGraphEdge, PgGraphNode, PgNodeType } from '../../lib/playground/types';
import { useToast } from '../../lib/toast/ToastProvider';
import { ConnectMenu, type ConnectMenuState } from './ConnectMenu';
import { NodePalette } from './NodePalette';
import { AlvoNode } from './nodes/AlvoNode';
import { CombinacoesNode } from './nodes/CombinacoesNode';
import { LoteNode } from './nodes/LoteNode';
import { MisturaNode } from './nodes/MisturaNode';
import { ResultadoNode } from './nodes/ResultadoNode';

// Declarado em module scope (regra do React Flow: recriar por render força
// remount de todos os nodes).
const nodeTypes: NodeTypes = {
  lote: LoteNode,
  mistura: MisturaNode,
  resultado: ResultadoNode,
  alvo: AlvoNode,
  combinacoes: CombinacoesNode,
};

const REJECTION_MESSAGES: Record<ConnectionRejectionReason, string> = {
  SELF: 'Um node não pode conectar nele mesmo',
  INVALID_PAIR: 'Conexão não permitida entre esses nodes',
  DUPLICATE_EDGE: 'Esses nodes já estão conectados',
  DUPLICATE_LOT_IN_MIX: 'Este lote já entra nesta mistura',
  INPUT_OCCUPIED: 'Este node já tem uma entrada conectada',
  CYCLE: 'Essa conexão criaria um ciclo',
};

/** Tipos que podem nascer do arrasto de uma porta de saída (PG26). */
const COMPATIBLE_TARGETS: Partial<Record<PgNodeType, PgNodeType[]>> = {
  lote: ['mistura'],
  mistura: ['mistura', 'resultado'],
  alvo: ['combinacoes'],
};

function initialNodeData(type: PgNodeType): Record<string, unknown> {
  if (type === 'lote') return { sampleId: null, sacks: null };
  if (type === 'combinacoes') return { maxLots: 3 };
  if (type === 'alvo') {
    return {
      peneiraAlvo: '',
      peneiraTolerancia: '',
      catacaoAlvo: '',
      catacaoTolerancia: '',
      sacasMinimas: '',
    };
  }
  return {};
}

let nodeIdCounter = 0;
function nextNodeId(type: PgNodeType): string {
  nodeIdCounter += 1;
  return `pg-${type}-${nodeIdCounter}`;
}

function toGraph(nodes: Node[], edges: Edge[]): { nodes: PgGraphNode[]; edges: PgGraphEdge[] } {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: (node.type ?? 'lote') as PgNodeType,
      data: node.data as PgGraphNode['data'],
    })),
    edges: edges.map((edge) => ({ source: edge.source, target: edge.target })),
  };
}

export function PlaygroundCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { screenToFlowPosition } = useReactFlow();
  const toast = useToast();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [connectMenu, setConnectMenu] = useState<ConnectMenuState | null>(null);
  // Último veredito negativo do isValidConnection — o React Flow só devolve
  // boolean; o motivo (pra toast do PG32) fica guardado aqui.
  const lastRejectionRef = useRef<ConnectionVerdict | null>(null);

  const createNode = useCallback(
    (type: PgNodeType, position: { x: number; y: number }): Node => ({
      id: nextNodeId(type),
      type,
      position,
      data: initialNodeData(type),
    }),
    []
  );

  const addNodeAtCenter = useCallback(
    (type: PgNodeType) => {
      const bounds = hostRef.current?.getBoundingClientRect();
      if (!bounds) return;
      // Stagger leve pra nodes consecutivos não nascerem empilhados.
      const offset = (nodeIdCounter % 5) * 28;
      const position = screenToFlowPosition({
        x: bounds.left + bounds.width / 2 + offset,
        y: bounds.top + bounds.height / 2 + offset,
      });
      setNodes((current) => [...current, createNode(type, position)]);
    },
    [createNode, screenToFlowPosition, setNodes]
  );

  const isValidConnection = useCallback(
    (candidate: Connection | Edge) => {
      if (!candidate.source || !candidate.target) return false;
      const graph = toGraph(nodes, edges);
      const verdict = validateConnection(graph.nodes, graph.edges, {
        source: candidate.source,
        target: candidate.target,
      });
      lastRejectionRef.current = verdict.ok ? null : verdict;
      return verdict.ok;
    },
    [nodes, edges]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      lastRejectionRef.current = null;
      setEdges((current) => addEdge(connection, current));
    },
    [setEdges]
  );

  const onConnectEnd = useCallback(
    (
      event: MouseEvent | TouchEvent,
      connectionState: {
        isValid: boolean | null;
        fromNode: Node | null;
        toNode: Node | null;
        fromHandle: { type: string | null } | null;
      }
    ) => {
      // Soltou no VAZIO a partir de uma porta de saída → menu de compatíveis
      // no ponto, criando o node já conectado (PG26, gesto do n8n).
      if (
        !connectionState.toNode &&
        connectionState.fromNode &&
        connectionState.fromHandle?.type === 'source'
      ) {
        const sourceType = (connectionState.fromNode.type ?? '') as PgNodeType;
        const options = COMPATIBLE_TARGETS[sourceType] ?? [];
        if (options.length === 0) return;
        const point = 'changedTouches' in event ? event.changedTouches[0] : event;
        const bounds = hostRef.current?.getBoundingClientRect();
        setConnectMenu({
          sourceId: connectionState.fromNode.id,
          options,
          screen: {
            x: point.clientX - (bounds?.left ?? 0),
            y: point.clientY - (bounds?.top ?? 0),
          },
          flow: screenToFlowPosition({ x: point.clientX, y: point.clientY }),
        });
        return;
      }
      // Soltou sobre um node mas a conexão foi recusada → motivo em toast (PG32).
      if (connectionState.isValid === false && connectionState.toNode) {
        const rejection = lastRejectionRef.current;
        if (rejection && !rejection.ok) {
          toast.error({ title: REJECTION_MESSAGES[rejection.reason] });
        }
        lastRejectionRef.current = null;
      }
    },
    [screenToFlowPosition, toast]
  );

  const onPickFromConnectMenu = useCallback(
    (type: PgNodeType) => {
      if (!connectMenu) return;
      const node = createNode(type, connectMenu.flow);
      setNodes((current) => [...current, node]);
      setEdges((current) =>
        addEdge({ source: connectMenu.sourceId, target: node.id } as Connection, current)
      );
      setConnectMenu(null);
    },
    [connectMenu, createNode, setNodes, setEdges]
  );

  const onDragOver = useCallback((event: DragEvent) => {
    if (!event.dataTransfer.types.includes('application/pg-node')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      const type = event.dataTransfer.getData('application/pg-node') as PgNodeType | '';
      if (!type) return;
      event.preventDefault();
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setNodes((current) => [...current, createNode(type, position)]);
    },
    [createNode, screenToFlowPosition, setNodes]
  );

  return (
    <div className="pg-canvas-wrap" ref={hostRef} onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onPaneClick={() => setConnectMenu(null)}
        deleteKeyCode={['Backspace', 'Delete']}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="#d3cec2" />
        <Controls showInteractive={false} />
      </ReactFlow>
      <NodePalette onAdd={addNodeAtCenter} />
      {nodes.length === 0 ? (
        <p className="pg-empty-hint">Arraste um Lote da paleta para começar</p>
      ) : null}
      {connectMenu ? (
        <ConnectMenu
          state={connectMenu}
          onPick={onPickFromConnectMenu}
          onClose={() => setConnectMenu(null)}
        />
      ) : null}
    </div>
  );
}
