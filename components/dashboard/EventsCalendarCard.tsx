'use client';

import { useMemo, useRef, useState } from 'react';

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

// Seam da F1 (docs/Eventos-Dashboard-Plano-de-Trabalho.md, EVD-P1/P2): o
// catálogo de tipos e a fonte dos eventos ainda não existem — o tipo fica
// LOCAL e mínimo de propósito (não entra em lib/types.ts até haver endpoint).
export interface DashboardCalendarEventStub {
  id: string;
  typeKey: string;
  label: string;
}

interface EventsCalendarCardProps {
  /** Mapa 'YYYY-MM-DD' → eventos do dia. F0 nasce sempre vazio (E7). */
  events?: Record<string, DashboardCalendarEventStub[]>;
}

const MAX_DOTS = 3;

// Card "Eventos" (dashboard desktop, DSH-D6 / F0): calendário de DUAS
// semanas domingo-first (E2/E12) com navegação livre de 14 em 14 dias +
// botão Hoje (E3), painel FIXO do dia selecionado (E4, protagonista ~60% —
// E14) e dots por tipo nos quadrados (E5/E13 — estrutura pronta; a F0 não
// tem eventos). Só visualização (E6); desktop-only (E9); hoje destacado e
// selecionado por default (E10).
export function EventsCalendarCard({ events = {} }: EventsCalendarCardProps) {
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
            {/* Nota da F0 (E19): sai quando as features de evento chegarem. */}
            <p className="dd-events-empty-note">
              As programações (embarques, entregas, aprovações...) chegam nas próximas atualizações.
            </p>
          </div>
        ) : (
          <ul className="dd-events-panel-list">
            {selectedEvents.map((event) => (
              <li key={event.id} className="dd-events-panel-item" data-type={event.typeKey}>
                {event.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
