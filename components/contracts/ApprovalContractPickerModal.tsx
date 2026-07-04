'use client';

// Aprovação do contrato (Fase I, D113/D117): modal de SELEÇÃO DE CONTRATO da
// porta /samples. Lista TODOS os contratos elegíveis (EMITIDO/FATURADO/PAGO)
// em view REDUZIDA (nº + comprador + data + sacas + selo de status — sem
// valores financeiros), do mais recente pro mais antigo, com busca CLIENT-SIDE
// (nº/comprador — o comprador vive no snapshot JSON, então o filtro é no
// front; 1 carga por abertura, cap 500 no backend) e o botão "Manual" no topo
// direito (etiqueta 100% manual, avulsa — auditada sem vínculo, D114).
// Molde = SaleContractLotPickerModal, sem o scroll infinito por cursor.
//
// Ao escolher, busca o PREFILL no picker (guard hydratingId + onDismissAttempt,
// como a hidratação do lot picker) e devolve via onPicked — o pai fecha o
// picker e abre o ApprovalLabelModal já preenchido (swap sem sobreposição).

import { useEffect, useMemo, useState } from 'react';

import { ApiError, getApprovalLabelPrefill, listApprovalContracts } from '../../lib/api-client';
import type { ApprovalContractOption, ApprovalLabelPrefill, SessionData } from '../../lib/types';
import { BottomSheet } from '../BottomSheet';
import { STATUS_META, STATUS_TEXT_COLOR, STATUS_TINT } from './SaleContractCard';

type ApprovalContractPickerModalProps = {
  session: SessionData;
  open: boolean;
  onClose: () => void;
  /** Contrato escolhido: devolve o prefill já buscado (hidratação no picker). */
  onPicked: (option: ApprovalContractOption, prefill: ApprovalLabelPrefill) => void;
  /** Botão "Manual" (topo direito): etiqueta em branco, sem contrato. */
  onManual: () => void;
  /** Pausa o arraste do sheet enquanto o formulário está aberto por cima. */
  dragDisabled?: boolean;
};

function formatContractDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export function ApprovalContractPickerModal({
  session,
  open,
  onClose,
  onPicked,
  onManual,
  dragDisabled = false,
}: ApprovalContractPickerModalProps) {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [items, setItems] = useState<ApprovalContractOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hydratingId, setHydratingId] = useState<string | null>(null);

  // Debounce da busca (o filtro é client-side; o debounce só evita re-filtrar
  // a cada tecla em listas grandes).
  useEffect(() => {
    const handle = setTimeout(() => setAppliedSearch(search.trim().toLowerCase()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  // 1 carga por abertura (o backend já filtra elegíveis + ordena desc).
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listApprovalContracts(session, { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        setItems(res.items);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar os contratos.');
        setItems([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [session, open]);

  const filtered = useMemo(() => {
    if (!appliedSearch) return items;
    return items.filter(
      (item) =>
        item.contractNumber.toLowerCase().includes(appliedSearch) ||
        (item.buyerName ?? '').toLowerCase().includes(appliedSearch)
    );
  }, [items, appliedSearch]);

  async function handlePick(option: ApprovalContractOption) {
    if (hydratingId) return;
    setHydratingId(option.id);
    setError(null);
    try {
      const prefill = await getApprovalLabelPrefill(session, option.id);
      onPicked(option, prefill);
      // O pai fecha o picker no mesmo batch; limpa o guard pro caso do "Voltar"
      // reabrir este mesmo picker (componente segue montado).
      setHydratingId(null);
    } catch (cause) {
      setHydratingId(null);
      setError(
        cause instanceof ApiError && cause.status === 409
          ? 'Este contrato não está mais elegível para aprovação.'
          : cause instanceof ApiError
            ? cause.message
            : 'Falha ao abrir o contrato.'
      );
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDismissAttempt={() => hydratingId === null}
      title="Selecionar contrato"
      ariaLabel="Selecionar contrato"
      dragDisabled={dragDisabled}
      className="ctr-form-sheet ctr-lotpick-sheet is-fit-content"
    >
      <div className="apick-toolbar">
        <p className="lotpick-hint">A etiqueta parte de um contrato emitido.</p>
        <button
          type="button"
          className="apick-manual-btn"
          onClick={onManual}
          disabled={hydratingId != null}
        >
          Manual
        </button>
      </div>

      <div className="lotpick-search">
        <input
          className="app-modal-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nº do contrato ou comprador..."
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {error ? <p className="sdv-modal-error lotpick-error">{error}</p> : null}

      <div className="lotpick-list">
        {loading ? (
          <p className="lotpick-status">Carregando contratos...</p>
        ) : filtered.length === 0 ? (
          <p className="lotpick-status">
            {appliedSearch
              ? 'Nenhum contrato encontrado.'
              : 'Nenhum contrato elegível. Use "Manual" para uma etiqueta avulsa.'}
          </p>
        ) : (
          filtered.map((option) => {
            const meta = STATUS_META[option.status];
            return (
              <button
                key={option.id}
                type="button"
                className="spv2-card is-card-open lotpick-card"
                onClick={() => void handlePick(option)}
              >
                <span className="spv2-card-bar" aria-hidden="true" />
                <span className="spv2-card-content">
                  <span className="spv2-card-top">
                    <span className="spv2-card-code">{option.contractNumber}</span>
                    <span
                      className="spv2-card-badge"
                      style={{
                        background: STATUS_TINT[option.status],
                        color: STATUS_TEXT_COLOR[option.status],
                      }}
                    >
                      {meta.label}
                    </span>
                  </span>
                  <span className="spv2-card-bottom">
                    <span className="spv2-card-owner">{option.buyerName ?? 'Sem comprador'}</span>
                    <span className="spv2-card-sep" aria-hidden="true" />
                    <span className="spv2-card-detail">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <path d="M16 2v4M8 2v4M3 10h18" />
                      </svg>
                      {formatContractDate(option.contractDate)}
                    </span>
                    <span className="spv2-card-sep" aria-hidden="true" />
                    <span className="spv2-card-detail">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="2" y="7" width="20" height="14" rx="2" />
                        <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
                      </svg>
                      {option.quantitySacks} sacas
                    </span>
                  </span>
                </span>
                <svg className="spv2-card-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            );
          })
        )}
      </div>
    </BottomSheet>
  );
}
