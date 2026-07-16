'use client';

// Fase 3: as pecas prontas, empilhadas, para conferir antes de publicar.
//
// Empilhadas e nao lado a lado porque no desktop o sheet e capado em 650px:
// duas pecas 9:16 lado a lado sairiam com ~300px cada e os numeros ficariam
// pequenos demais para conferir — que e justamente o que esta fase existe para
// permitir. As acoes ficam no footer do BottomSheet, entao rolar nao afasta o
// botao.

import { H, W } from '../../lib/informativos/story-layout';

interface InformativoRevisaoProps {
  mercadoRef: React.RefObject<HTMLCanvasElement | null>;
  meteoRef: React.RefObject<HTMLCanvasElement | null>;
  incluiMeteo: boolean;
  busy: boolean;
  onDownloadMercado: () => void;
  onDownloadMeteo: () => void;
}

export function InformativoRevisao({
  mercadoRef,
  meteoRef,
  incluiMeteo,
  busy,
  onDownloadMercado,
  onDownloadMeteo,
}: InformativoRevisaoProps) {
  return (
    <div className="inf-form ifm-revisao">
      <p className="ifm-preview-hint">Confira antes de publicar.</p>

      <article className="ifm-revisao-piece">
        <header className="ifm-revisao-head">
          <h3 className="ifm-revisao-title">Mercado</h3>
          {/* Um "Baixar" por peca: cada botao e um gesto proprio, entao nao
              dispara o aviso de "varios downloads" do Chrome — e e a saida
              quando o compartilhamento com os dois arquivos nao e aceito. */}
          <button
            type="button"
            className="ifm-drop-link"
            onClick={onDownloadMercado}
            disabled={busy}
          >
            Baixar
          </button>
        </header>
        <div className="ifm-preview-frame">
          <canvas ref={mercadoRef} width={W} height={H} className="ifm-preview-canvas" />
        </div>
      </article>

      {incluiMeteo ? (
        <article className="ifm-revisao-piece">
          <header className="ifm-revisao-head">
            <h3 className="ifm-revisao-title">Meteorológico</h3>
            <button
              type="button"
              className="ifm-drop-link"
              onClick={onDownloadMeteo}
              disabled={busy}
            >
              Baixar
            </button>
          </header>
          <div className="ifm-preview-frame">
            <canvas ref={meteoRef} width={W} height={H} className="ifm-preview-canvas" />
          </div>
        </article>
      ) : null}
    </div>
  );
}
