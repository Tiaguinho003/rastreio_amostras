'use client';

import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { SampleSnapshot } from '../../../lib/types';
import { NodeShell } from './NodeShell';
import { NODE_ICONS } from './icons';

// O snapshot do lote mora no PRÓPRIO node: o canvas não mantém um índice à
// parte, e o `lotsById` que os módulos puros recebem é derivado dos nodes a cada
// simulação. Um dono só para o dado.
//
// PG60: os três campos deixaram de ser anuláveis. O node de Lote não nasce mais
// vazio — quem o cria é a escolha do lote no passo 2 do painel, e não existe
// outro caminho: o menu de compatíveis (arrastar da porta para o vazio) nunca
// produz um Lote, porque Lote não tem porta de entrada.
export type LoteNodeData = {
  sampleId: string;
  sacks: number;
  sample: SampleSnapshot;
};

// Node Lote (PG29/PG30 → PG60 → PG61): o quadrado carrega só o ícone; o número
// do lote e as sacas moram abaixo dele.
//
// As sacas são um chip que abre um dropdown de edição (containers §1: editar
// 1–2 campos de um card é dropdown inline, não painel). O chip é o gatilho, e
// não o node inteiro, por dois motivos: o alvo fica explícito, e um `onClick` no
// corpo do node dispararia também ao terminar de ARRASTAR — a armadilha que a
// PG53 documentou no Resultado. Com `nodrag` no chip, arrastar por ele nem
// começa.
export function LoteNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const { sample, sacks } = data as LoteNodeData;
  const available = sample.availableSacks ?? 0;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const parsed = draft === '' ? null : Number(draft);
  const overCap = parsed !== null && parsed > available;
  const empty = parsed === null || parsed < 1;
  // "Ativado ao editar": confirmar só existe quando há uma mudança VÁLIDA a
  // aplicar. Sem isso o botão convida a um clique que não faz nada — e é ele que
  // mantém o node fora do estado de saldo estourado, que antes só era descoberto
  // ao executar.
  const canCommit = !empty && !overCap && parsed !== sacks;

  function openEditor() {
    setDraft(String(sacks));
    setEditing(true);
  }

  function commit(event: FormEvent) {
    event.preventDefault();
    if (!canCommit) return;
    updateNodeData(id, { sacks: parsed });
    setEditing(false);
  }

  return (
    <NodeShell
      id={id}
      icon={NODE_ICONS.lote}
      source
      name={
        <>
          Lote {sample.internalLotNumber}
          {sample.isBlend ? <span className="pg-node-badge">liga</span> : null}
        </>
      }
    >
      <div className="pg-sacks">
        <button
          type="button"
          className="pg-sacks-chip nodrag"
          aria-expanded={editing}
          aria-label={`${sacks} sacas do lote ${sample.internalLotNumber}. Editar`}
          onClick={() => (editing ? setEditing(false) : openEditor())}
        >
          <span>{sacks} sc</span>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {editing ? (
          <form
            className="pg-sacks-pop nodrag nopan"
            onSubmit={commit}
            // Fecha ao sair do dropdown — cobre clique fora e Tab. O
            // `relatedTarget` contido segura a abertura quando o foco só anda do
            // input para o botão de confirmar.
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setEditing(false);
              }
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              // O ESC morre aqui: sem isto ele seguiria para o canvas.
              event.stopPropagation();
              setEditing(false);
            }}
          >
            <div className="pg-sacks-pop-row">
              <input
                ref={inputRef}
                value={draft}
                inputMode="numeric"
                aria-label="Sacas"
                aria-invalid={overCap}
                className={overCap ? 'has-error' : undefined}
                onChange={(event) => setDraft(event.target.value.replace(/\D+/g, ''))}
              />
              <span className="pg-sacks-pop-unit">sc</span>
              <button
                type="submit"
                className="pg-sacks-confirm"
                disabled={!canCommit}
                aria-label="Confirmar sacas"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </button>
            </div>
            {overCap ? (
              <p className="pg-sacks-pop-error" role="alert">
                Máx. {available} sc disponíveis
              </p>
            ) : null}
          </form>
        ) : null}
      </div>

      <div className="pg-node-tooltip" role="tooltip">
        <span>{sample.declared.owner ?? 'Sem dono'}</span>
        <span>disp. {available} sc</span>
        <span>safra {sample.declared.harvest ?? '—'}</span>
      </div>
    </NodeShell>
  );
}
