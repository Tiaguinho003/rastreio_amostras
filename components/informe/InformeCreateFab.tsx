'use client';

import { useCallback, useEffect, useState } from 'react';

import { CommercialVisitFormSheet } from './CommercialVisitFormSheet';
import { InformeCreateRadialFab } from './InformeCreateRadialFab';
import { WeeklyReportFormSheet } from './WeeklyReportFormSheet';
import type { SessionData } from '../../lib/types';

// FAB radial de criacao (Visita comercial + Relatorio semanal) + os dois
// BottomSheets dos formularios, com o ciclo open/mounted (delayed unmount de
// 400ms pro slide-down). Extraido de InformeCommercialPage pra ser reusado
// tambem pelo viewer "Relatorios" do ADMIN.
//
// Renderiza um fragment: o FAB radial monta o leque (.fab-fan) como IRMAO do
// botao, e ambos ancoram pelas vars --fab-*/--fan-*. Por isso o CHAMADOR deve
// envolver este componente num container que define essas vars —
// `.hero-search-wrap.is-informe` (dentro de `.informe-commercial-page`) na
// pagina do comercial, ou `.rsm-fab-anchor` no viewer. Os BottomSheets fazem
// portal pro body, entao a posicao deles no JSX e indiferente.

interface InformeCreateFabProps {
  session: SessionData;
  onSubmitted: () => void;
  disabled?: boolean;
}

export function InformeCreateFab({ session, onSubmitted, disabled }: InformeCreateFabProps) {
  // Sheets dos formularios: `open` controla intencao, `mounted` presenca no
  // DOM (delayed unmount de 400ms pro slide-down do BottomSheet).
  const [visitSheetOpen, setVisitSheetOpen] = useState(false);
  const [visitSheetMounted, setVisitSheetMounted] = useState(false);
  const [weeklySheetOpen, setWeeklySheetOpen] = useState(false);
  const [weeklySheetMounted, setWeeklySheetMounted] = useState(false);

  useEffect(() => {
    if (visitSheetOpen) {
      setVisitSheetMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setVisitSheetMounted(false), 400);
    return () => window.clearTimeout(timer);
  }, [visitSheetOpen]);

  useEffect(() => {
    if (weeklySheetOpen) {
      setWeeklySheetMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setWeeklySheetMounted(false), 400);
    return () => window.clearTimeout(timer);
  }, [weeklySheetOpen]);

  const handleSubmitted = useCallback(() => {
    onSubmitted();
  }, [onSubmitted]);

  return (
    <>
      <InformeCreateRadialFab
        onCreateVisit={() => setVisitSheetOpen(true)}
        onCreateWeeklyReport={() => setWeeklySheetOpen(true)}
        disabled={disabled}
      />

      {visitSheetMounted ? (
        <CommercialVisitFormSheet
          open={visitSheetOpen}
          session={session}
          onClose={() => setVisitSheetOpen(false)}
          onSubmitted={handleSubmitted}
        />
      ) : null}

      {weeklySheetMounted ? (
        <WeeklyReportFormSheet
          open={weeklySheetOpen}
          session={session}
          onClose={() => setWeeklySheetOpen(false)}
          onSubmitted={handleSubmitted}
        />
      ) : null}
    </>
  );
}
