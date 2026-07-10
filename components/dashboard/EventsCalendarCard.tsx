'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  CALENDAR_FORTNIGHT_DAYS,
  CALENDAR_WEEKDAY_INITIALS,
  addDays,
  buildFortnight,
  computeFortnightStart,
  formatDayAriaLabel,
  formatMonthShort,
  formatPeriodLabel,
  formatSelectedDayLabel,
  getBrtToday,
  isWeekend,
  toDayKey,
} from '../../lib/dashboard-calendar';
import type { DashboardCalendarEvent } from '../../lib/types';

// F1 (E21-E27/D138): o tipo do evento foi promovido pro lib/types.ts
// (DashboardCalendarEvent) quando o 1º feed real nasceu — pagamentos de contrato.
type CalendarEvent = DashboardCalendarEvent;

interface EventsCalendarCardProps {
  /** Mapa 'YYYY-MM-DD' → eventos do dia (pagamento + lembrete de aprovação). */
  events?: Record<string, CalendarEvent[]>;
  /** Emite a quinzena visível (from..to 'YYYY-MM-DD') pro pai buscar o feed (E24). */
  onWindowChange?: (from: string, to: string) => void;
}

const MAX_DOTS = 3;

// AP29/EMB26/E28: TODO evento do feed é NAVEGAÇÃO PURA → a sub-aba dona (pagamento →
// Financeiro, embarque → Embarque, aprovação → Aprovações). O card não gera/registra
// nada — a ação (pagar/confirmar/gerar) mora na casa de cada um. null = tipo
// desconhecido (fallback só-rótulo).
function navTabForEvent(typeKey: string): string | null {
  if (typeKey.startsWith('contract_payment_')) return 'financeiro';
  if (typeKey.startsWith('contract_shipment')) return 'embarque';
  if (typeKey === 'contract_approval_due') return 'aprovacoes';
  return null;
}

// Card "Eventos" (dashboard desktop, DSH-D6 / F0): calendário de DUAS
// semanas domingo-first (E2/E12) com navegação livre de 14 em 14 dias +
// botão Hoje (E3), painel FIXO do dia selecionado (E4, protagonista ~60% —
// E14) e dots por tipo nos quadrados (E5/E13 — estrutura pronta; a F0 não
// tem eventos). Só visualização (E6); desktop-only (E9); hoje destacado e
// selecionado por default (E10).
export function EventsCalendarCard({ events = {}, onWindowChange }: EventsCalendarCardProps) {
  const today = useMemo(() => getBrtToday(), []);
  const todayKey = toDayKey(today);
  const [fortnightStart, setFortnightStart] = useState(() => computeFortnightStart(today));
  const [selectedDate, setSelectedDate] = useState(today);
  // Direção do deslize (E18) + contador pra re-disparar a animação a cada
  // navegação (muda a key do wrapper da grade).
  const [slide, setSlide] = useState<{ direction: 'left' | 'right' | null; tick: number }>({
    direction: null,
    tick: 0,
  });
  const gridRef = useRef<HTMLDivElement | null>(null);

  const days = useMemo(() => buildFortnight(fortnightStart), [fortnightStart]);
  const selectedKey = toDayKey(selectedDate);
  const selectedEvents = events[selectedKey] ?? [];

  // E24: emite a quinzena visível pro pai buscar o feed daquela janela (o card
  // navega internamente; o pai não saberia sem isso). Dispara na montagem + a cada
  // navegação. O pai deve memoizar `onWindowChange` (useCallback) p/ não re-buscar
  // a cada render.
  useEffect(() => {
    if (!onWindowChange) return;
    onWindowChange(
      toDayKey(fortnightStart),
      toDayKey(addDays(fortnightStart, CALENDAR_FORTNIGHT_DAYS - 1))
    );
  }, [fortnightStart, onWindowChange]);

  function navigate(direction: 'left' | 'right') {
    const delta = direction === 'left' ? -CALENDAR_FORTNIGHT_DAYS : CALENDAR_FORTNIGHT_DAYS;
    setFortnightStart((start) => addDays(start, delta));
    setSlide((prev) => ({ direction, tick: prev.tick + 1 }));
  }

  function goToToday() {
    setFortnightStart(computeFortnightStart(today));
    setSelectedDate(today);
    setSlide((prev) => ({ direction: null, tick: prev.tick + 1 }));
  }

  // Roving tabindex: setas movem o foco entre os quadrados (±1 dia, ±7 na
  // vertical) sem sair da quinzena exibida.
  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const offset = offsets[event.key];
    if (offset === undefined) {
      return;
    }
    const target = event.target as HTMLElement;
    const indexAttr = target.getAttribute('data-day-index');
    if (indexAttr === null) {
      return;
    }
    const nextIndex = Number(indexAttr) + offset;
    if (nextIndex < 0 || nextIndex >= CALENDAR_FORTNIGHT_DAYS) {
      return;
    }
    event.preventDefault();
    const next = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-day-index="${nextIndex}"]`
    );
    next?.focus();
  }

  return (
    <section className="dd-events-card" aria-label="Eventos">
      <header className="dd-events-header">
        <div className="dd-events-heading">
          <h3 className="dd-events-title">Eventos</h3>
          <span className="dd-events-period">{formatPeriodLabel(fortnightStart)}</span>
        </div>
        <div className="dd-events-nav" role="group" aria-label="Navegar entre semanas">
          <button
            type="button"
            className="dd-events-nav-arrow"
            onClick={() => navigate('left')}
            aria-label="Duas semanas anteriores"
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
            aria-label="Duas semanas seguintes"
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="m9.5 6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </header>

      <div className="dd-events-weekdays" aria-hidden="true">
        {CALENDAR_WEEKDAY_INITIALS.map((initial, i) => (
          <span key={i} className={i === 0 || i === 6 ? 'is-weekend' : undefined}>
            {initial}
          </span>
        ))}
      </div>

      <div
        key={slide.tick}
        ref={gridRef}
        className={`dd-events-grid${slide.direction ? ` is-slide-${slide.direction}` : ''}`}
        onKeyDown={handleGridKeyDown}
      >
        {days.map((day, index) => {
          const dayKey = toDayKey(day);
          const dayEvents = events[dayKey] ?? [];
          const isToday = dayKey === todayKey;
          const isSelected = dayKey === selectedKey;
          const showMonth = day.getUTCDate() === 1;
          return (
            <button
              key={dayKey}
              type="button"
              data-day-index={index}
              tabIndex={isSelected ? 0 : -1}
              className={`dd-events-day${isToday ? ' is-today' : ''}${
                isSelected ? ' is-selected' : ''
              }${isWeekend(day) ? ' is-weekend' : ''}`}
              onClick={() => setSelectedDate(day)}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${formatDayAriaLabel(day)}${
                dayEvents.length > 0
                  ? `, ${dayEvents.length} ${dayEvents.length === 1 ? 'evento' : 'eventos'}`
                  : ''
              }`}
            >
              <span className="dd-events-day-number">
                {day.getUTCDate()}
                {showMonth ? (
                  <span className="dd-events-day-month">{formatMonthShort(day)}</span>
                ) : null}
              </span>
              {dayEvents.length > 0 ? (
                <span className="dd-events-day-dots" aria-hidden="true">
                  {dayEvents.slice(0, MAX_DOTS).map((event) => (
                    <span key={event.id} className="dd-events-dot" data-type={event.typeKey} />
                  ))}
                  {dayEvents.length > MAX_DOTS ? (
                    <span className="dd-events-dot-more">+{dayEvents.length - MAX_DOTS}</span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="dd-events-panel">
        <h4 className="dd-events-panel-title">{formatSelectedDayLabel(selectedDate)}</h4>
        {selectedEvents.length === 0 ? (
          <div className="dd-events-empty">
            <p className="dd-events-empty-main">Nenhum evento para este dia.</p>
          </div>
        ) : (
          <ul className="dd-events-panel-list">
            {selectedEvents.map((event) => {
              // AP29/EMB26/E28: navegação PURA → a sub-aba dona do evento (a ação mora
              // lá). Fallback defensivo: tipo desconhecido vira só o rótulo (sem link).
              const tab = navTabForEvent(event.typeKey);
              const href = tab
                ? `/contratos?tab=${tab}${event.contractId ? `&highlight=${event.contractId}` : ''}`
                : null;
              return (
                <li key={event.id} className="dd-events-panel-item" data-type={event.typeKey}>
                  {href ? (
                    <Link href={href} className="dd-events-item-link">
                      <span className="dd-events-item-label">{event.label}</span>
                      <svg className="dd-events-item-go" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </Link>
                  ) : (
                    <span className="dd-events-item-label">{event.label}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
