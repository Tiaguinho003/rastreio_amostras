'use client';

// Corpo do Informativo: DUAS colunas (RD16 §2.10 R10). A esquerda rola o
// formulario (mercado obrigatorio + meteorologico opcional via toggle); a
// direita fixa a previa 1080x1920 AO VIVO, com abas Mercado | Meteorológico.
//
// Apresentacional: quem e dono do estado, das canvases (montadas aqui mas
// pintadas la), das acoes e da validacao e o InformativoFormSheet — as acoes
// vivem no footer do BottomSheet, que so quem monta o sheet consegue preencher.

import { InformativoMercadoFields } from './InformativoMercadoFields';
import { InformativoMeteoFields } from './InformativoMeteoFields';
import {
  type InformativoDraft,
  type MercadoFields,
  type MeteoFields,
  type Secao,
} from '../../lib/informativos/informativo-draft';
import { H, W } from '../../lib/informativos/story-layout';
import { type SlowFields } from '../../lib/informativos/slow-fields-store';
import { type PrevisaoImage } from '../../lib/informativos/use-previsao-image';

interface InformativoFormProps {
  draft: InformativoDraft;
  error: string | null;
  onPatchSlow: (patch: Partial<SlowFields>) => void;
  onPatchMercado: (patch: Partial<MercadoFields>) => void;
  onPatchMeteo: (patch: Partial<MeteoFields>) => void;
  onToggleMeteo: (inclui: boolean) => void;
  invalidMercado: (key: string) => boolean;
  invalidMeteo: (key: string) => boolean;
  previsao: PrevisaoImage | null;
  previsaoError: string | null;
  onAcceptPrevisao: (file: File | null | undefined) => void;
  onClearPrevisao: () => void;
  mercadoRef: React.RefObject<HTMLCanvasElement | null>;
  meteoRef: React.RefObject<HTMLCanvasElement | null>;
  previewTab: Secao;
  onPreviewTab: (tab: Secao) => void;
}

export function InformativoForm({
  draft,
  error,
  onPatchSlow,
  onPatchMercado,
  onPatchMeteo,
  onToggleMeteo,
  invalidMercado,
  invalidMeteo,
  previsao,
  previsaoError,
  onAcceptPrevisao,
  onClearPrevisao,
  mercadoRef,
  meteoRef,
  previewTab,
  onPreviewTab,
}: InformativoFormProps) {
  return (
    <div className="ifm-workspace">
      <div className="ifm-form-pane">
        <div className="fv-form-body ifm-fields">
          <InformativoMercadoFields
            slow={draft.slow}
            fields={draft.mercado}
            onPatchSlow={onPatchSlow}
            onPatch={onPatchMercado}
            invalid={invalidMercado}
          />

          <div className="ifm-meteo-section">
            <div className="ifm-meteo-toggle">
              <div className="ifm-meteo-toggle-text">
                <h3 className="fv-form-heading">Informativo meteorológico</h3>
                <p className="ifm-group-hint">Opcional — a peça do tempo dos próximos dias.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.incluiMeteo}
                aria-label="Incluir informativo meteorológico"
                className={`ifm-switch${draft.incluiMeteo ? ' is-on' : ''}`}
                onClick={() => onToggleMeteo(!draft.incluiMeteo)}
              >
                <span className="ifm-switch-knob" aria-hidden="true" />
              </button>
            </div>

            {draft.incluiMeteo ? (
              <InformativoMeteoFields
                fields={draft.meteo}
                onPatch={onPatchMeteo}
                previsao={previsao}
                previsaoError={previsaoError}
                onAcceptPrevisao={onAcceptPrevisao}
                onClearPrevisao={onClearPrevisao}
                invalid={invalidMeteo}
              />
            ) : null}
          </div>
        </div>

        {error ? <p className="inf-card-error ifm-form-error">{error}</p> : null}
      </div>

      <div className="ifm-preview-pane">
        <div className="ifm-preview-tabs" role="tablist" aria-label="Prévia">
          <button
            type="button"
            role="tab"
            aria-selected={previewTab === 'mercado'}
            className={`ifm-preview-tab${previewTab === 'mercado' ? ' is-active' : ''}`}
            onClick={() => onPreviewTab('mercado')}
          >
            Mercado
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={previewTab === 'meteo'}
            className={`ifm-preview-tab${previewTab === 'meteo' ? ' is-active' : ''}`}
            onClick={() => onPreviewTab('meteo')}
            disabled={!draft.incluiMeteo}
          >
            Meteorológico
          </button>
        </div>

        {/* As DUAS canvases ficam montadas o tempo todo: a inativa some por CSS
            (display:none), mas o toBlob do download depende do bitmap dela. */}
        <div className="ifm-preview-stage">
          <canvas
            ref={mercadoRef}
            width={W}
            height={H}
            role="img"
            aria-label="Prévia do informativo de mercado"
            className={`ifm-stage-canvas${previewTab === 'mercado' ? ' is-active' : ''}`}
          />
          <canvas
            ref={meteoRef}
            width={W}
            height={H}
            role="img"
            aria-label="Prévia do informativo meteorológico"
            className={`ifm-stage-canvas${previewTab === 'meteo' && draft.incluiMeteo ? ' is-active' : ''}`}
          />
        </div>

        <p className="ifm-preview-note">A prévia atualiza enquanto você preenche.</p>
      </div>
    </div>
  );
}
