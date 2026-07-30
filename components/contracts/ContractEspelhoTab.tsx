'use client';

import { useEffect, useRef, useState } from 'react';

import { ApiError, downloadEspelhoPdf, logEspelhoExport } from '../../lib/api-client';
import {
  espelhoSideEligibility,
  espelhoSideLabel,
  espelhoSides,
  latestEspelhoBySide,
  type DeliveredEspelho,
  type EspelhoSide,
} from '../../lib/espelho';
import { downloadFile, shareOrDownloadFile } from '../../lib/share-blob';
import type { SaleContract, SaleContractTimelineItem, SessionData } from '../../lib/types';

import { ContractDocumentView, useContractDocumentPages } from './ContractDocumentView';
import { snapshotName } from './SaleContractCard';

// Aba ESPELHO do detalhe do contrato (RC-D124/D125). Ela absorveu as DUAS superfícies
// que o espelho tinha: a Conferência (EspelhoConferenciaModal, D134) e a prévia
// (EspelhoCorretagemModal, Fase E). O que fazia sentido enquanto elas flutuavam por cima
// do detalhe deixou de fazer aqui:
//   - o TOGGLE de lado morreu: há um bloco POR LADO, e o rótulo já diz de quem é;
//   - o "Ver detalhes" (e o vai-e-volta que o painel mantinha para reabrir a conferência
//     depois) morreu: corrigir o contrato agora é trocar de aba.
//
// O que NÃO mudou, porque é regra e não moldura:
//   - a prévia não audita (D127): quem registra é Exportar/Baixar, e é a ENTREGA que
//     congela o snapshot (RC-D103);
//   - releitura de um guardado não registra de novo — é o mesmo documento;
//   - RC-D111: quem libera o botão é a elegibilidade DO LADO, gate por gate, na ordem do
//     `assertEspelhoEligible`. A pergunta "algum lado sai" mandaria o usuário para um 409
//     garantido.

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function money(value: number | null | undefined): string {
  return value != null ? BRL.format(value) : '—';
}

function dateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

// Timestamp REAL (não @db.Date) no fuso do NEGÓCIO — é a mesma data que o PDF imprime na
// coluna "Data". Formatar em UTC faria a linha "entregue em" mostrar um dia diferente do
// papel nas primeiras horas da noite.
function brtDateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

type ContractEspelhoTabProps = {
  session: SessionData;
  contract: SaleContract;
  timeline: SaleContractTimelineItem[] | null;
  /** Dono ATUAL do lote (RC-D37/D110) — só para o aviso de divergência no lado vendedor. */
  sampleOwner: { clientId: string; displayName: string | null } | null;
  /** Chamado quando uma entrega é registrada: o pai recarrega contrato + timeline. */
  onDelivered: () => void;
};

export function ContractEspelhoTab({
  session,
  contract,
  timeline,
  sampleOwner,
  onDelivered,
}: ContractEspelhoTabProps) {
  const sides = espelhoSides(contract);
  const delivered = latestEspelhoBySide(timeline);

  // Sem lado com corretagem não há espelho a emitir — e é diferente de "ainda não
  // gerei". A frase explica o motivo em vez de mostrar um botão que só daria 409.
  if (sides.length === 0) {
    const cancelledFree = contract.status === 'WASH_OUT' && contract.washoutBillable !== true;
    return (
      <p className="ctr-details-empty">
        {cancelledFree
          ? 'Contrato cancelado sem cobrança de corretagem — não há espelho a emitir.'
          : 'Este contrato não tem corretagem de nenhum lado — não há espelho a emitir.'}
      </p>
    );
  }

  return (
    <div className="ctr-espelho-blocks">
      {sides.map((side) => (
        <EspelhoSideBlock
          key={side}
          session={session}
          contract={contract}
          side={side}
          delivered={delivered[side] ?? null}
          sampleOwner={sampleOwner}
          onDelivered={onDelivered}
        />
      ))}
    </div>
  );
}

type EspelhoSideBlockProps = {
  session: SessionData;
  contract: SaleContract;
  side: EspelhoSide;
  delivered: DeliveredEspelho | null;
  sampleOwner: { clientId: string; displayName: string | null } | null;
  onDelivered: () => void;
};

function EspelhoSideBlock({
  session,
  contract,
  side,
  delivered,
  sampleOwner,
  onDelivered,
}: EspelhoSideBlockProps) {
  // `generating` = o usuário pediu um documento NOVO (primeira vez, ou "Gerar de novo"
  // sobre um que ficou desatualizado). Enquanto vale, o bloco mostra a PRÉVIA — que ainda
  // não é entrega nenhuma.
  const [generating, setGenerating] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<{ blob: Blob; fileName: string } | null>(null);

  const deliveredId = delivered?.logId ?? null;
  // A entrega chegou (o pai recarregou a timeline): a prévia vira o guardado. Reagir ao
  // `deliveredId` — e não desligar o `generating` no handler — evita o piscar de volta
  // para os campos entre o registro e a chegada do item novo.
  useEffect(() => {
    if (deliveredId) setGenerating(false);
  }, [deliveredId]);

  const showsPreview = generating;
  const showsStored = !generating && deliveredId != null;
  const showsFields = !generating && deliveredId == null;

  useEffect(() => {
    if (showsFields) {
      setPdfBlob(null);
      setError(null);
      fileRef.current = null;
      return;
    }
    let aborted = false;
    (async () => {
      setLoading(true);
      setError(null);
      setPdfBlob(null);
      fileRef.current = null;
      try {
        const { blob, fileName } = await downloadEspelhoPdf(
          session,
          contract.id,
          side,
          showsPreview ? { preview: true } : { logId: deliveredId as string }
        );
        if (aborted) return;
        fileRef.current = { blob, fileName };
        setPdfBlob(blob);
      } catch (cause) {
        if (!aborted) {
          setError(cause instanceof ApiError ? cause.message : 'Não foi possível gerar o espelho.');
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [session, contract.id, side, showsFields, showsPreview, deliveredId]);

  // RC-D130: o espelho também deixa de ser `<iframe>` e vira página rasterizada — o
  // mesmo desenho do contrato e da conferência da emissão.
  const espelhoDocument = useContractDocumentPages(pdfBlob);

  // D127: audita ("Espelho exportado" no timeline) SÓ na ENTREGA concluída — não na
  // intenção.
  //
  // 🔴 RC-D107: não é fire-and-forget com toast incondicional. Isto AGORA grava o
  // documento (RC-D103), então um erro aqui significa que a entrega não ficou registrada
  // — e o operador precisa saber, porque o papel já saiu.
  async function logDelivery() {
    if (!showsPreview) return; // releitura do mesmo documento não registra de novo
    try {
      await logEspelhoExport(session, contract.id, side, contract.version);
      onDelivered();
    } catch (cause) {
      const message =
        cause instanceof ApiError ? cause.message : 'Não foi possível registrar o espelho.';
      // A entrega ACONTECEU — o arquivo saiu. O que falhou foi guardar.
      setError(`O espelho foi entregue, mas não foi possível registrá-lo. ${message}`);
    }
  }

  async function handleExport() {
    if (!fileRef.current || busy) return;
    setBusy(true);
    try {
      const result = await shareOrDownloadFile(fileRef.current.blob, fileRef.current.fileName, {
        mimeType: 'application/pdf',
        shareTitle: `Espelho de Corretagem ${contract.contractNumber}`,
      });
      // Share cancelado (AbortError → 'cancelled') NÃO audita: nada saiu do aparelho.
      if (result !== 'cancelled') await logDelivery();
    } catch {
      setError('Não foi possível compartilhar o espelho.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!fileRef.current || busy) return;
    setBusy(true);
    try {
      downloadFile(fileRef.current.blob, fileRef.current.fileName);
      await logDelivery();
    } finally {
      setBusy(false);
    }
  }

  const sideCheck = espelhoSideEligibility(contract, side);
  const stale = showsStored && Boolean(delivered?.stale);

  return (
    <section className="ctr-espelho-block">
      <header className="ctr-espelho-block-head">
        <h4 className="ctr-section-title">{espelhoSideLabel(side)}</h4>
        {showsStored ? (
          <span className="ctr-espelho-block-meta">
            entregue em {brtDateOnly(delivered?.at)}
            {delivered?.commission != null ? ` · ${money(delivered.commission)}` : ''}
          </span>
        ) : null}
      </header>

      {error ? <p className="sdv-modal-error">{error}</p> : null}

      {showsFields ? (
        <EspelhoConferencia
          contract={contract}
          side={side}
          sampleOwner={sampleOwner}
          eligible={sideCheck.eligible}
          reason={sideCheck.reason ?? null}
          onGerar={() => setGenerating(true)}
        />
      ) : (
        <>
          {loading ? (
            <p className="ctr-modal-loading">Gerando o espelho...</p>
          ) : (
            <ContractDocumentView
              document={espelhoDocument}
              label={`o espelho de ${espelhoSideLabel(side).toLowerCase()} do contrato ${contract.contractNumber}`}
              onFallbackDownload={fileRef.current ? () => void handleDownload() : null}
            />
          )}
          {stale ? (
            <p className="ctr-doc-warning">
              O contrato mudou depois deste espelho. Os valores aqui são os que foram entregues;
              para um documento atualizado, gere um espelho novo.
            </p>
          ) : null}
          <p className="ctr-doc-hint">
            {showsStored
              ? delivered?.expiresAt
                ? `Espelho guardado. Disponível até ${brtDateOnly(delivered.expiresAt)} — 15 dias depois do fim do contrato.`
                : 'Espelho guardado enquanto o contrato estiver em andamento; sai 15 dias depois de ele terminar.'
              : 'Ainda não foi entregue: o espelho só fica guardado depois de Baixar ou Exportar.'}
          </p>
          <div className="ctr-details-actions">
            {showsStored ? (
              <button
                type="button"
                className="ctr-btn"
                disabled={busy || !sideCheck.eligible}
                onClick={() => setGenerating(true)}
              >
                Gerar de novo
              </button>
            ) : null}
            {/* 🔴 A VOLTA do "Gerar de novo". Ele liga o `generating`, que só desliga
                quando o `deliveredId` MUDA — e sobre um espelho já entregue ele não
                muda. Sem esta saída, mudar de ideia obrigava a fechar o detalhe
                inteiro. Só aparece quando há um guardado atrás da prévia. */}
            {showsPreview && deliveredId ? (
              <button
                type="button"
                className="ctr-btn"
                disabled={busy}
                onClick={() => setGenerating(false)}
              >
                Voltar ao guardado
              </button>
            ) : null}
            <button
              type="button"
              className="ctr-btn"
              onClick={() => void handleDownload()}
              disabled={!pdfBlob || busy}
            >
              Baixar
            </button>
            <button
              type="button"
              className="ctr-btn"
              onClick={() => void handleExport()}
              disabled={!pdfBlob || busy}
            >
              {busy ? 'Exportando...' : 'Exportar'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

// RC-D128: releitura de UM espelho guardado, aberta pela linha do Histórico. É por onde
// se chega aos SUBSTITUÍDOS — os que a aba Espelho, mostrando um por lado, não lista.
//
// 🔴 Aqui NÃO há registro: reabrir o mesmo documento não é uma entrega nova. É a mesma
// regra do `logDelivery` acima, só que aqui ela é estrutural — este componente não tem
// como chamar o log.
export function StoredEspelhoFrame({
  session,
  contractId,
  logId,
  side,
  contractNumber,
}: {
  session: SessionData;
  contractId: string;
  logId: string;
  side: EspelhoSide;
  contractNumber: string;
}) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<{ blob: Blob; fileName: string } | null>(null);

  useEffect(() => {
    let aborted = false;
    (async () => {
      setError(null);
      setPdfBlob(null);
      fileRef.current = null;
      try {
        const { blob, fileName } = await downloadEspelhoPdf(session, contractId, side, { logId });
        if (aborted) return;
        fileRef.current = { blob, fileName };
        setPdfBlob(blob);
      } catch (cause) {
        if (!aborted) {
          setError(cause instanceof ApiError ? cause.message : 'Não foi possível abrir o espelho.');
        }
      }
    })();
    return () => {
      aborted = true;
    };
  }, [session, contractId, logId, side]);

  const storedDocument = useContractDocumentPages(pdfBlob);

  return (
    <div className="ctr-tl-espelho">
      {error ? (
        <p className="sdv-modal-error">{error}</p>
      ) : (
        <ContractDocumentView
          document={storedDocument}
          label={`o espelho de ${espelhoSideLabel(side).toLowerCase()} do contrato ${contractNumber}`}
          loadingLabel="Abrindo o espelho..."
          onFallbackDownload={
            fileRef.current
              ? () =>
                  fileRef.current && downloadFile(fileRef.current.blob, fileRef.current.fileName)
              : null
          }
        />
      )}
      <div className="ctr-details-actions">
        <button
          type="button"
          className="ctr-btn"
          disabled={!pdfBlob || busy}
          onClick={() => {
            if (fileRef.current) downloadFile(fileRef.current.blob, fileRef.current.fileName);
          }}
        >
          Baixar
        </button>
        <button
          type="button"
          className="ctr-btn"
          disabled={!pdfBlob || busy}
          onClick={() => {
            if (!fileRef.current) return;
            setBusy(true);
            void shareOrDownloadFile(fileRef.current.blob, fileRef.current.fileName, {
              mimeType: 'application/pdf',
              shareTitle: `Espelho de Corretagem ${contractNumber}`,
            })
              .catch(() => setError('Não foi possível compartilhar o espelho.'))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Exportando...' : 'Exportar'}
        </button>
      </div>
    </div>
  );
}

// Os campos que vão sair impressos, conferidos ANTES de gerar (era o corpo do
// EspelhoConferenciaModal, D134). Espelha os valores que o PDF imprime (D131–D133):
// Data = data de GERAÇÃO (hoje); Preço = EFETIVO (cru ± ágio/deságio por saca).
function EspelhoConferencia({
  contract,
  side,
  sampleOwner,
  eligible,
  reason,
  onGerar,
}: {
  contract: SaleContract;
  side: EspelhoSide;
  sampleOwner: { clientId: string; displayName: string | null } | null;
  eligible: boolean;
  reason: string | null;
  onGerar: () => void;
}) {
  const clientName = snapshotName(
    side === 'seller' ? contract.sellerSnapshot : contract.buyerSnapshot
  );
  const commission =
    side === 'seller' ? contract.sellerBrokerageValue : contract.buyerBrokerageValue;
  // O fuso é o do NEGÓCIO, não o do aparelho: o PDF formata em America/Sao_Paulo, e sem
  // isto um aparelho fora do BRT conferia uma data diferente da impressa.
  const generatedDate = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const agioText =
    contract.agioDesagioType && contract.agioDesagioValue != null
      ? `${contract.agioDesagioType === 'AGIO' ? 'Ágio' : 'Deságio'} · ${money(contract.agioDesagioValue)}/sc`
      : null;

  // RC-D110: o espelho do vendedor imprime o nome CONGELADO na emissão, e o dono do lote
  // pode ter mudado desde então (RC-D37). Avisa, não bloqueia: quem cobra é quem vendeu,
  // e trocar o dono do lote depois não muda de quem é a corretagem — mas o operador
  // precisa saber que o nome do papel não é o dono de hoje.
  const ownerDiverged =
    side === 'seller' &&
    sampleOwner != null &&
    contract.sellerClientId != null &&
    sampleOwner.clientId !== contract.sellerClientId;

  const rows: Array<[string, string]> = [
    ['Cliente', clientName],
    ['Nº do contrato', contract.contractNumber],
    ['Data (geração)', generatedDate],
    ['Pagamento', dateBR(contract.paymentDate)],
    ['Preço/saca', money(contract.effectiveUnitPrice)],
  ];
  if (agioText) rows.push(['Ágio/Deságio', agioText]);
  rows.push(['Sacas', contract.quantitySacks != null ? String(contract.quantitySacks) : '—']);
  rows.push(['Comissão', money(commission)]);
  if (contract.purchaseNumber) rows.push(['Nº compra', contract.purchaseNumber]);

  return (
    <>
      <dl className="ctr-details-rows">
        {rows.map(([label, value]) => (
          <div key={label} className="ctr-details-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {ownerDiverged ? (
        <p className="ctr-doc-warning">
          O dono do lote mudou desde a emissão
          {sampleOwner?.displayName ? ` (hoje é ${sampleOwner.displayName})` : ''}. O espelho
          imprime o vendedor do contrato, que é quem vendeu — confira se a cobrança é mesmo dele.
        </p>
      ) : null}

      {eligible ? (
        <p className="ctr-espelho-conf-hint">
          Confira os dados acima. Para corrigir alguma informação, use o Editar na aba Detalhes.
        </p>
      ) : (
        <p className="sdv-modal-error">{reason}</p>
      )}

      <div className="ctr-details-actions">
        <button type="button" className="ctr-btn" disabled={!eligible} onClick={onGerar}>
          Gerar espelho
        </button>
      </div>
    </>
  );
}
