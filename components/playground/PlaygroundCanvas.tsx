'use client';

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Panel,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
// `MouseEvent` do React entra APELIDADO: sem o alias ele sombreia o
// `MouseEvent` global do DOM, que é o que o `onConnectEnd` do React Flow tipa.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import '@xyflow/react/dist/style.css';

import { playgroundEngine } from '../../lib/playground/engine';
import {
  typesAfter,
  typesBetween,
  validateConnection,
  type ConnectionRejectionReason,
  type ConnectionVerdict,
} from '../../lib/playground/graph';
import { createApiLotSource } from '../../lib/playground/lot-source';
import { runSimulation } from '../../lib/playground/simulation';
import type { PgGraphEdge, PgGraphNode, PgNodeType } from '../../lib/playground/types';
import { useToast } from '../../lib/toast/ToastProvider';
import type { SampleSnapshot, SessionData } from '../../lib/types';
import { AddNodeButton } from './AddNodeButton';
import { ConnectMenu, type ConnectMenuState } from './ConnectMenu';
import { ExecutePill } from './ExecutePill';
import { NodePaletteSheet } from './NodePaletteSheet';
import { PgEdge } from './PgEdge';
import { ResultDrawer } from './ResultDrawer';
import {
  PlaygroundCanvasActionsContext,
  type PlaygroundCanvasActions,
} from './canvas-actions-context';
import { PlaygroundLotsContext, type PlaygroundLots } from './lots-context';
import { PlaygroundResultsContext, type PlaygroundResults } from './results-context';
import { LoteNode, type LoteNodeData } from './nodes/LoteNode';
import { MisturaNode } from './nodes/MisturaNode';
import { ResultadoNode } from './nodes/ResultadoNode';

// Declarados em module scope (regra do React Flow: recriar por render força
// remount de todos os nodes e de todas as edges).
const nodeTypes: NodeTypes = {
  lote: LoteNode,
  mistura: MisturaNode,
  resultado: ResultadoNode,
};

const edgeTypes: EdgeTypes = { pg: PgEdge };

// PG64: toda ligação nova nasce com o nosso tipo e com SETA. A seta diz o
// sentido do fluxo — sem ela, uma cascata de misturas é um emaranhado sem
// direção. A COR dela não vem daqui: o React Flow escreve a cor do marker como
// atributo de apresentação, e `var()` não resolve em atributo; quem pinta é o
// `.react-flow__arrowhead` no CSS, para o token seguir sendo a fonte única.
const defaultEdgeOptions = {
  type: 'pg',
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
};

const REJECTION_MESSAGES: Record<ConnectionRejectionReason, string> = {
  SELF: 'Um node não pode conectar nele mesmo',
  INVALID_PAIR: 'Conexão não permitida entre esses nodes',
  DUPLICATE_EDGE: 'Esses nodes já estão conectados',
  DUPLICATE_LOT_IN_MIX: 'Este lote já entra nesta mistura',
  INPUT_OCCUPIED: 'Este node já tem uma entrada conectada',
  CYCLE: 'Essa conexão criaria um ciclo',
};

// PG64: a lista de compatíveis era escrita à mão AQUI e repetia o `VALID_PAIRS`
// do `graph.ts` — duas listas com a mesma verdade, livres para divergir. Agora
// ela deriva do módulo puro, que é quem valida a conexão de fato.
const COMPATIBLE_TARGETS: Record<PgNodeType, PgNodeType[]> = {
  lote: typesAfter('lote'),
  mistura: typesAfter('mistura'),
  resultado: typesAfter('resultado'),
};

/**
 * PG60: só Lote tem configuração, e ela chega PRONTA de quem cria o node — a
 * escolha do lote no 2º passo do painel. O `initialNodeData` que devolvia
 * `{sampleId: null, sacks: null, sample: null}` morreu com o node vazio.
 */
function loteNodeData(sample: SampleSnapshot): LoteNodeData {
  return {
    sampleId: sample.id,
    sample,
    // Default = saldo físico total, como a liga real (F2.1). O `?? 0` não
    // acontece: a busca só oferece lote com saldo > 0.
    sacks: sample.availableSacks ?? 0,
  };
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
    // PG60: todo node de Lote nasce com lote — não há mais o caso do node vazio.
    const { sample } = node.data as LoteNodeData;
    lots.set(sample.id, sample);
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
  // Painel de nodes (PG58): a paleta docada virou `.side-sheet`, aberto pelo "+"
  // do canto ou pelo "+" central do canvas vazio (PG59). Guardar QUAL dos dois
  // abriu é o que permite devolver o foco ao trigger no fechamento (containers
  // §6); o `isConnected` cobre o trigger que não existe mais — escolher o
  // primeiro node desmonta justamente o "+" central.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteTriggerRef = useRef<HTMLButtonElement | null>(null);
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
        nodes.flatMap((node) => (node.type === 'lote' ? (node.data as LoteNodeData).sample.id : []))
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
    (
      type: PgNodeType,
      position: { x: number; y: number },
      data: Record<string, unknown> = {}
    ): Node => ({
      id: nextNodeId(type),
      type,
      position,
      data,
    }),
    []
  );

  const addNodeAtCenter = useCallback(
    (type: PgNodeType, data?: Record<string, unknown>) => {
      const bounds = hostRef.current?.getBoundingClientRect();
      if (!bounds) return;
      // Stagger leve pra nodes consecutivos não nascerem empilhados. Conta o que
      // ESTÁ no canvas, não o contador global de ids: o "+" central (PG59) é o
      // único ato possível no canvas vazio, e o node que ele cria tem que cair
      // no centro exato — sob o próprio botão que foi tocado.
      const offset = (nodes.length % 5) * 28;
      const position = screenToFlowPosition({
        x: bounds.left + bounds.width / 2 + offset,
        y: bounds.top + bounds.height / 2 + offset,
      });
      setNodes((current) => [...current, createNode(type, position, data)]);
    },
    [createNode, nodes.length, screenToFlowPosition, setNodes]
  );

  const openPalette = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    paletteTriggerRef.current = event.currentTarget;
    // A faixa direita hospeda UM painel. A ficha é mais estreita (420px) e
    // cobre o "+" do canto, então na prática não há como chegar aqui com ela
    // aberta — mas dois `.side-sheet` no mesmo tier, no mesmo lugar, é a
    // espécie de bug que não se quer descobrir depois.
    setDrawerResultId(null);
    setPaletteOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    // `setTimeout(0)`: o sheet ainda anima a saída com o focus-trap ativo, e
    // focar no mesmo tick seria roubado de volta (containers §6).
    const trigger = paletteTriggerRef.current;
    paletteTriggerRef.current = null;
    window.setTimeout(() => {
      if (trigger?.isConnected) trigger.focus();
    }, 0);
  }, []);

  // PG60: dois jeitos de sair do painel com um node. Mistura e Resultado não têm
  // o que perguntar e saem do passo 1; o Lote sai do passo 2, e quem o cria é a
  // ESCOLHA do lote — por isso são duas funções e não uma com `if`.
  const onPickType = useCallback(
    (type: PgNodeType) => {
      addNodeAtCenter(type);
      closePalette();
    },
    [addNodeAtCenter, closePalette]
  );

  const onPickLot = useCallback(
    (sample: SampleSnapshot) => {
      addNodeAtCenter('lote', loteNodeData(sample));
      closePalette();
    },
    [addNodeAtCenter, closePalette]
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

  // PG63: enquanto um arrasto de conexão está em curso, os cotos com "+" de
  // TODOS os nodes viram ruído e alvo falso — somem, e voltam ao soltar.
  //
  // A classe vai direto no DOM, sem `useState`: guardar isso em estado
  // re-renderizaria o canvas inteiro no meio de um gesto de arrasto, que é o
  // pior momento possível para isso acontecer.
  const setConnecting = useCallback((on: boolean) => {
    hostRef.current?.classList.toggle('is-connecting', on);
  }, []);

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
      setConnecting(false);
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
          title: 'Conectar a…',
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
    [screenToFlowPosition, setConnecting, toast]
  );

  // PG62: o "+" do coto de um node. Abre o MESMO menu de compatíveis do
  // arraste-para-o-vazio — o "+" é o caminho de quem não quer arrastar, e o
  // resultado tem que ser idêntico. Nenhum dos tipos que podem sair daqui
  // (Mistura, Resultado) precisa de configuração, então não há passo de painel:
  // o Lote, que precisaria, nunca é destino de conexão.
  const addFromNode = useCallback(
    (sourceId: string, event: ReactMouseEvent<HTMLElement>) => {
      const source = nodes.find((node) => node.id === sourceId);
      const options = COMPATIBLE_TARGETS[(source?.type ?? '') as PgNodeType] ?? [];
      if (options.length === 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const bounds = hostRef.current?.getBoundingClientRect();
      // A âncora é o MEIO da borda direita do "+", convertida para o flow antes
      // de deslocar: assim o afastamento do node novo é em unidades do canvas e
      // não encolhe nem estica com o zoom.
      const anchor = screenToFlowPosition({ x: rect.right, y: rect.top + rect.height / 2 });
      setConnectMenu({
        sourceId,
        options,
        title: 'Conectar a…',
        screen: {
          x: rect.right - (bounds?.left ?? 0) + 8,
          y: rect.top - (bounds?.top ?? 0),
        },
        // −34 = meia altura do quadrado: o node novo nasce alinhado pelo CENTRO
        // com o de origem, e não pendurado pelo topo.
        flow: { x: anchor.x + 70, y: anchor.y - 34 },
      });
    },
    [nodes, screenToFlowPosition]
  );

  // PG64: o "+" da barra da linha. Mesmo menu, terceiro caminho — e o único que
  // desfaz algo: a ligação antiga morre e nascem duas.
  const insertOnEdge = useCallback(
    (
      edgeId: string,
      sourceId: string,
      targetId: string,
      flow: { x: number; y: number },
      event: ReactMouseEvent<HTMLElement>
    ) => {
      const byId = new Map(nodes.map((node) => [node.id, node]));
      const sourceType = byId.get(sourceId)?.type as PgNodeType | undefined;
      const targetType = byId.get(targetId)?.type as PgNodeType | undefined;
      if (!sourceType || !targetType) return;
      const options = typesBetween(sourceType, targetType);
      if (options.length === 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const bounds = hostRef.current?.getBoundingClientRect();
      setConnectMenu({
        sourceId,
        options,
        title: 'Inserir aqui…',
        insert: { edgeId, targetId },
        screen: {
          x: rect.right - (bounds?.left ?? 0) + 8,
          y: rect.top - (bounds?.top ?? 0),
        },
        // O ponto médio da curva já vem em coordenadas de flow; o −34 alinha o
        // quadrado pelo centro, como no coto.
        flow: { x: flow.x - 34, y: flow.y - 34 },
      });
    },
    [nodes]
  );

  const canvasActions = useMemo<PlaygroundCanvasActions>(
    () => ({ addFromNode, insertOnEdge }),
    [addFromNode, insertOnEdge]
  );

  const onPickFromConnectMenu = useCallback(
    (type: PgNodeType) => {
      if (!connectMenu) return;
      const node = createNode(type, connectMenu.flow);
      const { sourceId, insert } = connectMenu;
      setNodes((current) => [...current, node]);
      setEdges((current) => {
        // Inserir no meio: a ligação antiga sai ANTES das duas novas entrarem —
        // deixá-la viva junto criaria um caminho paralelo que pula o node novo,
        // e a Mistura de destino contaria a mesma origem duas vezes.
        const base = insert ? current.filter((edge) => edge.id !== insert.edgeId) : current;
        const withFirst = addEdge({ source: sourceId, target: node.id } as Connection, base);
        return insert
          ? addEdge({ source: node.id, target: insert.targetId } as Connection, withFirst)
          : withFirst;
      });
      setConnectMenu(null);
    },
    [connectMenu, createNode, setNodes, setEdges]
  );

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

  // O par `onDragOver`/`onDrop` morreu com a paleta docada (PG58): o único
  // produtor do `application/pg-node` era o item arrastável dela, e o backdrop
  // do painel interceptaria o drop de qualquer jeito.

  return (
    <PlaygroundLotsContext.Provider value={lotsValue}>
      <PlaygroundResultsContext.Provider value={resultsValue}>
        <PlaygroundCanvasActionsContext.Provider value={canvasActions}>
          <div className="pg-canvas-wrap" ref={hostRef}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectStart={() => setConnecting(true)}
              onConnectEnd={onConnectEnd}
              isValidConnection={isValidConnection}
              // PG63: tolerância de SOLTAR a conexão (o padrão é 20). Errar a
              // porta por 30px desfaz o gesto inteiro — é o erro mais frequente
              // e mais caro do canvas. 60 é o número do n8n.
              connectionRadius={60}
              onPaneClick={() => setConnectMenu(null)}
              onNodeClick={onNodeClick}
              // PG63: o chrome pequeno (coto e portas) mantém tamanho de TELA em
              // qualquer zoom. A variável vai no DOM por ref, fora do React: o
              // `onMove` dispara a cada quadro do pan/zoom, e passar isso por
              // estado re-renderizaria o canvas inteiro em cada um deles.
              onMove={(_event, viewport) =>
                hostRef.current?.style.setProperty(
                  '--pg-zoom-comp',
                  String(Math.min(2.5, Math.max(0.4, 1 / viewport.zoom)))
                )
              }
              deleteKeyCode={['Backspace', 'Delete']}
              minZoom={0.3}
              maxZoom={2}
            >
              {/* PG55: sem prop `color` — o ponto vem do `--pg-dot` via
                `--xy-background-pattern-color`, no `.pg-host`. */}
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} />
              <Controls showInteractive={false} />
              <ExecutePill onExecute={onExecute} disabled={nodes.length === 0} />
              {/* PG58: o "+" do canto. Dentro de um `Panel` porque é a peça do
                React Flow que já resolve ancorar sobre o canvas. */}
              <Panel position="top-right">
                <AddNodeButton variant="corner" onOpen={openPalette} />
              </Panel>
            </ReactFlow>
            {/* PG59: o "+" central existe só enquanto o canvas está vazio. Fora do
              `<ReactFlow>` porque o `Panel` não tem posição central — e aqui o
              contexto de posicionamento é o `.pg-canvas-wrap`, como era a
              paleta. A PG54 segue valendo no que ela disse: nada de FRASE no
              vazio. */}
            {nodes.length === 0 ? <AddNodeButton variant="center" onOpen={openPalette} /> : null}
            <NodePaletteSheet
              open={paletteOpen}
              onClose={closePalette}
              onPickType={onPickType}
              onPickLot={onPickLot}
            />
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
        </PlaygroundCanvasActionsContext.Provider>
      </PlaygroundResultsContext.Provider>
    </PlaygroundLotsContext.Provider>
  );
}
