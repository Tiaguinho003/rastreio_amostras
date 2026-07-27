'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  CALENDAR_WEEKDAY_INITIALS,
  addMonths,
  buildMonthGrid,
  computeMonthStart,
  formatDayAriaLabel,
  formatMonthLabel,
  formatMonthShort,
  getBrtToday,
  toDayKey,
} from '../../lib/dashboard-calendar';
import { LoadError } from '../LoadError';
import type { DashboardCalendarEvent } from '../../lib/types';

// F1 (E21-E27/D138): o tipo do evento foi promovido pro lib/types.ts
// (DashboardCalendarEvent) quando o 1º feed real nasceu — pagamentos de contrato.
type CalendarEvent = DashboardCalendarEvent;

interface EventsCalendarCardProps {
  /** Mapa 'YYYY-MM-DD' → eventos do dia (pagamento + embarque; DSB-D11 soma faturamento). */
  events?: Record<string, CalendarEvent[]>;
  /** Emite a GRADE do mês visível (from..to 'YYYY-MM-DD') pro pai buscar o feed (E24/DSB-D18). */
  onWindowChange?: (from: string, to: string) => void;
  /** Erro de carregamento de algum dos feeds (strip não-bloqueante + retry). */
  error?: string | null;
  onRetry?: () => void;
}

// EMB26/E28: TODO evento do feed é NAVEGAÇÃO PURA — o card não gera/registra nada.
// RC-D23: o destino de TODOS eles é o mesmo, o próprio CONTRATO. Antes cada tipo
// apontava pra sub-aba dona (pagamento → Financeiro, embarque → Embarque,
// faturamento → Contratos), e a DSB-D11 apagava o link quando o papel não abria
// aquela aba. Com as fases dentro do contrato, não há aba nem papel a checar:
// pagar, faturar e confirmar embarque moram todos lá. Evento sem contractId
// (nenhum feed atual) segue como rótulo inerte.
function eventHref(event: CalendarEvent): string | null {
  if (!event.contractId) return null;
  return `/contratos?details=${event.contractId}&highlight=${event.contractId}`;
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

// Card "Eventos" (dashboard desktop, DSB-D18): calendário MENSAL (grade 7×N
// domingo-first), com TODOS os dias — fins de semana esmaecidos (o negócio não
// agenda ações neles; eventos ali são legado/borda, exibidos no dia REAL) e as
// pontas dos meses vizinhos esmaecidas COM eventos. Navegação ◀ Hoje ▶ de mês
// em mês. Cada dia mostra os eventos DENTRO da célula — chips coloridos por
// ESTADO (DSB-D10), clicáveis (navegação pura → página dona); dias cheios rolam
// POR DENTRO da própria célula. Sem painel de dia selecionado. "Hoje" com anel.
// Desktop-only (o DashboardMobile não o monta).
export function EventsCalendarCard({
  events = {},
  onWindowChange,
  error,
  onRetry,
}: EventsCalendarCardProps) {
  const today = useMemo(() => getBrtToday(), []);
  const todayKey = toDayKey(today);
  const [monthStart, setMonthStart] = useState(() => computeMonthStart(today));
  // Direção do deslize (E18) + contador pra re-disparar a animação a cada
  // navegação (muda a key do wrapper da grade).
  const [slide, setSlide] = useState<{ direction: 'left' | 'right' | null; tick: number }>({
    direction: null,
    tick: 0,
  });

  // Grade completa do mês (28/35/42 células, sempre semanas inteiras).
  const days = useMemo(() => buildMonthGrid(monthStart), [monthStart]);
  const monthIndex = monthStart.getUTCMonth();

  // E24/DSB-D18: emite a GRADE inteira (inclui as pontas dos meses vizinhos)
  // pro pai buscar os feeds. Dispara na montagem + a cada navegação. O pai
  // memoiza `onWindowChange`.
  useEffect(() => {
    if (!onWindowChange || days.length === 0) return;
    onWindowChange(toDayKey(days[0]), toDayKey(days[days.length - 1]));
  }, [days, onWindowChange]);

  function navigate(direction: 'left' | 'right') {
    const delta = direction === 'left' ? -1 : 1;
    setMonthStart((start) => addMonths(start, delta));
    setSlide((prev) => ({ direction, tick: prev.tick + 1 }));
  }

  function goToToday() {
    setMonthStart(computeMonthStart(today));
    setSlide((prev) => ({ direction: null, tick: prev.tick + 1 }));
  }

  return (
    <section className="dd-events-card" aria-label="Eventos">
      <header className="dd-events-header">
        <div className="dd-events-heading">
          <h3 className="dd-events-title">Eventos</h3>
          <span className="dd-events-period">{formatMonthLabel(monthStart)}</span>
        </div>
        <div className="dd-events-nav" role="group" aria-label="Navegar entre meses">
          <button
            type="button"
            className="dd-events-nav-arrow"
            onClick={() => navigate('left')}
            aria-label="Mês anterior"
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
            aria-label="Próximo mês"
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="m9.5 6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </header>

      {error ? <LoadError message={error} onRetry={onRetry} compact /> : null}

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
          // DSB-D18: fim de semana e pontas dos meses vizinhos ficam esmaecidos
          // (institucional) — eventos continuam visíveis/clicáveis nos dois casos.
          const dow = day.getUTCDay();
          const isWeekend = dow === 0 || dow === 6;
          const isOutside = day.getUTCMonth() !== monthIndex;
          return (
            <div
              key={dayKey}
              className={`dd-events-day${isToday ? ' is-today' : ''}${isWeekend ? ' is-weekend' : ''}${isOutside ? ' is-outside' : ''}`}
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
                    const href = eventHref(event);
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
