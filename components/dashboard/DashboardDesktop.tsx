'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getDashboardInvoiceEvents,
  getDashboardPaymentEvents,
  getDashboardShipmentEvents,
} from '../../lib/api-client';
import { contractsHubTabs, FINANCEIRO_ROLES, getRoleLabel, isRoleAllowed } from '../../lib/roles';
import { EventsCalendarCard } from './EventsCalendarCard';
import { getGreeting, getTodayLong } from './greeting';
import type { DashboardCalendarEvent, SessionData } from '../../lib/types';

const DESKTOP_MQ = '(min-width: 901px)';
// Throttle do refetch em focus/visibility: evita N requests em Alt+Tab rápido.
const REFETCH_THROTTLE_MS = 30_000;

interface DashboardDesktopProps {
  session: SessionData;
}

export function DashboardDesktop({ session }: DashboardDesktopProps) {
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

        {/* Layout (DSB-D14): o dashboard apresenta APENAS o card de Eventos,
            ocupando a area toda. O donut foi apagado do sistema; os cards de
            envios migraram pra /samples e pra aba Aprovacoes de /embarques. */}
        <div className="dd-content-grid">
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
