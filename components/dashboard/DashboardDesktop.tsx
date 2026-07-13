'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getDashboardInvoiceEvents,
  getDashboardPaymentEvents,
  getDashboardRecentSends,
  getDashboardShipmentEvents,
} from '../../lib/api-client';
import { contractsHubTabs, FINANCEIRO_ROLES, getRoleLabel, isRoleAllowed } from '../../lib/roles';
import { SalesAvailabilityCard } from '../SalesAvailabilityCard';
import { DashboardLoadError } from './DashboardLoadError';
import { EventsCalendarCard } from './EventsCalendarCard';
import { getGreeting, getTodayLong } from './greeting';
import { RecentSendsCard } from './RecentSendsCard';
import type {
  DashboardCalendarEvent,
  DashboardRecentSendsResponse,
  DashboardSalesAvailabilityResponse,
  SessionData,
} from '../../lib/types';

const DESKTOP_MQ = '(min-width: 901px)';
// Throttle do refetch em focus/visibility: evita N requests em Alt+Tab rápido.
const REFETCH_THROTTLE_MS = 30_000;

interface DashboardDesktopProps {
  session: SessionData;
  salesData: DashboardSalesAvailabilityResponse | null;
  error: string | null;
  onRetry?: () => void;
}

export function DashboardDesktop({ session, salesData, error, onRetry }: DashboardDesktopProps) {
  // Saudação do cabeçalho da página (mesmo primeiro nome do hero mobile).
  const fullName = session.user.fullName ?? session.user.username;
  const firstName = fullName.split(' ')[0];
  const roleLabel = getRoleLabel(session.user.role);

  // Guarda de montagem: evita setState após unmount em qualquer fetch (o retry pode
  // disparar fora do ciclo do effect que criava o `active` por-chamada).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ───────── Cards de envios (recent-sends: 1 fetch alimenta os 2 cards) ─────────
  const [recentSends, setRecentSends] = useState<DashboardRecentSendsResponse | null>(null);
  const [recentSendsError, setRecentSendsError] = useState<string | null>(null);
  const lastSendsFetchRef = useRef<number>(0);

  const fetchRecentSends = useCallback(() => {
    // Só o breakpoint desktop busca (o twin mobile fica montado mas inerte via CSS).
    if (!window.matchMedia(DESKTOP_MQ).matches) return;
    lastSendsFetchRef.current = Date.now();
    getDashboardRecentSends(session)
      .then((response) => {
        if (!mountedRef.current) return;
        setRecentSends(response);
        setRecentSendsError(null);
      })
      .catch(() => {
        if (mountedRef.current) setRecentSendsError('Não foi possível carregar os envios.');
      });
  }, [session]);

  useEffect(() => {
    fetchRecentSends();
    const mq = window.matchMedia(DESKTOP_MQ);
    const throttled = () => {
      if (Date.now() - lastSendsFetchRef.current < REFETCH_THROTTLE_MS) return;
      fetchRecentSends();
    };
    // 'change' re-busca ao ENTRAR no desktop num resize (senão o card ficava travado
    // no skeleton — nada disparava o fetch).
    const onBreakpoint = () => {
      if (mq.matches) fetchRecentSends();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') throttled();
    };
    window.addEventListener('focus', throttled);
    document.addEventListener('visibilitychange', onVisible);
    mq.addEventListener('change', onBreakpoint);
    return () => {
      window.removeEventListener('focus', throttled);
      document.removeEventListener('visibilitychange', onVisible);
      mq.removeEventListener('change', onBreakpoint);
    };
  }, [fetchRecentSends]);

  // ───────── Card de Eventos (3 feeds mesclados client-side) ─────────
  // F1 (E24/E28): pagamento — só ADMIN/COMMERCIAL (canPay); demais nem chamam o feed.
  const canPay = isRoleAllowed(session.user.role, FINANCEIRO_ROLES);
  // DSB-D11: abas de /contratos que o papel abre — o chip só vira LINK p/ a aba dona
  // quando ela está aqui (faturamento → Contratos só p/ ADMIN/COMMERCIAL; operacional
  // vê o chip mas ele fica inerte).
  const navigableTabs = contractsHubTabs(session.user.role);
  const [paymentEvents, setPaymentEvents] = useState<Record<string, DashboardCalendarEvent[]>>({});
  const [shipmentEvents, setShipmentEvents] = useState<Record<string, DashboardCalendarEvent[]>>(
    {}
  );
  const [invoiceEvents, setInvoiceEvents] = useState<Record<string, DashboardCalendarEvent[]>>({});
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [paymentWindow, setPaymentWindow] = useState<{ from: string; to: string } | null>(null);
  const lastEventsFetchRef = useRef<number>(0);
  const handleWindowChange = useCallback((from: string, to: string) => {
    setPaymentWindow({ from, to });
  }, []);

  const calendarEvents = useMemo(() => {
    const merged: Record<string, DashboardCalendarEvent[]> = {};
    for (const [day, evs] of Object.entries(paymentEvents)) merged[day] = [...evs];
    for (const feed of [shipmentEvents, invoiceEvents]) {
      for (const [day, evs] of Object.entries(feed)) {
        merged[day] = merged[day] ? [...merged[day], ...evs] : [...evs];
      }
    }
    return merged;
  }, [paymentEvents, shipmentEvents, invoiceEvents]);

  const fetchPaymentEvents = useCallback(() => {
    if (!canPay || !paymentWindow) return;
    if (!window.matchMedia(DESKTOP_MQ).matches) return;
    getDashboardPaymentEvents(session, paymentWindow)
      .then((res) => {
        if (!mountedRef.current) return;
        setPaymentEvents(res.events);
        setEventsError(null);
      })
      .catch(() => {
        if (mountedRef.current) setEventsError('Não foi possível carregar os eventos.');
      });
  }, [session, canPay, paymentWindow]);

  const fetchShipmentEvents = useCallback(() => {
    if (!paymentWindow) return;
    if (!window.matchMedia(DESKTOP_MQ).matches) return;
    getDashboardShipmentEvents(session, paymentWindow)
      .then((res) => {
        if (!mountedRef.current) return;
        setShipmentEvents(res.events);
        setEventsError(null);
      })
      .catch(() => {
        if (mountedRef.current) setEventsError('Não foi possível carregar os eventos.');
      });
  }, [session, paymentWindow]);

  const fetchInvoiceEvents = useCallback(() => {
    if (!paymentWindow) return;
    if (!window.matchMedia(DESKTOP_MQ).matches) return;
    getDashboardInvoiceEvents(session, paymentWindow)
      .then((res) => {
        if (!mountedRef.current) return;
        setInvoiceEvents(res.events);
        setEventsError(null);
      })
      .catch(() => {
        if (mountedRef.current) setEventsError('Não foi possível carregar os eventos.');
      });
  }, [session, paymentWindow]);

  const refetchEvents = useCallback(() => {
    fetchPaymentEvents();
    fetchShipmentEvents();
    fetchInvoiceEvents();
  }, [fetchPaymentEvents, fetchShipmentEvents, fetchInvoiceEvents]);

  useEffect(() => {
    const doFetch = () => {
      lastEventsFetchRef.current = Date.now();
      refetchEvents();
    };
    // Inicial + a cada mudança da janela visível (o card emite via onWindowChange).
    doFetch();
    const mq = window.matchMedia(DESKTOP_MQ);
    // Throttle + gate de visibilityState: um Alt+Tab dispara focus E visibilitychange;
    // sem isso eram até 6 requests (3 ao ocultar + 6 ao voltar) por 1 retorno.
    const throttled = () => {
      if (Date.now() - lastEventsFetchRef.current < REFETCH_THROTTLE_MS) return;
      doFetch();
    };
    const onBreakpoint = () => {
      if (mq.matches) doFetch(); // paridade com o card de envios: re-busca no resize
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') throttled();
    };
    window.addEventListener('focus', throttled);
    document.addEventListener('visibilitychange', onVisible);
    mq.addEventListener('change', onBreakpoint);
    return () => {
      window.removeEventListener('focus', throttled);
      document.removeEventListener('visibilitychange', onVisible);
      mq.removeEventListener('change', onBreakpoint);
    };
  }, [refetchEvents]);

  return (
    <div className="dashboard-desktop">
      <section className="dashboard-page">
        {/* Cabeçalho da página (desktop): rótulo "Visão geral" + saudação/nome
            (protagonista), tipo de usuário com escudo e a data de hoje por
            extenso. As informações (cards) começam logo abaixo. */}
        <header className="dd-page-header">
          <h1 className="dd-page-title">Visão geral</h1>
          <p className="dd-page-greeting">
            {getGreeting()} <strong className="dd-page-greeting-name">{firstName}</strong>
          </p>
          <span className="dd-page-role">
            <svg
              className="dd-page-role-icon"
              viewBox="0 0 24 24"
              focusable="false"
              aria-hidden="true"
            >
              <path d="M12 3 5 5.5v6c0 4.5 3 8.3 7 9.5 4-1.2 7-5 7-9.5v-6L12 3z" />
              <path d="m9 12 2 2 4-4.5" />
            </svg>
            {roleLabel}
          </span>
          <span className="dd-page-date">{getTodayLong()}</span>
        </header>

        {error ? <DashboardLoadError message={error} onRetry={onRetry} /> : null}

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
              error={recentSendsError}
              onRetry={fetchRecentSends}
            />
            <RecentSendsCard
              title="Aprovações enviadas"
              emptyLabel="Nenhuma aprovação enviada."
              variant="approvals"
              items={recentSends ? recentSends.approvalItems : null}
              error={recentSendsError}
              onRetry={fetchRecentSends}
            />
          </div>
          <EventsCalendarCard
            events={calendarEvents}
            navigableTabs={navigableTabs}
            onWindowChange={handleWindowChange}
            error={eventsError}
            onRetry={refetchEvents}
          />
        </div>
      </section>
    </div>
  );
}
