'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  CALENDAR_WEEK_DAYS,
  CALENDAR_WEEKDAY_INITIALS,
  addDays,
  buildBusinessDays,
  computeWeekStart,
  formatDayAriaLabel,
  formatMonthShort,
  formatPeriodLabel,
  getBrtToday,
  toDayKey,
} from '../../lib/dashboard-calendar';
import { DashboardLoadError } from './DashboardLoadError';
import type { DashboardCalendarEvent } from '../../lib/types';

// F1 (E21-E27/D138): o tipo do evento foi promovido pro lib/types.ts
// (DashboardCalendarEvent) quando o 1º feed real nasceu — pagamentos de contrato.
type CalendarEvent = DashboardCalendarEvent;

interface EventsCalendarCardProps {
  /** Mapa 'YYYY-MM-DD' → eventos do dia (pagamento + embarque; DSB-D11 soma faturamento). */
  events?: Record<string, CalendarEvent[]>;
  /** DSB-D11: abas de /contratos que o papel abre — o chip só linka p/ aba visível. */
  navigableTabs?: string[];
  /** Emite a semana visível (from..to 'YYYY-MM-DD') pro pai buscar o feed (E24). */
  onWindowChange?: (from: string, to: string) => void;
  /** Erro de carregamento de algum dos feeds (strip não-bloqueante + retry). */
  error?: string | null;
  onRetry?: () => void;
}

// EMB26/E28: TODO evento do feed é NAVEGAÇÃO PURA → a sub-aba dona (pagamento →
// Financeiro, embarque → Embarque, faturamento → Contratos; DSB-D11). O card não
// gera/registra nada — a ação (pagar/faturar/confirmar) mora na casa de cada um.
// null = tipo desconhecido (fallback só-rótulo, sem link).
function navTabForEvent(typeKey: string): string | null {
  if (typeKey.startsWith('contract_payment_')) return 'financeiro';
  if (typeKey.startsWith('contract_shipment')) return 'embarque';
  if (typeKey.startsWith('contract_invoice')) return 'contratos';
  return null;
}

// Abas do hub /contratos (fallback quando o pai não passa navigableTabs).
const ALL_CONTRACT_TABS = ['contratos', 'financeiro', 'aprovacoes', 'embarque'];

// DSB-D11: `navigableTabs` = abas de /contratos que o papel abre. Se a aba dona do
// evento não está lá (ex.: faturamento → Contratos p/ um operacional), o chip vira
// rótulo inerte (sem link) em vez de levar a uma aba que o papel não tem.
function eventHref(event: CalendarEvent, navigableTabs: readonly string[]): string | null {
  const tab = navTabForEvent(event.typeKey);
  if (!tab || !navigableTabs.includes(tab)) return null;
  return `/contratos?tab=${tab}${event.contractId ? `&highlight=${event.contractId}` : ''}`;
}

// DSB-D10: a COR do chip carrega o estado (previsto/atrasado/realizado); pra não
// depender só da cor (a11y), o nome acessível + tooltip incluem a palavra do estado.
function chipAccessibleLabel(event: CalendarEvent): string {
  return event.state ? `${event.label} · ${event.state}` : event.label;
}

// DSB-D10: legenda do card — a cor virou código de estado, então explicitamos.
const EVENT_STATES: Array<{ state: 'previsto' | 'atrasado' | 'realizado'; label: string }> = [
  { state: 'previsto', label: 'previsto' },
  { state: 'atrasado', label: 'atrasado' },
  { state: 'realizado', label: 'realizado' },
];

// Card "Eventos" (dashboard desktop, DSB-D4 + DSB-D7): SEMANA DE DIAS ÚTEIS (seg–sex,
// 5 células) com navegação livre ◀ Hoje ▶ de 7 em 7 dias. A janela BUSCADA continua
// dom–sáb (7 dias) — o backend rola os eventos de fim de semana pro dia útil vizinho
// (sáb→sex, dom→seg) pra nada sumir. Cada dia é um quadrado alto que mostra os eventos
// DENTRO da célula — chips coloridos por ESTADO (DSB-D10), clicáveis (navegação pura → /contratos);
// dias cheios rolam POR DENTRO da própria célula. Sem painel de dia selecionado.
// "Hoje" com anel. Desktop-only (o DashboardMobile não o monta).
export function EventsCalendarCard({
  events = {},
  navigableTabs = ALL_CONTRACT_TABS,
  onWindowChange,
  error,
  onRetry,
}: EventsCalendarCardProps) {
  const today = useMemo(() => getBrtToday(), []);
  const todayKey = toDayKey(today);
  const [weekStart, setWeekStart] = useState(() => computeWeekStart(today));
  // Direção do deslize (E18) + contador pra re-disparar a animação a cada
  // navegação (muda a key do wrapper da grade).
  const [slide, setSlide] = useState<{ direction: 'left' | 'right' | null; tick: number }>({
    direction: null,
    tick: 0,
  });

  // Renderiza só os 5 dias úteis (DSB-D7); os fins de semana da janela ficam de fora.
  const days = useMemo(() => buildBusinessDays(weekStart), [weekStart]);

  // E24: emite a JANELA dom–sáb (7 dias) pro pai buscar o feed — inclui o fim de
  // semana de propósito, pra o backend poder rolar esses eventos pros dias úteis
  // exibidos. Dispara na montagem + a cada navegação. O pai memoiza `onWindowChange`.
  useEffect(() => {
    if (!onWindowChange) return;
    onWindowChange(toDayKey(weekStart), toDayKey(addDays(weekStart, CALENDAR_WEEK_DAYS - 1)));
  }, [weekStart, onWindowChange]);

  function navigate(direction: 'left' | 'right') {
    const delta = direction === 'left' ? -CALENDAR_WEEK_DAYS : CALENDAR_WEEK_DAYS;
    setWeekStart((start) => addDays(start, delta));
    setSlide((prev) => ({ direction, tick: prev.tick + 1 }));
  }

  function goToToday() {
    setWeekStart(computeWeekStart(today));
    setSlide((prev) => ({ direction: null, tick: prev.tick + 1 }));
  }

  return (
    <section className="dd-events-card" aria-label="Eventos">
      <header className="dd-events-header">
        <div className="dd-events-heading">
          <h3 className="dd-events-title">Eventos</h3>
          <span className="dd-events-period">{formatPeriodLabel(weekStart)}</span>
        </div>
        <div className="dd-events-nav" role="group" aria-label="Navegar entre semanas">
          <button
            type="button"
            className="dd-events-nav-arrow"
            onClick={() => navigate('left')}
            aria-label="Semana anterior"
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="m14.5 6-6 6 6 6" />
            </svg>
          </button>
          <button type="button" className="dd-events-nav-today" onClick={goToToday}>
            Hoje
          </button>
          <button
            type="button"
            className="dd-events-nav-arrow"
            onClick={() => navigate('right')}
            aria-label="Próxima semana"
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="m9.5 6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </header>

      {error ? <DashboardLoadError message={error} onRetry={onRetry} compact /> : null}

      {/* DSB-D10: legenda das cores (a cor = estado). aria-hidden: o estado já vai
          no aria-label de cada chip; aqui é só apoio visual. */}
      <div className="dd-events-legend" aria-hidden="true">
        {EVENT_STATES.map((s) => (
          <span key={s.state} className="dd-events-legend-item" data-state={s.state}>
            {s.label}
          </span>
        ))}
      </div>

      <div className="dd-events-weekdays" aria-hidden="true">
        {CALENDAR_WEEKDAY_INITIALS.map((initial, i) => (
          <span key={i}>{initial}</span>
        ))}
      </div>

      <div
        key={slide.tick}
        className={`dd-events-grid${slide.direction ? ` is-slide-${slide.direction}` : ''}`}
      >
        {days.map((day) => {
          const dayKey = toDayKey(day);
          const dayEvents = events[dayKey] ?? [];
          const isToday = dayKey === todayKey;
          const showMonth = day.getUTCDate() === 1;
          return (
            <div
              key={dayKey}
              className={`dd-events-day${isToday ? ' is-today' : ''}`}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${formatDayAriaLabel(day)}${
                dayEvents.length > 0
                  ? `, ${dayEvents.length} ${dayEvents.length === 1 ? 'evento' : 'eventos'}`
                  : ', sem eventos'
              }`}
            >
              <span className="dd-events-day-number">
                {day.getUTCDate()}
                {showMonth ? (
                  <span className="dd-events-day-month">{formatMonthShort(day)}</span>
                ) : null}
              </span>
              {dayEvents.length > 0 ? (
                <div className="dd-events-day-list">
                  {dayEvents.map((event) => {
                    // Navegação PURA → a sub-aba dona (a ação mora lá). Tipo
                    // desconhecido vira chip só-rótulo (sem link). A cor sai do
                    // `data-state` (DSB-D10); `data-type` fica pra QA/semântica.
                    const href = eventHref(event, navigableTabs);
                    const accessibleLabel = chipAccessibleLabel(event);
                    return href ? (
                      <Link
                        key={event.id}
                        href={href}
                        className="dd-events-chip"
                        data-type={event.typeKey}
                        data-state={event.state}
                        title={accessibleLabel}
                        aria-label={accessibleLabel}
                      >
                        {event.label}
                      </Link>
                    ) : (
                      <span
                        key={event.id}
                        className="dd-events-chip"
                        data-type={event.typeKey}
                        data-state={event.state}
                        title={accessibleLabel}
                        aria-label={accessibleLabel}
                      >
                        {event.label}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
