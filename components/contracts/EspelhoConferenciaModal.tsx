'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { getSaleContract } from '../../lib/api-client';
import { espelhoEligibility, espelhoSides, type EspelhoSide } from '../../lib/espelho';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { SaleContract, SaleContractDetail, SessionData } from '../../lib/types';

// Re-export p/ compatibilidade (EspelhoCorretagemModal/ContratosPanel importam daqui).
export type { EspelhoSide };

type EspelhoConferenciaModalProps = {
  session: SessionData;
  contract: SaleContract;
  onClose: () => void;
  // "Gerar espelho": avança pra prévia do PDF com o lado escolhido.
  onConfirm: (side: EspelhoSide) => void;
  // "Ver detalhes": a página fecha a conferência, abre o Detalhes e REABRE a
  // conferência quando o Detalhes fechar (vai-e-volta, D134).
  onOpenDetails: () => void;
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function snapshotName(snap: Record<string, unknown> | null): string {
  if (!snap) return '—';
  const value = (snap.displayName ?? snap.legalName ?? snap.fullName) as string | undefined;
  return value && value.trim() ? value : '—';
}

function money(value: number | null): string {
  return value != null ? BRL.format(value) : '—';
}

function dateBR(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

// Espelho de Corretagem — fase de CONFERÊNCIA (D134): antes de gerar o PDF, o
// usuário confere os campos que sairão impressos (puxados do contrato FRESCO,
// refletindo o lado do toggle) e pode ir aos Detalhes do contrato pra revisar/
// editar. "Gerar espelho" abre a prévia (EspelhoCorretagemModal) com o lado
// escolhido — o toggle vive SÓ aqui.
export function EspelhoConferenciaModal({
  session,
  contract,
  onClose,
  onConfirm,
  onOpenDetails,
}: EspelhoConferenciaModalProps) {
  const focusTrapRef = useFocusTrap(true);
  // Re-busca o contrato FRESCO ao abrir: o prop vem da LISTA (cache), que pode
  // estar defasada (ex.: ágio aplicado, edição recém-feita nos Detalhes). O
  // fallback é o próprio prop enquanto a busca não chega.
  const [detail, setDetail] = useState<SaleContractDetail | null>(null);
  const view: SaleContract = detail ?? contract;

  // O espelho é direcionado a quem paga corretagem: só os lados com corretagem (> 0)
  // entram no toggle. SEM o fallback antigo dos-dois-lados — se o contrato FRESCO ficou
  // inelegível (perdeu corretagem / virou washout à-vista entre a lista e a abertura), a
  // tela avisa e bloqueia "Gerar espelho" em vez de mandar pra um 409 garantido na prévia.
  const availableSides = espelhoSides(view);
  const ineligible = !espelhoEligibility(view).eligible;
  const [side, setSide] = useState<EspelhoSide>(() => availableSides[0] ?? 'seller');

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const { contract: fresh } = await getSaleContract(session, contract.id);
        if (!aborted) setDetail(fresh);
      } catch {
        /* mantém o prop como fallback */
      }
    })();
    return () => {
      aborted = true;
    };
  }, [session, contract.id]);

  // Reconcilia o lado com o contrato fresco: se o lado corrente perdeu a
  // corretagem entre a lista e a abertura, salta pro primeiro disponível.
  useEffect(() => {
    if (!availableSides.includes(side)) {
      setSide(availableSides[0] ?? 'seller');
    }
    // availableSides é derivado de `view` — basta reagir à chegada do detail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const clientName = snapshotName(side === 'seller' ? view.sellerSnapshot : view.buyerSnapshot);
  const commission = side === 'seller' ? view.sellerBrokerageValue : view.buyerBrokerageValue;

  // Espelha os valores que o PDF imprime (D131–D133): Data = data de GERAÇÃO
  // (hoje); Preço = EFETIVO (cru ± ágio/deságio por saca).
  const generatedDate = new Date().toLocaleDateString('pt-BR');
  // Espelho (dedup): lê o preço efetivo da view (fonte única) em vez de recalcular.
  const effectiveUnitPrice = view.effectiveUnitPrice;
  const agioText =
    view.agioDesagioType && view.agioDesagioValue != null
      ? `${view.agioDesagioType === 'AGIO' ? 'Ágio' : 'Deságio'} · ${money(view.agioDesagioValue)}/sc`
      : null;

  return createPortal(
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ctr-espelho-conf-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="ctr-espelho-conf-title" className="app-modal-title">
              Conferir dados do espelho
            </h3>
            <p className="app-modal-subtitle">Contrato {contract.contractNumber}</p>
          </div>
          <button type="button" className="app-modal-close" onClick={onClose} aria-label="Fechar">
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="app-modal-content">
          <div className="ctr-espelho-side" role="group" aria-label="Parte do espelho">
            {availableSides.map((s) => (
              <button
                key={s}
                type="button"
                className={`ctr-espelho-side-btn${side === s ? ' is-active' : ''}`}
                aria-pressed={side === s}
                onClick={() => setSide(s)}
              >
                {s === 'seller' ? 'Vendedor' : 'Comprador'}
              </button>
            ))}
          </div>

          <div className="ctr-espelho-fields">
            <span className="ctr-espelho-summary-row is-full">
              <span className="ctr-espelho-summary-label">Cliente</span>
              <span className="ctr-espelho-summary-value">{clientName}</span>
            </span>
            <span className="ctr-espelho-summary-row">
              <span className="ctr-espelho-summary-label">Nº do contrato</span>
              <span className="ctr-espelho-summary-value">{view.contractNumber}</span>
            </span>
            <span className="ctr-espelho-summary-row">
              <span className="ctr-espelho-summary-label">Data (geração)</span>
              <span className="ctr-espelho-summary-value">{generatedDate}</span>
            </span>
            <span className="ctr-espelho-summary-row">
              <span className="ctr-espelho-summary-label">Pagamento</span>
              <span className="ctr-espelho-summary-value">{dateBR(view.paymentDate)}</span>
            </span>
            <span className="ctr-espelho-summary-row">
              <span className="ctr-espelho-summary-label">Preço/saca</span>
              <span className="ctr-espelho-summary-value">{money(effectiveUnitPrice)}</span>
            </span>
            {agioText ? (
              <span className="ctr-espelho-summary-row">
                <span className="ctr-espelho-summary-label">Ágio/Deságio</span>
                <span className="ctr-espelho-summary-value">{agioText}</span>
              </span>
            ) : null}
            <span className="ctr-espelho-summary-row">
              <span className="ctr-espelho-summary-label">Sacas</span>
              <span className="ctr-espelho-summary-value">{view.quantitySacks ?? '—'}</span>
            </span>
            <span className="ctr-espelho-summary-row">
              <span className="ctr-espelho-summary-label">Comissão</span>
              <span className="ctr-espelho-summary-value">{money(commission)}</span>
            </span>
            {view.purchaseNumber ? (
              <span className="ctr-espelho-summary-row">
                <span className="ctr-espelho-summary-label">Nº compra</span>
                <span className="ctr-espelho-summary-value">{view.purchaseNumber}</span>
              </span>
            ) : null}
          </div>

          {ineligible ? (
            <p className="sdv-modal-error">
              Este contrato não está mais elegível para o Espelho (sem corretagem ou cancelado à
              vista). Recarregue a lista.
            </p>
          ) : (
            <p className="ctr-espelho-conf-hint">
              Confira os dados acima. Para corrigir alguma informação, abra os detalhes do contrato.
            </p>
          )}
        </div>

        <div className="app-modal-actions">
          <button type="button" className="app-modal-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="ctr-btn" onClick={onOpenDetails}>
            Ver detalhes
          </button>
          <button
            type="button"
            className="app-modal-submit"
            onClick={() => onConfirm(side)}
            disabled={ineligible}
          >
            Gerar espelho
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
