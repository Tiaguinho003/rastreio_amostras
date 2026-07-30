'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getDashboardAvisos,
  getDashboardInvoiceEvents,
  getDashboardPaymentEvents,
} from '../../lib/api-client';
import { isRoleAllowed, PAYMENT_FEED_ROLES } from '../../lib/roles';
import { useRevalidate } from '../../lib/revalidation/use-revalidate';
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
  // F3 (SN-D13): o card de Avisos era uma das 5 superfícies sem revalidação —
  // ele resume pendência de lote, contrato e relatório, então assina os três.
  const avisos = useRecentSendsFeed<DashboardAviso>(
    session,
    getDashboardAvisos,
    'Não foi possível carregar os avisos.',
    ['lotes', 'contratos', 'relatorios']
  );

  // ───────── Card de Eventos (2 feeds mesclados client-side) ─────────
  // F1 (E24/E28): o feed de pagamento tem gate próprio. RC-D5: ele NÃO acompanhou
  // a carteira pro ADMIN-only — segue em todo não-PROSPECTOR (PAYMENT_FEED_ROLES);
  // só o PROSPECTOR nem chama o feed.
  const canSeePaymentEvents = isRoleAllowed(session.user.role, PAYMENT_FEED_ROLES);
  // RC-D23: a DSB-D11 (chip inerte quando o papel não abre a aba dona) perdeu o
  // objeto — todo chip aponta pro próprio contrato, que os 5 papéis abrem.
  const [paymentEvents, setPaymentEvents] = useState<Record<string, DashboardCalendarEvent[]>>({});
  const [invoiceEvents, setInvoiceEvents] = useState<Record<string, DashboardCalendarEvent[]>>({});
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [paymentWindow, setPaymentWindow] = useState<{ from: string; to: string } | null>(null);
  const handleWindowChange = useCallback((from: string, to: string) => {
    setPaymentWindow({ from, to });
  }, []);

  const calendarEvents = useMemo(() => {
    const merged: Record<string, DashboardCalendarEvent[]> = {};
    for (const [day, evs] of Object.entries(paymentEvents)) merged[day] = [...evs];
    for (const [day, evs] of Object.entries(invoiceEvents)) {
      merged[day] = merged[day] ? [...merged[day], ...evs] : [...evs];
    }
    return merged;
  }, [paymentEvents, invoiceEvents]);

  const fetchPaymentEvents = useCallback(() => {
    if (!canSeePaymentEvents || !paymentWindow) return;
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
  }, [session, canSeePaymentEvents, paymentWindow]);

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
    fetchInvoiceEvents();
  }, [fetchPaymentEvents, fetchInvoiceEvents]);

  // F3 (SN-D13): os listeners de focus/visibilitychange que este card mantinha
  // por conta própria saíram — o `useRevalidate` faz isso e traz junto o
  // barramento. O calendário é montado a partir de CONTRATO (vencimento de
  // pagamento e de nota), então é `contratos` que o invalida: marcar um
  // pagamento em /contratos ou /financeiro agora repinta o calendário na hora.
  // Poll desligado pelo mesmo motivo do card de Avisos.
  useRevalidate({
    subjects: ['contratos'],
    enabled: true,
    onRevalidate: refetchEvents,
    pollMs: null,
    throttleMs: REFETCH_THROTTLE_MS,
  });

  useEffect(() => {
    // Inicial + a cada mudança da janela visível (o card emite via onWindowChange).
    refetchEvents();
    // O resize que ENTRA no desktop re-busca: o gate `matchMedia` dos fetchers
    // barra tudo abaixo de 901px, então sem isto o card ficaria no skeleton.
    const mq = window.matchMedia(DESKTOP_MQ);
    const onBreakpoint = () => {
      if (mq.matches) refetchEvents();
    };
    mq.addEventListener('change', onBreakpoint);
    return () => {
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
            donut foi apagado (DSB-D14). O card de Avisos linka pro proprio
            contrato desde a RC-D23 (a worklist de Aprovacoes que ele abria morreu
            com a /embarques). */}
        <div className="dd-content-grid">
          <EventsCalendarCard
            events={calendarEvents}
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
