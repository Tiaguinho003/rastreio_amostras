'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getApprovalLabelPrefill,
  getDashboardApprovalEvents,
  getDashboardPaymentEvents,
  getDashboardRecentSends,
  getDashboardShipmentEvents,
} from '../../lib/api-client';
import { canManageClients, FINANCEIRO_ROLES, isRoleAllowed } from '../../lib/roles';
import { ApprovalLabelModal } from '../ApprovalLabelModal';
import { SalesAvailabilityCard } from '../SalesAvailabilityCard';
import { EventsCalendarCard } from './EventsCalendarCard';
import { RecentSendsCard } from './RecentSendsCard';
import { useOperationModal } from './useOperationModal';
import { OperationModal } from './OperationModal';
import { StatCard } from './StatCard';
import type {
  ApprovalLabelPrefill,
  DashboardCalendarEvent,
  DashboardPendingResponse,
  DashboardRecentSendsResponse,
  DashboardSalesAvailabilityResponse,
  SessionData,
} from '../../lib/types';

interface DashboardDesktopProps {
  session: SessionData;
  data: DashboardPendingResponse | null;
  salesData: DashboardSalesAvailabilityResponse | null;
  error: string | null;
}

export function DashboardDesktop({ session, data, salesData, error }: DashboardDesktopProps) {
  const router = useRouter();
  const {
    activeOperationPanel,
    open: operationModalOpen,
    openOperationPanel,
    closeOperationModal,
    classifySample,
    operationModalData,
  } = useOperationModal(data);

  const [recentSends, setRecentSends] = useState<DashboardRecentSendsResponse | null>(null);
  // Throttle pro refetch on focus/visibilitychange: evita N requests
  // em Alt+Tab rapido.
  const lastFetchRef = useRef<number>(0);

  // F1 (E24/E28): eventos de pagamento do card de Eventos — só ADMIN/COMMERCIAL
  // (E22). `paymentWindow` = a quinzena visível que o card emite via onWindowChange.
  // E28: o evento é navegação pura (→ Financeiro); o "Pago" saiu do dashboard.
  const canPay = isRoleAllowed(session.user.role, FINANCEIRO_ROLES);
  const canManageCadastro = canManageClients(session.user.role);
  const [paymentEvents, setPaymentEvents] = useState<Record<string, DashboardCalendarEvent[]>>({});
  const [paymentWindow, setPaymentWindow] = useState<{ from: string; to: string } | null>(null);
  const handleWindowChange = useCallback((from: string, to: string) => {
    setPaymentWindow({ from, to });
  }, []);

  // F2 (reforma AP6/AP7): lembrete de aprovação — feed SEPARADO (visibilidade diferente
  // dos pagamentos: todos os não-PROSPECTOR), na MESMA janela. Merge client-side no
  // `events` do card (id namespaced 'reminder:' evita colisão de key com pagamentos).
  const [approvalEvents, setApprovalEvents] = useState<Record<string, DashboardCalendarEvent[]>>(
    {}
  );
  // F4 (EMB7/EMB26): eventos de embarque — feed SEPARADO (mesma visibilidade da
  // aprovação: todos os não-PROSPECTOR, auth-only), na MESMA janela. Merge client-side
  // no `events` do card (id namespaced 'shipment:' evita colisão de key).
  const [shipmentEvents, setShipmentEvents] = useState<Record<string, DashboardCalendarEvent[]>>(
    {}
  );
  const [approvalForm, setApprovalForm] = useState<{
    contractId: string;
    prefill: ApprovalLabelPrefill;
  } | null>(null);
  const calendarEvents = useMemo(() => {
    const merged: Record<string, DashboardCalendarEvent[]> = {};
    for (const [day, evs] of Object.entries(paymentEvents)) merged[day] = [...evs];
    for (const [day, evs] of Object.entries(approvalEvents)) {
      merged[day] = merged[day] ? [...merged[day], ...evs] : [...evs];
    }
    for (const [day, evs] of Object.entries(shipmentEvents)) {
      merged[day] = merged[day] ? [...merged[day], ...evs] : [...evs];
    }
    return merged;
  }, [paymentEvents, approvalEvents, shipmentEvents]);

  useEffect(() => {
    if (!session) return undefined;

    // So o breakpoint ATIVO busca (o twin mobile fica montado mas inerte via
    // CSS). `active` evita setState apos unmount; o listener de 'change' do
    // matchMedia re-busca ao ENTRAR no desktop num resize (senao o card
    // ficava travado no skeleton — nada disparava o fetch).
    const mq = window.matchMedia('(min-width: 901px)');
    let active = true;
    const REFETCH_THROTTLE_MS = 30_000;

    function refetchAll() {
      if (!active || !mq.matches) return;
      lastFetchRef.current = Date.now();
      getDashboardRecentSends(session)
        .then((response) => {
          if (active) setRecentSends(response);
        })
        .catch(() => {});
    }

    function refetchAllThrottled() {
      if (Date.now() - lastFetchRef.current < REFETCH_THROTTLE_MS) return;
      refetchAll();
    }

    refetchAll();

    function handleBreakpointChange() {
      if (mq.matches) refetchAll();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        refetchAllThrottled();
      }
    }

    mq.addEventListener('change', handleBreakpointChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refetchAllThrottled);
    return () => {
      active = false;
      mq.removeEventListener('change', handleBreakpointChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refetchAllThrottled);
    };
  }, [session]);

  // F1 (E24): busca os eventos de pagamento da JANELA visível (emitida pelo card).
  // Só desktop + só ADMIN/COMMERCIAL (canPay); demais não chamam → card vazio.
  // Re-busca em focus/visibility. Serve tb pra recarregar após "Pago" (o evento
  // migra agendado→realizado, podendo mudar de dia).
  const fetchPaymentEvents = useCallback(() => {
    if (!canPay || !paymentWindow) return;
    if (!window.matchMedia('(min-width: 901px)').matches) return;
    getDashboardPaymentEvents(session, paymentWindow)
      .then((res) => setPaymentEvents(res.events))
      .catch(() => {});
  }, [session, canPay, paymentWindow]);

  // F2 (AP10): SEM gate de papel — o card só monta no desktop (já não-PROSPECTOR).
  // Mesma janela dos pagamentos. Re-busca em focus/visibility e após "Gerar aprovação"
  // (aí o lembrete some, pois o contrato passa a ter linha no approval_label_log).
  const fetchApprovalEvents = useCallback(() => {
    if (!paymentWindow) return;
    if (!window.matchMedia('(min-width: 901px)').matches) return;
    getDashboardApprovalEvents(session, paymentWindow)
      .then((res) => setApprovalEvents(res.events))
      .catch(() => {});
  }, [session, paymentWindow]);

  // F4 (EMB7): SEM gate de papel (o card só monta no desktop, já não-PROSPECTOR).
  // Mesma janela. Re-busca em focus/visibility e após confirmar (o evento migra
  // agendado→realizado, podendo mudar de dia).
  const fetchShipmentEvents = useCallback(() => {
    if (!paymentWindow) return;
    if (!window.matchMedia('(min-width: 901px)').matches) return;
    getDashboardShipmentEvents(session, paymentWindow)
      .then((res) => setShipmentEvents(res.events))
      .catch(() => {});
  }, [session, paymentWindow]);

  useEffect(() => {
    fetchPaymentEvents();
    fetchApprovalEvents();
    fetchShipmentEvents();
    const onFocusOrVisible = () => {
      fetchPaymentEvents();
      fetchApprovalEvents();
      fetchShipmentEvents();
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [fetchPaymentEvents, fetchApprovalEvents, fetchShipmentEvents]);

  // Q.print: card "Impressao pendente" cortado definitivamente (decisao
  // Q.1.c #20). PrintJob agora vive como informacao auxiliar dentro do
  // detalhe da amostra, nao no dashboard.
  const classificationTotal = data?.classificationPending.total ?? 0;

  return (
    <div className="dashboard-desktop">
      <section className="dashboard-page">
        {error ? (
          <p className="dashboard-error-banner" role="status">
            {error}
          </p>
        ) : null}

        {/* Layout DSH-D4/D5/D6 + E20: coluna ESQUERDA = pendencias (2
            StatCards, tamanho preservado) + pilha donut/Ultimos envios;
            coluna DIREITA inteira = card de Eventos, do topo (linha das
            pendencias) ate a base. */}
        <div className="dd-content-grid">
          <div className="dd-left-col">
            <div className={`dd-summary-row${canManageCadastro ? '' : ' is-single'}`}>
              {data ? (
                <>
                  <StatCard
                    title="Classificação pendente"
                    value={classificationTotal}
                    onClick={(event) =>
                      openOperationPanel('classification_pending', event.currentTarget)
                    }
                    ariaExpanded={activeOperationPanel === 'classification_pending'}
                    ariaHasPopup="dialog"
                    icon={
                      <svg viewBox="0 0 24 24" focusable="false">
                        <ellipse cx="12" cy="12" rx="6.2" ry="9" />
                        <path d="M12 4.6 Q 13 8.5 12 12 Q 11 15.5 12 19.4" />
                      </svg>
                    }
                  />
                  {/* So quem gerencia cadastro (ADMIN + CADASTRO) ve — os demais
                      nao abrem o detalhe do cliente, entao o card nao levaria a
                      acao nenhuma. Leva ao hub, nao a /clients. */}
                  {canManageCadastro ? (
                    <StatCard
                      title="Cadastros pendentes"
                      value={data.clientsIncomplete.total}
                      onClick={() => router.push('/cadastros?incomplete=true')}
                      ariaLabel={`Cadastros pendentes (${data.clientsIncomplete.total})`}
                      icon={
                        <svg viewBox="0 0 24 24" focusable="false">
                          <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                          <path d="M17 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                          <path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" />
                          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        </svg>
                      }
                    />
                  ) : null}
                </>
              ) : (
                Array.from({ length: canManageCadastro ? 2 : 1 }).map((_, i) => (
                  <div key={i} className="dd-stat-card is-skeleton" aria-hidden="true" />
                ))
              )}
            </div>
            <div className="dd-left-stack">
              {salesData ? (
                <SalesAvailabilityCard data={salesData} compact />
              ) : (
                <div className="sales-card sales-card-skeleton" aria-hidden="true" />
              )}
              <RecentSendsCard items={recentSends ? recentSends.items : null} />
            </div>
          </div>
          <EventsCalendarCard
            events={calendarEvents}
            onWindowChange={handleWindowChange}
            onGerarAprovacao={(evt) => {
              if (evt.contractId == null) return;
              const contractId = evt.contractId;
              getApprovalLabelPrefill(session, contractId)
                .then((prefill) => setApprovalForm({ contractId, prefill }))
                .catch(() => {});
            }}
          />
        </div>
      </section>

      <OperationModal
        open={operationModalOpen}
        data={operationModalData}
        onClose={closeOperationModal}
        onItemAction={classifySample}
      />

      {approvalForm ? (
        <ApprovalLabelModal
          open
          session={session}
          prefill={approvalForm.prefill}
          saleContractId={approvalForm.contractId}
          onBack={null}
          onClose={() => {
            setApprovalForm(null);
            fetchApprovalEvents();
          }}
        />
      ) : null}
    </div>
  );
}
