'use client';

// RC-D27/D28: a CONFIRMAÇÃO PELO DOCUMENTO. "Emitir" deixou de emitir: ele monta
// o contrato, pede a prévia ao servidor e mostra o documento. Quem emite é o
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
//
// RC-D53 (2026-07-28): isto DEIXOU DE SER UM MODAL. Era um diálogo central
// portalado, com backdrop cheio, que subia por cima do painel do formulário —
// duas superfícies para o que o usuário vive como um ato só. Virou o SEGUNDO
// PASSO do mesmo painel: sem portal, sem backdrop, sem header e sem rodapé
// próprios (o rodapé é o do painel, e é o pai que o monta). Com isso morre a
// exceção de "backdrop cheio sobre painel" registrada em `containers` §2.
//
// A rasterização saiu para um HOOK porque o rodapé mora no pai: é ele que
// precisa saber se o documento já apareceu para liberar o Confirmar (o guard da
// RC-D27 — confirmar no escuro derrota a tela).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { downloadFile } from '../../lib/share-blob';

export type ContractDocumentPage = { url: string; width: number; height: number };

export type ContractDocumentPages = {
  pages: ContractDocumentPage[];
  rendering: boolean;
  renderError: string | null;
};

// Escala de rasterização: 2x do CSS pixel do PDF. Abaixo disso o texto de 7pt do
// contrato fica ilegível no celular; acima, a memória de canvas cresce rápido
// num documento de várias páginas.
const RENDER_SCALE = 2;

/**
 * Rasteriza o PDF da prévia em imagens de página. Quem chama é o PAI, não o
 * passo: o `rendering`/`renderError` decidem o `disabled` do Confirmar, que vive
 * no rodapé do painel.
 */
export function useContractDocumentPages(blob: Blob | null): ContractDocumentPages {
  const [pages, setPages] = useState<ContractDocumentPage[]>([]);
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  // As object URLs das páginas vivem aqui pra o cleanup revogar todas, inclusive
  // as que ficaram prontas depois de um unmount no meio da renderização.
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!blob) {
      setPages([]);
      setRendering(true);
      setRenderError(null);
      return;
    }
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
        const rendered: ContractDocumentPage[] = [];
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

  return { pages, rendering, renderError };
}

type ContractDocumentStepProps = {
  /** PDF já gerado pelo endpoint de prévia. */
  blob: Blob;
  contractNumber: string | null;
  /** O número ainda vai ser alocado na emissão (criação) ou já é o do contrato. */
  provisionalNumber: boolean;
  document: ContractDocumentPages;
  /** Avisa o pai que o PDF foi baixado — é o que libera o Confirmar quando a tela falhou. */
  onDownloaded: () => void;
};

export function ContractDocumentStep({
  blob,
  contractNumber,
  provisionalNumber,
  document: { pages, rendering, renderError },
  onDownloaded,
}: ContractDocumentStepProps) {
  const [zoomOpen, setZoomOpen] = useState(false);

  // ESC fecha SÓ a ampliação. Em fase de captura porque o `BottomSheet` tem
  // handler global de ESC: sem isto, ampliar e apertar ESC voltaria um passo do
  // painel (RC-D55) com a tela cheia ainda aberta por cima.
  useEffect(() => {
    if (!zoomOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setZoomOpen(false);
    };
    window.document.addEventListener('keydown', onKeyDown, true);
    return () => window.document.removeEventListener('keydown', onKeyDown, true);
  }, [zoomOpen]);

  function handleDownload() {
    // Mesma convenção do nome que o servidor manda no Content-Disposition.
    const slug = (contractNumber ?? '').replace('/', '-').trim();
    downloadFile(blob, slug ? `contrato-${slug}-previa.pdf` : 'contrato-previa.pdf');
    onDownloaded();
  }

  return (
    <>
      <p className="fv-panel-lead">
        Confira o contrato · {contractNumber ? `Nº ${contractNumber}` : 'Documento'}
        {provisionalNumber ? ' · provisório' : ''} · ainda não emitido
      </p>

      {rendering ? (
        <p className="ctr-modal-loading">Montando o documento...</p>
      ) : renderError ? (
        // Rasterização falhou (aparelho antigo, memória, worker bloqueado). O PDF
        // em si está aqui e é válido — então a saída é BAIXAR e olhar, não emitir
        // no escuro. É o mesmo contorno do `.ctr-doc-hint` do Espelho, só que
        // aqui virou a ação principal do estado.
        <div className="ctr-doc-fallback">
          <p className="ctr-modal-loading">{renderError}</p>
          <button type="button" className="ctr-btn" onClick={handleDownload}>
            Baixar o PDF para conferir
          </button>
        </div>
      ) : (
        <>
          {/* RC-D56: em 620px a folha A4 sai a ~0,78 da escala e a letra de 7pt
              fica com ~7px. "Ampliar" é a saída pra ler de perto SEM devolver a
              leitura padrão pra uma tela por cima do painel. */}
          <div className="ctr-doc-stepbar">
            <button type="button" className="ctr-btn" onClick={() => setZoomOpen(true)}>
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m16.2 16.2 4.1 4.1M11 8v6M8 11h6" />
              </svg>
              Ampliar
            </button>
          </div>
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
        </>
      )}

      {provisionalNumber ? (
        <p className="ctr-doc-hint">
          O número definitivo é gerado na emissão e pode diferir deste.
        </p>
      ) : null}

      {zoomOpen
        ? createPortal(
            // Stage própria, não o `PhotoZoomViewer`: aquele é de UMA imagem com
            // pinça e pan; aqui são N páginas em rolagem vertical, e o que
            // resolve a legibilidade é a LARGURA, não o zoom.
            <div
              className="ctr-doc-zoom"
              role="dialog"
              aria-modal="true"
              aria-label="Contrato ampliado"
              onClick={(event) => {
                if (event.target === event.currentTarget) setZoomOpen(false);
              }}
            >
              <button
                type="button"
                className="ctr-doc-zoom-close"
                onClick={() => setZoomOpen(false)}
                aria-label="Fechar a ampliação"
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <div className="ctr-doc-zoom-pages">
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
            </div>,
            window.document.body
          )
        : null}
    </>
  );
}
