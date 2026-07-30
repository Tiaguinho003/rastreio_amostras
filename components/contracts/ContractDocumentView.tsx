'use client';

// O RENDERIZADOR DE DOCUMENTO do domínio de contratos — um só, para os quatro
// lugares onde um PDF aparece na tela: a conferência da emissão (`ContractDocumentStep`),
// a aba Detalhes do contrato, cada bloco da aba Espelho e a releitura aberta pelo
// Histórico.
//
// 🔴 RC-D130 (2026-07-30): antes, o detalhe usava `<iframe src={blobUrl}>` e a emissão
// rasterizava. As duas formas mostram o mesmo PDF e não se parecem em nada: o `<iframe>`
// entrega o documento embrulhado no VISUALIZADOR DO NAVEGADOR — barra escura com zoom,
// girar, imprimir e o menu de três pontos, painel de miniaturas à esquerda, fundo cinza-
// -escuro em volta da folha. É chrome de aplicativo em cima de um papel, e ele é do
// navegador: não dá para tematizar, muda de forma entre Chrome/Firefox/Safari e no iOS
// muitas vezes não renderiza nada.
//
// Rasterizar resolve os dois problemas de uma vez: o documento vira `<img>` numa folha
// branca sobre o canvas da própria página — sem barra, sem miniaturas, sem fundo preto —
// e aparece em QUALQUER aparelho. As ações que a barra do navegador dava e que o
// operador realmente usa (baixar, exportar/imprimir) já existem como botões da própria
// tela; o zoom virou o "Ampliar", que abre as páginas em largura cheia.
//
// Quem rasteriza é o CLIENTE, com `pdfjs-dist` em import dinâmico (~1 MB, só baixado
// quando alguém abre um documento). Fazer isso no servidor exigiria Ghostscript ou
// binding nativo no contêiner.
//
// O hook mora aqui, e não no passo da emissão, porque lá o `rendering` decide o
// `disabled` de um botão que vive no RODAPÉ DO PAI — quem chama o hook é o pai, quem
// desenha é este componente.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
 * Rasteriza um PDF em imagens de página. `blob` nulo = ainda não chegou (o estado
 * inicial é `rendering`, não "vazio": um documento a caminho não é um documento que
 * falhou).
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

type ContractDocumentViewProps = {
  document: ContractDocumentPages;
  /** Nome do documento para o alt das páginas e o rótulo da ampliação. */
  label: string;
  /** Texto do "carregando" — o documento pode estar sendo BUSCADO, não só pintado. */
  loadingLabel?: string;
  /**
   * Saída de quando a rasterização falha (aparelho antigo, memória, worker bloqueado):
   * o PDF em si está válido, então baixar e olhar resolve. Sem isto o estado de erro
   * fica sem porta — e era justamente a função do velho aviso "se não aparecer no seu
   * aparelho, use Baixar ou Exportar", que este componente aposentou.
   */
  onFallbackDownload?: (() => void) | null;
  fallbackLabel?: string;
};

export function ContractDocumentView({
  document: { pages, rendering, renderError },
  label,
  loadingLabel = 'Montando o documento…',
  onFallbackDownload = null,
  fallbackLabel = 'Baixar o PDF',
}: ContractDocumentViewProps) {
  const [zoomOpen, setZoomOpen] = useState(false);

  // ESC fecha SÓ a ampliação. Em fase de captura porque o `BottomSheet` que hospeda
  // todos os consumidores tem handler global de ESC: sem isto, ampliar e apertar ESC
  // fecharia o painel inteiro com a tela cheia ainda por cima.
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

  if (rendering) {
    return <p className="ctr-modal-loading">{loadingLabel}</p>;
  }

  if (renderError) {
    return (
      <div className="ctr-doc-fallback">
        <p className="ctr-modal-loading">{renderError}</p>
        {onFallbackDownload ? (
          <button type="button" className="ctr-btn" onClick={onFallbackDownload}>
            {fallbackLabel}
          </button>
        ) : null}
      </div>
    );
  }

  const sheets = pages.map((page, index) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={page.url}
      className="ctr-doc-page"
      src={page.url}
      width={page.width}
      height={page.height}
      alt={`Página ${index + 1} de ${label}`}
    />
  ));

  return (
    <>
      {/* RC-D56: numa coluna de 620px a folha A4 sai a ~0,78 da escala e a letra de
          7pt fica com ~7px. "Ampliar" é a leitura de perto — e é o que substitui o
          zoom que a barra do visualizador do navegador dava. */}
      <div className="ctr-doc-stepbar">
        <button type="button" className="ctr-btn" onClick={() => setZoomOpen(true)}>
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m16.2 16.2 4.1 4.1M11 8v6M8 11h6" />
          </svg>
          Ampliar
        </button>
      </div>
      <div className="ctr-doc-pages">{sheets}</div>

      {zoomOpen
        ? createPortal(
            // Stage própria, não o `PhotoZoomViewer`: aquele é de UMA imagem com
            // pinça e pan; aqui são N páginas em rolagem vertical, e o que resolve a
            // legibilidade é a LARGURA, não o zoom.
            <div
              className="ctr-doc-zoom"
              role="dialog"
              aria-modal="true"
              aria-label={`${label} ampliado`}
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
              <div className="ctr-doc-zoom-pages">{sheets}</div>
            </div>,
            window.document.body
          )
        : null}
    </>
  );
}
