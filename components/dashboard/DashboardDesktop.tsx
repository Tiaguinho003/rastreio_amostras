'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getDashboardAvisos,
  getDashboardInvoiceEvents,
  getDashboardPaymentEvents,
  getDashboardShipmentEvents,
} from '../../lib/api-client';
import { contractsHubTabs, FINANCEIRO_ROLES, isRoleAllowed } from '../../lib/roles';
import { useRecentSendsFeed } from '../../lib/use-recent-sends-feed';
import { AvisosCard } from './AvisosCard';
import { EventsCalendarCard } from './EventsCalendarCard';
import type { DashboardAviso, DashboardCalendarEvent, SessionData } from '../../lib/types';

const DESKTOP_MQ = '(min-width: 901px)';
// Throttle do refetch em focus/visibility: evita N requests em Alt+Tab rápido.
const REFETCH_THROTTLE_MS = 30_000;

interface DashboardDesktopProps {
  session: SessionData;
}

export function DashboardDesktop({ session }: DashboardDesktopProps) {
  // Guarda de montagem: evita setState após unmount em qualquer fetch (o retry pode
  // disparar fora do ciclo do effect que criava o `active` por-chamada).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ───────── Card de Avisos (DSB-D19): aprovação a enviar ─────────
  // Feed BINÁRIO (some quando a etiqueta é gerada — o backend filtra); desktop-only +
  // refetch em foco/visibilidade pelo hook (o mesmo dos cards de envios). Fica na
  // coluna à DIREITA do calendário (grid de 2 colunas). Auth-only p/ todos os
  // não-PROSPECTOR (o dashboard padrão já é só deles).
  const avisos = useRecentSendsFeed<DashboardAviso>(
    session,
    getDashboardAvisos,
    'Não foi possível carregar os avisos.'
  );

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
        {/* DSB-D16: o cabecalho da pagina ("Visao geral" + saudacao + papel +
            data) foi REMOVIDO — o card de Eventos fica sozinho na pagina. */}
        {/* Layout (DSB-D14 + DSB-D19): grid de 2 colunas — o card de Eventos
            (calendario, 1fr) à esquerda e o card de Avisos (~300px) à DIREITA. O
            donut foi apagado (DSB-D14); os cards de envios migraram pra /samples e
            pra aba Aprovacoes de /embarques. */}
        <div className="dd-content-grid">
          <EventsCalendarCard
            events={calendarEvents}
            navigableTabs={navigableTabs}
            onWindowChange={handleWindowChange}
            error={eventsError}
            onRetry={refetchEvents}
          />
          <AvisosCard items={avisos.items} error={avisos.error} onRetry={avisos.retry} />
        </div>
      </section>
    </div>
  );
}
