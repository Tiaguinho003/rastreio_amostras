'use client';

import { useCallback, useEffect, useState } from 'react';

import { CommercialVisitFormSheet } from './CommercialVisitFormSheet';
import { InformativoFormSheet } from './InformativoFormSheet';
import { InformeCreateRadialFab } from './InformeCreateRadialFab';
import { WeeklyReportFormSheet } from './WeeklyReportFormSheet';
import {
  loadSlowFields,
  saveSlowFields,
  type SlowFields,
} from '../../lib/informativos/slow-fields-store';
import { useToast } from '../../lib/toast/ToastProvider';
import type { SessionData } from '../../lib/types';

// FAB radial de criacao (Visita comercial + Informativo + Relatorio semanal) +
// os BottomSheets dos formularios, com o ciclo open/mounted (delayed unmount de
// 400ms pro slide-down). Extraido de InformeCommercialPage pra ser reusado
// tambem pelo viewer "Relatorios" do ADMIN.
//
// Renderiza um fragment: o FAB radial monta o leque (.fab-fan) como IRMAO do
// botao, e ambos ancoram pelas vars --fab-*/--fan-*. Por isso o CHAMADOR deve
// envolver este componente num container que define essas vars —
// `.hero-search-wrap.is-informe` (dentro de `.informe-commercial-page`) na
// pagina do comercial, ou `.rsm-fab-anchor` no viewer. Os BottomSheets fazem
// portal pro body, entao a posicao deles no JSX e indiferente.
//
// O Informativo e a opcao ATIPICA do leque: as outras duas criam registro e o
// feed recarrega (onSubmitted); ele so gera uma imagem e some (P1 do
// docs/Informativos-Plano-de-Trabalho.md) — nada a recarregar.

interface InformeCreateFabProps {
  session: SessionData;
  onSubmitted: () => void;
  // Relatorio semanal so p/ ADMIN + COMMERCIAL (o leque esconde a opcao).
  canCreateWeekly: boolean;
  disabled?: boolean;
}

export function InformeCreateFab({
  session,
  onSubmitted,
  canCreateWeekly,
  disabled,
}: InformeCreateFabProps) {
  const toast = useToast();

  // Sheets dos formularios: `open` controla intencao, `mounted` presenca no
  // DOM (delayed unmount de 400ms pro slide-down do BottomSheet).
  const [visitSheetOpen, setVisitSheetOpen] = useState(false);
  const [visitSheetMounted, setVisitSheetMounted] = useState(false);
  const [weeklySheetOpen, setWeeklySheetOpen] = useState(false);
  const [weeklySheetMounted, setWeeklySheetMounted] = useState(false);
  const [informativoSheetOpen, setInformativoSheetOpen] = useState(false);
  const [informativoSheetMounted, setInformativoSheetMounted] = useState(false);

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

  useEffect(() => {
    if (informativoSheetOpen) {
      setInformativoSheetMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setInformativoSheetMounted(false), 400);
    return () => window.clearTimeout(timer);
  }, [informativoSheetOpen]);

  const handleSubmitted = useCallback(() => {
    onSubmitted();
  }, [onSubmitted]);

  const handleInformativoGenerated = useCallback(
    (quantidade: number) => {
      toast.success({
        title: quantidade > 1 ? 'Informativos gerados.' : 'Informativo gerado.',
      });
    },
    [toast]
  );

  // Le do localStorage so na abertura do sheet — nao no render, que roda no
  // servidor.
  const [informativoSlow, setInformativoSlow] = useState<SlowFields | null>(null);

  const handleOpenInformativo = useCallback(() => {
    setInformativoSlow(loadSlowFields());
    setInformativoSheetOpen(true);
  }, []);

  return (
    <>
      <InformeCreateRadialFab
        onCreateVisit={() => setVisitSheetOpen(true)}
        onCreateWeeklyReport={() => setWeeklySheetOpen(true)}
        onCreateInformativo={handleOpenInformativo}
        canCreateWeekly={canCreateWeekly}
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

      {informativoSheetMounted ? (
        <InformativoFormSheet
          open={informativoSheetOpen}
          onClose={() => setInformativoSheetOpen(false)}
          onGenerated={handleInformativoGenerated}
          initialSlow={informativoSlow}
          onPersistSlow={saveSlowFields}
        />
      ) : null}
    </>
  );
}
