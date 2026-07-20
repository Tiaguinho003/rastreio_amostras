'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { ANIMATION_MS, BottomSheet } from './BottomSheet';
import { ApiError, sendApprovalLabel } from '../lib/api-client';
import { useToast } from '../lib/toast/ToastProvider';
import type { ApprovalLabelPrefill, SessionData } from '../lib/types';

// Modal da Etiqueta de Aprovação (Fase I, D112–D119). Mesmo padrão do
// NewSampleModal: bottom-sheet saindo de baixo (central no desktop via CSS)
// + efeito de sucesso (check animado) que auto-fecha. Uma porta: a worklist
// de Aprovações abre com os campos PRÉ-PREENCHIDOS do contrato (o seletor do
// /samples e a etiqueta "Manual"/avulsa saíram com a AP29/AP12). O Lote de
// origem aparece READ-ONLY (espelha o cadastro do lote — pra corrigir, edita o
// lote/liga e reimprime); "Limpar" zera só os campos. Imprime na MESMA impressora
// (print agent), sem QR, 1 cópia por envio. Envio AUDITADO: sendApprovalLabel
// grava o custom_print_job + a linha da approval_label_log na mesma transação
// (sempre com saleContractId — AP12). Gate central não-PROSPECTOR no backend.

interface FieldConfig {
  key: string;
  uiLabel: string; // rótulo no formulário (amigável)
  printLabel: string; // rótulo impresso na etiqueta (abreviado, maiúsculo)
  placeholder: string;
  numeric?: boolean;
  noSpaces?: boolean; // bloqueia espaço no input (só caracteres)
  maxChars?: number; // limite de caracteres do input (default 80)
}

// Campos de VALOR ÚNICO (impressos). O Lote NÃO está aqui: é read-only (vem do
// cadastro do lote — ver `lots` no componente). Os printLabel saem MAIÚSCULOS com
// ":" na etiqueta (o ":" é adicionado pelo buildCustomLabel).
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
  },
  {
    key: 'produtor',
    uiLabel: 'Produtor',
    printLabel: 'PRODUT',
    placeholder: 'Nome do produtor',
    maxChars: 52,
  },
  {
    key: 'armazem',
    uiLabel: 'Armazém',
    printLabel: 'ARMAZ',
    placeholder: 'Nome do armazém',
    maxChars: 52,
  },
  {
    key: 'sacas',
    uiLabel: 'Sacas',
    printLabel: 'SACAS',
    placeholder: 'Total de sacas',
    numeric: true,
    maxChars: 26,
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

// Rótulo impresso do Lote. Os lotes são READ-ONLY (espelham a origem gravada do
// lote): no envio, os valores não-vazios do prefill são juntados numa ÚNICA linha
// LOTE; o print agent divide por vírgula numa grade 4x2. O cap de exibição
// (8 + "+") e a quebra vêm do backend (splitOriginLotForLabel).
const LOTE_PRINT_LABEL = 'LOTE';

type Lot = { id: number; value: string };

// Contador de id estável pros campos de lote (chaves do React; permite remover
// do meio sem reanimar/embaralhar os demais). Module-level = estável, sem
// disparar exhaustive-deps nos effects.
let lotIdSeq = 0;
function nextLotId(): number {
  const id = lotIdSeq;
  lotIdSeq += 1;
  return id;
}
function freshLots(): Lot[] {
  return [{ id: nextLotId(), value: '' }];
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

// Lotes já quebrados pelo backend (D116); vazio → 1 campo em branco (o grupo
// dinâmico precisa de ao menos um input).
function lotsFromPrefill(prefill: ApprovalLabelPrefill): Lot[] {
  if (prefill.lots.length === 0) return freshLots();
  return prefill.lots.map((value) => ({ id: nextLotId(), value }));
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
  const [lots, setLots] = useState<Lot[]>(freshLots);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // 'form' = bottom-sheet visível; 'success' = sheet desceu, aguardando o check.
  const [phase, setPhase] = useState<'form' | 'success'>('form');
  // O check central só aparece depois que o sheet termina de descer.
  const [successVisible, setSuccessVisible] = useState(false);

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (formError) setFormError(null);
  }

  function handleClear() {
    // Lotes sao read-only (espelham a origem do lote) — Limpar so zera os campos
    // editaveis.
    setValues(emptyValues());
    setFormError(null);
  }

  function hasUnsavedData() {
    return Object.values(values).some((v) => v.trim().length > 0);
  }

  async function handleSubmit() {
    if (submitting) return;

    // Campos de valor único + a linha LOTE (junta os lotes não-vazios). O print
    // agent posiciona cada campo pelo rótulo, então a ordem aqui é livre.
    const fieldLines = FIELDS.map((field) => ({
      label: field.printLabel,
      value: values[field.key].trim(),
    }));
    const lotValue = lots
      .map((lot) => lot.value.trim())
      .filter(Boolean)
      .join(', ');
    const lines = [...fieldLines, { label: LOTE_PRINT_LABEL, value: lotValue }];

    if (lines.every((line) => line.value.length === 0)) {
      setFormError('Preencha ao menos um campo para imprimir.');
      return;
    }

    setSubmitting(true);
    try {
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
      const message =
        err instanceof ApiError && err.status === 409
          ? 'Este contrato não está mais elegível para aprovação.'
          : err instanceof ApiError
            ? err.message
            : 'Não foi possível enviar para impressão.';
      toast.error({ title: 'Falha ao imprimir', description: message });
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
    setLots(freshLots());
    setFormError(null);
    setSubmitting(false);
  }, [open]);

  // Semeia o formulário com o prefill do contrato QUANDO o modal abre (a página
  // só monta o modal DEPOIS do fetch do prefill — sem corrida com o reset
  // acima). Reabrir o MESMO contrato re-preenche do contrato de novo, descartando
  // edições (D117/S80).
  useEffect(() => {
    if (!open || !prefill) return;
    setValues(valuesFromPrefill(prefill));
    setLots(lotsFromPrefill(prefill));
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

  const formFooter = (
    <div className="nsv2-submit-wrap">
      <button
        type="button"
        className="nsv2-clear-btn"
        disabled={submitting || !hasUnsavedData()}
        onClick={handleClear}
      >
        <span>Limpar</span>
      </button>
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
            {FORM_ROWS.map((row) => (
              <div
                key={row.map((cell) => cell.key).join('-')}
                className="alm-form-row"
                style={{ gridTemplateColumns: row.map((cell) => `${cell.weight}fr`).join(' ') }}
              >
                {row.map((cell) => {
                  const field = FIELD_BY_KEY[cell.key];
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
                        />
                      </div>
                    </label>
                  );
                })}
              </div>
            ))}

            {/* Lotes de origem READ-ONLY: espelham o cadastro do lote (o usuário
                não edita aqui — pra corrigir, edita o lote/liga e reimprime).
                Mostra até 8 + "+"; vazio (futuro) = sem lote. */}
            <div className="alm-lots-group">
              <span className="nsv2-field-label">Lotes de origem</span>
              {lots.some((lot) => lot.value.trim()) ? (
                <div className="alm-lots-readonly">
                  {lots
                    .filter((lot) => lot.value.trim())
                    .map((lot) => (
                      <span key={lot.id} className="alm-lot-chip">
                        {lot.value}
                      </span>
                    ))}
                </div>
              ) : (
                <p className="alm-lots-empty">Sem lote de origem.</p>
              )}
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
            // escuro SEM blur (via :has(.is-action) no globals.css). Mesmo padrao
            // do ClassificationSuccessModal. Via createPortal (obrigatorio — sem
            // ele o transform do <PageTransition> captura o position:fixed e o
            // modal abre atras da pagina). Ver skill `modals`.
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
