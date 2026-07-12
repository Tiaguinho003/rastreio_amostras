'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getDashboardPaymentEvents,
  getDashboardRecentSends,
  getDashboardShipmentEvents,
} from '../../lib/api-client';
import { FINANCEIRO_ROLES, isRoleAllowed } from '../../lib/roles';
import { SalesAvailabilityCard } from '../SalesAvailabilityCard';
import { EventsCalendarCard } from './EventsCalendarCard';
import { RecentSendsCard } from './RecentSendsCard';
import type {
  DashboardCalendarEvent,
  DashboardRecentSendsResponse,
  DashboardSalesAvailabilityResponse,
  SessionData,
} from '../../lib/types';

interface DashboardDesktopProps {
  session: SessionData;
  salesData: DashboardSalesAvailabilityResponse | null;
  error: string | null;
}

export function DashboardDesktop({ session, salesData, error }: DashboardDesktopProps) {
  const [recentSends, setRecentSends] = useState<DashboardRecentSendsResponse | null>(null);
  // Throttle pro refetch on focus/visibilitychange: evita N requests
  // em Alt+Tab rapido.
  const lastFetchRef = useRef<number>(0);

  // F1 (E24/E28): eventos de pagamento do card de Eventos — só ADMIN/COMMERCIAL
  // (E22). `paymentWindow` = a quinzena visível que o card emite via onWindowChange.
  // E28: o evento é navegação pura (→ Financeiro); o "Pago" saiu do dashboard.
  const canPay = isRoleAllowed(session.user.role, FINANCEIRO_ROLES);
  const [paymentEvents, setPaymentEvents] = useState<Record<string, DashboardCalendarEvent[]>>({});
  const [paymentWindow, setPaymentWindow] = useState<{ from: string; to: string } | null>(null);
  const handleWindowChange = useCallback((from: string, to: string) => {
    setPaymentWindow({ from, to });
  }, []);

  // F4 (EMB7/EMB26): eventos de embarque — feed SEPARADO (todos os não-PROSPECTOR,
  // auth-only), na MESMA janela. Merge client-side no `events` do card (id namespaced
  // 'shipment:' evita colisão de key).
  const [shipmentEvents, setShipmentEvents] = useState<Record<string, DashboardCalendarEvent[]>>(
    {}
  );
  const calendarEvents = useMemo(() => {
    const merged: Record<string, DashboardCalendarEvent[]> = {};
    for (const [day, evs] of Object.entries(paymentEvents)) merged[day] = [...evs];
    for (const [day, evs] of Object.entries(shipmentEvents)) {
      merged[day] = merged[day] ? [...merged[day], ...evs] : [...evs];
    }
    return merged;
  }, [paymentEvents, shipmentEvents]);

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
    fetchShipmentEvents();
    const onFocusOrVisible = () => {
      fetchPaymentEvents();
      fetchShipmentEvents();
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [fetchPaymentEvents, fetchShipmentEvents]);

  return (
    <div className="dashboard-desktop">
      <section className="dashboard-page">
        {error ? (
          <p className="dashboard-error-banner" role="status">
            {error}
          </p>
        ) : null}

        {/* Layout (DSB-D3 + DSB-D5): TOP ROW = "Lotes disponiveis" (donut, mais
            estreito) + "Amostras enviadas" + "Aprovacoes enviadas" lado a lado;
            EMBAIXO = card de Eventos HORIZONTAL ocupando a largura toda. */}
        <div className="dd-content-grid">
          <div className="dd-top-row">
            {salesData ? (
              <SalesAvailabilityCard data={salesData} compact />
            ) : (
              <div className="sales-card sales-card-skeleton" aria-hidden="true" />
            )}
            <RecentSendsCard
              title="Amostras enviadas"
              emptyLabel="Nenhuma amostra enviada."
              variant="samples"
              items={recentSends ? recentSends.sampleItems : null}
            />
            <RecentSendsCard
              title="Aprovações enviadas"
              emptyLabel="Nenhuma aprovação enviada."
              variant="approvals"
              items={recentSends ? recentSends.approvalItems : null}
            />
          </div>
          <EventsCalendarCard events={calendarEvents} onWindowChange={handleWindowChange} />
        </div>
      </section>
    </div>
  );
}
