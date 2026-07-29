'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

import { applyAgioSaleContract, ApiError } from '../../lib/api-client';
import { formatCurrencyValue, maskCurrencyInput, parseCurrencyInput } from '../../lib/currency';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { AgioDesagioType, SaleContract, SessionData } from '../../lib/types';

// Fechamento (D87): "Aplicar ágio/deságio" num contrato EMITIDO. Substitui o
// ágio vigente (sempre sobre o preço cru, D88) e recalcula total + corretagem no
// servidor; prévia ao vivo espelha computeContractMoneyWithAgio. Molde do shell
// do SaleContractLifecycleDialog (.app-modal.is-themed.is-action).

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
// Espelha o round2 do backend (`sale-contract-support.js`) — RC-D108. Tem que ser a
// MESMA conta, senão a prévia mostra um centavo de diferença do valor gravado. O
// Number.EPSILON que estava aqui é inócuo na faixa de valores do negócio e derrubava
// o meio-centavo; ver o comentário longo no backend para o porquê.
const round2 = (n: number) =>
  Number.isFinite(n) ? Math.round(Number((n * 100).toPrecision(15))) / 100 : n;

type SaleContractAgioDialogProps = {
  session: SessionData;
  contract: SaleContract;
  agioType: AgioDesagioType;
  onClose: () => void;
  onDone: () => void;
};

export function SaleContractAgioDialog({
  session,
  contract,
  agioType,
  onClose,
  onDone,
}: SaleContractAgioDialogProps) {
  const focusTrapRef = useFocusTrap(true);
  // Pré-preenche o valor vigente só quando o tipo escolhido bate com o do
  // contrato (senão começa vazio — é uma troca de sinal).
  const [value, setValue] = useState(() =>
    contract.agioDesagioType === agioType ? formatCurrencyValue(contract.agioDesagioValue) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAgio = agioType === 'AGIO';
  const title = isAgio ? 'Aplicar ágio' : 'Aplicar deságio';
  const parsed = parseCurrencyInput(value);
  // Prévia (espelha o backend): preço efetivo/saca = preço ± valor; total =
  // efetivo × sacas; corretagem de cada lado = total × %. v=0 mostra a base.
  const unitPrice = contract.unitPrice ?? 0;
  const sacks = contract.quantitySacks;
  const sellerPct = contract.sellerBrokeragePct ?? 0;
  const buyerPct = contract.buyerBrokeragePct ?? 0;
  const v = parsed ?? 0;
  const effectiveUnit = round2(isAgio ? unitPrice + v : unitPrice - v);
  const newTotal = round2(effectiveUnit * sacks);
  const newSellerValue = round2((newTotal * sellerPct) / 100);
  const newBuyerValue = round2((newTotal * buyerPct) / 100);

  // Deságio não pode zerar/inverter o preço (o backend rejeita; aqui bloqueia antes).
  const desagioExceeds = !isAgio && parsed !== null && parsed >= unitPrice;
  const canSubmit = !saving && parsed !== null && parsed > 0 && !desagioExceeds;

  async function handleSubmit() {
    if (parsed === null || parsed <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }
    if (desagioExceeds) {
      setError(
        `O deságio não pode ser maior ou igual ao preço por saca (${BRL.format(unitPrice)}).`
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await applyAgioSaleContract(session, contract.id, {
        expectedVersion: contract.version,
        agioDesagioType: agioType,
        agioDesagioValue: parsed,
      });
      onDone();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError('Este contrato foi modificado. Recarregue a página e tente de novo.');
      } else {
        setError(cause instanceof ApiError ? cause.message : 'Falha ao aplicar o ágio/deságio.');
      }
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action sample-detail-compact-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ctr-agio-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="ctr-agio-title" className="app-modal-title">
              {title}
            </h3>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        {error ? (
          <p className="sdv-modal-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="app-modal-content">
          <p className="ctr-confirm-text">
            {isAgio ? 'Ágio' : 'Deságio'} sobre o preço por saca do contrato{' '}
            {contract.contractNumber}. Substitui o valor vigente e recalcula o total e a corretagem.
          </p>

          <label className="app-modal-field">
            <span className="app-modal-label">Valor (R$/saca)</span>
            <input
              className="app-modal-input"
              type="text"
              inputMode="numeric"
              value={value}
              disabled={saving}
              placeholder="0,00"
              onChange={(event) => {
                setValue(maskCurrencyInput(event.target.value));
                setError(null);
              }}
            />
          </label>

          {desagioExceeds ? (
            <p className="app-modal-field-error" role="alert">
              O deságio não pode ser ≥ o preço por saca ({BRL.format(unitPrice)}).
            </p>
          ) : null}

          <dl className="ctr-agio-preview">
            <div className="ctr-agio-preview-row">
              <dt>Preço efetivo/saca</dt>
              <dd>
                {BRL.format(effectiveUnit)}
                <span className="ctr-agio-preview-base"> (base {BRL.format(unitPrice)})</span>
              </dd>
            </div>
            <div className="ctr-agio-preview-row">
              <dt>Valor total</dt>
              <dd>
                {BRL.format(newTotal)}
                {contract.totalValue != null ? (
                  <span className="ctr-agio-preview-base">
                    {' '}
                    (atual {BRL.format(contract.totalValue)})
                  </span>
                ) : null}
              </dd>
            </div>
            <div className="ctr-agio-preview-row">
              <dt>Corretagem</dt>
              <dd>
                vend. {BRL.format(newSellerValue)} · comp. {BRL.format(newBuyerValue)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="app-modal-actions">
          <button type="button" className="app-modal-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="app-modal-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {saving ? 'Aplicando...' : 'Aplicar'}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
