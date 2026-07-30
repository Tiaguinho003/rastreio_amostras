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
  disabled = false,
  target = false,
  source = false,
  corner,
  children,
}: {
  id: string;
  icon: ReactNode;
  name: ReactNode;
  variant?: NodeShellVariant;
  /** PG65: node fora do cálculo — riscado, ligações intactas, reversível. */
  disabled?: boolean;
  /** Porta de entrada, à esquerda. Sem ela o quadrado vira "gatilho" (PG62). */
  target?: boolean;
  /** Porta de saída, à direita. */
  source?: boolean;
  /** Selo no canto do quadrado (o check do Resultado). */
  corner?: ReactNode;
  /** Vai ABAIXO do nome (sacas do Lote, mensagem de erro). */
  children?: ReactNode;
}) {
  const { deleteElements, updateNodeData } = useReactFlow();
  const { addFromNode } = usePlaygroundCanvasActions();
  // Seletor de valor PRIMITIVO: o `useStore` compara o retorno por identidade,
  // e um objeto novo a cada chamada re-renderizaria o node a cada tique do
  // canvas.
  //
  // PG62: o coto com "+" é a OFERTA de conectar, e some quando a saída já tem
  // para onde ir — sobra a linha da edge, saindo do círculo.
  //
  // 🪦 Aqui havia um segundo seletor, `connected`, que decidia se "desativar"
  // aparecia: enquanto desativar SOLTAVA as ligações (PG61), sem ligação não
  // havia o que desativar. Na PG65 desativar deixou de mexer nelas, e o botão
  // passou a valer sempre.
  const hasOutgoing = useStore((store) => store.edges.some((edge) => edge.source === id));

  // PG63: o mesmo estado serve ao mouse E ao teclado. Antes só o hover abria a
  // barra, e quem navega por Tab não tinha como chegar em deletar/desativar.
  const [toolsOpen, setToolsOpen] = useState(false);
  const leaveTimer = useRef<number | null>(null);

  const clearLeave = () => {
    if (leaveTimer.current === null) return;
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
  };
  const show = useCallback(() => {
    clearLeave();
    setToolsOpen(true);
  }, []);
  const hide = useCallback(() => {
    clearLeave();
    leaveTimer.current = window.setTimeout(() => {
      // 🔴 A checagem é no documento, não no `.pg-node`: o `NodeToolbar`
      // PORTALA os botões para fora da árvore DOM do node. Sem ela, dar Tab
      // para o primeiro botão dispararia o blur do node, a barra fecharia e o
      // foco iria junto — a barra seria inalcançável pelo teclado.
      const active = document.activeElement;
      const owner = active instanceof HTMLElement ? active.closest('.pg-node-tools') : null;
      if (owner instanceof HTMLElement && owner.dataset.nodeId === id) return;
      setToolsOpen(false);
    }, HOVER_GRACE_MS);
  }, [id]);
  useEffect(() => clearLeave, []);

  // Desativado VENCE os estados: um node fora da conta não tem por que anunciar
  // que está incompleto ou com erro — a conta em que ele estaria errado não é
  // feita.
  const variantClass = disabled
    ? ' is-disabled'
    : variant === 'error'
      ? ' has-error'
      : variant
        ? ` is-${variant}`
        : '';
  // Sem porta de entrada, o node é uma FONTE: nada chega nele, e o lado esquerdo
  // arredondado diz isso de longe — a forma faz o trabalho que uma legenda faria
  // (é o desenho do node-gatilho do n8n). Hoje só o Lote cai aqui.
  const triggerClass = target ? '' : ' is-trigger';

  return (
    <div
      className={disabled ? 'pg-node is-disabled' : 'pg-node'}
      onMouseEnter={show}
      onMouseLeave={hide}
      // `onFocus`/`onBlur` do React são focusin/focusout: BORBULHAM, e borbulham
      // pela árvore do REACT — então o foco nos botões da barra, que estão
      // portalados, chega aqui também.
      onFocus={show}
      onBlur={hide}
    >
      {/* `NodeToolbar` do React Flow: portala, acompanha o node no pan/zoom e
          não é recortado por nada. Fazer à mão custaria as três coisas. */}
      <NodeToolbar
        isVisible={toolsOpen}
        position={Position.Top}
        offset={8}
        data-node-id={id}
        className="pg-node-tools nodrag nopan"
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {/* PG65: TOGGLE, não uma faca. Desativar tira o node da conta e o
            risca; as ligações ficam e reativar devolve tudo. Antes ele soltava
            as edges, e religar era trabalho manual — o desenho do fluxo se
            perdia por um clique de "e se sem este lote?". */}
        <button
          type="button"
          className={disabled ? 'is-on' : undefined}
          aria-pressed={disabled}
          aria-label={disabled ? 'Reativar node' : 'Desativar node'}
          title={disabled ? 'Reativar — volta para a conta' : 'Desativar — sai da conta'}
          onClick={() => updateNodeData(id, { disabled: !disabled })}
        >
          {/* Botão de energia: o arco aberto e o traço. */}
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7.5 6.5a7 7 0 1 0 9 0" />
            <path d="M12 3v8" />
          </svg>
        </button>
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
        {/* O risco atravessando o quadrado — o desenho do n8n. É o que diz
            "está aqui, mas não conta" sem precisar de legenda. */}
        {disabled ? <span className="pg-node-strike" aria-hidden="true" /> : null}
        {corner}
        {/* PG62: a porta de saída é o CÍRCULO na borda, e ele fica SEMPRE — é
            dali que a edge nasce e é de onde se puxa a próxima, porque um node
            pode alimentar mais de um destino. O que some ao conectar é o coto:
            a linha curta e o "+", que são a oferta, não a porta. Na PG61 o "+"
            ERA a porta, e por isso não podia sumir: a âncora da edge saltaria
            de volta para a borda do quadrado. */}
        {source ? <Handle type="source" position={Position.Right} /> : null}
        {/* PG63: o coto fica SEMPRE montado e o que muda é a classe. Animar a
            saída com montagem/desmontagem exigiria maquinário de exit-animation;
            com a classe, a transição CSS cobre os dois sentidos de graça — ele
            cresce a partir da borda do quadrado e encolhe de volta pra lá. */}
        {source ? (
          <span className={`pg-node-stub${hasOutgoing ? ' is-hidden' : ''}`}>
            <AddNodeButton
              variant="stub"
              label="Conectar a um node novo"
              // O `tabIndex` acompanha a visibilidade: coto escondido não pode
              // continuar no tab order só porque continua montado.
              tabIndex={hasOutgoing ? -1 : 0}
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
