'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { ANIMATION_MS, BottomSheet } from './BottomSheet';
import { OriginLotChips } from './OriginLotChips';
import {
  ApiError,
  sendApprovalLabel,
  setSaleContractPurchaseNumber,
  updateRegistration,
} from '../lib/api-client';
import { useToast } from '../lib/toast/ToastProvider';
import type { ApprovalLabelPrefill, ApprovalOriginLotLockReason, SessionData } from '../lib/types';

// Modal da Etiqueta de Aprovação (Fase I, D112–D119). Mesmo padrão do
// NewSampleModal: bottom-sheet saindo de baixo (central no desktop via CSS)
// + efeito de sucesso (check animado) que auto-fecha. Uma porta: o detalhe do
// contrato abre com os campos PRÉ-PREENCHIDOS (o seletor do /samples e a
// etiqueta "Manual"/avulsa saíram com a AP29/AP12). Imprime na MESMA impressora
// (print agent), sem QR, 1 cópia por envio. Envio AUDITADO: sendApprovalLabel
// grava o custom_print_job + a linha da approval_label_log na mesma transação
// (sempre com saleContractId — AP12). Gate central não-PROSPECTOR no backend.
//
// RC-D98/D99/D100 (2026-07-29): a etiqueta deixou de ser write-only. Só DOIS
// campos são editáveis — "Nº compra" e "Lotes de origem" — e os dois GRAVAM DE
// VOLTA antes de imprimir: o número no contrato, os lotes no cadastro do lote.
// Os outros quatro viram leitura (`forms` §3): eles pertencem ao contrato, e
// editá-los aqui só faria o papel divergir do sistema.

interface FieldConfig {
  key: string;
  uiLabel: string; // rótulo no formulário (amigável)
  printLabel: string; // rótulo impresso na etiqueta (abreviado, maiúsculo)
  placeholder: string;
  numeric?: boolean;
  noSpaces?: boolean; // bloqueia espaço no input (só caracteres)
  maxChars?: number; // limite de caracteres do input (default 80)
  // RC-D98: campo de LEITURA — vem do contrato e não é editável aqui. Renderiza
  // o valor, não um input desabilitado (`forms` §3: não pode parecer clicável).
  locked?: boolean;
}

// Campos de VALOR ÚNICO (impressos). O Lote NÃO está aqui: tem markup próprio
// (chips) logo abaixo. Os printLabel saem MAIÚSCULOS com ":" na etiqueta (o ":"
// é adicionado pelo buildCustomLabel).
const FIELDS: FieldConfig[] = [
  {
    // Permite espaço (a etiqueta quebra o Nº compra em até 2 linhas). maxChars 26
    // = 2 linhas × 13 chars/linha, o máximo que a etiqueta exibe sem encolher a
    // fonte abaixo do piso (ver print-agent/label.js, coluna COMPRA).
    key: 'compra',
    uiLabel: 'Nº compra',
    printLabel: 'N° COMPRA',
    placeholder: 'Nº da compra',
    maxChars: 26,
  },
  {
    key: 'fechamento',
    uiLabel: 'Nº fechamento',
    printLabel: 'N° FECHAMENTO',
    placeholder: 'Nº do fechamento',
    noSpaces: true,
    maxChars: 36,
    locked: true,
  },
  {
    key: 'produtor',
    uiLabel: 'Produtor',
    printLabel: 'PRODUT',
    placeholder: 'Nome do produtor',
    maxChars: 52,
    locked: true,
  },
  {
    key: 'armazem',
    uiLabel: 'Armazém',
    printLabel: 'ARMAZ',
    placeholder: 'Nome do armazém',
    maxChars: 52,
    locked: true,
  },
  {
    key: 'sacas',
    uiLabel: 'Sacas',
    printLabel: 'SACAS',
    placeholder: 'Total de sacas',
    numeric: true,
    maxChars: 26,
    locked: true,
  },
];

// Disposição dos campos de valor único (linhas; pares lado a lado). `weight` =
// fração da largura da linha (colunas desiguais via grid-template-columns em
// `fr`). O grupo de Lotes é renderizado SEPARADAMENTE, logo abaixo (full-width).
const FORM_ROWS: Array<Array<{ key: string; weight: number }>> = [
  [
    { key: 'compra', weight: 1 },
    { key: 'fechamento', weight: 1 },
  ],
  [
    { key: 'produtor', weight: 2 },
    { key: 'sacas', weight: 1 },
  ],
  [{ key: 'armazem', weight: 1 }],
];

const FIELD_BY_KEY: Record<string, FieldConfig> = Object.fromEntries(
  FIELDS.map((field) => [field.key, field])
);

// Rótulo impresso do Lote. O modal manda o texto CRU numa única linha LOTE; o
// recorte do papel (16 chars por código, 7 + "+" acima de 8) é do backend, no
// splitOriginLotForLabel — a MESMA função do prefill (RC-D100).
const LOTE_PRINT_LABEL = 'LOTE';

// Quantos códigos a grade 4x2 do papel comporta. Acima disso o backend imprime
// 7 + "+", e o modal diz isso ao operador — recorte silencioso mentiria sobre o
// que vai sair.
const LOTS_ON_LABEL = 8;

// RC-D100: por que o campo de lotes está travado. Cada motivo vira a frase
// exibida — campo apagado sem explicação vira beco (`forms` §4).
const LOCK_HINT: Record<ApprovalOriginLotLockReason, string> = {
  NO_SAMPLE: 'Contrato futuro — não há lote vinculado.',
  BLEND: 'É uma liga: a origem vem dos lotes que a compõem.',
  BLEND_COMPONENT: 'Este lote compõe uma liga — editar aqui alteraria a liga junto.',
  SAMPLE_STATUS: 'O lote não está em situação editável.',
};

function countLots(text: string): number {
  return text.split(/[\s,;]+/).filter(Boolean).length;
}

function emptyValues(): Record<string, string> {
  const acc: Record<string, string> = {};
  for (const field of FIELDS) {
    acc[field.key] = '';
  }
  return acc;
}

interface ApprovalLabelModalProps {
  open: boolean;
  onClose: () => void;
  session: SessionData;
  // Prefill do contrato (D115): a worklist abre o modal já com os campos
  // preenchidos do contrato de origem.
  prefill?: ApprovalLabelPrefill | null;
  // Vínculo da auditoria: o contrato de origem, sempre presente (AP12 — não há
  // mais etiqueta avulsa).
  saleContractId?: string | null;
  // Disparado APÓS o envio gravar (só no sucesso). Molde do onDone do embarque: o
  // pai usa pra refaturar (portão AP18) ou refetchar a worklist da sub-aba. Distinto
  // do onClose (que fecha em cancelamento OU no auto-close do sucesso).
  onSent?: (() => void) | null;
}

// Semeia os campos de valor único a partir do prefill (chaves = FIELDS.key).
function valuesFromPrefill(prefill: ApprovalLabelPrefill): Record<string, string> {
  return {
    compra: prefill.fields.compra,
    fechamento: prefill.fields.fechamento,
    produtor: prefill.fields.produtor,
    armazem: prefill.fields.armazem,
    sacas: prefill.fields.sacas,
  };
}

// 🔴 O estado do campo de lotes é o texto CRU (`originLotText`), NUNCA `lots`.
// `lots` é o recorte do papel: corta cada código em 16 chars e, acima de 8,
// troca o resto por um "+" que é sentinela de desenho, não lote. Editar sobre
// ele e salvar de volta apagaria em silêncio tudo que o "+" representa — é essa
// inversão que torna a cascata do RC-D100 segura.
function originLotFromPrefill(prefill: ApprovalLabelPrefill): string {
  return prefill.originLotText ?? '';
}

export function ApprovalLabelModal({
  open,
  onClose,
  session,
  prefill = null,
  saleContractId = null,
  onSent = null,
}: ApprovalLabelModalProps) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>(emptyValues);
  // Texto CRU do lote de origem (ver originLotFromPrefill).
  const [originLot, setOriginLot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // 'form' = bottom-sheet visível; 'success' = sheet desceu, aguardando o check.
  const [phase, setPhase] = useState<'form' | 'success'>('form');
  // O check central só aparece depois que o sheet termina de descer.
  const [successVisible, setSuccessVisible] = useState(false);

  const lotsEditable = prefill?.originLot.editable === true;
  const lockReason = prefill?.originLot.lockReason ?? null;

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (formError) setFormError(null);
  }

  // RC-D101: o "Limpar" saiu. Com quatro campos travados ele só zeraria os dois
  // que CASCATEIAM — viraria um botão de apagar o Nº compra do contrato e o lote
  // de origem do cadastro num clique. O que ainda faz sentido apagar apaga-se
  // campo a campo, que é deliberado.

  async function handleSubmit() {
    if (submitting || !prefill) return;

    // Campos de valor único + a linha LOTE (texto cru; o backend recorta pro
    // papel). O print agent posiciona cada campo pelo rótulo, então a ordem
    // aqui é livre.
    const fieldLines = FIELDS.map((field) => ({
      label: field.printLabel,
      value: values[field.key].trim(),
    }));
    const lotValue = originLot.trim();
    const lines = [...fieldLines, { label: LOTE_PRINT_LABEL, value: lotValue }];

    if (lines.every((line) => line.value.length === 0)) {
      setFormError('Preencha ao menos um campo para imprimir.');
      return;
    }

    // O que a cascata vai gravar. Só o que MUDOU: o updateRegistration faz o
    // diff e recusa um patch sem mudança (409 "No registration changes
    // detected"), e o endpoint do Nº compra é idempotente mas gastaria uma
    // ida ao servidor à toa.
    const purchaseChanged = values.compra.trim() !== prefill.fields.compra.trim();
    const lotChanged = lotsEditable && lotValue !== (prefill.originLotText ?? '');
    let saved = false;

    setSubmitting(true);
    try {
      // 🔴 GRAVA ANTES DE IMPRIMIR. Se a escrita falha, o papel não sai com um
      // dado que não entrou no sistema. A ordem inversa deixaria etiqueta e
      // cadastro divergentes exatamente no caso que a cascata veio corrigir.
      if (lotChanged && prefill.originLot.sampleId && prefill.originLot.sampleVersion !== null) {
        await updateRegistration(session, prefill.originLot.sampleId, {
          expectedVersion: prefill.originLot.sampleVersion,
          after: { declared: { originLot: lotValue } },
          reasonCode: 'DATA_FIX',
          reasonText: 'Correcao pela etiqueta de aprovacao',
        });
        saved = true;
      }
      if (purchaseChanged && saleContractId) {
        await setSaleContractPurchaseNumber(session, saleContractId, {
          purchaseNumber: values.compra.trim(),
          expectedVersion: prefill.contractVersion,
        });
        saved = true;
      }

      // Envio AUDITADO (D114): job de impressão + linha da approval_label_log
      // na mesma transação; saleContractId sempre presente (AP12).
      await sendApprovalLabel(session, { saleContractId, lines });
      // Sucesso: desce o sheet (phase='success') e o check central aparece
      // logo após (ver effect abaixo), auto-fechando em seguida.
      setPhase('success');
      // Avisa o pai que o envio foi gravado (portão AP18 refatura / a sub-aba
      // refetcha). Só no sucesso — distingue de um cancelamento (onClose).
      onSent?.();
    } catch (err) {
      const conflict = err instanceof ApiError && err.status === 409;
      // O código vem em `details` (o ApiError não o promove a campo próprio).
      const code =
        err instanceof ApiError && err.details && typeof err.details === 'object'
          ? ((err.details as { code?: unknown }).code ?? null)
          : null;
      // Os dois lados sinalizam conflito de versão de formas diferentes: o
      // contrato por código, o lote (event store) só pela mensagem.
      const versionConflict =
        conflict &&
        (code === 'SALE_CONTRACT_VERSION_CONFLICT' ||
          (err instanceof ApiError && err.message.startsWith('Version conflict')));
      const message = versionConflict
        ? 'O contrato ou o lote mudou em outra tela. Feche e abra a etiqueta de novo.'
        : conflict
          ? 'Este contrato não está mais elegível para aprovação.'
          : err instanceof ApiError
            ? err.message
            : 'Não foi possível enviar para impressão.';
      toast.error({
        title: 'Falha ao imprimir',
        // A gravação já aconteceu e não se desfaz (o lote é event-sourced).
        // Calar isso deixaria o operador reimprimindo achando que nada mudou.
        description: saved ? `As alterações foram salvas, mas ${message.toLowerCase()}` : message,
      });
      // O painel fica aberto com os dados na tela: o caminho de recuperação é
      // apertar "Imprimir" de novo, e a cascata já gravada não repete (nada mudou).
      if (saved) onSent?.();
    } finally {
      setSubmitting(false);
    }
  }

  // Reset total quando o modal é totalmente dispensado (pai fecha, inclusive
  // após o auto-close do sucesso). Garante form limpo na próxima abertura.
  useEffect(() => {
    if (open) return;
    setPhase('form');
    setSuccessVisible(false);
    setValues(emptyValues());
    setOriginLot('');
    setFormError(null);
    setSubmitting(false);
  }, [open]);

  // Semeia o formulário com o prefill do contrato QUANDO o modal abre (a página
  // só monta o modal DEPOIS do fetch do prefill — sem corrida com o reset
  // acima). Reabrir o MESMO contrato re-preenche do contrato de novo, descartando
  // edições (D117/S80) — que agora, com a cascata, já foram gravadas: o
  // re-preenchimento traz o valor novo, não desfaz nada.
  useEffect(() => {
    if (!open || !prefill) return;
    setValues(valuesFromPrefill(prefill));
    setOriginLot(originLotFromPrefill(prefill));
    setFormError(null);
  }, [open, prefill]);

  // Após o sucesso, espera o slide-down do sheet (ANIMATION_MS) e mostra o
  // check central — mesmo timing do NewSampleModal.
  useEffect(() => {
    if (phase !== 'success') return;
    const timer = window.setTimeout(() => setSuccessVisible(true), ANIMATION_MS + 30);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Check sem botões: auto-fecha ~1,5s depois de aparecer, voltando à página
  // de Lotes (onClose → o effect de open=false reseta o estado).
  useEffect(() => {
    if (!successVisible) return;
    const timer = window.setTimeout(() => onClose(), 1500);
    return () => window.clearTimeout(timer);
  }, [successVisible, onClose]);

  // RC-D101: sem "Limpar" — o submit ocupa a linha inteira.
  const formFooter = (
    <div className="nsv2-submit-wrap">
      <button
        type="button"
        className="nsv2-submit-btn"
        disabled={submitting}
        onClick={() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          void handleSubmit();
        }}
      >
        <span>{submitting ? 'Enviando…' : 'Imprimir etiqueta'}</span>
      </button>
    </div>
  );

  return (
    <>
      <BottomSheet
        open={open && phase === 'form'}
        onClose={onClose}
        title="Etiqueta de Aprovação"
        footer={formFooter}
        ariaLabel="Etiqueta de Aprovação"
        className="is-approval-label"
        dragToDismiss
      >
        <div className="new-sample-step-content">
          <div className="alm-form">
            {/* RC-D98: uma nota para os QUATRO travados, não quatro hints — a
                origem deles é a mesma, e repetir a frase por campo é ruído. */}
            <p className="alm-locked-note">
              Fechamento, produtor, armazém e sacas vêm do contrato.
            </p>

            {FORM_ROWS.map((row) => (
              <div
                key={row.map((cell) => cell.key).join('-')}
                className="alm-form-row"
                style={{ gridTemplateColumns: row.map((cell) => `${cell.weight}fr`).join(' ') }}
              >
                {row.map((cell) => {
                  const field = FIELD_BY_KEY[cell.key];
                  // Campo travado: mantém a CAIXA do formulário, mas não é um
                  // <input disabled> — é um <p> com a geometria do input e
                  // `aria-disabled` (`forms` §3, apresentação recuada).
                  if (field.locked) {
                    return (
                      <div key={field.key} className="nsv2-field alm-field">
                        <span className="nsv2-field-label">{field.uiLabel}</span>
                        <p className="alm-locked-input" aria-disabled="true">
                          {values[field.key] || '—'}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <label key={field.key} className="nsv2-field alm-field">
                      <span className="nsv2-field-label">{field.uiLabel}</span>
                      <div className="nsv2-field-input-wrap">
                        <input
                          className="nsv2-field-input alm-input"
                          type="text"
                          inputMode={field.numeric ? 'numeric' : 'text'}
                          value={values[field.key]}
                          onChange={(event) => {
                            const raw = event.target.value;
                            const next = field.numeric
                              ? raw.replace(/\D/g, '')
                              : field.noSpaces
                                ? raw.replace(/\s/g, '')
                                : raw;
                            setField(field.key, next);
                          }}
                          placeholder={field.placeholder}
                          maxLength={field.maxChars ?? 80}
                          autoComplete="off"
                          disabled={submitting}
                        />
                      </div>
                    </label>
                  );
                })}
              </div>
            ))}

            {/* RC-D100: Lotes de origem — o MESMO editor do detalhe do lote
                (OriginLotChips), porque é o mesmo dado e ele grava lá. Travado
                quando a escrita teria efeito além deste lote (liga, componente
                de liga) ou não teria onde cair (Futuro, status). Sempre
                presente, mesmo vazio (RC-D97). */}
            <div className="alm-lots-group">
              <span className="nsv2-field-label">Lotes de origem</span>
              <OriginLotChips
                value={originLot}
                onChange={(next) => {
                  setOriginLot(next);
                  if (formError) setFormError(null);
                }}
                disabled={!lotsEditable || submitting}
                placeholder="Código do lote"
              />
              {lockReason ? <p className="alm-field-hint">{LOCK_HINT[lockReason]}</p> : null}
              {/* O papel comporta 8; acima disso o backend imprime 7 + "+". O
                  cadastro guarda todos — dizer isso evita a leitura de que a
                  etiqueta perdeu os lotes. */}
              {countLots(originLot) > LOTS_ON_LABEL ? (
                <p className="alm-field-hint">
                  A etiqueta comporta {LOTS_ON_LABEL} códigos; os demais saem como “+”.
                </p>
              ) : null}
            </div>
          </div>

          {formError ? (
            <p className="nsv2-inline-error" role="alert">
              {formError}
            </p>
          ) : null}
        </div>
      </BottomSheet>

      {successVisible
        ? createPortal(
            // Modal central canonico no VISUAL DE ACAO (.app-modal.is-themed
            // .is-action): header claro + titulo verde a esquerda + backdrop
            // escuro SEM blur (via :has(.is-action) no globals.css). Ultimo
            // consumidor do check antigo `.sample-created-*` (o
            // ClassificationSuccessModal que o dividia foi deletado em 2026-07-22;
            // Aprovacao esta fora do ciclo FV). Via createPortal (obrigatorio —
            // sem ele o transform do <PageTransition> captura o position:fixed e
            // o modal abre atras da pagina). Ver skill `modals`.
            <div className="app-modal-backdrop" onClick={onClose}>
              <section
                className="app-modal is-themed is-action"
                role="dialog"
                aria-modal="true"
                aria-labelledby="approval-sent-title"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 id="approval-sent-title" className="app-modal-title">
                      Etiqueta enviada
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="app-modal-close"
                    onClick={onClose}
                    aria-label="Fechar"
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </header>

                <div className="app-modal-content sample-created-body">
                  <div className="sample-created-check-wrap" aria-hidden="true">
                    <svg className="sample-created-check" viewBox="0 0 52 52">
                      <circle cx="26" cy="26" r="24" />
                      <path d="M14 27l8 8 16-16" />
                    </svg>
                  </div>

                  <p className="approval-sent-hint">Deve sair na impressora em alguns segundos.</p>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export type { ApprovalLabelModalProps };
