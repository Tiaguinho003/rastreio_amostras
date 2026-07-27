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
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';

import '@xyflow/react/dist/style.css';

import { playgroundEngine } from '../../lib/playground/engine';
import {
  validateConnection,
  type ConnectionRejectionReason,
  type ConnectionVerdict,
} from '../../lib/playground/graph';
import { createApiLotSource } from '../../lib/playground/lot-source';
import { runSimulation } from '../../lib/playground/simulation';
import type { PgGraphEdge, PgGraphNode, PgNodeType } from '../../lib/playground/types';
import { useToast } from '../../lib/toast/ToastProvider';
import type { SampleSnapshot, SessionData } from '../../lib/types';
import { ConnectMenu, type ConnectMenuState } from './ConnectMenu';
import { ExecutePill } from './ExecutePill';
import { NodePalette } from './NodePalette';
import { ResultDrawer } from './ResultDrawer';
import { PlaygroundLotsContext, type PlaygroundLots } from './lots-context';
import { PlaygroundResultsContext, type PlaygroundResults } from './results-context';
import { LoteNode, type LoteNodeData } from './nodes/LoteNode';
import { MisturaNode } from './nodes/MisturaNode';
import { ResultadoNode } from './nodes/ResultadoNode';

// Declarado em module scope (regra do React Flow: recriar por render força
// remount de todos os nodes).
const nodeTypes: NodeTypes = {
  lote: LoteNode,
  mistura: MisturaNode,
  resultado: ResultadoNode,
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
};

function initialNodeData(type: PgNodeType): Record<string, unknown> {
  if (type === 'lote') return { sampleId: null, sacks: null, sample: null };
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

/**
 * Índice de lotes que os módulos puros consomem — DERIVADO dos nodes, porque
 * o snapshot mora no `data` de cada node Lote desde a troca dos mocks pela
 * busca real. Antes era o `mockLotIndex` estático.
 */
function collectLots(nodes: Node[]): ReadonlyMap<string, SampleSnapshot> {
  const lots = new Map<string, SampleSnapshot>();
  for (const node of nodes) {
    if (node.type !== 'lote') continue;
    const { sample } = node.data as LoteNodeData;
    if (sample) lots.set(sample.id, sample);
  }
  return lots;
}

export function PlaygroundCanvas({ session }: { session: SessionData }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { screenToFlowPosition } = useReactFlow();
  const toast = useToast();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [connectMenu, setConnectMenu] = useState<ConnectMenuState | null>(null);
  // Último veredito negativo do isValidConnection — o React Flow só devolve
  // boolean; o motivo (pra toast do PG32) fica guardado aqui.
  const lastRejectionRef = useRef<ConnectionVerdict | null>(null);

  // Execução (PG14): a 1ª é manual (pill); depois qualquer edição recalcula
  // automaticamente via o próprio useMemo — resultado é DERIVADO, nunca
  // sincronizado à mão.
  const [hasExecuted, setHasExecuted] = useState(false);
  const [drawerResultId, setDrawerResultId] = useState<string | null>(null);
  const outcomes = useMemo(() => {
    if (!hasExecuted) return null;
    const graph = toGraph(nodes, edges);
    return runSimulation(graph.nodes, graph.edges, collectLots(nodes), playgroundEngine);
  }, [nodes, edges, hasExecuted]);
  const resultsValue = useMemo<PlaygroundResults>(
    () => ({ outcomes, openDrawer: setDrawerResultId }),
    [outcomes]
  );

  // Fonte de lotes: uma por sessão. Recriar a cada render faria a busca do
  // node reagir como se o termo tivesse mudado (o `source` é dependência do
  // efeito de busca) e cada tecla dispararia duas requisições.
  const lotSource = useMemo(() => createApiLotSource(session), [session]);
  const lotsValue = useMemo<PlaygroundLots>(
    () => ({
      source: lotSource,
      // PG46: o mesmo lote não entra duas vezes no canvas. Some da busca em
      // vez de ser oferecido e recusado depois — e libera de volta quando o
      // node que o segurava é apagado.
      usedSampleIds: new Set(
        nodes.flatMap((node) =>
          node.type === 'lote' ? ((node.data as LoteNodeData).sample?.id ?? []) : []
        )
      ),
    }),
    [lotSource, nodes]
  );

  // Live region: anuncia o recálculo automático a leitores de tela.
  const [announcement, setAnnouncement] = useState('');
  const announceCountRef = useRef(0);
  useEffect(() => {
    if (!outcomes) return;
    announceCountRef.current += 1;
    setAnnouncement(`Estimativa atualizada (${announceCountRef.current})`);
  }, [outcomes]);

  // Fecha o drawer se o node Resultado dele sumir do canvas.
  useEffect(() => {
    if (drawerResultId && !nodes.some((node) => node.id === drawerResultId)) {
      setDrawerResultId(null);
    }
  }, [drawerResultId, nodes]);

  const onExecute = useCallback(() => {
    if (!nodes.some((node) => node.type === 'resultado')) {
      toast.info({ title: 'Adicione um node Resultado para ver a estimativa' });
    }
    setHasExecuted(true);
  }, [nodes, toast]);

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

  // PG53: o node de Resultado virou só um check — o alvo de clique passou a
  // ser o node inteiro. `onNodeClick` do React Flow, e não um onClick no
  // node, porque ele só dispara em clique de verdade: arrastar o node pelo
  // canvas não abre a ficha.
  const onNodeClick = useCallback(
    (_event: unknown, node: Node) => {
      if (node.type === 'resultado') setDrawerResultId(node.id);
    },
    [setDrawerResultId]
  );

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
    <PlaygroundLotsContext.Provider value={lotsValue}>
      <PlaygroundResultsContext.Provider value={resultsValue}>
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
            onNodeClick={onNodeClick}
            deleteKeyCode={['Backspace', 'Delete']}
            minZoom={0.3}
            maxZoom={2}
          >
            {/* PG55: sem prop `color` — o ponto vem do `--pg-dot` via
                `--xy-background-pattern-color`, no `.pg-host`. */}
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} />
            <Controls showInteractive={false} />
            <ExecutePill onExecute={onExecute} disabled={nodes.length === 0} />
          </ReactFlow>
          {/* PG54: o canvas vazio fica vazio mesmo — a dica central saiu. */}
          <NodePalette onAdd={addNodeAtCenter} />
          {connectMenu ? (
            <ConnectMenu
              state={connectMenu}
              onPick={onPickFromConnectMenu}
              onClose={() => setConnectMenu(null)}
            />
          ) : null}
          {/* PG52: sempre montado — o `BottomSheet` precisa do `open` indo de
              true pra false pra animar a saída; desmontar corta o slide. */}
          <ResultDrawer
            open={drawerResultId !== null}
            outcome={drawerResultId ? (outcomes?.get(drawerResultId) ?? null) : null}
            onClose={() => setDrawerResultId(null)}
          />
          <p className="pg-live-region" role="status" aria-live="polite">
            {announcement}
          </p>
        </div>
      </PlaygroundResultsContext.Provider>
    </PlaygroundLotsContext.Provider>
  );
}
