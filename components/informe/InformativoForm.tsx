'use client';

// Roteador das 3 fases do Informativo: mercado -> meteorologico -> revisao.
// Apresentacional: quem e dono do estado, das canvases e das acoes e o
// InformativoFormSheet (as acoes vivem no footer do BottomSheet, que so quem
// monta o sheet consegue preencher).

import { InformativoMercadoFields } from './InformativoMercadoFields';
import { InformativoMeteoFields } from './InformativoMeteoFields';
import { InformativoRevisao } from './InformativoRevisao';
import {
  type InformativoDraft,
  type MercadoFields,
  type MeteoFields,
} from '../../lib/informativos/informativo-draft';
import { type SlowFields } from '../../lib/informativos/slow-fields-store';
import { type PrevisaoImage } from '../../lib/informativos/use-previsao-image';

interface InformativoFormProps {
  draft: InformativoDraft;
  error: string | null;
  busy: boolean;
  onPatchSlow: (patch: Partial<SlowFields>) => void;
  onPatchMercado: (patch: Partial<MercadoFields>) => void;
  onPatchMeteo: (patch: Partial<MeteoFields>) => void;
  invalid: (key: string) => boolean;
  previsao: PrevisaoImage | null;
  previsaoError: string | null;
  onAcceptPrevisao: (file: File | null | undefined) => void;
  onClearPrevisao: () => void;
  mercadoRef: React.RefObject<HTMLCanvasElement | null>;
  meteoRef: React.RefObject<HTMLCanvasElement | null>;
  onDownloadMercado: () => void;
  onDownloadMeteo: () => void;
}

export function InformativoForm({
  draft,
  error,
  busy,
  onPatchSlow,
  onPatchMercado,
  onPatchMeteo,
  invalid,
  previsao,
  previsaoError,
  onAcceptPrevisao,
  onClearPrevisao,
  mercadoRef,
  meteoRef,
  onDownloadMercado,
  onDownloadMeteo,
}: InformativoFormProps) {
  if (draft.phase === 'revisao') {
    return (
      <>
        <InformativoRevisao
          mercadoRef={mercadoRef}
          meteoRef={meteoRef}
          incluiMeteo={draft.incluiMeteo}
          busy={busy}
          onDownloadMercado={onDownloadMercado}
          onDownloadMeteo={onDownloadMeteo}
        />
        {error ? <p className="inf-card-error">{error}</p> : null}
      </>
    );
  }

  if (draft.phase === 'meteo') {
    return (
      <div className="inf-form">
        <InformativoMeteoFields
          fields={draft.meteo}
          onPatch={onPatchMeteo}
          previsao={previsao}
          previsaoError={previsaoError}
          onAcceptPrevisao={onAcceptPrevisao}
          onClearPrevisao={onClearPrevisao}
          invalid={invalid}
        />
        {error ? <p className="inf-card-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="inf-form">
      <InformativoMercadoFields
        slow={draft.slow}
        fields={draft.mercado}
        onPatchSlow={onPatchSlow}
        onPatch={onPatchMercado}
        invalid={invalid}
      />
      {error ? <p className="inf-card-error">{error}</p> : null}
    </div>
  );
}
