'use client';

// Campos do Informativo de Mercado: 21 controles em 4 cards (INF28 — todos
// obrigatorios).
//
// Reusa o kit legado do Informativo (.inf-card/.inf-field/.inf-pill) e
// acrescenta so o que e proprio da peca, no prefixo .ifm-. (A visita/semanal
// migraram para o kit institucional .fv-form-* na RD16 §2.10; o Informativo
// segue no kit .inf-* por ser um wizard/canvas proprio — R-D5.)

import {
  MAX_LEN,
  maskAnoInput,
  maskBolsa,
  maskDolar,
  maskPreco,
  maskSafraInput,
  maskUpperInput,
  maskVariacao,
} from '../../lib/informativos/format';
import { type MercadoFields } from '../../lib/informativos/informativo-draft';
import { type SlowFields } from '../../lib/informativos/slow-fields-store';

interface InformativoMercadoFieldsProps {
  slow: SlowFields;
  fields: MercadoFields;
  onPatchSlow: (patch: Partial<SlowFields>) => void;
  onPatch: (patch: Partial<MercadoFields>) => void;
  invalid: (key: string) => boolean;
}

export function InformativoMercadoFields({
  slow,
  fields,
  onPatchSlow,
  onPatch,
  invalid,
}: InformativoMercadoFieldsProps) {
  const cls = (key: string) => `inf-input${invalid(key) ? ' has-error' : ''}`;

  return (
    <>
      <section className="inf-card">
        <header className="inf-card-head">
          <span className="inf-card-num" aria-hidden="true">
            1
          </span>
          <div className="inf-card-head-text">
            <h3 className="inf-card-title">Resumo do mercado</h3>
            <p className="inf-card-sub">A data de hoje entra sozinha na peça</p>
          </div>
        </header>

        <label className="inf-field">
          <span className="inf-field-label">Bolsa NY</span>
          <input
            className={cls('bolsaLabel')}
            value={slow.bolsaLabel}
            inputMode="text"
            placeholder="Bolsa NY - mai/26"
            onChange={(e) =>
              onPatchSlow({ bolsaLabel: maskUpperInput(e.target.value, MAX_LEN.bolsaLabel) })
            }
          />
        </label>

        <div className="ifm-pair">
          <label className="inf-field">
            <span className="inf-field-label">Valor da bolsa</span>
            <input
              className={cls('bolsa')}
              value={fields.bolsa}
              inputMode="numeric"
              placeholder="292,65"
              onChange={(e) => onPatch({ bolsa: maskBolsa(e.target.value) })}
            />
            <span className="ifm-unit">Usc/lp</span>
          </label>

          <label className="inf-field">
            <span className="inf-field-label">Dólar</span>
            <input
              className={cls('dolar')}
              value={fields.dolar}
              inputMode="numeric"
              placeholder="5,2303"
              onChange={(e) => onPatch({ dolar: maskDolar(e.target.value) })}
            />
            <span className="ifm-unit">R$/US$</span>
          </label>
        </div>

        <div className="inf-field">
          <span className="inf-field-label">Variação</span>
          <div
            className="inf-choice-grid ifm-dir-grid"
            role="group"
            aria-label="Direção da variação"
          >
            <button
              type="button"
              className={`inf-pill ifm-dir${fields.variacaoDir === 'alta' ? ' is-selected is-alta' : ''}`}
              aria-pressed={fields.variacaoDir === 'alta'}
              onClick={() => onPatch({ variacaoDir: 'alta' })}
            >
              <span className="ifm-dir-arrow is-up" aria-hidden="true" />
              Alta
            </button>
            <button
              type="button"
              className={`inf-pill ifm-dir${fields.variacaoDir === 'baixa' ? ' is-selected is-baixa' : ''}`}
              aria-pressed={fields.variacaoDir === 'baixa'}
              onClick={() => onPatch({ variacaoDir: 'baixa' })}
            >
              <span className="ifm-dir-arrow is-down" aria-hidden="true" />
              Baixa
            </button>
          </div>
        </div>

        <label className="inf-field">
          <span className="inf-field-label">Pontos</span>
          <input
            className={cls('variacao')}
            value={fields.variacao}
            inputMode="numeric"
            placeholder="20"
            onChange={(e) => onPatch({ variacao: maskVariacao(e.target.value) })}
          />
          <span className="ifm-unit">pts</span>
        </label>
      </section>

      <section className="inf-card">
        <header className="inf-card-head">
          <span className="inf-card-num" aria-hidden="true">
            2
          </span>
          <div className="inf-card-head-text">
            <h3 className="inf-card-title">Mercado físico</h3>
            <p className="inf-card-sub">Café tipo 6/7, preço livre</p>
          </div>
        </header>

        <div className="ifm-pair">
          <label className="inf-field">
            <span className="inf-field-label">Safra</span>
            <input
              className={cls('safra')}
              value={slow.safra}
              inputMode="numeric"
              placeholder="25/26"
              onChange={(e) => onPatchSlow({ safra: maskSafraInput(e.target.value) })}
            />
          </label>

          <label className="inf-field">
            <span className="inf-field-label">Preço</span>
            <input
              className={cls('fisicoPreco')}
              value={fields.fisicoPreco}
              inputMode="numeric"
              placeholder="1.960,00"
              onChange={(e) => onPatch({ fisicoPreco: maskPreco(e.target.value) })}
            />
            <span className="ifm-unit">R$</span>
          </label>
        </div>
      </section>

      <section className="inf-card">
        <header className="inf-card-head">
          <span className="inf-card-num" aria-hidden="true">
            3
          </span>
          <div className="inf-card-head-text">
            <h3 className="inf-card-title">Mercado futuro</h3>
            <p className="inf-card-sub">Preço livre, duas safras</p>
          </div>
        </header>

        <div className="ifm-pair">
          <label className="inf-field">
            <span className="inf-field-label">Ano da coluna 1</span>
            <input
              className={cls('futuroAnoA')}
              value={slow.futuroAnoA}
              inputMode="numeric"
              placeholder="2026"
              onChange={(e) => onPatchSlow({ futuroAnoA: maskAnoInput(e.target.value) })}
            />
          </label>
          <label className="inf-field">
            <span className="inf-field-label">Ano da coluna 2</span>
            <input
              className={cls('futuroAnoB')}
              value={slow.futuroAnoB}
              inputMode="numeric"
              placeholder="2027"
              onChange={(e) => onPatchSlow({ futuroAnoB: maskAnoInput(e.target.value) })}
            />
          </label>
        </div>

        {([1, 2] as const).map((n) => {
          const mesAKey = `mesA${n}` as const;
          const mesBKey = `mesB${n}` as const;
          const precoAKey = `precoA${n}` as const;
          const precoBKey = `precoB${n}` as const;
          return (
            <div className="ifm-row-group" key={n}>
              <span className="ifm-row-legend">Linha {n}</span>
              <div className="ifm-quad">
                <label className="inf-field">
                  <span className="inf-field-label">Mês {slow.futuroAnoA || '(coluna 1)'}</span>
                  <input
                    className={cls(mesAKey)}
                    value={slow[mesAKey]}
                    placeholder="AGO"
                    onChange={(e) =>
                      onPatchSlow({ [mesAKey]: maskUpperInput(e.target.value, MAX_LEN.mes) })
                    }
                  />
                </label>
                <label className="inf-field">
                  <span className="inf-field-label">Preço</span>
                  <input
                    className={cls(precoAKey)}
                    value={fields[precoAKey]}
                    inputMode="numeric"
                    placeholder="1.690,00"
                    onChange={(e) => onPatch({ [precoAKey]: maskPreco(e.target.value) })}
                  />
                </label>
                <label className="inf-field">
                  <span className="inf-field-label">Mês {slow.futuroAnoB || '(coluna 2)'}</span>
                  <input
                    className={cls(mesBKey)}
                    value={slow[mesBKey]}
                    placeholder="AGO"
                    onChange={(e) =>
                      onPatchSlow({ [mesBKey]: maskUpperInput(e.target.value, MAX_LEN.mes) })
                    }
                  />
                </label>
                <label className="inf-field">
                  <span className="inf-field-label">Preço</span>
                  <input
                    className={cls(precoBKey)}
                    value={fields[precoBKey]}
                    inputMode="numeric"
                    placeholder="1.620,00"
                    onChange={(e) => onPatch({ [precoBKey]: maskPreco(e.target.value) })}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </section>

      <section className="inf-card">
        <header className="inf-card-head">
          <span className="inf-card-num" aria-hidden="true">
            4
          </span>
          <div className="inf-card-head-text">
            <h3 className="inf-card-title">CPR — mercado futuro</h3>
            <p className="inf-card-sub">Um valor por ano</p>
          </div>
        </header>

        <div className="ifm-quad">
          <label className="inf-field">
            <span className="inf-field-label">Ano da coluna 1</span>
            <input
              className={cls('cprAnoA')}
              value={slow.cprAnoA}
              inputMode="numeric"
              placeholder="2026"
              onChange={(e) => onPatchSlow({ cprAnoA: maskAnoInput(e.target.value) })}
            />
          </label>
          <label className="inf-field">
            <span className="inf-field-label">Valor</span>
            <input
              className={cls('cprA')}
              value={fields.cprA}
              inputMode="numeric"
              placeholder="1.545,00"
              onChange={(e) => onPatch({ cprA: maskPreco(e.target.value) })}
            />
          </label>
          <label className="inf-field">
            <span className="inf-field-label">Ano da coluna 2</span>
            <input
              className={cls('cprAnoB')}
              value={slow.cprAnoB}
              inputMode="numeric"
              placeholder="2027"
              onChange={(e) => onPatchSlow({ cprAnoB: maskAnoInput(e.target.value) })}
            />
          </label>
          <label className="inf-field">
            <span className="inf-field-label">Valor</span>
            <input
              className={cls('cprB')}
              value={fields.cprB}
              inputMode="numeric"
              placeholder="1.245,00"
              onChange={(e) => onPatch({ cprB: maskPreco(e.target.value) })}
            />
          </label>
        </div>
      </section>
    </>
  );
}
