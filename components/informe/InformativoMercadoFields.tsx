'use client';

// Campos do Informativo de Mercado: 21 controles em 4 grupos (INF28 — todos
// obrigatorios), na MESMA ordem logica da peca (Resumo -> Fisico -> Futuro ->
// CPR).
//
// Layout compacto RD16 §2.10 (pedido do Flavio): campos enxutos com a cor
// padrao dos modais (`.app-modal-*`, escopada em `.informativo-sheet`), unidade
// DENTRO do rotulo (sem a linha `.ifm-unit`), variacao numa linha so com os
// botoes alta/baixa, e o mercado futuro agrupado POR ANO (uma coluna por ano,
// espelhando a arte) em vez de por "linha". Mantem o shell `.fv-form-heading`.

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
      <div className="ifm-group">
        <h3 className="fv-form-heading">Resumo do mercado</h3>

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
            <span className="inf-field-label">Valor (Usc/lp)</span>
            <input
              className={cls('bolsa')}
              value={fields.bolsa}
              inputMode="numeric"
              placeholder="292,65"
              onChange={(e) => onPatch({ bolsa: maskBolsa(e.target.value) })}
            />
          </label>

          <label className="inf-field">
            <span className="inf-field-label">Dólar (R$/US$)</span>
            <input
              className={cls('dolar')}
              value={fields.dolar}
              inputMode="numeric"
              placeholder="5,2303"
              onChange={(e) => onPatch({ dolar: maskDolar(e.target.value) })}
            />
          </label>
        </div>

        <div className={`inf-field ifm-var-field${invalid('variacaoDir') ? ' has-error' : ''}`}>
          <span className="inf-field-label">Variação (pts)</span>
          <div className="ifm-var-row">
            <input
              className={cls('variacao')}
              value={fields.variacao}
              inputMode="numeric"
              placeholder="20"
              aria-label="Pontos de variação"
              onChange={(e) => onPatch({ variacao: maskVariacao(e.target.value) })}
            />
            <button
              type="button"
              className={`inf-pill ifm-dir is-alta${fields.variacaoDir === 'alta' ? ' is-selected' : ''}`}
              aria-pressed={fields.variacaoDir === 'alta'}
              aria-label="Alta"
              onClick={() => onPatch({ variacaoDir: 'alta' })}
            >
              <span className="ifm-dir-arrow is-up" aria-hidden="true" />
              Alta
            </button>
            <button
              type="button"
              className={`inf-pill ifm-dir is-baixa${fields.variacaoDir === 'baixa' ? ' is-selected' : ''}`}
              aria-pressed={fields.variacaoDir === 'baixa'}
              aria-label="Baixa"
              onClick={() => onPatch({ variacaoDir: 'baixa' })}
            >
              <span className="ifm-dir-arrow is-down" aria-hidden="true" />
              Baixa
            </button>
          </div>
        </div>
      </div>

      <div className="ifm-group">
        <h3 className="fv-form-heading">Mercado físico</h3>

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
            <span className="inf-field-label">Preço (R$)</span>
            <input
              className={cls('fisicoPreco')}
              value={fields.fisicoPreco}
              inputMode="numeric"
              placeholder="1.960,00"
              onChange={(e) => onPatch({ fisicoPreco: maskPreco(e.target.value) })}
            />
          </label>
        </div>
      </div>

      <div className="ifm-group">
        <h3 className="fv-form-heading">Mercado futuro</h3>

        {/* Uma coluna por ANO, espelhando a arte: mesmo ano fica junto. Cada
            coluna = o ano + duas linhas Mês|Preço. */}
        <div className="ifm-year-cols">
          {(['A', 'B'] as const).map((col) => {
            const anoKey = `futuroAno${col}` as const;
            return (
              <div className="ifm-year-col" key={col}>
                <label className="inf-field">
                  <span className="inf-field-label">Ano</span>
                  <input
                    className={cls(anoKey)}
                    value={slow[anoKey]}
                    inputMode="numeric"
                    placeholder={col === 'A' ? '2026' : '2027'}
                    onChange={(e) => onPatchSlow({ [anoKey]: maskAnoInput(e.target.value) })}
                  />
                </label>

                {([1, 2] as const).map((n) => {
                  const mesKey = `mes${col}${n}` as const;
                  const precoKey = `preco${col}${n}` as const;
                  return (
                    <div className="ifm-mp-row" key={n}>
                      <label className="inf-field">
                        <span className="inf-field-label">Mês</span>
                        <input
                          className={cls(mesKey)}
                          value={slow[mesKey]}
                          placeholder="AGO"
                          onChange={(e) =>
                            onPatchSlow({ [mesKey]: maskUpperInput(e.target.value, MAX_LEN.mes) })
                          }
                        />
                      </label>
                      <label className="inf-field">
                        <span className="inf-field-label">Preço</span>
                        <input
                          className={cls(precoKey)}
                          value={fields[precoKey]}
                          inputMode="numeric"
                          placeholder="1.690,00"
                          onChange={(e) => onPatch({ [precoKey]: maskPreco(e.target.value) })}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="ifm-group">
        <h3 className="fv-form-heading">CPR — mercado futuro</h3>

        <div className="ifm-year-cols">
          {(['A', 'B'] as const).map((col) => {
            const anoKey = `cprAno${col}` as const;
            const valorKey = `cpr${col}` as const;
            return (
              <div className="ifm-year-col" key={col}>
                <label className="inf-field">
                  <span className="inf-field-label">Ano</span>
                  <input
                    className={cls(anoKey)}
                    value={slow[anoKey]}
                    inputMode="numeric"
                    placeholder={col === 'A' ? '2026' : '2027'}
                    onChange={(e) => onPatchSlow({ [anoKey]: maskAnoInput(e.target.value) })}
                  />
                </label>
                <label className="inf-field">
                  <span className="inf-field-label">Valor</span>
                  <input
                    className={cls(valorKey)}
                    value={fields[valorKey]}
                    inputMode="numeric"
                    placeholder={col === 'A' ? '1.545,00' : '1.245,00'}
                    onChange={(e) => onPatch({ [valorKey]: maskPreco(e.target.value) })}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
