'use client';

import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  getSampleDetail,
  listContractLookups,
  previewSaleContractPdf,
  updateClient,
} from '../../lib/api-client';
import {
  formatCurrencyValue,
  maskCurrencyInput,
  parseCurrencyInput,
  parseDecimalBr,
} from '../../lib/currency';
import { isWeekendIso, WEEKEND_DATE_MESSAGE } from '../../lib/business-days';
import { BottomSheet } from '../BottomSheet';
import { BrokerMultiSelectField } from '../samples/BrokerMultiSelectField';
import { ClientLookupField } from '../clients/ClientLookupField';
import { ClientQuickCreateModal } from '../clients/ClientQuickCreateModal';
import { ClientUnitModal } from '../clients/ClientUnitModal';
import { HarvestDisplay } from '../samples/HarvestDisplay';
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
  SampleSnapshot,
  SessionData,
} from '../../lib/types';
import type { JsonValue } from '../../lib/api-client';
import { ContractDocumentConfirmModal } from './ContractDocumentConfirmModal';

type SaleContractEtapa2ModalProps = {
  session: SessionData;
  // Card "Editar": contrato existente.
  contractId?: string;
  open: boolean;
  onClose: () => void;
  // RC-D20: recebe o id do contrato recém-emitido pra o pai poder ABRI-LO em vez
  // de só voltar pra lista. Null quando a emissão não devolveu id.
  onSaved: (contractId: string | null) => void;
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
    /** RC-D32: fatos do lote para a faixa de identidade no topo. */
    ownerName: string | null;
    harvest: string | null;
  };
  // À VISTA: o lote mudou durante o preenchimento (409 SAMPLE_VERSION_CONFLICT) e
  // este é o snapshot fresco. Quem monta o `spotCreate` é o pai — devolve o
  // snapshot inteiro pra ele reaproveitar o mesmo mapeamento do picker.
  onSpotRefreshed?: (sample: SampleSnapshot) => void;
  // Modo CRIACAO FUTURO (1 modal): sem lote/contrato. Mostra o bloco "Venda"
  // (vazio, sacas LIVRES) + Vendedor/Comprador manuais; o submit cria o contrato
  // FUTURO JA EMITIDO numa só chamada (createFutureSaleContract, D97).
  futureCreate?: boolean;
};

function dateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

// RC-D31: a data do contrato nascia vazia e o submit exigia. Hoje e a resposta
// em praticamente todo caso — e continua editavel. Fuso local (nao toISOString,
// que devolve UTC e pode voltar um dia a noite no Brasil).
function todayInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function unitLabel(unit: ClientUnitSummary): string {
  return unit.name ?? `Filial ${unit.code}`;
}

// RC-D35: os campos que uma validação pode apontar. Fechado (não `string`) pra o
// typecheck pegar chave que não existe no markup — erro silencioso seria um campo
// sem nenhuma marca vermelha.
type FormFieldKey =
  | 'saleDate'
  | 'saleSacks'
  | 'saleUnitPrice'
  | 'saleSellerPct'
  | 'saleBuyerPct'
  | 'saleBrokers'
  | 'seller'
  | 'sellerUnit'
  | 'bankAccount'
  | 'buyer'
  | 'buyerUnit'
  | 'paymentForm'
  | 'modality'
  | 'packaging'
  | 'invoiceDate'
  | 'paymentDate'
  | 'requiresApproval'
  | 'approvalLead'
  | 'agioValue';

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
  onSpotRefreshed,
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
  // D144: datas planejadas "À definir" — só em contrato FUTURO. Toggle por campo;
  // marcado limpa/desabilita o input e o submit envia null explícito.
  const [invoiceDateTbd, setInvoiceDateTbd] = useState(false);
  const [paymentDateTbd, setPaymentDateTbd] = useState(false);
  const [observations, setObservations] = useState('');
  const [description, setDescription] = useState('');
  // Aprovacao (reforma AP1/AP6): sinal obrigatorio (null = nao escolhido, trava a
  // conclusao) + lembrete em dias (string, molde weightKg; so vale quando "Sim").
  const [requiresApproval, setRequiresApproval] = useState<boolean | null>(null);
  const [approvalReminderLeadDays, setApprovalReminderLeadDays] = useState('30');

  const [saving, setSaving] = useState(false);
  // `error` = o que NÃO tem campo (falha do servidor, liga inviável, conflito de
  // versão). O que tem campo vive em `fieldError` (RC-D35) e é desenhado dentro
  // dele — num painel de 620px com ~30 campos, a mensagem no topo do sheet ficava
  // fora da tela justamente quando o usuário apertava Emitir.
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: FormFieldKey; message: string } | null>(
    null
  );

  // RC-D34: houve mexida do usuário em algum campo. Não dá pra inferir de
  // "campo preenchido": à vista o formulário JÁ nasce com data, sacas, vendedor,
  // filial e banco (RC-D31) e no Editar nasce com o contrato inteiro — o guard
  // dispararia sempre, que é pior que não existir.
  const [touched, setTouched] = useState(false);
  // Qual saída está esperando a confirmação: fechar de vez ou voltar ao picker.
  const [pendingExit, setPendingExit] = useState<'close' | 'back' | null>(null);

  // RC-D27: o documento em conferência (fase 2). Enquanto existe, o painel
  // continua montado atrás — "Voltar" só descarta isto.
  const [confirmDoc, setConfirmDoc] = useState<{
    blob: Blob;
    contractNumber: string | null;
    provisionalNumber: boolean;
  } | null>(null);
  const pendingEmitRef = useRef<(() => Promise<void>) | null>(null);
  // RC-D37: aviso de que o dono do lote mudou desde a emissão, então o vendedor
  // acompanhou e filial + banco foram esvaziados. Estado persistente do
  // formulário (vale enquanto os campos estiverem vazios) → banner, não toast:
  // some quando o usuário reescolhe, não sozinho depois de 4s.
  const [ownerDivergedNotice, setOwnerDivergedNotice] = useState(false);

  function clearErrors() {
    setError(null);
    setFieldError(null);
  }

  // RC-D34: qualquer mexida do usuario num campo. Serve de sinal de rascunho
  // sujo (o `descartar?` ao fechar) e limpa o erro de campo de quebra — os dois
  // acontecem sempre juntos, entao os handlers chamam um so.
  function onFieldChange() {
    setTouched(true);
    clearErrors();
  }

  // Um erro por vez (o 1º pendente), como já era — só que agora apontando o campo.
  function failField(field: FormFieldKey, message: string) {
    setError(null);
    setFieldError({ field, message });
  }

  function fieldClass(field: FormFieldKey): string {
    return fieldError?.field === field ? 'app-modal-field is-field-error' : 'app-modal-field';
  }

  // `.app-modal-field-error`, não o `.fv-form-field-error` do kit: é a peça que
  // este formulário já usa no aviso de fim de semana logo abaixo das datas — duas
  // classes de erro no mesmo campo dariam dois vermelhos diferentes. O
  // `.ctr-form-sheet` retinta a peça no tom do kit.
  function fieldMessage(field: FormFieldKey) {
    if (fieldError?.field !== field) return null;
    return <span className="app-modal-field-error">{fieldError.message}</span>;
  }

  // Fecha o confirm aninhado quando o pai sinaliza fechamento — senão ele fica
  // pendurado durante o unmount atrasado do sheet (molde do WeeklyReportFormSheet).
  useEffect(() => {
    if (!open) {
      setPendingExit(null);
      setConfirmDoc(null);
      pendingEmitRef.current = null;
    }
  }, [open]);

  // Rola até o campo com erro: sem isso, apertar Emitir com um campo pendente
  // acima da dobra não muda nada visível. Consulta o DOM em vez de manter ~25
  // refs — só existe um `.is-field-error` por vez.
  useEffect(() => {
    if (!fieldError) return;
    const node = document.querySelector('.ctr-etapa2-content .is-field-error');
    node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [fieldError]);

  // D144: o "À definir" só existe no FUTURO — criação (futureCreate) ou Editar
  // de um contrato FUTURO (type persistido; molde do displayContractType).
  const isFuturo = futureCreate || contract?.type === 'FUTURO';

  // Sub-modais de "+cadastrar filial"
  const [unitModalFor, setUnitModalFor] = useState<'seller' | 'buyer' | null>(null);
  const [savingUnit, setSavingUnit] = useState(false);
  const [unitError, setUnitError] = useState<string | null>(null);

  // RC-D35: depois do 409 do lote, `spotCreate` troca de IDENTIDADE (versão e
  // saldo novos) — mas a hidratação abaixo não pode rodar de novo, senão ela
  // reescreveria o formulário que o usuário acabou de preencher, que é
  // exatamente o que a recuperação existe pra evitar. Por isso o objeto entra
  // por ref e a dependência do efeito é o ID do lote: hidrata uma vez por lote.
  const spotCreateRef = useRef(spotCreate);
  spotCreateRef.current = spotCreate;
  const spotSampleId = spotCreate?.sampleId ?? null;

  useEffect(() => {
    let aborted = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        // Modo CRIACAO À VISTA (1 modal): vem do picker de lote. Carrega lookups,
        // pré-preenche o vendedor (dono do lote, se houver), semeia o blend e — para
        // liga — semeia sacas = 100% e checa a viabilidade da cascata.
        const spot = spotCreateRef.current;
        if (spot) {
          const lookupsRes = await listContractLookups(session);
          if (aborted) return;
          setLookups(lookupsRes);
          setContract(null);
          setSampleIsBlend(spot.isBlend);
          // RC-D31: sacas = saldo do lote. Em liga isso e obrigatorio (venda de
          // liga e 100%, campo travado); em lote normal e so o caso comum —
          // vender o lote inteiro — com o campo livre pra reduzir.
          setSaleSacks(String(spot.availableSacks));
          setSaleDate(todayInputValue());
          if (spot.ownerClientId) {
            const sellerD = await getClient(session, spot.ownerClientId).catch(() => null);
            if (aborted) return;
            if (sellerD) {
              setSeller(sellerD.client);
              setSellerUnits(sellerD.units);
              // RC-D31: filial obrigatoria para PF. Com uma unica, escolher e
              // ritual — o formulario ja sabe a resposta.
              if (sellerD.client.personType === 'PF' && sellerD.units.length === 1) {
                setSellerUnitId(sellerD.units[0].id);
              }
            }
          }
          // Liga: viabilidade da venda (bloqueia se alguma origem não cobre a cascata).
          if (spot.isBlend) {
            try {
              const feas = await getBlendFeasibility(session, spot.sampleId);
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
          // RC-D31: mesma razao do a vista. Sacas ficam livres (contrato futuro
          // nao tem lote pra limitar).
          setSaleDate(todayInputValue());
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
        // D144: FUTURO com data null abre com o "À definir" marcado.
        setInvoiceDateTbd(c.type === 'FUTURO' && c.invoiceDate == null);
        setPaymentDateTbd(c.type === 'FUTURO' && c.paymentDate == null);
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

        // RC-D37: com lote, o vendedor exibido é o dono ATUAL do lote — é ele que
        // o servidor vai emitir. Se divergir do gravado, a filial e o banco do
        // contrato são de outro cliente: zera os dois (mesmo tratamento do
        // handleSelectSeller), senão o submit estouraria um 422 de banco numa
        // edição que nem tocou no vendedor.
        const effectiveSellerId = c.sampleOwner?.clientId ?? c.sellerClientId;
        if (c.sampleOwner && c.sampleOwner.clientId !== c.sellerClientId) {
          setSellerUnitId('');
          setBankAccountId('');
          // Zerar em silêncio faria os dois campos aparecerem vazios sem
          // explicação, e o usuário só descobriria no submit como "campo
          // obrigatório". O banner conta o porquê antes de ele preencher.
          setOwnerDivergedNotice(true);
        }

        const [sellerD, buyerD, bwD, swD] = await Promise.all([
          effectiveSellerId ? getClient(session, effectiveSellerId).catch(() => null) : null,
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
  }, [session, contractId, spotSampleId, futureCreate]);

  const sellerIsPF = seller?.personType === 'PF';
  const buyerIsPF = buyer?.personType === 'PF';

  async function handleSelectSeller(client: ClientSummary | null) {
    setSeller(client);
    setSellerUnitId('');
    setBankAccountId('');
    onFieldChange();
    if (!client) {
      setSellerUnits([]);
      return;
    }
    try {
      const detail = await getClient(session, client.id);
      setSeller(detail.client);
      setSellerUnits(detail.units);
      // RC-D31: mesma pre-selecao da hidratacao — vale tambem quando o vendedor
      // e TROCADO a mao, senao o atalho existiria so no caminho automatico.
      if (detail.client.personType === 'PF' && detail.units.length === 1) {
        setSellerUnitId(detail.units[0].id);
      }
    } catch {
      setSellerUnits(client.units ?? []);
    }
  }

  // Comprador editavel (P20): troca o comprador + zera/recarrega a filial dele
  // (a anterior era do comprador antigo). Molde do handleSelectSeller.
  async function handleSelectBuyer(client: ClientSummary | null) {
    setBuyer(client);
    setBuyerUnitId('');
    onFieldChange();
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
    onFieldChange();
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
    // RC-D35: mensagem específica do 1º pendente, DENTRO do campo dele.
    if (!seller) {
      failField('seller', 'Selecione o vendedor.');
      return;
    }
    if (sellerIsPF && !sellerUnitId) {
      failField('sellerUnit', 'Selecione a filial do vendedor.');
      return;
    }
    // Criação (à vista/Futuro): o comprador é obrigatório (vai na venda/contrato).
    if (isCreateLike && !buyer) {
      failField('buyer', 'Selecione o comprador.');
      return;
    }
    if (buyerIsPF && !buyerUnitId) {
      failField('buyerUnit', 'Selecione a filial do comprador.');
      return;
    }
    if (!bankAccountId) {
      failField('bankAccount', 'Selecione o banco do vendedor.');
      return;
    }
    if (!paymentFormId) {
      failField('paymentForm', 'Selecione a forma de pagamento.');
      return;
    }
    if (!modalityId) {
      failField('modality', 'Selecione a modalidade.');
      return;
    }
    if (!packagingId) {
      failField('packaging', 'Selecione a embalagem.');
      return;
    }
    // D144: campo com "À definir" marcado (só FUTURO) pula obrigatoriedade/dia útil.
    if (!invoiceDateTbd) {
      if (!invoiceDate) {
        failField('invoiceDate', 'Informe a data de faturamento.');
        return;
      }
      // DSB-D7: faturamento/pagamento não podem cair em fim de semana.
      if (isWeekendIso(invoiceDate)) {
        failField('invoiceDate', 'A data cai em fim de semana. Escolha um dia útil.');
        return;
      }
    }
    if (!paymentDateTbd) {
      if (!paymentDate) {
        failField('paymentDate', 'Informe a data de pagamento.');
        return;
      }
      if (isWeekendIso(paymentDate)) {
        failField('paymentDate', 'A data cai em fim de semana. Escolha um dia útil.');
        return;
      }
    }
    // D142: o cronograma planejado precisa ser coerente (espelha o 422 do
    // backend) — só comparável quando as duas datas existem (D144).
    if (!invoiceDateTbd && !paymentDateTbd && paymentDate < invoiceDate) {
      failField('paymentDate', 'Não pode ser anterior à data de faturamento.');
      return;
    }
    // Aprovacao (AP3): escolha obrigatoria. Quando "Sim", o lembrete e 1..365 dias.
    if (requiresApproval == null) {
      failField('requiresApproval', 'Escolha se o contrato precisa de aprovação.');
      return;
    }
    if (requiresApproval) {
      const lead = Number(approvalReminderLeadDays);
      if (!approvalReminderLeadDays.trim() || !Number.isInteger(lead) || lead < 1 || lead > 365) {
        failField('approvalLead', 'Informe o lembrete entre 1 e 365 dias.');
        return;
      }
    }
    if (agioType !== '' && !agioValue.trim()) {
      failField('agioValue', 'Informe o valor do ágio/deságio.');
      return;
    }

    // Fase 1 (venda) — todos os modos mostram o bloco "Venda". À vista: sacas ≤
    // saldo do lote (liga já vem travada em 100%). Liga inviável (à vista) bloqueia.
    // Liga inviável não é erro de campo: nada que o usuário digite aqui resolve —
    // é o estado das origens. Fica na mensagem do topo.
    if (isSpotCreate && blendInfeasible) {
      setFieldError(null);
      setError(feasibilityError ?? 'Liga inviável para venda — alguma origem não cobre a cascata.');
      return;
    }
    const sacks = Number(saleSacks);
    if (!saleSacks.trim() || !Number.isInteger(sacks) || sacks <= 0) {
      failField('saleSacks', 'Informe a quantidade de sacas.');
      return;
    }
    if (isSpotCreate && spotCreate && sacks > spotCreate.availableSacks) {
      failField('saleSacks', `Máximo de ${spotCreate.availableSacks} sacas no lote.`);
      return;
    }
    const price = parseCurrencyInput(saleUnitPrice);
    if (!saleUnitPrice.trim() || price == null || price <= 0) {
      failField('saleUnitPrice', 'Informe o preço por saca.');
      return;
    }
    // Deságio não pode zerar/inverter o preço por saca (o backend rejeita; bloqueia antes).
    if (agioType === 'DESAGIO') {
      const agioParsed = parseCurrencyInput(agioValue);
      if (agioParsed != null && agioParsed >= price) {
        failField('agioValue', 'O deságio não pode ser maior ou igual ao preço por saca.');
        return;
      }
    }
    const sellerPct = saleSellerPct.trim() === '' ? 0 : (parseDecimalBr(saleSellerPct) ?? NaN);
    if (Number.isNaN(sellerPct) || sellerPct < 0 || sellerPct > 100) {
      failField('saleSellerPct', 'Informe de 0 a 100.');
      return;
    }
    const buyerPct = saleBuyerPct.trim() === '' ? 0 : (parseDecimalBr(saleBuyerPct) ?? NaN);
    if (Number.isNaN(buyerPct) || buyerPct < 0 || buyerPct > 100) {
      failField('saleBuyerPct', 'Informe de 0 a 100.');
      return;
    }
    if (!saleDate) {
      failField('saleDate', 'Informe a data do contrato.');
      return;
    }
    if (saleBrokerIds.length === 0) {
      failField('saleBrokers', 'Selecione ao menos um corretor.');
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
    clearErrors();
    const payload: SaleContractEtapa2Input = {
      expectedVersion: 0,
      // RC-D40: com lote o servidor deriva o vendedor do dono e RECUSA o campo
      // (422) — manda-lo seria pedir uma troca que não vai acontecer.
      sellerClientId: sellerLockedToLot ? undefined : seller.id,
      buyerClientId: buyer?.id ?? null,
      sellerUnitId: sellerIsPF ? sellerUnitId || null : null,
      buyerUnitId: buyerIsPF ? buyerUnitId || null : null,
      sellerBankAccountId: bankAccountId,
      buyerWarehouseClientId: buyerWarehouse?.id ?? null,
      sellerWarehouseClientId: sellerWarehouse?.id ?? null,
      paymentFormId,
      modalityId,
      packagingId,
      // D144: null explícito = "À definir" (só FUTURO; o backend valida o type).
      invoiceDate: invoiceDateTbd ? null : invoiceDate,
      paymentDate: paymentDateTbd ? null : paymentDate,
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
    // Criação (à vista/Futuro): o comprador é obrigatório. A validação lá em cima
    // já garante — este guard é o estreitamento de tipo.
    if (isCreateLike && !buyer) {
      failField('buyer', 'Selecione o comprador.');
      setSaving(false);
      return;
    }
    const createBody = buyer
      ? {
          // fase 1 (venda)
          buyerClientId: buyer.id,
          quantitySacks: isSpotCreate && spotCreate?.isBlend ? spotCreate.availableSacks : sacks,
          unitPrice: price,
          sellerBrokeragePct: sellerPct,
          buyerBrokeragePct: buyerPct,
          contractDate: saleDate,
          brokerIds: saleBrokerIds,
          // etapa 2 — RC-D40: à vista o vendedor sai do lote e o campo é recusado
          // (422); o Futuro, sem lote, continua mandando o vendedor escolhido.
          sellerClientId: isSpotCreate ? undefined : seller.id,
          sellerUnitId: sellerIsPF ? sellerUnitId || null : null,
          buyerUnitId: buyerIsPF ? buyerUnitId || null : null,
          sellerBankAccountId: bankAccountId,
          buyerWarehouseClientId: buyerWarehouse?.id ?? null,
          sellerWarehouseClientId: sellerWarehouse?.id ?? null,
          paymentFormId,
          modalityId,
          packagingId,
          // D144: null explícito = "À definir" (só chega aqui no futureCreate).
          invoiceDate: invoiceDateTbd ? null : invoiceDate,
          paymentDate: paymentDateTbd ? null : paymentDate,
          purchaseNumber: purchaseNumber.trim() || null,
          paymentCondition: null,
          observations: observations.trim() || null,
          description: description.trim() || null,
          weightKg: weightKg.trim() ? parseDecimalBr(weightKg) : null,
          agioDesagioType: agioType || null,
          agioDesagioValue: agioType ? parseCurrencyInput(agioValue) : null,
          requiresApproval,
          approvalReminderLeadDays: leadDaysPayload,
        }
      : null;

    // RC-D27: o que o servidor precisa pra montar o MESMO documento que a emissão
    // vai gerar. Criação manda o corpo da criação; "Editar" manda o contractId +
    // a etapa 2 (o backend herda do contrato o que não veio).
    const previewBody = createBody
      ? futureCreate
        ? { type: 'FUTURO', ...createBody }
        : { type: 'MERCADO_A_VISTA', sampleId: spotCreate?.sampleId ?? null, ...createBody }
      : { contractId, ...payload };

    // RC-D27: a emissão de verdade, guardada pra rodar SÓ no "Confirmar" da tela
    // do documento. Fica num ref (não em estado): o que o usuário confirma tem
    // que ser exatamente o que foi validado e renderizado, sem chance de um
    // re-render trocar o payload no meio.
    pendingEmitRef.current = async () => {
      if (isCreateLike && createBody) {
        // Criação (à vista/Futuro) — 1 chamada só: o contrato nasce EMITIDO
        // (D97). O backend registra a venda no lote (à vista) e grava o contrato
        // completo na MESMA transação; não há mais passo EM_ABERTO intermediário
        // nem venda parcial a limpar.
        let created: { contract: { id: string } } | null = null;
        if (futureCreate) {
          created = await createFutureSaleContract(session, { type: 'FUTURO', ...createBody });
        } else if (spotCreate) {
          created = await createSpotSaleContract(session, {
            type: 'MERCADO_A_VISTA',
            sampleId: spotCreate.sampleId,
            expectedVersion: spotCreate.sampleVersion,
            ...createBody,
          });
        }
        // RC-D20: quem acabou de emitir quer VER o contrato, não a lista.
        onSaved(created?.contract?.id ?? null);
        return;
      }
      if (contractId && contract) {
        await emitSaleContract(session, contractId, {
          ...payload,
          expectedVersion: contract.version,
        });
        onSaved(contractId);
      }
    };

    try {
      const preview = await previewSaleContractPdf(session, previewBody as JsonValue);
      setConfirmDoc({
        blob: preview.blob,
        contractNumber: preview.contractNumber,
        provisionalNumber: preview.provisionalNumber,
      });
    } catch (cause) {
      pendingEmitRef.current = null;
      setError(cause instanceof ApiError ? cause.message : 'Falha ao gerar a prévia do contrato.');
    } finally {
      setSaving(false);
    }
  }

  // "Confirmar e emitir": só agora o contrato é criado. Erro NÃO fecha a tela do
  // documento — o usuário decide se tenta de novo ou volta ao formulário.
  async function handleConfirmEmit() {
    const run = pendingEmitRef.current;
    if (!run || saving) return;
    setSaving(true);
    setError(null);
    try {
      await run();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        // O conflito é sobre o formulário (saldo/versão do lote): fecha o
        // documento e devolve o painel, onde a mensagem faz sentido e o campo
        // ajustado está à mão.
        setConfirmDoc(null);
        pendingEmitRef.current = null;
        await handleVersionConflict(cause);
      } else {
        setError(cause instanceof ApiError ? cause.message : 'Falha ao emitir o contrato.');
      }
    } finally {
      setSaving(false);
    }
  }

  // 409 na emissão. Dizia sempre "Este contrato foi modificado. Recarregue a
  // página" — assunto errado na criação à vista (quem mudou foi o LOTE, não o
  // contrato, que ainda nem existe) e beco sem saída: a versão velha ficava presa
  // no estado, então reenviar falhava para sempre.
  //
  // No conflito do lote, re-hidrata versão e saldo PRESERVANDO o formulário: o
  // usuário só precisa conferir as sacas e emitir de novo.
  async function handleVersionConflict(cause: ApiError) {
    const code = (cause.details as { code?: string } | null)?.code;
    if (code !== 'SAMPLE_VERSION_CONFLICT' || !spotCreate || !onSpotRefreshed) {
      setError('Este contrato foi modificado. Recarregue a página e tente de novo.');
      return;
    }
    try {
      const { sample } = await getSampleDetail(session, spotCreate.sampleId);
      const nextAvailable = sample.availableSacks ?? 0;
      onSpotRefreshed(sample);
      // RC-D37: o vendedor é o dono do lote. Se o dono mudou no meio do
      // preenchimento, o campo travado tem que acompanhar — e a filial e o banco
      // do dono antigo deixam de valer.
      const nextOwnerId = sample.ownerClientId ?? null;
      const ownerChanged = nextOwnerId !== (seller?.id ?? null);
      if (ownerChanged) {
        setSellerUnitId('');
        setBankAccountId('');
        if (nextOwnerId) {
          const detail = await getClient(session, nextOwnerId).catch(() => null);
          if (detail) {
            setSeller(detail.client);
            setSellerUnits(detail.units);
          }
        } else {
          setSeller(null);
          setSellerUnits([]);
        }
      }
      if (nextAvailable <= 0) {
        setError('O lote não tem mais saldo para venda. Volte e escolha outro lote.');
        return;
      }
      if (ownerChanged) {
        setError(
          'O dono do lote mudou enquanto você preenchia — o vendedor do contrato acompanhou. Confira o banco e emita de novo.'
        );
        return;
      }
      // Sacas acima do novo saldo viram o saldo — é o valor que o auto-preenchimento
      // teria colocado, e o campo segue editável.
      const current = Number(saleSacks);
      const clamped = !Number.isInteger(current) || current > nextAvailable;
      if (clamped) setSaleSacks(String(nextAvailable));
      setError(
        clamped
          ? `O saldo do lote mudou para ${nextAvailable} sacas — o campo foi ajustado. Confira e emita de novo.`
          : `O lote mudou enquanto você preenchia (saldo atual: ${nextAvailable} sacas). Confira e emita de novo.`
      );
    } catch {
      setError('O lote mudou e não foi possível recarregá-lo. Volte e escolha o lote de novo.');
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
    <div className={fieldClass('sellerUnit')}>
      <span className="app-modal-label">Filial do vendedor</span>
      <InlineSelectField
        options={sellerUnits.map((unit) => ({ id: unit.id, label: unitLabel(unit) }))}
        value={sellerUnitId}
        onChange={(id) => {
          setSellerUnitId(id);
          onFieldChange();
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
      {fieldMessage('sellerUnit')}
    </div>
  );

  const buyerUnitField = (
    <div className={fieldClass('buyerUnit')}>
      <span className="app-modal-label">Filial do comprador</span>
      <InlineSelectField
        options={buyerUnits.map((unit) => ({ id: unit.id, label: unitLabel(unit) }))}
        value={buyerUnitId}
        onChange={(id) => {
          setBuyerUnitId(id);
          onFieldChange();
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
      {fieldMessage('buyerUnit')}
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
          onFieldChange();
        }}
      >
        <option value="">Nenhum</option>
        <option value="AGIO">Ágio</option>
        <option value="DESAGIO">Deságio</option>
      </select>
    </label>
  );

  const agioValueField = (
    <label className={fieldClass('agioValue')}>
      <span className="app-modal-label">Valor (R$/saca)</span>
      <input
        className="app-modal-input"
        inputMode="decimal"
        value={agioValue}
        disabled={disabled}
        onChange={(event) => {
          setAgioValue(maskCurrencyInput(event.target.value));
          onFieldChange();
        }}
        placeholder="0,00"
      />
      {fieldMessage('agioValue')}
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

  // RC-D37: contrato COM lote tem o vendedor TRAVADO — é o dono do lote, e o
  // servidor o deriva de lá (o payload não é lido). Trocar o vendedor se faz no
  // cadastro do lote. No Futuro (sem lote) o campo segue livre.
  const sellerLockedToLot = isSpotCreate || contract?.sampleId != null;

  function doExit(kind: 'close' | 'back') {
    if (kind === 'back' && handleBack) handleBack();
    else handleSheetClose();
  }

  // RC-D34: as duas saídas perdem o formulário inteiro. Com algo preenchido pelo
  // usuário, pedem confirmação; com o formulário intocado, saem direto — a
  // pergunta em cima de nada é só atrito. `true` = pode sair agora.
  function canExit(kind: 'close' | 'back'): boolean {
    if (saving) return false;
    // O ESC do BottomSheet é global e o modal central não entra na pilha de
    // sheets — sem este guard, apertar ESC com a conferência (ou o próprio
    // "Descartar?") aberta fecharia o painel POR BAIXO deles.
    if (confirmDoc || pendingExit) return false;
    if (touched) {
      setPendingExit(kind);
      return false;
    }
    return true;
  }

  // O botão do rodapé precisa AGIR; o dismiss do sheet só precisa da resposta
  // (quem fecha, nesse caso, é o próprio BottomSheet).
  function requestExit(kind: 'close' | 'back') {
    if (canExit(kind)) doExit(kind);
  }

  function confirmExit() {
    const kind = pendingExit ?? 'close';
    setPendingExit(null);
    doExit(kind);
  }

  const sheetFooter = (
    <div className="app-modal-actions ctr-etapa2-actions">
      <button
        type="button"
        className="app-modal-secondary"
        onClick={() => requestExit(handleBack ? 'back' : 'close')}
        disabled={saving}
      >
        {handleBack ? 'Voltar' : 'Cancelar'}
      </button>
      {/* RC-D27: "Emitir" deixou de emitir — ele monta o documento e abre a
          conferência. Quem emite é o "Confirmar" de lá. */}
      <button
        type="button"
        className="app-modal-submit"
        onClick={handleSubmit}
        disabled={saving || loading}
      >
        {saving ? 'Gerando...' : 'Emitir'}
      </button>
    </div>
  );

  return (
    <>
      <BottomSheet
        open={open}
        onClose={handleSheetClose}
        onDismissAttempt={() => canExit('close')}
        title={null}
        ariaLabel={sheetTitle}
        footer={sheetFooter}
        stacked={isSpotCreate}
        closeVariant="edge-back"
        dragDisabled={pendingExit != null || confirmDoc != null}
        className="fv-panel-sheet side-sheet ctr-form-sheet ctr-contract-sheet"
      >
        {error ? <p className="sdv-modal-error">{error}</p> : null}
        {loadError ? <p className="sdv-modal-error">{loadError}</p> : null}
        {/* Some sozinho quando a conta é reescolhida: o banner vale enquanto o
            estado que ele descreve for verdade, e não por um tempo fixo. */}
        {ownerDivergedNotice && !bankAccountId ? (
          <p className="ctr-form-notice" role="status">
            O dono do lote mudou desde a emissão, então o vendedor deste contrato acompanhou.
            Escolha de novo a filial e a conta bancária.
          </p>
        ) : null}

        {loading ? (
          <div className="app-modal-content">
            <p className="ctr-modal-loading">Carregando...</p>
          </div>
        ) : (
          <div className="app-modal-content ctr-etapa2-content">
            <p className="fv-panel-lead">{sheetTitle}</p>

            {/* RC-D32: faixa de identidade do lote. Fechado o picker, é a única
                chance de conferir que o lote é o certo — antes daqui só havia
                uma linha cinza com o número. */}
            {isSpotCreate && spotCreate ? (
              <div className="ctr-lot-band">
                <span className="ctr-lot-band-code">
                  Lote {spotCreate.internalLotNumber ?? 'sem número'}
                </span>
                {spotCreate.ownerName ? (
                  <>
                    <span className="ctr-lot-band-dot" aria-hidden="true">
                      ·
                    </span>
                    <span className="ctr-lot-band-fact">{spotCreate.ownerName}</span>
                  </>
                ) : null}
                {spotCreate.harvest ? (
                  <>
                    <span className="ctr-lot-band-dot" aria-hidden="true">
                      ·
                    </span>
                    <span className="ctr-lot-band-fact">
                      {/* HarvestDisplay, nao texto cru: liga com 2+ safras vira o
                          badge "Mix" — mesmo desenho do card do picker que o
                          usuario acabou de ver. `showMixSafras={false}` porque a
                          faixa ja separa fatos por "·" e a lista de safras usa o
                          mesmo separador. */}
                      Safra <HarvestDisplay harvest={spotCreate.harvest} showMixSafras={false} />
                    </span>
                  </>
                ) : null}
                <span className="ctr-lot-band-dot" aria-hidden="true">
                  ·
                </span>
                <span className="ctr-lot-band-fact">
                  {spotCreate.availableSacks} sacas disponíveis
                </span>
              </div>
            ) : null}

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

                  <label className={fieldClass('saleDate')}>
                    <span className="app-modal-label">Data do contrato</span>
                    <input
                      className="app-modal-input"
                      type="date"
                      value={saleDate}
                      disabled={disabled}
                      onChange={(event) => {
                        setSaleDate(event.target.value);
                        onFieldChange();
                      }}
                    />
                    {fieldMessage('saleDate')}
                  </label>

                  <div style={halfRowStyle}>
                    <div className={fieldClass('saleSacks')}>
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
                          onFieldChange();
                        }}
                      />
                      {fieldMessage('saleSacks')}
                    </div>

                    <label className={fieldClass('saleUnitPrice')}>
                      <span className="app-modal-label">Preço por saca (R$)</span>
                      <input
                        className="app-modal-input"
                        inputMode="decimal"
                        value={saleUnitPrice}
                        disabled={disabled}
                        onChange={(event) => {
                          setSaleUnitPrice(maskCurrencyInput(event.target.value));
                          onFieldChange();
                        }}
                        placeholder="0,00"
                      />
                      {fieldMessage('saleUnitPrice')}
                    </label>
                  </div>

                  <div style={halfRowStyle}>
                    <label className={fieldClass('saleSellerPct')}>
                      <span className="app-modal-label">Corretagem do vendedor (%)</span>
                      <input
                        className="app-modal-input"
                        inputMode="decimal"
                        value={saleSellerPct}
                        disabled={disabled}
                        onChange={(event) => {
                          setSaleSellerPct(event.target.value.replace(/[^0-9.,]/g, ''));
                          onFieldChange();
                        }}
                        placeholder="0"
                      />
                      {fieldMessage('saleSellerPct')}
                    </label>

                    <label className={fieldClass('saleBuyerPct')}>
                      <span className="app-modal-label">Corretagem do comprador (%)</span>
                      <input
                        className="app-modal-input"
                        inputMode="decimal"
                        value={saleBuyerPct}
                        disabled={disabled}
                        onChange={(event) => {
                          setSaleBuyerPct(event.target.value.replace(/[^0-9.,]/g, ''));
                          onFieldChange();
                        }}
                        placeholder="0"
                      />
                      {fieldMessage('saleBuyerPct')}
                    </label>
                  </div>

                  <div className={fieldClass('saleBrokers')}>
                    <span className="app-modal-label">Corretores</span>
                    <BrokerMultiSelectField
                      session={session}
                      selectedIds={saleBrokerIds}
                      disabled={disabled}
                      onChange={(ids) => {
                        setSaleBrokerIds(ids);
                        onFieldChange();
                      }}
                    />
                    {fieldMessage('saleBrokers')}
                  </div>
                </div>

                <div className="ctr-block">
                  {/* Bloco Vendedor */}
                  <p className="ctr-section-title">Vendedor</p>

                  <div className="ctr-pair">
                    <div className={fieldClass('seller')}>
                      <span className="app-modal-label">Vendedor</span>
                      {/* RC-D37: com lote, o vendedor é o dono do lote e o campo
                          não abre. Trocá-lo aqui transferia o lote no ato de
                          emitir — agora a troca se faz onde ela pertence, no
                          cadastro do lote. */}
                      {sellerLockedToLot ? (
                        <>
                          <p className="ctr-locked-value">
                            {seller?.displayName ?? 'Sem produtor'}
                          </p>
                          <span className="ctr-locked-hint">
                            É o dono do lote. Para trocar, edite o dono no cadastro do lote.
                          </span>
                        </>
                      ) : (
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
                      )}
                      {fieldMessage('seller')}
                    </div>

                    {sellerIsPF ? sellerUnitField : null}
                  </div>

                  <div className="ctr-pair">
                    <div className={fieldClass('bankAccount')}>
                      <span className="app-modal-label">Banco do vendedor</span>
                      <ClientBankAccountSelectField
                        session={session}
                        clientId={seller?.id ?? null}
                        value={bankAccountId}
                        disabled={disabled}
                        defaultHolderName={seller?.displayName ?? null}
                        defaultHolderTaxId={seller?.cnpj ?? seller?.cpf ?? null}
                        onChange={(id) => {
                          setBankAccountId(id ?? '');
                          onFieldChange();
                        }}
                      />
                      {fieldMessage('bankAccount')}
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
                    <div className={fieldClass('buyer')}>
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
                      {fieldMessage('buyer')}
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
                    <label className={fieldClass('paymentForm')}>
                      <span className="app-modal-label">Forma de pagamento</span>
                      <InlineSelectField
                        options={(lookups?.paymentForms ?? []).map((item) => ({
                          id: item.id,
                          label: item.name,
                        }))}
                        value={paymentFormId}
                        onChange={(id) => {
                          setPaymentFormId(id);
                          onFieldChange();
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
                      {fieldMessage('paymentForm')}
                    </label>

                    <label className={fieldClass('modality')}>
                      <span className="app-modal-label">Modalidade</span>
                      <InlineSelectField
                        options={(lookups?.modalities ?? []).map((item) => ({
                          id: item.id,
                          label: item.name,
                        }))}
                        value={modalityId}
                        onChange={(id) => {
                          setModalityId(id);
                          onFieldChange();
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
                      {fieldMessage('modality')}
                    </label>
                  </div>

                  <label className={fieldClass('packaging')}>
                    <span className="app-modal-label">Embalagem</span>
                    <InlineSelectField
                      options={(lookups?.packagings ?? []).map((item) => ({
                        id: item.id,
                        label: item.name,
                      }))}
                      value={packagingId}
                      onChange={(id) => {
                        setPackagingId(id);
                        onFieldChange();
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
                    {fieldMessage('packaging')}
                  </label>

                  {/* D144: no FUTURO cada data planejada tem o toggle "À definir"
                      (limpa/desabilita o input; o submit envia null explícito). */}
                  <div style={halfRowStyle}>
                    <div className={fieldClass('invoiceDate')}>
                      <span className="app-modal-label ctr-date-label">
                        Data de faturamento
                        {isFuturo ? (
                          <button
                            type="button"
                            className={`ctr-tbd-toggle${invoiceDateTbd ? ' is-selected' : ''}`}
                            aria-pressed={invoiceDateTbd}
                            disabled={disabled}
                            onClick={() => {
                              setInvoiceDateTbd((prev) => {
                                if (!prev) setInvoiceDate('');
                                return !prev;
                              });
                              onFieldChange();
                            }}
                          >
                            À definir
                          </button>
                        ) : null}
                      </span>
                      <input
                        className="app-modal-input"
                        type="date"
                        aria-label="Data de faturamento"
                        value={invoiceDate}
                        disabled={disabled || invoiceDateTbd}
                        onChange={(event) => {
                          setInvoiceDate(event.target.value);
                          onFieldChange();
                        }}
                      />
                      {/* O aviso do submit entra só como ÚLTIMO caso: as datas já
                          avisam ao vivo (fim de semana, ordem) e duas mensagens no
                          mesmo campo seria ruído. */}
                      {!invoiceDateTbd && isWeekendIso(invoiceDate) ? (
                        <span className="app-modal-field-error">{WEEKEND_DATE_MESSAGE}</span>
                      ) : (
                        fieldMessage('invoiceDate')
                      )}
                    </div>

                    <div className={fieldClass('paymentDate')}>
                      <span className="app-modal-label ctr-date-label">
                        Data de pagamento
                        {isFuturo ? (
                          <button
                            type="button"
                            className={`ctr-tbd-toggle${paymentDateTbd ? ' is-selected' : ''}`}
                            aria-pressed={paymentDateTbd}
                            disabled={disabled}
                            onClick={() => {
                              setPaymentDateTbd((prev) => {
                                if (!prev) setPaymentDate('');
                                return !prev;
                              });
                              onFieldChange();
                            }}
                          >
                            À definir
                          </button>
                        ) : null}
                      </span>
                      <input
                        className="app-modal-input"
                        type="date"
                        aria-label="Data de pagamento"
                        value={paymentDate}
                        disabled={disabled || paymentDateTbd}
                        onChange={(event) => {
                          setPaymentDate(event.target.value);
                          onFieldChange();
                        }}
                      />
                      {!paymentDateTbd && isWeekendIso(paymentDate) ? (
                        <span className="app-modal-field-error">{WEEKEND_DATE_MESSAGE}</span>
                      ) : !invoiceDateTbd &&
                        !paymentDateTbd &&
                        paymentDate &&
                        invoiceDate &&
                        paymentDate < invoiceDate ? (
                        <span className="app-modal-field-error">
                          A data de pagamento não pode ser anterior à data de faturamento.
                        </span>
                      ) : (
                        fieldMessage('paymentDate')
                      )}
                    </div>
                  </div>
                </div>

                <div className="ctr-block">
                  {/* Aprovação (reforma AP1/AP6) */}
                  <p className="ctr-section-title">Aprovação</p>

                  <div className={fieldClass('requiresApproval')}>
                    <span className="app-modal-label">Este contrato precisa de aprovação?</span>
                    {isCreateLike ? (
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
                            onFieldChange();
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
                            onFieldChange();
                          }}
                        >
                          Não
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* AP32: no "Editar" o sinal é read-only — latch de mão única
                            (muda só na criação e pelo botão "Solicitar aprovação"). */}
                        <div
                          className="ctr-approval-choice"
                          role="group"
                          aria-label="Precisa de aprovação?"
                        >
                          <button
                            type="button"
                            className="ctr-approval-btn is-selected"
                            aria-pressed={true}
                            disabled
                          >
                            {requiresApproval ? 'Sim' : 'Não'}
                          </button>
                        </div>
                        {!requiresApproval ? (
                          <p className="ctr-approval-note">
                            Para exigir aprovação, use “Solicitar aprovação” no contrato.
                          </p>
                        ) : null}
                      </>
                    )}
                    {fieldMessage('requiresApproval')}
                  </div>

                  {requiresApproval === true ? (
                    <label className={fieldClass('approvalLead')}>
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
                          onFieldChange();
                        }}
                        placeholder="30"
                      />
                      {fieldMessage('approvalLead')}
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

      {/* RC-D27/D28: fase 2 — o documento pra conferir antes de emitir. O painel
          continua montado atrás; "Voltar" só descarta esta tela. */}
      {confirmDoc ? (
        <ContractDocumentConfirmModal
          blob={confirmDoc.blob}
          contractNumber={confirmDoc.contractNumber}
          provisionalNumber={confirmDoc.provisionalNumber}
          submitting={saving}
          error={error}
          onConfirm={() => void handleConfirmEmit()}
          onBack={() => {
            if (saving) return;
            setConfirmDoc(null);
            pendingEmitRef.current = null;
            setError(null);
          }}
        />
      ) : null}

      {/* RC-D34: descartar rascunho. Confirm central `.is-scrim-none` +
          `.is-compact` — o fundo NÃO escurece, então o formulário que está
          prestes a se perder continua visível atrás (molde de /users e
          /relatorios, skill `forms` §8). */}
      {pendingExit
        ? createPortal(
            <div className="app-modal-backdrop is-scrim-none" onClick={() => setPendingExit(null)}>
              <section
                className="app-modal is-themed app-confirm-modal is-compact"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="ctr-discard-title"
                aria-describedby="ctr-discard-description"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="app-modal-content">
                  <div className="app-confirm-modal-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                      <path d="M12 9v4" />
                      <path d="M12 17v.01" />
                    </svg>
                  </div>
                  <h3 id="ctr-discard-title" className="app-confirm-modal-title">
                    {pendingExit === 'back'
                      ? 'Voltar e escolher outro lote?'
                      : 'Descartar contrato?'}
                  </h3>
                  <p id="ctr-discard-description" className="app-confirm-modal-message">
                    O que você preencheu será perdido. O contrato ainda não foi emitido.
                  </p>
                </div>

                <div className="app-modal-actions">
                  <button
                    type="button"
                    className="app-modal-secondary"
                    onClick={() => setPendingExit(null)}
                    autoFocus
                  >
                    Continuar preenchendo
                  </button>
                  <button
                    type="button"
                    className="app-modal-submit is-danger"
                    onClick={confirmExit}
                  >
                    {pendingExit === 'back' ? 'Voltar' : 'Descartar'}
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
