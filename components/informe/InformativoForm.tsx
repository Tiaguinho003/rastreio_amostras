'use client';

// Corpo do Informativo: DOIS blocos, cada peca FIXA ao lado do seu proprio
// formulario (RD16 §2.10, pedido do Flavio). Bloco 1 = mercado (form | previa
// de mercado); bloco 2 = meteorologico (toggle + form | previa do tempo). Nao
// ha mais abas Mercado|Meteo — cada previa e sticky ao lado da secao dela.
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
  /** Raiz do workspace — o sheet usa pra rolar ate o 1o campo faltante. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** 24 ou 72 — o registro fecha 72h na segunda (ver `registroEmHoras`). */
  registroHoras: 24 | 72;
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
  containerRef,
  registroHoras,
}: InformativoFormProps) {
  return (
    <div className="ifm-workspace" ref={containerRef}>
      {/* ── Bloco 1: mercado (form | previa fixa) ── */}
      <section className="ifm-block">
        <div className="ifm-form-pane">
          <div className="fv-form-body ifm-fields">
            <InformativoMercadoFields
              slow={draft.slow}
              fields={draft.mercado}
              onPatchSlow={onPatchSlow}
              onPatch={onPatchMercado}
              invalid={invalidMercado}
            />
          </div>
        </div>

        <div className="ifm-preview-pane">
          <div className="ifm-preview-stage">
            <canvas
              ref={mercadoRef}
              width={W}
              height={H}
              role="img"
              aria-label="Prévia do informativo de mercado"
              className="ifm-stage-canvas"
            />
          </div>
          <p className="ifm-preview-note">A prévia atualiza enquanto você preenche.</p>
        </div>
      </section>

      {/* ── Bloco 2: meteorologico (opcional) ── */}
      <section className={`ifm-block${draft.incluiMeteo ? '' : ' is-off'}`}>
        <div className="ifm-form-pane">
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
            <div className="fv-form-body ifm-fields">
              <InformativoMeteoFields
                fields={draft.meteo}
                onPatch={onPatchMeteo}
                previsao={previsao}
                previsaoError={previsaoError}
                onAcceptPrevisao={onAcceptPrevisao}
                onClearPrevisao={onClearPrevisao}
                invalid={invalidMeteo}
                registroHoras={registroHoras}
              />
            </div>
          ) : null}
        </div>

        {draft.incluiMeteo ? (
          <div className="ifm-preview-pane">
            <div className="ifm-preview-stage">
              <canvas
                ref={meteoRef}
                width={W}
                height={H}
                role="img"
                aria-label="Prévia do informativo meteorológico"
                className="ifm-stage-canvas"
              />
            </div>
            <p className="ifm-preview-note">A prévia atualiza enquanto você preenche.</p>
          </div>
        ) : null}
      </section>

      {error ? <p className="inf-card-error ifm-form-error">{error}</p> : null}
    </div>
  );
}
