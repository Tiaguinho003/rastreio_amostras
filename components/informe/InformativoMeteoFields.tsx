'use client';

// Campos do Informativo Meteorologico: 5 valores + o print da previsao.
//
// Bem menos que os 21 do mercado — e por isso que a fase e rapida. Os rotulos
// (TEMPERATURA, REGISTRO EM 24h...) sao fixos na peca; aqui so entram os
// numeros, sem unidade (INF19).

import { maskPluviosidade, maskTemperatura, maskUmidade } from '../../lib/informativos/format';
import { type MeteoFields } from '../../lib/informativos/informativo-draft';
import { type PrevisaoImage } from '../../lib/informativos/use-previsao-image';
import { PrevisaoPicker } from './PrevisaoPicker';

interface InformativoMeteoFieldsProps {
  fields: MeteoFields;
  onPatch: (patch: Partial<MeteoFields>) => void;
  previsao: PrevisaoImage | null;
  previsaoError: string | null;
  onAcceptPrevisao: (file: File | null | undefined) => void;
  onClearPrevisao: () => void;
  invalid: (key: string) => boolean;
}

export function InformativoMeteoFields({
  fields,
  onPatch,
  previsao,
  previsaoError,
  onAcceptPrevisao,
  onClearPrevisao,
  invalid,
}: InformativoMeteoFieldsProps) {
  const cls = (key: string) => `inf-input${invalid(key) ? ' has-error' : ''}`;

  return (
    <>
      <section className="inf-card">
        <header className="inf-card-head">
          <span className="inf-card-num" aria-hidden="true">
            1
          </span>
          <div className="inf-card-head-text">
            <h3 className="inf-card-title">Agora</h3>
            <p className="inf-card-sub">No momento da publicação</p>
          </div>
        </header>

        <div className="ifm-pair">
          <label className="inf-field">
            <span className="inf-field-label">Temperatura</span>
            <input
              className={cls('temperatura')}
              value={fields.temperatura}
              inputMode="text"
              placeholder="15,5"
              onChange={(e) => onPatch({ temperatura: maskTemperatura(e.target.value) })}
            />
            <span className="ifm-unit">°C</span>
          </label>

          <label className="inf-field">
            <span className="inf-field-label">Umidade do ar</span>
            <input
              className={cls('umidade')}
              value={fields.umidade}
              inputMode="numeric"
              placeholder="68"
              onChange={(e) => onPatch({ umidade: maskUmidade(e.target.value) })}
            />
            <span className="ifm-unit">%</span>
          </label>
        </div>
      </section>

      <section className="inf-card">
        <header className="inf-card-head">
          <span className="inf-card-num" aria-hidden="true">
            2
          </span>
          <div className="inf-card-head-text">
            <h3 className="inf-card-title">Registro em 24h</h3>
            <p className="inf-card-sub">Use “-” para temperatura negativa</p>
          </div>
        </header>

        <div className="ifm-pair">
          <label className="inf-field">
            <span className="inf-field-label">Máxima</span>
            <input
              className={cls('maxima')}
              value={fields.maxima}
              inputMode="text"
              placeholder="22,1"
              onChange={(e) => onPatch({ maxima: maskTemperatura(e.target.value) })}
            />
            <span className="ifm-unit">°C</span>
          </label>

          <label className="inf-field">
            <span className="inf-field-label">Mínima</span>
            <input
              className={cls('minima')}
              value={fields.minima}
              inputMode="text"
              placeholder="13,7"
              onChange={(e) => onPatch({ minima: maskTemperatura(e.target.value) })}
            />
            <span className="ifm-unit">°C</span>
          </label>
        </div>

        <label className="inf-field">
          <span className="inf-field-label">Pluviosidade</span>
          <input
            className={cls('pluviosidade')}
            value={fields.pluviosidade}
            inputMode="numeric"
            placeholder="0,0"
            onChange={(e) => onPatch({ pluviosidade: maskPluviosidade(e.target.value) })}
          />
          <span className="ifm-unit">mm</span>
        </label>
      </section>

      <section className="inf-card">
        <header className="inf-card-head">
          <span className="inf-card-num" aria-hidden="true">
            3
          </span>
          <div className="inf-card-head-text">
            <h3 className="inf-card-title">Previsão do tempo</h3>
            <p className="inf-card-sub">O print da linha dos próximos dias</p>
          </div>
        </header>

        <PrevisaoPicker
          previsao={previsao}
          error={previsaoError}
          invalid={invalid('previsao')}
          onAccept={onAcceptPrevisao}
          onClear={onClearPrevisao}
        />
      </section>
    </>
  );
}
