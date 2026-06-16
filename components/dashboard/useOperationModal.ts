'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import type { DashboardPendingResponse, SampleSnapshot } from '../../lib/types';

// Q.print: card "Impressao pendente" cortado — so resta classification_pending.
export type OperationPanel = 'classification_pending' | null;
export type OperationPanelKey = Exclude<OperationPanel, null>;

export interface OperationModalData {
  title: string;
  emptyMessage: string;
  items: SampleSnapshot[];
  themeClass: string;
}

function buildOperationModalData(data: DashboardPendingResponse): OperationModalData {
  return {
    title: 'Lotes pendentes',
    emptyMessage: 'Nenhuma amostra aguardando classificacao.',
    items: data.classificationPending.items,
    themeClass: 'is-status-classification-pending',
  };
}

export function useOperationModal(data: DashboardPendingResponse | null) {
  const router = useRouter();
  const [activeOperationPanel, setActiveOperationPanel] = useState<OperationPanel>(null);
  const lastOperationTriggerRef = useRef<HTMLButtonElement | null>(null);

  // O painel virou um BottomSheet (ver OperationModal): ESC, lock de scroll,
  // focus trap, backdrop, drag e back do Android sao todos do BottomSheet —
  // o hook so guarda o estado de aberto/fechado e o gatilho pra devolver foco.
  const open = activeOperationPanel !== null;

  function openOperationPanel(panel: OperationPanelKey, trigger: HTMLButtonElement) {
    lastOperationTriggerRef.current = trigger;
    setActiveOperationPanel((current) => (current === panel ? null : panel));
  }

  function closeOperationModal() {
    setActiveOperationPanel(null);
    // O BottomSheet faz focus trap mas nao devolve o foco ao gatilho ao
    // fechar — restauramos no card que abriu o sheet (a11y de teclado).
    const trigger = lastOperationTriggerRef.current;
    if (trigger) {
      window.setTimeout(() => trigger.focus(), 0);
    }
  }

  // Acao da seta de cada card: abre a camera com a amostra pra classificar.
  // CRITICO: limpamos o marcador de history do BottomSheet ANTES de navegar.
  // Ir pra /camera desmonta o dashboard -> o cleanup do sheet roda e, se o
  // marcador continuar setado, chama history.back() e DESFAZ o router.push
  // assincrono (a seta nao abria a camera). Mesmo padrao do HeaderAvatarMenu.go().
  function classifySample(sampleId: string) {
    if (typeof window !== 'undefined' && window.history.state?.bottomSheet) {
      window.history.replaceState({ ...window.history.state, bottomSheet: false }, '');
    }
    setActiveOperationPanel(null);
    router.push(`/camera?sampleId=${sampleId}`);
  }

  // Construido sempre que ha dados do dashboard (nao so quando aberto) pra que
  // o conteudo continue disponivel durante a animacao de saida do BottomSheet,
  // que mantem o sheet montado por ANIMATION_MS apos o close.
  const operationModalData = data ? buildOperationModalData(data) : null;

  return {
    open,
    activeOperationPanel,
    openOperationPanel,
    closeOperationModal,
    classifySample,
    operationModalData,
  };
}
