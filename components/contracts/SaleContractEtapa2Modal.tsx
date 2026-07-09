'use client';

import { type CSSProperties, useEffect, useState } from 'react';

import {
  ApiError,
  createClientUnit,
  createContractLookup,
  createFutureSaleContract,
  createSpotSaleContract,
  emitSaleContract,
  getBlendFeasibility,
  getClient,
  getNextContractNumber,
  getSaleContract,
  listContractLookups,
  updateClient,
} from '../../lib/api-client';
import {
  formatCurrencyValue,
  maskCurrencyInput,
  parseCurrencyInput,
  parseDecimalBr,
} from '../../lib/currency';
import { BottomSheet } from '../BottomSheet';
import { BrokerMultiSelectField } from '../samples/BrokerMultiSelectField';
import { ClientLookupField } from '../clients/ClientLookupField';
import { ClientQuickCreateModal } from '../clients/ClientQuickCreateModal';
import { ClientUnitModal } from '../clients/ClientUnitModal';
import { ClientBankAccountSelectField } from './ClientBankAccountSelectField';
import { InlineSelectField } from './InlineSelectField';
import type {
  ClientSummary,
  ClientUnitInput,
  ClientUnitSummary,
  ContractLookupsResponse,
  SaleContractDetail,
  SaleContractEtapa2Input,
  SaleContractSaleFieldsInput,
  SessionData,
} from '../../lib/types';

type SaleContractEtapa2ModalProps = {
  session: SessionData;
  // Card "Editar": contrato existente.
  contractId?: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  // À VISTA: "Voltar" no rodapé retorna à seleção de lote (fecha este sheet e
  // reabre o picker). Ausente em Futuro/Editar, onde o rodapé mostra "Cancelar".
  onBack?: () => void;
  // Modo CRIACAO À VISTA (1 modal): vem do picker de lote. Mostra o bloco "Venda"
  // (sacas ≤ disponível; liga = 100% travado) + Vendedor pré-preenchido do dono do
  // lote + Comprador manual; o submit registra a venda no lote E cria o contrato
  // JA EMITIDO numa só chamada (createSpotSaleContract, D97).
  spotCreate?: {
    sampleId: string;
    sampleVersion: number;
    internalLotNumber: string | null;
    availableSacks: number;
    isBlend: boolean;
    ownerClientId: string | null;
    nextNumber: string | null;
  };
  // Modo CRIACAO FUTURO (1 modal): sem lote/contrato. Mostra o bloco "Venda"
  // (vazio, sacas LIVRES) + Vendedor/Comprador manuais; o submit cria o contrato
  // FUTURO JA EMITIDO numa só chamada (createFutureSaleContract, D97).
  futureCreate?: boolean;
};

function dateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

function unitLabel(unit: ClientUnitSummary): string {
  return unit.name ?? `Filial ${unit.code}`;
}

// Fechamento: modal do contrato. 3 modos: "Editar" (contrato existente, via
// contractId → emitSaleContract) e criação em 1 modal — À VISTA (spotCreate, vem
// do picker de lote → createSpotSaleContract) ou FUTURO (futureCreate, sem lote →
// createFutureSaleContract). Na criação o contrato nasce EMITIDO numa só chamada
// (D97). Pre-preenche via getSaleContract/getClient + listContractLookups.
export function SaleContractEtapa2Modal({
  session,
  open,
  contractId,
  onClose,
  onSaved,
  onBack,
  spotCreate,
  futureCreate = false,
}: SaleContractEtapa2ModalProps) {
  // Modos de criação em 1 modal: à vista (spotCreate, do picker) ou Futuro.
  const isSpotCreate = spotCreate != null;
  const isCreateLike = isSpotCreate || futureCreate;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contract, setContract] = useState<SaleContractDetail | null>(null);
  const [lookups, setLookups] = useState<ContractLookupsResponse | null>(null);
  // Preview do número do contrato no modo Futuro (gerado de fato no submit;
  // sequência contínua com o à vista). À vista traz via spotCreate.nextNumber.
  const [futureNumber, setFutureNumber] = useState<string | null>(null);

  // Partes / banco / armazens
  const [seller, setSeller] = useState<ClientSummary | null>(null);
  const [sellerUnits, setSellerUnits] = useState<ClientUnitSummary[]>([]);
  const [sellerUnitId, setSellerUnitId] = useState('');
  const [buyer, setBuyer] = useState<ClientSummary | null>(null);
  const [buyerUnits, setBuyerUnits] = useState<ClientUnitSummary[]>([]);
  const [buyerUnitId, setBuyerUnitId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [buyerWarehouse, setBuyerWarehouse] = useState<ClientSummary | null>(null);
  const [sellerWarehouse, setSellerWarehouse] = useState<ClientSummary | null>(null);

  // Cadastro inline (vendedor / armazem) — espelha o comprador da Etapa 1.
  const [sellerCreateOpen, setSellerCreateOpen] = useState(false);
  const [sellerCreateSeed, setSellerCreateSeed] = useState('');
  const [warehouseCreateFor, setWarehouseCreateFor] = useState<'buyer' | 'seller' | null>(null);
  const [warehouseCreateSeed, setWarehouseCreateSeed] = useState('');
  const [buyerCreateOpen, setBuyerCreateOpen] = useState(false);
  const [buyerCreateSeed, setBuyerCreateSeed] = useState('');

  // Fase 1 (venda) — bloco "Venda" do modal (card-edit, à vista e Futuro). Sacas
  // travam em liga (sampleIsBlend / spotCreate liga).
  const [saleSacks, setSaleSacks] = useState('');
  const [saleUnitPrice, setSaleUnitPrice] = useState('');
  const [saleSellerPct, setSaleSellerPct] = useState('');
  const [saleBuyerPct, setSaleBuyerPct] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const [saleBrokerIds, setSaleBrokerIds] = useState<string[]>([]);
  const [sampleIsBlend, setSampleIsBlend] = useState(false);

  // À vista (spotCreate) liga: viabilidade da cascata (bloqueia venda inviável).
  const [blendInfeasible, setBlendInfeasible] = useState(false);
  const [feasibilityError, setFeasibilityError] = useState<string | null>(null);

  // Campos simples
  const [purchaseNumber, setPurchaseNumber] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [agioType, setAgioType] = useState<'' | 'AGIO' | 'DESAGIO'>('');
  const [agioValue, setAgioValue] = useState('');
  const [paymentFormId, setPaymentFormId] = useState('');
  const [modalityId, setModalityId] = useState('');
  const [packagingId, setPackagingId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [observations, setObservations] = useState('');
  const [description, setDescription] = useState('');
  // Aprovacao (reforma AP1/AP6): sinal obrigatorio (null = nao escolhido, trava a
  // conclusao) + lembrete em dias (string, molde weightKg; so vale quando "Sim").
  const [requiresApproval, setRequiresApproval] = useState<boolean | null>(null);
  const [approvalReminderLeadDays, setApprovalReminderLeadDays] = useState('30');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sub-modais de "+cadastrar filial"
  const [unitModalFor, setUnitModalFor] = useState<'seller' | 'buyer' | null>(null);
  const [savingUnit, setSavingUnit] = useState(false);
  const [unitError, setUnitError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        // Modo CRIACAO À VISTA (1 modal): vem do picker de lote. Carrega lookups,
        // pré-preenche o vendedor (dono do lote, se houver), semeia o blend e — para
        // liga — semeia sacas = 100% e checa a viabilidade da cascata.
        if (spotCreate) {
          const lookupsRes = await listContractLookups(session);
          if (aborted) return;
          setLookups(lookupsRes);
          setContract(null);
          setSampleIsBlend(spotCreate.isBlend);
          if (spotCreate.isBlend) {
            setSaleSacks(String(spotCreate.availableSacks));
          }
          if (spotCreate.ownerClientId) {
            const sellerD = await getClient(session, spotCreate.ownerClientId).catch(() => null);
            if (aborted) return;
            if (sellerD) {
              setSeller(sellerD.client);
              setSellerUnits(sellerD.units);
            }
          }
          // Liga: viabilidade da venda (bloqueia se alguma origem não cobre a cascata).
          if (spotCreate.isBlend) {
            try {
              const feas = await getBlendFeasibility(session, spotCreate.sampleId);
              if (aborted) return;
              setBlendInfeasible(!feas.feasible);
            } catch (cause) {
              if (aborted) return;
              setFeasibilityError(
                cause instanceof ApiError
                  ? cause.message
                  : 'Falha ao verificar a viabilidade da liga'
              );
            }
          }
          return;
        }
        // Modo CRIACAO FUTURO (1 modal): sem lote/contrato — só carrega as listas;
        // Venda/Vendedor/Comprador começam vazios (sacas livres, sampleIsBlend false).
        if (futureCreate) {
          const lookupsRes = await listContractLookups(session);
          if (aborted) return;
          setLookups(lookupsRes);
          setContract(null);
          // Preview do número (opcional; o número real é gerado no submit).
          try {
            const { contractNumber } = await getNextContractNumber(session);
            if (!aborted) setFutureNumber(contractNumber);
          } catch {
            /* sem preview → cai para "—" */
          }
          return;
        }
        if (!contractId) return;
        const [contractRes, lookupsRes] = await Promise.all([
          getSaleContract(session, contractId),
          listContractLookups(session),
        ]);
        if (aborted) return;
        const c = contractRes.contract;
        setContract(c);
        setLookups(lookupsRes);
        setPurchaseNumber(c.purchaseNumber ?? '');
        setWeightKg(c.weightKg != null ? String(c.weightKg) : '');
        setAgioType(c.agioDesagioType ?? '');
        setAgioValue(formatCurrencyValue(c.agioDesagioValue));
        setPaymentFormId(c.paymentFormId ?? '');
        setModalityId(c.modalityId ?? '');
        setPackagingId(c.packagingId ?? '');
        setInvoiceDate(dateInputValue(c.invoiceDate));
        setPaymentDate(dateInputValue(c.paymentDate));
        setObservations(c.observations ?? '');
        setDescription(c.description ?? '');
        setRequiresApproval(c.requiresApproval);
        setApprovalReminderLeadDays(
          c.approvalReminderLeadDays != null ? String(c.approvalReminderLeadDays) : '30'
        );
        setSellerUnitId(c.sellerUnitId ?? '');
        setBuyerUnitId(c.buyerUnitId ?? '');
        setBankAccountId(c.sellerBankAccountId ?? '');
        // Fase 1 (venda) editavel
        setSaleSacks(String(c.quantitySacks));
        setSaleUnitPrice(formatCurrencyValue(c.unitPrice));
        setSaleSellerPct(c.sellerBrokeragePct != null ? String(c.sellerBrokeragePct) : '');
        setSaleBuyerPct(c.buyerBrokeragePct != null ? String(c.buyerBrokeragePct) : '');
        setSaleDate(dateInputValue(c.contractDate));
        setSaleBrokerIds(c.brokers.map((broker) => broker.brokerId));
        setSampleIsBlend(Boolean(c.sampleIsBlend));

        const [sellerD, buyerD, bwD, swD] = await Promise.all([
          c.sellerClientId ? getClient(session, c.sellerClientId).catch(() => null) : null,
          c.buyerClientId ? getClient(session, c.buyerClientId).catch(() => null) : null,
          c.buyerWarehouseClientId
            ? getClient(session, c.buyerWarehouseClientId).catch(() => null)
            : null,
          c.sellerWarehouseClientId
            ? getClient(session, c.sellerWarehouseClientId).catch(() => null)
            : null,
        ]);
        if (aborted) return;
        if (sellerD) {
          setSeller(sellerD.client);
          setSellerUnits(sellerD.units);
        }
        if (buyerD) {
          setBuyer(buyerD.client);
          setBuyerUnits(buyerD.units);
        }
        if (bwD) setBuyerWarehouse(bwD.client);
        if (swD) setSellerWarehouse(swD.client);
      } catch (cause) {
        if (!aborted) {
          setLoadError(cause instanceof ApiError ? cause.message : 'Falha ao carregar o contrato.');
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [session, contractId, spotCreate, futureCreate]);

  const sellerIsPF = seller?.personType === 'PF';
  const buyerIsPF = buyer?.personType === 'PF';

  async function handleSelectSeller(client: ClientSummary | null) {
    setSeller(client);
    setSellerUnitId('');
    setBankAccountId('');
    setError(null);
    if (!client) {
      setSellerUnits([]);
      return;
    }
    try {
      const detail = await getClient(session, client.id);
      setSeller(detail.client);
      setSellerUnits(detail.units);
    } catch {
      setSellerUnits(client.units ?? []);
    }
  }

  // Comprador editavel (P20): troca o comprador + zera/recarrega a filial dele
  // (a anterior era do comprador antigo). Molde do handleSelectSeller.
  async function handleSelectBuyer(client: ClientSummary | null) {
    setBuyer(client);
    setBuyerUnitId('');
    setError(null);
    if (!client) {
      setBuyerUnits([]);
      return;
    }
    try {
      const detail = await getClient(session, client.id);
      setBuyer(detail.client);
      setBuyerUnits(detail.units);
    } catch {
      setBuyerUnits(client.units ?? []);
    }
  }

  async function handleSelectWarehouse(which: 'buyer' | 'seller', client: ClientSummary | null) {
    if (which === 'buyer') setBuyerWarehouse(client);
    else setSellerWarehouse(client);
    setError(null);
    // D49: liga isWarehouse no cliente escolhido (best-effort — o contrato
    // guarda a referencia mesmo se isto falhar).
    if (client && !client.isWarehouse) {
      try {
        await updateClient(session, client.id, {
          isWarehouse: true,
          reasonText: 'Definido como armazem em um contrato (Fechamento)',
        });
      } catch {
        /* nao bloqueia o fluxo */
      }
    }
  }

  async function handleCreateUnit(data: ClientUnitInput) {
    const party = unitModalFor === 'seller' ? seller : buyer;
    if (!party) return;
    setSavingUnit(true);
    setUnitError(null);
    try {
      const res = await createClientUnit(session, party.id, data);
      const detail = await getClient(session, party.id);
      if (unitModalFor === 'seller') {
        setSellerUnits(detail.units);
        setSellerUnitId(res.unit.id);
      } else {
        setBuyerUnits(detail.units);
        setBuyerUnitId(res.unit.id);
      }
      setUnitModalFor(null);
    } catch (cause) {
      setUnitError(cause instanceof ApiError ? cause.message : 'Falha ao cadastrar a filial.');
    } finally {
      setSavingUnit(false);
    }
  }

  async function handleSubmit() {
    // Card: exige o contrato carregado. Criação (wizard/Futuro): não há contrato.
    if (!isCreateLike && !contract) return;
    // Erros por campo (molde da Etapa 1): mensagem especifica do 1o pendente.
    if (!seller) {
      setError('Selecione o vendedor.');
      return;
    }
    if (sellerIsPF && !sellerUnitId) {
      setError('Selecione a filial do vendedor.');
      return;
    }
    // Criação (à vista/Futuro): o comprador é obrigatório (vai na venda/contrato).
    if (isCreateLike && !buyer) {
      setError('Selecione o comprador.');
      return;
    }
    if (buyerIsPF && !buyerUnitId) {
      setError('Selecione a filial do comprador.');
      return;
    }
    if (!bankAccountId) {
      setError('Selecione o banco do vendedor.');
      return;
    }
    if (!paymentFormId) {
      setError('Selecione a forma de pagamento.');
      return;
    }
    if (!modalityId) {
      setError('Selecione a modalidade.');
      return;
    }
    if (!packagingId) {
      setError('Selecione a embalagem.');
      return;
    }
    if (!invoiceDate) {
      setError('Informe a data de faturamento.');
      return;
    }
    if (!paymentDate) {
      setError('Informe a data de pagamento.');
      return;
    }
    // Aprovacao (AP3): escolha obrigatoria. Quando "Sim", o lembrete e 1..365 dias.
    if (requiresApproval == null) {
      setError('Escolha se o contrato precisa de aprovação.');
      return;
    }
    if (requiresApproval) {
      const lead = Number(approvalReminderLeadDays);
      if (!approvalReminderLeadDays.trim() || !Number.isInteger(lead) || lead < 1 || lead > 365) {
        setError('Informe o lembrete entre 1 e 365 dias.');
        return;
      }
    }
    if (agioType !== '' && !agioValue.trim()) {
      setError('Informe o valor do ágio/deságio.');
      return;
    }

    // Fase 1 (venda) — todos os modos mostram o bloco "Venda". À vista: sacas ≤
    // saldo do lote (liga já vem travada em 100%). Liga inviável (à vista) bloqueia.
    if (isSpotCreate && blendInfeasible) {
      setError(feasibilityError ?? 'Liga inviável para venda — alguma origem não cobre a cascata.');
      return;
    }
    const sacks = Number(saleSacks);
    if (!saleSacks.trim() || !Number.isInteger(sacks) || sacks <= 0) {
      setError('Informe a quantidade de sacas.');
      return;
    }
    if (isSpotCreate && spotCreate && sacks > spotCreate.availableSacks) {
      setError(`Máximo de ${spotCreate.availableSacks} sacas disponíveis no lote.`);
      return;
    }
    const price = parseCurrencyInput(saleUnitPrice);
    if (!saleUnitPrice.trim() || price == null || price <= 0) {
      setError('Informe o preço por saca.');
      return;
    }
    const sellerPct = saleSellerPct.trim() === '' ? 0 : (parseDecimalBr(saleSellerPct) ?? NaN);
    if (Number.isNaN(sellerPct) || sellerPct < 0 || sellerPct > 100) {
      setError('Corretagem do vendedor inválida (0 a 100).');
      return;
    }
    const buyerPct = saleBuyerPct.trim() === '' ? 0 : (parseDecimalBr(saleBuyerPct) ?? NaN);
    if (Number.isNaN(buyerPct) || buyerPct < 0 || buyerPct > 100) {
      setError('Corretagem do comprador inválida (0 a 100).');
      return;
    }
    if (!saleDate) {
      setError('Informe a data do contrato.');
      return;
    }
    if (saleBrokerIds.length === 0) {
      setError('Selecione ao menos um corretor.');
      return;
    }
    const saleFieldsPayload: SaleContractSaleFieldsInput = {
      quantitySacks: sacks,
      unitPrice: price,
      sellerBrokeragePct: sellerPct,
      buyerBrokeragePct: buyerPct,
      contractDate: saleDate,
      brokerIds: saleBrokerIds,
    };

    // Lembrete (AP6): dias só quando precisa de aprovação; null quando "Não".
    const leadDaysPayload = requiresApproval ? Number(approvalReminderLeadDays) : null;
    setSaving(true);
    setError(null);
    const payload: SaleContractEtapa2Input = {
      expectedVersion: 0,
      sellerClientId: seller.id,
      buyerClientId: buyer?.id ?? null,
      sellerUnitId: sellerIsPF ? sellerUnitId || null : null,
      buyerUnitId: buyerIsPF ? buyerUnitId || null : null,
      sellerBankAccountId: bankAccountId,
      buyerWarehouseClientId: buyerWarehouse?.id ?? null,
      sellerWarehouseClientId: sellerWarehouse?.id ?? null,
      paymentFormId,
      modalityId,
      packagingId,
      invoiceDate,
      paymentDate,
      purchaseNumber: purchaseNumber.trim() || null,
      paymentCondition: null,
      observations: observations.trim() || null,
      description: description.trim() || null,
      weightKg: weightKg.trim() ? parseDecimalBr(weightKg) : null,
      agioDesagioType: agioType || null,
      agioDesagioValue: agioType ? parseCurrencyInput(agioValue) : null,
      requiresApproval,
      approvalReminderLeadDays: leadDaysPayload,
      // À vista/Futuro: a fase 1 vai na venda/contrato (não no emit).
      saleFields: isCreateLike ? undefined : saleFieldsPayload,
    };
    try {
      if (isCreateLike) {
        // Criação (à vista/Futuro) — 1 chamada só: o contrato nasce EMITIDO
        // (D97). O backend registra a venda no lote (à vista) e grava o contrato
        // completo na MESMA transação; não há mais passo EM_ABERTO intermediário
        // nem venda parcial a limpar.
        if (!buyer) {
          setError('Selecione o comprador.');
          return;
        }
        const createBody = {
          // fase 1 (venda)
          buyerClientId: buyer.id,
          quantitySacks: isSpotCreate && spotCreate?.isBlend ? spotCreate.availableSacks : sacks,
          unitPrice: price,
          sellerBrokeragePct: sellerPct,
          buyerBrokeragePct: buyerPct,
          contractDate: saleDate,
          brokerIds: saleBrokerIds,
          // etapa 2
          sellerClientId: seller.id,
          sellerUnitId: sellerIsPF ? sellerUnitId || null : null,
          buyerUnitId: buyerIsPF ? buyerUnitId || null : null,
          sellerBankAccountId: bankAccountId,
          buyerWarehouseClientId: buyerWarehouse?.id ?? null,
          sellerWarehouseClientId: sellerWarehouse?.id ?? null,
          paymentFormId,
          modalityId,
          packagingId,
          invoiceDate,
          paymentDate,
          purchaseNumber: purchaseNumber.trim() || null,
          paymentCondition: null,
          observations: observations.trim() || null,
          description: description.trim() || null,
          weightKg: weightKg.trim() ? parseDecimalBr(weightKg) : null,
          agioDesagioType: agioType || null,
          agioDesagioValue: agioType ? parseCurrencyInput(agioValue) : null,
          requiresApproval,
          approvalReminderLeadDays: leadDaysPayload,
        };
        if (futureCreate) {
          await createFutureSaleContract(session, { type: 'FUTURO', ...createBody });
        } else if (spotCreate) {
          await createSpotSaleContract(session, {
            type: 'MERCADO_A_VISTA',
            sampleId: spotCreate.sampleId,
            expectedVersion: spotCreate.sampleVersion,
            ...createBody,
          });
        }
        onSaved();
      } else if (contractId && contract) {
        await emitSaleContract(session, contractId, {
          ...payload,
          expectedVersion: contract.version,
        });
        onSaved();
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError('Este contrato foi modificado. Recarregue a página e tente de novo.');
      } else {
        setError(cause instanceof ApiError ? cause.message : 'Falha ao emitir o contrato.');
      }
    } finally {
      setSaving(false);
    }
  }

  const disabled = saving;

  // Layout: pares lado a lado em grid 50/50 que casa o gap do .app-modal-content
  // (molde da Etapa 1). Filiais e ágio extraídos pra compor em par sem duplicar.
  const halfRowStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: '0.75rem',
  };

  // Valor só-leitura dos campos de topo (número + tipo): fundo levemente cinza
  // pra sinalizar "não editável"; texto escuro/negrito pra o valor se destacar.
  const infoValueStyle: CSSProperties = {
    background: '#f5f6f5',
    color: '#1a1a1a',
    fontWeight: 600,
  };

  const sellerUnitField = (
    <div className="app-modal-field">
      <span className="app-modal-label">Filial do vendedor</span>
      <InlineSelectField
        options={sellerUnits.map((unit) => ({ id: unit.id, label: unitLabel(unit) }))}
        value={sellerUnitId}
        onChange={(id) => {
          setSellerUnitId(id);
          setError(null);
        }}
        disabled={disabled}
        placeholder="Selecione a filial"
        emptyMessage="Nenhuma filial cadastrada."
        onRequestCreate={() => {
          setUnitError(null);
          setUnitModalFor('seller');
        }}
        createLabel="Cadastrar filial"
      />
    </div>
  );

  const buyerUnitField = (
    <div className="app-modal-field">
      <span className="app-modal-label">Filial do comprador</span>
      <InlineSelectField
        options={buyerUnits.map((unit) => ({ id: unit.id, label: unitLabel(unit) }))}
        value={buyerUnitId}
        onChange={(id) => {
          setBuyerUnitId(id);
          setError(null);
        }}
        disabled={disabled}
        placeholder="Selecione a filial"
        emptyMessage="Nenhuma filial cadastrada."
        onRequestCreate={() => {
          setUnitError(null);
          setUnitModalFor('buyer');
        }}
        createLabel="Cadastrar filial"
      />
    </div>
  );

  const agioTypeField = (
    <label className="app-modal-field">
      <span className="app-modal-label">Ágio/Deságio (opcional)</span>
      <select
        className="app-modal-input"
        value={agioType}
        disabled={disabled}
        onChange={(event) => {
          setAgioType(event.target.value as '' | 'AGIO' | 'DESAGIO');
          setError(null);
        }}
      >
        <option value="">Nenhum</option>
        <option value="AGIO">Ágio</option>
        <option value="DESAGIO">Deságio</option>
      </select>
    </label>
  );

  const agioValueField = (
    <label className="app-modal-field">
      <span className="app-modal-label">Valor (R$/saca)</span>
      <input
        className="app-modal-input"
        inputMode="decimal"
        value={agioValue}
        disabled={disabled}
        onChange={(event) => {
          setAgioValue(maskCurrencyInput(event.target.value));
          setError(null);
        }}
        placeholder="0,00"
      />
    </label>
  );

  const sheetTitle = futureCreate
    ? 'Novo contrato — Futuro'
    : isSpotCreate
      ? 'Novo contrato — À vista'
      : `Editar contrato${contract ? ` ${contract.contractNumber}` : ''}`;

  // Topo do form (só leitura): número que será criado + tipo do contrato.
  const displayContractNumber = contract
    ? contract.contractNumber
    : isSpotCreate
      ? (spotCreate?.nextNumber ?? '—')
      : (futureNumber ?? '—');
  const displayContractType = futureCreate || contract?.type === 'FUTURO' ? 'Futuro' : 'À vista';

  // Fechar (X / backdrop / ESC / arraste) ENCERRA o fluxo e volta à página. Como
  // nada é gravado antes do submit (o contrato nasce EMITIDO numa só chamada,
  // D97), não há venda parcial a limpar. NÃO retorna ao passo anterior — isso é
  // o "Voltar" (handleBack).
  const handleSheetClose = onClose;

  // À vista: "Voltar" retorna à seleção de lote. Null em Futuro/Editar → o
  // rodapé mostra "Cancelar".
  const handleBack = onBack ?? null;

  const sheetFooter = (
    <div className="app-modal-actions ctr-etapa2-actions">
      <button
        type="button"
        className="app-modal-secondary"
        onClick={handleBack ?? handleSheetClose}
        disabled={saving}
      >
        {handleBack ? 'Voltar' : 'Cancelar'}
      </button>
      <button
        type="button"
        className="app-modal-submit"
        onClick={handleSubmit}
        disabled={saving || loading}
      >
        {saving ? 'Emitindo...' : 'Emitir'}
      </button>
    </div>
  );

  return (
    <>
      <BottomSheet
        open={open}
        onClose={handleSheetClose}
        onDismissAttempt={() => !saving}
        title={sheetTitle}
        ariaLabel={sheetTitle}
        footer={sheetFooter}
        stacked={isSpotCreate}
        className="ctr-form-sheet ctr-contract-sheet"
      >
        {error ? <p className="sdv-modal-error">{error}</p> : null}
        {loadError ? <p className="sdv-modal-error">{loadError}</p> : null}

        {loading ? (
          <div className="app-modal-content">
            <p className="ctr-modal-loading">Carregando...</p>
          </div>
        ) : (
          <div className="app-modal-content ctr-etapa2-content">
            {/* Topo (primeira info após o header): número que será criado + tipo,
                ambos só-leitura. */}
            <div style={halfRowStyle}>
              <div className="app-modal-field">
                <span className="app-modal-label">Número do contrato</span>
                <div className="app-modal-input" style={infoValueStyle}>
                  {displayContractNumber}
                </div>
              </div>
              <div className="app-modal-field">
                <span className="app-modal-label">Tipo</span>
                <div className="app-modal-input" style={infoValueStyle}>
                  {displayContractType}
                </div>
              </div>
            </div>

            <div className="ctr-etapa2-cols">
              <div className="ctr-etapa2-col">
                <div className="ctr-block">
                  {/* Fase 1 (venda) — bloco em todos os modos. Sacas travadas em liga
                  (F7.1 / à vista liga = 100%); à vista limita ao saldo do lote. */}
                  <p className="ctr-section-title">Venda</p>

                  {isSpotCreate && spotCreate ? (
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--brand-muted)' }}>
                      Lote {spotCreate.internalLotNumber ?? 'Sem número'}
                    </p>
                  ) : null}

                  <label className="app-modal-field">
                    <span className="app-modal-label">Data do contrato</span>
                    <input
                      className="app-modal-input"
                      type="date"
                      value={saleDate}
                      disabled={disabled}
                      onChange={(event) => {
                        setSaleDate(event.target.value);
                        setError(null);
                      }}
                    />
                  </label>

                  <div style={halfRowStyle}>
                    <div className="app-modal-field">
                      <span className="app-modal-label">
                        Sacas
                        {sampleIsBlend
                          ? ' (liga: 100%)'
                          : isSpotCreate && spotCreate
                            ? ` (${spotCreate.availableSacks} disp.)`
                            : ''}
                      </span>
                      <input
                        className="app-modal-input"
                        inputMode="numeric"
                        value={saleSacks}
                        disabled={disabled || sampleIsBlend}
                        onChange={(event) => {
                          setSaleSacks(event.target.value.replace(/[^0-9]/g, ''));
                          setError(null);
                        }}
                      />
                    </div>

                    <label className="app-modal-field">
                      <span className="app-modal-label">Preço por saca (R$)</span>
                      <input
                        className="app-modal-input"
                        inputMode="decimal"
                        value={saleUnitPrice}
                        disabled={disabled}
                        onChange={(event) => {
                          setSaleUnitPrice(maskCurrencyInput(event.target.value));
                          setError(null);
                        }}
                        placeholder="0,00"
                      />
                    </label>
                  </div>

                  <div style={halfRowStyle}>
                    <label className="app-modal-field">
                      <span className="app-modal-label">Corretagem do vendedor (%)</span>
                      <input
                        className="app-modal-input"
                        inputMode="decimal"
                        value={saleSellerPct}
                        disabled={disabled}
                        onChange={(event) => {
                          setSaleSellerPct(event.target.value.replace(/[^0-9.,]/g, ''));
                          setError(null);
                        }}
                        placeholder="0"
                      />
                    </label>

                    <label className="app-modal-field">
                      <span className="app-modal-label">Corretagem do comprador (%)</span>
                      <input
                        className="app-modal-input"
                        inputMode="decimal"
                        value={saleBuyerPct}
                        disabled={disabled}
                        onChange={(event) => {
                          setSaleBuyerPct(event.target.value.replace(/[^0-9.,]/g, ''));
                          setError(null);
                        }}
                        placeholder="0"
                      />
                    </label>
                  </div>

                  <div className="app-modal-field">
                    <span className="app-modal-label">Corretores</span>
                    <BrokerMultiSelectField
                      session={session}
                      selectedIds={saleBrokerIds}
                      disabled={disabled}
                      onChange={(ids) => {
                        setSaleBrokerIds(ids);
                        setError(null);
                      }}
                    />
                  </div>
                </div>

                <div className="ctr-block">
                  {/* Bloco Vendedor */}
                  <p className="ctr-section-title">Vendedor</p>

                  <div className="ctr-pair">
                    <div className="app-modal-field">
                      <span className="app-modal-label">Vendedor</span>
                      <ClientLookupField
                        session={session}
                        label="Vendedor"
                        kind="owner"
                        selectedClient={seller}
                        disabled={disabled}
                        compact
                        onSelectClient={(client) => void handleSelectSeller(client)}
                        emptyMessage="Nenhum vendedor encontrado."
                        onRequestCreate={(searchTerm) => {
                          setSellerCreateSeed(searchTerm);
                          setSellerCreateOpen(true);
                        }}
                        createLabel="Cadastrar vendedor"
                      />
                    </div>

                    {sellerIsPF ? sellerUnitField : null}
                  </div>

                  <div className="ctr-pair">
                    <div className="app-modal-field">
                      <span className="app-modal-label">Banco do vendedor</span>
                      <ClientBankAccountSelectField
                        session={session}
                        stacked
                        clientId={seller?.id ?? null}
                        value={bankAccountId}
                        disabled={disabled}
                        defaultHolderName={seller?.displayName ?? null}
                        defaultHolderTaxId={seller?.cnpj ?? seller?.cpf ?? null}
                        onChange={(id) => {
                          setBankAccountId(id ?? '');
                          setError(null);
                        }}
                      />
                    </div>

                    <div className="app-modal-field">
                      <span className="app-modal-label">Armazém do vendedor (opcional)</span>
                      <ClientLookupField
                        session={session}
                        label="Armazém do vendedor"
                        kind="any"
                        selectedClient={sellerWarehouse}
                        disabled={disabled}
                        compact
                        onSelectClient={(client) => void handleSelectWarehouse('seller', client)}
                        emptyMessage="Nenhum cliente encontrado."
                        onRequestCreate={(searchTerm) => {
                          setWarehouseCreateSeed(searchTerm);
                          setWarehouseCreateFor('seller');
                        }}
                        createLabel="Cadastrar armazém"
                      />
                    </div>
                  </div>
                </div>

                <div className="ctr-block">
                  {/* Bloco Comprador: tudo do comprador junto */}
                  <p className="ctr-section-title">Comprador</p>

                  <div className="ctr-pair">
                    <div className="app-modal-field">
                      <span className="app-modal-label">Comprador</span>
                      <ClientLookupField
                        session={session}
                        label="Comprador"
                        kind="buyer"
                        selectedClient={buyer}
                        disabled={disabled}
                        compact
                        onSelectClient={(client) => void handleSelectBuyer(client)}
                        emptyMessage="Nenhum comprador encontrado."
                        onRequestCreate={(searchTerm) => {
                          setBuyerCreateSeed(searchTerm);
                          setBuyerCreateOpen(true);
                        }}
                        createLabel="Cadastrar comprador"
                      />
                    </div>

                    {buyerIsPF ? buyerUnitField : null}
                  </div>

                  <div className="app-modal-field">
                    <span className="app-modal-label">Armazém do comprador (opcional)</span>
                    <ClientLookupField
                      session={session}
                      label="Armazém do comprador"
                      kind="any"
                      selectedClient={buyerWarehouse}
                      disabled={disabled}
                      compact
                      onSelectClient={(client) => void handleSelectWarehouse('buyer', client)}
                      emptyMessage="Nenhum cliente encontrado."
                      onRequestCreate={(searchTerm) => {
                        setWarehouseCreateSeed(searchTerm);
                        setWarehouseCreateFor('buyer');
                      }}
                      createLabel="Cadastrar armazém"
                    />
                  </div>
                </div>
              </div>
              <div className="ctr-etapa2-col">
                <div className="ctr-block">
                  {/* Pagamento & logística */}
                  <p className="ctr-section-title">Pagamento e logística</p>

                  <div style={halfRowStyle}>
                    <label className="app-modal-field">
                      <span className="app-modal-label">Forma de pagamento</span>
                      <InlineSelectField
                        options={(lookups?.paymentForms ?? []).map((item) => ({
                          id: item.id,
                          label: item.name,
                        }))}
                        value={paymentFormId}
                        onChange={(id) => {
                          setPaymentFormId(id);
                          setError(null);
                        }}
                        disabled={disabled}
                        loading={!lookups}
                        createLabel="Adicionar"
                        onCreate={async (name) => {
                          const { item } = await createContractLookup(session, {
                            list: 'paymentForm',
                            name,
                          });
                          setLookups((prev) =>
                            prev ? { ...prev, paymentForms: [...prev.paymentForms, item] } : prev
                          );
                          return { id: item.id, label: item.name };
                        }}
                      />
                    </label>

                    <label className="app-modal-field">
                      <span className="app-modal-label">Modalidade</span>
                      <InlineSelectField
                        options={(lookups?.modalities ?? []).map((item) => ({
                          id: item.id,
                          label: item.name,
                        }))}
                        value={modalityId}
                        onChange={(id) => {
                          setModalityId(id);
                          setError(null);
                        }}
                        disabled={disabled}
                        loading={!lookups}
                        createLabel="Adicionar"
                        onCreate={async (name) => {
                          const { item } = await createContractLookup(session, {
                            list: 'modality',
                            name,
                          });
                          setLookups((prev) =>
                            prev ? { ...prev, modalities: [...prev.modalities, item] } : prev
                          );
                          return { id: item.id, label: item.name };
                        }}
                      />
                    </label>
                  </div>

                  <label className="app-modal-field">
                    <span className="app-modal-label">Embalagem</span>
                    <InlineSelectField
                      options={(lookups?.packagings ?? []).map((item) => ({
                        id: item.id,
                        label: item.name,
                      }))}
                      value={packagingId}
                      onChange={(id) => {
                        setPackagingId(id);
                        setError(null);
                      }}
                      disabled={disabled}
                      loading={!lookups}
                      createLabel="Adicionar"
                      onCreate={async (name) => {
                        const { item } = await createContractLookup(session, {
                          list: 'packaging',
                          name,
                        });
                        setLookups((prev) =>
                          prev ? { ...prev, packagings: [...prev.packagings, item] } : prev
                        );
                        return { id: item.id, label: item.name };
                      }}
                    />
                  </label>

                  <div style={halfRowStyle}>
                    <label className="app-modal-field">
                      <span className="app-modal-label">Data de faturamento</span>
                      <input
                        className="app-modal-input"
                        type="date"
                        value={invoiceDate}
                        disabled={disabled}
                        onChange={(event) => {
                          setInvoiceDate(event.target.value);
                          setError(null);
                        }}
                      />
                    </label>

                    <label className="app-modal-field">
                      <span className="app-modal-label">Data de pagamento</span>
                      <input
                        className="app-modal-input"
                        type="date"
                        value={paymentDate}
                        disabled={disabled}
                        onChange={(event) => {
                          setPaymentDate(event.target.value);
                          setError(null);
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="ctr-block">
                  {/* Aprovação (reforma AP1/AP6) */}
                  <p className="ctr-section-title">Aprovação</p>

                  <div className="app-modal-field">
                    <span className="app-modal-label">Este contrato precisa de aprovação?</span>
                    <div
                      className="ctr-approval-choice"
                      role="group"
                      aria-label="Precisa de aprovação?"
                    >
                      <button
                        type="button"
                        className={`ctr-approval-btn${requiresApproval === true ? ' is-selected' : ''}`}
                        aria-pressed={requiresApproval === true}
                        disabled={disabled}
                        onClick={() => {
                          setRequiresApproval(true);
                          setError(null);
                        }}
                      >
                        Sim
                      </button>
                      <button
                        type="button"
                        className={`ctr-approval-btn${requiresApproval === false ? ' is-selected' : ''}`}
                        aria-pressed={requiresApproval === false}
                        disabled={disabled}
                        onClick={() => {
                          setRequiresApproval(false);
                          setError(null);
                        }}
                      >
                        Não
                      </button>
                    </div>
                  </div>

                  {requiresApproval === true ? (
                    <label className="app-modal-field">
                      <span className="app-modal-label">
                        Lembrar quantos dias antes do faturamento?
                      </span>
                      <input
                        className="app-modal-input"
                        inputMode="numeric"
                        value={approvalReminderLeadDays}
                        disabled={disabled}
                        onChange={(event) => {
                          setApprovalReminderLeadDays(event.target.value.replace(/[^0-9]/g, ''));
                          setError(null);
                        }}
                        placeholder="30"
                      />
                    </label>
                  ) : null}
                </div>

                <div className="ctr-block">
                  {/* Valores */}
                  <p className="ctr-section-title">Valores</p>

                  <div style={halfRowStyle}>
                    <label className="app-modal-field">
                      <span className="app-modal-label">Número de compra (opcional)</span>
                      <input
                        className="app-modal-input"
                        value={purchaseNumber}
                        disabled={disabled}
                        onChange={(event) => setPurchaseNumber(event.target.value)}
                        placeholder="Referência externa"
                      />
                    </label>

                    <label className="app-modal-field">
                      <span className="app-modal-label">Peso (Kg) (opcional)</span>
                      <input
                        className="app-modal-input"
                        inputMode="decimal"
                        value={weightKg}
                        disabled={disabled}
                        onChange={(event) =>
                          setWeightKg(event.target.value.replace(/[^0-9.,]/g, ''))
                        }
                        placeholder="0,00"
                      />
                    </label>
                  </div>

                  {agioType ? (
                    <div style={halfRowStyle}>
                      {agioTypeField}
                      {agioValueField}
                    </div>
                  ) : (
                    agioTypeField
                  )}
                </div>

                <div className="ctr-block">
                  {/* Textos */}
                  <p className="ctr-section-title">Textos</p>

                  <label className="app-modal-field">
                    <span className="app-modal-label">Observações (opcional)</span>
                    <textarea
                      className="app-modal-input ctr-textarea"
                      value={observations}
                      disabled={disabled}
                      onChange={(event) => setObservations(event.target.value)}
                      rows={2}
                    />
                  </label>

                  <label className="app-modal-field">
                    <span className="app-modal-label">Descrição (opcional)</span>
                    <textarea
                      className="app-modal-input ctr-textarea"
                      value={description}
                      disabled={disabled}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={2}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </BottomSheet>

      {unitModalFor ? (
        <ClientUnitModal
          open
          stacked
          saving={savingUnit}
          errorMessage={unitError}
          onClose={() => {
            if (!savingUnit) setUnitModalFor(null);
          }}
          onSubmit={handleCreateUnit}
        />
      ) : null}

      <ClientQuickCreateModal
        session={session}
        open={sellerCreateOpen}
        title="Novo vendedor"
        initialSearch={sellerCreateSeed}
        initialPersonType="PJ"
        initialIsSeller
        onClose={() => setSellerCreateOpen(false)}
        onCreated={(client) => {
          setSellerCreateOpen(false);
          void handleSelectSeller(client);
        }}
      />

      <ClientQuickCreateModal
        session={session}
        open={buyerCreateOpen}
        title="Novo comprador"
        initialSearch={buyerCreateSeed}
        initialPersonType="PJ"
        initialIsBuyer
        onClose={() => setBuyerCreateOpen(false)}
        onCreated={(client) => {
          setBuyerCreateOpen(false);
          void handleSelectBuyer(client);
        }}
      />

      <ClientQuickCreateModal
        session={session}
        open={warehouseCreateFor !== null}
        title="Novo armazém"
        initialSearch={warehouseCreateSeed}
        initialPersonType="PJ"
        initialIsWarehouse
        onClose={() => setWarehouseCreateFor(null)}
        onCreated={(client) => {
          const which = warehouseCreateFor;
          setWarehouseCreateFor(null);
          if (which) void handleSelectWarehouse(which, client);
        }}
      />
    </>
  );
}
