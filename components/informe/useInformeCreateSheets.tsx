'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { CommercialVisitFormSheet } from './CommercialVisitFormSheet';
import { InformativoFormSheet } from './InformativoFormSheet';
import { WeeklyReportFormSheet } from './WeeklyReportFormSheet';
import {
  loadSlowFields,
  saveSlowFields,
  type SlowFields,
} from '../../lib/informativos/slow-fields-store';
import { useToast } from '../../lib/toast/ToastProvider';
import type { SessionData } from '../../lib/types';

// Estado dos 3 BottomSheets de criacao de /relatorios (Visita comercial +
// Semanal + Informativo), com o ciclo open/mounted (delayed unmount de 400ms
// pro slide-down). UMA fonte de estado servindo as DUAS portas de criacao: os
// botoes do cabecalho no desktop (reformulacao FV, RD §2.10 v2) e o FAB radial
// no mobile — antes vivia dentro do InformeCreateFab, que so tinha o FAB.
//
// Retorna os `open*` (triggers) e o `sheets` (arvore dos 3 sheets, ja com portal
// pro body — a posicao no JSX e indiferente; renderize `sheets` UMA vez).
//
// O Informativo e a opcao ATIPICA: as outras duas criam registro e o feed
// recarrega (onSubmitted); ele so gera uma imagem e some (nada a recarregar).

interface UseInformeCreateSheetsOptions {
  session: SessionData;
  onSubmitted: () => void;
}

interface InformeCreateSheets {
  openVisit: () => void;
  openWeekly: () => void;
  openInformativo: () => void;
  sheets: ReactNode;
}

export function useInformeCreateSheets({
  session,
  onSubmitted,
}: UseInformeCreateSheetsOptions): InformeCreateSheets {
  const toast = useToast();

  // `open` controla intencao; `mounted` presenca no DOM (delayed unmount de
  // 400ms pro slide-down do BottomSheet).
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

  const openInformativo = useCallback(() => {
    setInformativoSlow(loadSlowFields());
    setInformativoSheetOpen(true);
  }, []);

  const openVisit = useCallback(() => setVisitSheetOpen(true), []);
  const openWeekly = useCallback(() => setWeeklySheetOpen(true), []);

  const sheets = (
    <>
      {visitSheetMounted ? (
        <CommercialVisitFormSheet
          open={visitSheetOpen}
          session={session}
          onClose={() => setVisitSheetOpen(false)}
          onSubmitted={onSubmitted}
        />
      ) : null}

      {weeklySheetMounted ? (
        <WeeklyReportFormSheet
          open={weeklySheetOpen}
          session={session}
          onClose={() => setWeeklySheetOpen(false)}
          onSubmitted={onSubmitted}
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

  return { openVisit, openWeekly, openInformativo, sheets };
}
