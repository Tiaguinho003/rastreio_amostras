'use client';

// Side-sheet dos INFORMATIVOS (opcao "Informativo" da /relatorios).
//
// Duas colunas (RD16 §2.10 R10): o formulario a esquerda e a previa 1080x1920 AO
// VIVO a direita. A peca de mercado e sempre gerada; a meteorologica e opcional
// (toggle). Nao ha mais wizard de fases — o preview substitui a "revisao".
//
// Este componente e o dono do estado porque as acoes vivem no `footer` do
// BottomSheet, e o footer so pode ser montado por quem chama o <BottomSheet>.
//
// Como as outras portas de criacao: fechar com dados preenchidos abre a
// confirmacao de descarte. Diferenca: o Informativo NAO cria registro — gera
// imagem e some (P1). Por isso nao ha onSubmitted que recarregue o feed; so
// onGenerated, que fecha e avisa.

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
  type Secao,
} from '../../lib/informativos/informativo-draft';
import { drawMercado } from '../../lib/informativos/mercado-draw';
import { drawMeteo } from '../../lib/informativos/meteo-draw';
import { loadLogo } from '../../lib/informativos/story-draw';
import { useStoryCanvas } from '../../lib/informativos/use-story-canvas';
import { usePrevisaoImage } from '../../lib/informativos/use-previsao-image';
import type { SlowFields } from '../../lib/informativos/slow-fields-store';
import {
  shareOrDownloadFile,
  shareOrDownloadFiles,
  type ShareFileInput,
} from '../../lib/share-blob';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { useFocusTrap } from '../../lib/use-focus-trap';

interface InformativoFormSheetProps {
  open: boolean;
  onClose: () => void;
  /** Pecas entregues — o sheet ja fechou quando isto dispara. */
  onGenerated?: (quantidade: number) => void;
  initialSlow?: SlowFields | null;
  onPersistSlow?: (slow: SlowFields) => void;
}

const ERRO_CAMPOS = 'Preencha todos os campos para continuar.';
const ERRO_IMAGEM = 'Não foi possível gerar a imagem. Tente novamente.';

// Tempo entre a ultima tecla e a repintura da previa: rapido o bastante pra
// parecer ao vivo, folgado o bastante pra nao repintar a peca a cada digito.
const PREVIEW_DEBOUNCE_MS = 160;

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

  const toggleMeteo = useCallback((inclui: boolean) => {
    setError(null);
    dispatch({ type: 'set-inclui-meteo', inclui });
  }, []);

  const acceptPrevisao = useCallback(
    (file: File | null | undefined) => {
      setError(null);
      void previsaoImage.accept(file);
    },
    [previsaoImage]
  );

  // Dados VIVOS (sem debounce): a fonte de verdade do download exato.
  const mercadoData = useMemo(() => toMercadoData(draft, dataTexto), [draft, dataTexto]);
  const meteoData = useMemo(
    () => toMeteoData(draft.meteo, dataTexto, previsao?.size ?? null),
    [draft.meteo, dataTexto, previsao]
  );

  // Dados ATRASADOS: alimentam so a previa, pra nao repintar a cada tecla. O
  // print da previsao (size + image) entra AO VIVO no paint — debounca-lo daria
  // 160ms de peca desalinhada logo apos colar.
  const debouncedMercado = useDebouncedValue(mercadoData, PREVIEW_DEBOUNCE_MS);
  const debouncedMeteo = useDebouncedValue(meteoData, PREVIEW_DEBOUNCE_MS);

  const paintMercado = useCallback(
    (ctx: CanvasRenderingContext2D, logo: CanvasImageSource | null) => {
      drawMercado(ctx, debouncedMercado, { logo });
    },
    [debouncedMercado]
  );
  const paintMeteo = useCallback(
    (ctx: CanvasRenderingContext2D, logo: CanvasImageSource | null) => {
      drawMeteo(
        ctx,
        { ...debouncedMeteo, previsao: previsao?.size ?? null },
        { logo, previsao: previsao?.image ?? null }
      );
    },
    [debouncedMeteo, previsao]
  );

  // As duas canvases ficam montadas enquanto o sheet esta aberto; a meteo so
  // pinta quando incluida. O toBlob do download le o bitmap das duas.
  const mercadoRef = useStoryCanvas(open, paintMercado);
  const meteoRef = useStoryCanvas(open && draft.incluiMeteo, paintMeteo);

  const missingMerc = useMemo(() => missingMercado(draft), [draft]);
  const missingMet = useMemo(
    () => missingMeteo(draft.meteo, previsao !== null),
    [draft.meteo, previsao]
  );
  const invalidMercado = useCallback(
    (key: string) => draft.submitted.mercado && missingMerc.has(key),
    [draft.submitted.mercado, missingMerc]
  );
  const invalidMeteo = useCallback(
    (key: string) => draft.submitted.meteo && missingMet.has(key),
    [draft.submitted.meteo, missingMet]
  );

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

  // Pinta a peca com os dados VIVOS (nao os atrasados da previa) e devolve o
  // PNG — garante que o arquivo baixado bate com o ultimo digito.
  const renderToBlob = useCallback(
    async (kind: Secao): Promise<Blob | null> => {
      const canvas = kind === 'mercado' ? mercadoRef.current : meteoRef.current;
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      let logo: CanvasImageSource | null = null;
      try {
        logo = await loadLogo();
      } catch {
        logo = null;
      }
      if (kind === 'mercado') {
        drawMercado(ctx, mercadoData, { logo });
      } else {
        drawMeteo(ctx, meteoData, { logo, previsao: previsao?.image ?? null });
      }
      return canvasToBlob(canvas);
    },
    [mercadoData, meteoData, previsao, mercadoRef, meteoRef]
  );

  const handleDownloadTudo = useCallback(async () => {
    if (busy) return;
    // Sem fase de "revisar", a validacao mora no download.
    dispatch({ type: 'mark-submitted', secao: 'mercado' });
    if (draft.incluiMeteo) {
      dispatch({ type: 'mark-submitted', secao: 'meteo' });
    }
    const missM = missingMercado(draft);
    const missMe = draft.incluiMeteo
      ? missingMeteo(draft.meteo, previsao !== null)
      : new Set<string>();
    if (missM.size > 0 || missMe.size > 0) {
      setError(ERRO_CAMPOS);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const iso = formatDateIsoLocal(hoje);
      const files: ShareFileInput[] = [];
      const mercadoBlob = await renderToBlob('mercado');
      if (!mercadoBlob) {
        setError(ERRO_IMAGEM);
        return;
      }
      files.push({
        blob: mercadoBlob,
        filename: `informativo-mercado-${iso}.png`,
        mimeType: 'image/png',
      });
      if (draft.incluiMeteo) {
        const meteoBlob = await renderToBlob('meteo');
        if (!meteoBlob) {
          setError(ERRO_IMAGEM);
          return;
        }
        files.push({
          blob: meteoBlob,
          filename: `informativo-meteorologico-${iso}.png`,
          mimeType: 'image/png',
        });
      }
      const result = await shareOrDownloadFiles(files, {
        shareTitle: files.length > 1 ? 'Informativos do dia' : 'Informativo de mercado',
      });
      // Cancelou o compartilhamento: nada se perde, o sheet fica aberto.
      if (result === 'cancelled') return;
      finalizar(files.length);
    } catch {
      setError(ERRO_IMAGEM);
    } finally {
      setBusy(false);
    }
  }, [busy, draft, previsao, hoje, renderToBlob, finalizar]);

  // Baixar uma peca so: entrega e NAO fecha — a outra ainda pode interessar.
  // Cada botao e um gesto proprio, entao nao dispara o aviso de "varios
  // downloads" do Chrome.
  const handleDownloadUma = useCallback(
    async (qual: Secao) => {
      if (busy) return;
      dispatch({ type: 'mark-submitted', secao: qual });
      const faltando =
        qual === 'mercado' ? missingMercado(draft) : missingMeteo(draft.meteo, previsao !== null);
      if (faltando.size > 0) {
        setError(ERRO_CAMPOS);
        return;
      }

      setBusy(true);
      setError(null);
      try {
        const blob = await renderToBlob(qual);
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
    [busy, draft, previsao, hoje, renderToBlob]
  );

  const footer = draft.incluiMeteo ? (
    <div className="ifm-footer-dl">
      <div className="ifm-footer-dl-row">
        <button
          type="button"
          className="app-modal-secondary"
          onClick={() => void handleDownloadUma('mercado')}
          disabled={busy}
        >
          Baixar mercado
        </button>
        <button
          type="button"
          className="app-modal-secondary"
          onClick={() => void handleDownloadUma('meteo')}
          disabled={busy}
        >
          Baixar meteorológico
        </button>
      </div>
      <button
        type="button"
        className="app-modal-submit"
        onClick={() => void handleDownloadTudo()}
        disabled={busy}
      >
        {busy ? 'Gerando…' : 'Baixar os dois'}
      </button>
    </div>
  ) : (
    <button
      type="button"
      className="app-modal-submit ifm-footer-single"
      onClick={() => void handleDownloadTudo()}
      disabled={busy}
    >
      {busy ? 'Gerando…' : 'Baixar informativo'}
    </button>
  );

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        onDismissAttempt={handleDismissAttempt}
        title="Informativo"
        ariaLabel="Informativo"
        closeVariant="edge-back"
        footer={footer}
        dragToDismiss
        dragDisabled={confirmDiscardOpen || busy}
        className="fv-panel-sheet side-sheet informativo-sheet"
      >
        <InformativoForm
          draft={draft}
          error={error}
          onPatchSlow={patchSlow}
          onPatchMercado={patchMercado}
          onPatchMeteo={patchMeteo}
          onToggleMeteo={toggleMeteo}
          invalidMercado={invalidMercado}
          invalidMeteo={invalidMeteo}
          previsao={previsao}
          previsaoError={previsaoImage.error}
          onAcceptPrevisao={acceptPrevisao}
          onClearPrevisao={previsaoImage.clear}
          mercadoRef={mercadoRef}
          meteoRef={meteoRef}
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
