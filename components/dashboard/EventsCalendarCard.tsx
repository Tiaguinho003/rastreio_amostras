'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  CALENDAR_WEEK_DAYS,
  CALENDAR_WEEKDAY_INITIALS,
  addDays,
  buildWeek,
  computeWeekStart,
  formatDayAriaLabel,
  formatMonthShort,
  formatPeriodLabel,
  getBrtToday,
  toDayKey,
} from '../../lib/dashboard-calendar';
import type { DashboardCalendarEvent } from '../../lib/types';

// F1 (E21-E27/D138): o tipo do evento foi promovido pro lib/types.ts
// (DashboardCalendarEvent) quando o 1º feed real nasceu — pagamentos de contrato.
type CalendarEvent = DashboardCalendarEvent;

interface EventsCalendarCardProps {
  /** Mapa 'YYYY-MM-DD' → eventos do dia (pagamento + aprovação + embarque). */
  events?: Record<string, CalendarEvent[]>;
  /** Emite a semana visível (from..to 'YYYY-MM-DD') pro pai buscar o feed (E24). */
  onWindowChange?: (from: string, to: string) => void;
}

// AP29/EMB26/E28: TODO evento do feed é NAVEGAÇÃO PURA → a sub-aba dona (pagamento →
// Financeiro, embarque → Embarque, aprovação → Aprovações). O card não gera/registra
// nada — a ação (pagar/confirmar/gerar) mora na casa de cada um. null = tipo
// desconhecido (fallback só-rótulo, sem link).
function navTabForEvent(typeKey: string): string | null {
  if (typeKey.startsWith('contract_payment_')) return 'financeiro';
  if (typeKey.startsWith('contract_shipment')) return 'embarque';
  if (typeKey === 'contract_approval_due') return 'aprovacoes';
  return null;
}

function eventHref(event: CalendarEvent): string | null {
  const tab = navTabForEvent(event.typeKey);
  if (!tab) return null;
  return `/contratos?tab=${tab}${event.contractId ? `&highlight=${event.contractId}` : ''}`;
}

// Card "Eventos" (dashboard desktop, DSB-D4): SEMANA ÚNICA (7 dias domingo-first,
// E12) com navegação livre ◀ Hoje ▶ de 7 em 7 dias. Cada dia é um quadrado alto que
// mostra os eventos DENTRO da célula — chips coloridos por tipo, clicáveis (navegação
// pura → /contratos); dias com muitos eventos rolam POR DENTRO da própria célula.
// Sem painel de dia selecionado (não precisa clicar pra ver). "Hoje" com anel;
// fins de semana legíveis (sem apagar). Desktop-only (o DashboardMobile não o monta).
export function EventsCalendarCard({ events = {}, onWindowChange }: EventsCalendarCardProps) {
  const today = useMemo(() => getBrtToday(), []);
  const todayKey = toDayKey(today);
  const [weekStart, setWeekStart] = useState(() => computeWeekStart(today));
  // Direção do deslize (E18) + contador pra re-disparar a animação a cada
  // navegação (muda a key do wrapper da grade).
  const [slide, setSlide] = useState<{ direction: 'left' | 'right' | null; tick: number }>({
    direction: null,
    tick: 0,
  });

  const days = useMemo(() => buildWeek(weekStart), [weekStart]);

  // E24: emite a semana visível pro pai buscar o feed daquela janela. Dispara na
  // montagem + a cada navegação. O pai deve memoizar `onWindowChange` (useCallback).
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
                    // desconhecido vira chip só-rótulo (sem link).
                    const href = eventHref(event);
                    return href ? (
                      <Link
                        key={event.id}
                        href={href}
                        className="dd-events-chip"
                        data-type={event.typeKey}
                        title={event.label}
                      >
                        {event.label}
                      </Link>
                    ) : (
                      <span
                        key={event.id}
                        className="dd-events-chip"
                        data-type={event.typeKey}
                        title={event.label}
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
