'use client';

// RC-D27/D28: a CONFIRMAÇÃO PELO DOCUMENTO. "Emitir" deixou de emitir: ele monta
// o contrato, pede a prévia ao servidor e abre esta tela. Quem emite é o
// "Confirmar"; "Voltar" devolve o formulário intacto.
//
// O documento é o PDF DE VERDADE — mesma `_resolveEmitData` e mesmo
// `renderContractPdf` da emissão (RC-D28). Fidelidade por construção, não por
// réplica: revoga a RC-D14 (prévia "meio a meio" em HTML) e a RC-D15 (sem prévia
// no celular).
//
// Quem RASTERIZA é o cliente, com pdfjs-dist em import dinâmico, pintando em
// <canvas>. É o desvio do "servidor manda imagem": rasterizar no servidor
// exigiria Ghostscript ou binding nativo no contêiner. O resultado para o
// usuário é o mesmo — imagem que aparece em qualquer aparelho, inclusive onde o
// <iframe> de PDF não renderiza (o caso que o `.ctr-doc-hint` do Espelho
// contorna com "use Exportar ou Baixar").

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useFocusTrap } from '../../lib/use-focus-trap';

type ContractDocumentConfirmModalProps = {
  /** PDF já gerado pelo endpoint de prévia. */
  blob: Blob;
  contractNumber: string | null;
  /** O número ainda vai ser alocado na emissão (criação) ou já é o do contrato. */
  provisionalNumber: boolean;
  /** Emitindo de fato (pós-Confirmar): trava os dois botões. */
  submitting: boolean;
  /** Erro da emissão, mostrado sem fechar a tela. */
  error: string | null;
  onConfirm: () => void;
  onBack: () => void;
};

type PageImage = { url: string; width: number; height: number };

// Escala de rasterização: 2x do CSS pixel do PDF. Abaixo disso o texto de 7pt do
// contrato fica ilegível no celular; acima, a memória de canvas cresce rápido
// num documento de várias páginas.
const RENDER_SCALE = 2;

export function ContractDocumentConfirmModal({
  blob,
  contractNumber,
  provisionalNumber,
  submitting,
  error,
  onConfirm,
  onBack,
}: ContractDocumentConfirmModalProps) {
  const focusTrapRef = useFocusTrap(true);
  const [pages, setPages] = useState<PageImage[]>([]);
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  // As object URLs das páginas vivem aqui pra o cleanup revogar todas, inclusive
  // as que ficaram prontas depois de um unmount no meio da renderização.
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    let aborted = false;
    (async () => {
      setRendering(true);
      setRenderError(null);
      try {
        // Import dinâmico: a biblioteca (~1 MB) só entra no bundle desta tela e
        // só é baixada quando alguém chega a confirmar um contrato.
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();

        const data = await blob.arrayBuffer();
        if (aborted) return;
        const doc = await pdfjs.getDocument({ data }).promise;
        const rendered: PageImage[] = [];
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          if (aborted) break;
          const page = await doc.getPage(pageNumber);
          const viewport = page.getViewport({ scale: RENDER_SCALE });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext('2d');
          if (!context) throw new Error('canvas indisponível');
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          const pageBlob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/png')
          );
          if (!pageBlob) throw new Error('falha ao rasterizar a página');
          const url = URL.createObjectURL(pageBlob);
          urlsRef.current.push(url);
          rendered.push({ url, width: canvas.width, height: canvas.height });
          // Libera o canvas antes da próxima página (documentos longos).
          canvas.width = 0;
          canvas.height = 0;
        }
        if (!aborted) setPages(rendered);
      } catch {
        if (!aborted) setRenderError('Não foi possível exibir o documento.');
      } finally {
        if (!aborted) setRendering(false);
      }
    })();
    return () => {
      aborted = true;
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current = [];
    };
  }, [blob]);

  // ESC = Voltar. O painel de trás tem o próprio handler de ESC (global, do
  // BottomSheet) e não sabe que este modal existe — quem bloqueia ele lá é o
  // `canExit`; aqui a tecla precisa fazer a coisa certa, não nada.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || submitting) return;
      event.preventDefault();
      event.stopPropagation();
      onBack();
    };
    // Fase de captura: chega antes do handler global do BottomSheet.
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [submitting, onBack]);

  return createPortal(
    // Backdrop CHEIO, não `.fv-panel-scrim`: exceção deliberada à regra de
    // "confirmação sobre painel" (skill containers §2) — o documento precisa da
    // tela inteira pra ser legível, e é ele o objeto da decisão.
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action ctr-doc-modal ctr-confirm-doc"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ctr-confirm-doc-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="ctr-confirm-doc-title" className="app-modal-title">
              Confira o contrato
            </h3>
            <p className="app-modal-subtitle">
              {contractNumber ? `Nº ${contractNumber}` : 'Documento'}
              {provisionalNumber ? ' · provisório' : ''} · ainda não emitido
            </p>
          </div>
        </header>

        {error ? <p className="sdv-modal-error">{error}</p> : null}

        <div className="app-modal-content ctr-doc-content">
          {rendering ? (
            <p className="ctr-modal-loading">Montando o documento...</p>
          ) : renderError ? (
            <p className="ctr-modal-loading">{renderError}</p>
          ) : (
            <div className="ctr-doc-pages">
              {pages.map((page, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={page.url}
                  className="ctr-doc-page"
                  src={page.url}
                  width={page.width}
                  height={page.height}
                  alt={`Página ${index + 1} do contrato`}
                />
              ))}
            </div>
          )}
          {provisionalNumber ? (
            <p className="ctr-doc-hint">
              O número definitivo é gerado na emissão e pode diferir deste.
            </p>
          ) : null}
        </div>

        <div className="app-modal-actions">
          <button
            type="button"
            className="app-modal-secondary"
            onClick={onBack}
            disabled={submitting}
          >
            Voltar
          </button>
          <button
            type="button"
            className="app-modal-submit"
            onClick={onConfirm}
            disabled={submitting || rendering}
          >
            {submitting ? 'Emitindo...' : 'Confirmar e emitir'}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
