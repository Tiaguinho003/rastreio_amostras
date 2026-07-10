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
  /** Abre o modal "Gerar aprovação" no pai (F2/AP7); só em eventos contract_approval_due. */
  onGerarAprovacao?: (event: CalendarEvent) => void;
  /** Emite a quinzena visível (from..to 'YYYY-MM-DD') pro pai buscar o feed (E24). */
  onWindowChange?: (from: string, to: string) => void;
}

const MAX_DOTS = 3;

// Rótulo do status no acordeão (E25). WASH_OUT fica FORA do feed, mas mapeado por segurança.
const STATUS_LABEL: Record<string, string> = {
  EMITIDO: 'Emitido',
  FATURADO: 'Faturado',
  PAGO: 'Pago',
  WASH_OUT: 'Washout',
};

// Card "Eventos" (dashboard desktop, DSH-D6 / F0): calendário de DUAS
// semanas domingo-first (E2/E12) com navegação livre de 14 em 14 dias +
// botão Hoje (E3), painel FIXO do dia selecionado (E4, protagonista ~60% —
// E14) e dots por tipo nos quadrados (E5/E13 — estrutura pronta; a F0 não
// tem eventos). Só visualização (E6); desktop-only (E9); hoje destacado e
// selecionado por default (E10).
export function EventsCalendarCard({
  events = {},
  onGerarAprovacao,
  onWindowChange,
}: EventsCalendarCardProps) {
  const today = useMemo(() => getBrtToday(), []);
  const todayKey = toDayKey(today);
  const [fortnightStart, setFortnightStart] = useState(() => computeFortnightStart(today));
  const [selectedDate, setSelectedDate] = useState(today);
  // Acordeão do painel (E25): 1 evento aberto por vez.
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
              onClick={() => {
                setSelectedDate(day);
                setExpandedId(null);
              }}
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
              // E28: pagamento vira navegação PURA → Financeiro (sem acordeão/ações no
              // card; o "Pago" e o portão moram no Financeiro). Aprovação (F2) mantém o
              // acordeão + "Gerar aprovação" até a reforma dela (AP17-30).
              if (event.typeKey.startsWith('contract_payment_')) {
                return (
                  <li key={event.id} className="dd-events-panel-item" data-type={event.typeKey}>
                    <Link
                      href={`/contratos?tab=financeiro${
                        event.contractId ? `&highlight=${event.contractId}` : ''
                      }`}
                      className="dd-events-item-link"
                    >
                      <span className="dd-events-item-label">{event.label}</span>
                      <svg className="dd-events-item-go" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </Link>
                  </li>
                );
              }
              const isOpen = expandedId === event.id;
              const canGerar =
                event.typeKey === 'contract_approval_due' && Boolean(onGerarAprovacao);
              return (
                <li key={event.id} className="dd-events-panel-item" data-type={event.typeKey}>
                  <button
                    type="button"
                    className="dd-events-item-head"
                    onClick={() => setExpandedId((cur) => (cur === event.id ? null : event.id))}
                    aria-expanded={isOpen}
                  >
                    <span className="dd-events-item-label">{event.label}</span>
                    <svg className="dd-events-item-chevron" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {isOpen ? (
                    <div className="dd-events-item-detail">
                      <dl className="dd-events-item-fields">
                        <div>
                          <dt>Contrato</dt>
                          <dd>{event.contractNumber ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>Comprador</dt>
                          <dd>{event.buyerName ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>Vendedor</dt>
                          <dd>{event.sellerName ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>
                            {event.status ? (STATUS_LABEL[event.status] ?? event.status) : '—'}
                          </dd>
                        </div>
                      </dl>
                      <div className="dd-events-item-actions">
                        {canGerar ? (
                          <button
                            type="button"
                            className="dd-events-item-btn dd-events-item-btn-primary"
                            onClick={() => onGerarAprovacao?.(event)}
                          >
                            Gerar aprovação
                          </button>
                        ) : null}
                        {event.contractId ? (
                          <Link
                            href={`/contratos?details=${event.contractId}`}
                            className="dd-events-item-btn"
                          >
                            Ver contrato
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
