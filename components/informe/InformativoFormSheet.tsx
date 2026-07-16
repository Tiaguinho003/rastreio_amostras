'use client';

// BottomSheet dos INFORMATIVOS (opcao "Informativo" do FAB da /relatorios).
//
// Fluxo de 3 fases: mercado -> meteorologico -> revisao. O meteorologico e
// PULAVEL (o mercado nao — e a peca de todo dia). A revisao mostra as pecas
// prontas e entrega as duas.
//
// Este componente e o dono do estado porque as acoes vivem no `footer` do
// BottomSheet, e o footer so pode ser montado por quem chama o <BottomSheet>.
//
// Como as outras opcoes do leque: fechar com dados preenchidos abre a
// confirmacao de descarte empilhada (.is-stacked, portal pro body). Diferenca:
// o Informativo NAO cria registro — gera imagem e some (P1). Por isso nao ha
// onSubmitted que recarregue o feed; so onGenerated, que fecha e avisa.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { BottomSheet } from '../BottomSheet';
import { InformativoForm } from './InformativoForm';
import { formatDateExtensoLocal, formatDateIsoLocal } from '../../lib/date-br';
import {
  createInformativoDraft,
  informativoDraftReducer,
  isDraftDirty,
  missingMercado,
  missingMeteo,
  toMercadoData,
  toMeteoData,
  type MercadoFields,
  type MeteoFields,
  type Phase,
} from '../../lib/informativos/informativo-draft';
import { drawMercado } from '../../lib/informativos/mercado-draw';
import { drawMeteo } from '../../lib/informativos/meteo-draw';
import { useStoryCanvas } from '../../lib/informativos/use-story-canvas';
import { usePrevisaoImage } from '../../lib/informativos/use-previsao-image';
import type { SlowFields } from '../../lib/informativos/slow-fields-store';
import {
  shareOrDownloadFile,
  shareOrDownloadFiles,
  type ShareFileInput,
} from '../../lib/share-blob';
import { useFocusTrap } from '../../lib/use-focus-trap';

interface InformativoFormSheetProps {
  open: boolean;
  onClose: () => void;
  /** Pecas entregues — o sheet ja fechou quando isto dispara. */
  onGenerated?: (quantidade: number) => void;
  initialSlow?: SlowFields | null;
  onPersistSlow?: (slow: SlowFields) => void;
}

const TITULOS: Record<Phase, string> = {
  mercado: 'Informativo de mercado',
  meteo: 'Informativo meteorológico',
  revisao: 'Revisar e baixar',
};

const ERRO_CAMPOS = 'Preencha todos os campos para continuar.';
const ERRO_IMAGEM = 'Não foi possível gerar a imagem. Tente novamente.';

function canvasToBlob(canvas: HTMLCanvasElement | null): Promise<Blob | null> {
  if (!canvas) return Promise.resolve(null);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export function InformativoFormSheet({
  open,
  onClose,
  onGenerated,
  initialSlow,
  onPersistSlow,
}: InformativoFormSheetProps) {
  const [draft, dispatch] = useReducer(
    informativoDraftReducer,
    initialSlow ?? null,
    createInformativoDraft
  );
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmTrapRef = useFocusTrap(confirmDiscardOpen);

  const previsaoImage = usePrevisaoImage();
  const { previsao } = previsaoImage;

  // A data e travada em hoje (INF17) e vem do relogio LOCAL — o canvas roda no
  // navegador, entao e o dia de quem esta publicando.
  const hoje = useMemo(() => new Date(), []);
  const dataTexto = useMemo(() => formatDateExtensoLocal(hoje), [hoje]);

  // Editar um campo limpa o erro — igual em todos, entao o clear mora aqui.
  const patchSlow = useCallback((patch: Partial<SlowFields>) => {
    dispatch({ type: 'patch-slow', patch });
    setError(null);
  }, []);
  const patchMercado = useCallback((patch: Partial<MercadoFields>) => {
    dispatch({ type: 'patch-mercado', patch });
    setError(null);
  }, []);
  const patchMeteo = useCallback((patch: Partial<MeteoFields>) => {
    dispatch({ type: 'patch-meteo', patch });
    setError(null);
  }, []);

  const acceptPrevisao = useCallback(
    (file: File | null | undefined) => {
      setError(null);
      void previsaoImage.accept(file);
    },
    [previsaoImage]
  );

  const mercadoData = useMemo(() => toMercadoData(draft, dataTexto), [draft, dataTexto]);
  const meteoData = useMemo(
    () => toMeteoData(draft.meteo, dataTexto, previsao?.size ?? null),
    [draft.meteo, dataTexto, previsao]
  );

  const missing = useMemo(() => {
    if (draft.phase === 'meteo') {
      return missingMeteo(draft.meteo, previsao !== null);
    }
    return missingMercado(draft);
  }, [draft, previsao]);

  const naRevisao = draft.phase === 'revisao';
  const paintMercado = useCallback(
    (ctx: CanvasRenderingContext2D, logo: CanvasImageSource | null) => {
      drawMercado(ctx, mercadoData, { logo });
    },
    [mercadoData]
  );
  const paintMeteo = useCallback(
    (ctx: CanvasRenderingContext2D, logo: CanvasImageSource | null) => {
      drawMeteo(ctx, meteoData, { logo, previsao: previsao?.image ?? null });
    },
    [meteoData, previsao]
  );
  const mercadoRef = useStoryCanvas(naRevisao, paintMercado);
  const meteoRef = useStoryCanvas(naRevisao && draft.incluiMeteo, paintMeteo);

  // Ref, e nao leitura direta do draft, de proposito: o requestClose do
  // BottomSheet entra nas deps do efeito de ESC, entao um handler que mudasse a
  // cada tecla re-registraria o listener de keydown a cada tecla.
  const isDirtyRef = useRef(false);
  useEffect(() => {
    isDirtyRef.current = isDraftDirty(draft) || previsao !== null;
  }, [draft, previsao]);

  const handleDismissAttempt = useCallback(() => {
    if (!isDirtyRef.current) {
      return true;
    }
    setConfirmDiscardOpen(true);
    return false;
  }, []);

  function handleDiscard() {
    setConfirmDiscardOpen(false);
    onClose();
  }

  const finalizar = useCallback(
    (quantidade: number) => {
      isDirtyRef.current = false;
      onPersistSlow?.(draft.slow);
      onClose();
      onGenerated?.(quantidade);
    },
    [draft.slow, onClose, onGenerated, onPersistSlow]
  );

  const avancar = useCallback(
    (proxima: Phase) => {
      dispatch({ type: 'mark-submitted', phase: draft.phase });
      if (missing.size > 0) {
        setError(ERRO_CAMPOS);
        return;
      }
      setError(null);
      dispatch({ type: 'set-phase', phase: proxima });
    },
    [draft.phase, missing]
  );

  const handleSkipMeteo = useCallback(() => {
    setError(null);
    dispatch({ type: 'skip-meteo' });
  }, []);

  const arquivos = useCallback(async (): Promise<ShareFileInput[]> => {
    const iso = formatDateIsoLocal(hoje);
    const out: ShareFileInput[] = [];
    const mercadoBlob = await canvasToBlob(mercadoRef.current);
    if (!mercadoBlob) return [];
    out.push({
      blob: mercadoBlob,
      filename: `informativo-mercado-${iso}.png`,
      mimeType: 'image/png',
    });
    if (draft.incluiMeteo) {
      const meteoBlob = await canvasToBlob(meteoRef.current);
      if (!meteoBlob) return [];
      out.push({
        blob: meteoBlob,
        filename: `informativo-meteorologico-${iso}.png`,
        mimeType: 'image/png',
      });
    }
    return out;
  }, [draft.incluiMeteo, hoje, mercadoRef, meteoRef]);

  const handleDownloadTudo = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const files = await arquivos();
      if (files.length === 0) {
        setError(ERRO_IMAGEM);
        return;
      }
      const result = await shareOrDownloadFiles(files, {
        shareTitle: files.length > 1 ? 'Informativos do dia' : 'Informativo de mercado',
      });
      // Cancelou o compartilhamento: nada se perde, o modal fica aberto.
      if (result === 'cancelled') return;
      finalizar(files.length);
    } catch {
      setError(ERRO_IMAGEM);
    } finally {
      setBusy(false);
    }
  }, [arquivos, busy, finalizar]);

  // Baixar uma peca so: entrega e NAO fecha — pode ser que a outra ainda
  // interesse.
  const handleDownloadUma = useCallback(
    async (qual: 'mercado' | 'meteo') => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const canvas = qual === 'mercado' ? mercadoRef.current : meteoRef.current;
        const blob = await canvasToBlob(canvas);
        if (!blob) {
          setError(ERRO_IMAGEM);
          return;
        }
        const iso = formatDateIsoLocal(hoje);
        const nome =
          qual === 'mercado'
            ? `informativo-mercado-${iso}.png`
            : `informativo-meteorologico-${iso}.png`;
        await shareOrDownloadFile(blob, nome, {
          mimeType: 'image/png',
          shareTitle: qual === 'mercado' ? 'Informativo de mercado' : 'Informativo meteorológico',
        });
      } catch {
        setError(ERRO_IMAGEM);
      } finally {
        setBusy(false);
      }
    },
    [busy, hoje, mercadoRef, meteoRef]
  );

  const invalid = useCallback(
    (key: string) => draft.submitted[draft.phase] && missing.has(key),
    [draft.phase, draft.submitted, missing]
  );

  const footer = (() => {
    if (draft.phase === 'mercado') {
      return (
        <div className="ifm-footer-actions is-single">
          <button type="button" className="inf-submit" onClick={() => avancar('meteo')}>
            Continuar
          </button>
        </div>
      );
    }
    if (draft.phase === 'meteo') {
      return (
        <div className="ifm-footer-actions">
          <button type="button" className="app-modal-secondary" onClick={handleSkipMeteo}>
            Pular
          </button>
          <button type="button" className="inf-submit" onClick={() => avancar('revisao')}>
            Revisar
          </button>
        </div>
      );
    }
    return (
      <div className="ifm-footer-actions">
        <button
          type="button"
          className="app-modal-secondary"
          onClick={() =>
            dispatch({ type: 'set-phase', phase: draft.incluiMeteo ? 'meteo' : 'mercado' })
          }
          disabled={busy}
        >
          Voltar
        </button>
        <button
          type="button"
          className="inf-submit"
          onClick={() => void handleDownloadTudo()}
          disabled={busy}
        >
          {busy ? 'Gerando…' : draft.incluiMeteo ? 'Baixar os dois' : 'Baixar informativo'}
        </button>
      </div>
    );
  })();

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        onDismissAttempt={handleDismissAttempt}
        title={TITULOS[draft.phase]}
        ariaLabel={TITULOS[draft.phase]}
        footer={footer}
        dragToDismiss
        dragDisabled={confirmDiscardOpen || busy}
        className="is-informe is-informativo"
      >
        <InformativoForm
          draft={draft}
          error={error}
          busy={busy}
          onPatchSlow={patchSlow}
          onPatchMercado={patchMercado}
          onPatchMeteo={patchMeteo}
          invalid={invalid}
          previsao={previsao}
          previsaoError={previsaoImage.error}
          onAcceptPrevisao={acceptPrevisao}
          onClearPrevisao={previsaoImage.clear}
          mercadoRef={mercadoRef}
          meteoRef={meteoRef}
          onDownloadMercado={() => void handleDownloadUma('mercado')}
          onDownloadMeteo={() => void handleDownloadUma('meteo')}
        />
      </BottomSheet>

      {confirmDiscardOpen
        ? createPortal(
            <div
              className="app-modal-backdrop is-stacked"
              onClick={() => setConfirmDiscardOpen(false)}
            >
              <section
                ref={confirmTrapRef}
                className="app-modal is-themed app-confirm-modal is-stacked"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="discard-informativo-title"
                aria-describedby="discard-informativo-description"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 id="discard-informativo-title" className="app-modal-title">
                      Descartar informativo?
                    </h3>
                  </div>
                </header>

                <div className="app-modal-content">
                  <div className="app-confirm-modal-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                      <path d="M12 9v4" />
                      <path d="M12 17v.01" />
                    </svg>
                  </div>
                  <p id="discard-informativo-description" className="app-confirm-modal-message">
                    Os valores preenchidos serão perdidos. Esta ação não pode ser desfeita.
                  </p>
                </div>

                <div className="app-modal-actions">
                  <button
                    type="button"
                    className="app-modal-secondary"
                    onClick={() => setConfirmDiscardOpen(false)}
                    autoFocus
                  >
                    Continuar
                  </button>
                  <button
                    type="button"
                    className="app-modal-submit is-danger"
                    onClick={handleDiscard}
                  >
                    Descartar
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
