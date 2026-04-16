'use client';

import { useEffect, useRef, useState } from 'react';

import { useFocusTrap } from '../../lib/use-focus-trap';
import type { DashboardPendingResponse, SampleSnapshot } from '../../lib/types';

export type OperationPanel = 'print_pending' | 'classification_pending' | null;
export type OperationPanelKey = Exclude<OperationPanel, null>;

export interface OperationModalData {
  modalId: string;
  title: string;
  emptyMessage: string;
  total: number;
  items: SampleSnapshot[];
  themeClass: string;
}

function buildOperationModalData(
  data: DashboardPendingResponse,
  activePanel: OperationPanel
): OperationModalData | null {
  if (activePanel === null) {
    return null;
  }

  if (activePanel === 'print_pending') {
    return {
      modalId: 'dashboard-operation-modal-print-pending',
      title: 'Impressao pendente',
      emptyMessage: 'Nenhuma amostra com impressao pendente.',
      total: data.printPending.total,
      items: data.printPending.items,
      themeClass: 'is-status-print-pending',
    };
  }

  return {
    modalId: 'dashboard-operation-modal-classification-pending',
    title: 'Aguardando classificacao',
    emptyMessage: 'Nenhuma amostra aguardando classificacao.',
    total: data.classificationPending.total + (data.classificationInProgress?.total ?? 0),
    items: [...data.classificationPending.items, ...(data.classificationInProgress?.items ?? [])],
    themeClass: 'is-status-classification-pending',
  };
}

export function useOperationModal(data: DashboardPendingResponse | null) {
  const [activeOperationPanel, setActiveOperationPanel] = useState<OperationPanel>(null);
  const focusTrapRef = useFocusTrap(activeOperationPanel !== null);
  const modalCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastOperationTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!activeOperationPanel) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setActiveOperationPanel(null);
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => {
      modalCloseButtonRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => {
        lastOperationTriggerRef.current?.focus();
      }, 0);
    };
  }, [activeOperationPanel]);

  function openOperationPanel(panel: OperationPanelKey, trigger: HTMLButtonElement) {
    lastOperationTriggerRef.current = trigger;
    setActiveOperationPanel((current) => (current === panel ? null : panel));
  }

  function closeOperationModal() {
    setActiveOperationPanel(null);
  }

  const operationModalData = data ? buildOperationModalData(data, activeOperationPanel) : null;

  return {
    activeOperationPanel,
    focusTrapRef,
    modalCloseButtonRef,
    openOperationPanel,
    closeOperationModal,
    operationModalData,
  };
}
