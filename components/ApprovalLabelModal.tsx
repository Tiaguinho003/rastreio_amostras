'use client';

import { useEffect, useRef, useState } from 'react';

import { ANIMATION_MS, BottomSheet } from './BottomSheet';
import { ApiError, requestCustomPrint } from '../lib/api-client';
import { useToast } from '../lib/toast/ToastProvider';
import type { SessionData } from '../lib/types';

// Modal da Etiqueta de Aprovação (ex-"avulsa"). Mesmo padrão do NewSampleModal:
// bottom-sheet saindo de baixo + efeito de sucesso (check animado) que
// auto-fecha. Aberto pela opção "Aprovação" do leque do "+" em /samples.
// Imprime na MESMA impressora das amostras (via print agent), 6 campos
// editáveis, sem QR, 1 cópia por envio. Pipeline intacto: requestCustomPrint →
// fila custom_print_job. Acesso garantido pelo gate da página (/samples =
// NON_PROSPECTOR_ROLES) + gate central do PROSPECTOR no backend.

interface FieldConfig {
  key: string;
  uiLabel: string; // rótulo no formulário (amigável)
  printLabel: string; // rótulo impresso na etiqueta (abreviado, maiúsculo)
  placeholder: string;
  numeric?: boolean;
  noSpaces?: boolean; // bloqueia espaço no input (só caracteres)
  maxChars?: number; // limite de caracteres do input (default 80)
}

// Ordem = ordem de leitura na etiqueta (topo → base). Os printLabel saem
// MAIÚSCULOS com ":" na etiqueta (o ":" é adicionado pelo buildCustomLabel).
const FIELDS: FieldConfig[] = [
  {
    key: 'compra',
    uiLabel: 'Nº compra',
    printLabel: 'N° COMPRA',
    placeholder: 'Nº da compra',
    noSpaces: true,
    maxChars: 36,
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
  { key: 'lote', uiLabel: 'Lote', printLabel: 'LOTE', placeholder: 'Lote', maxChars: 78 },
  {
    key: 'sacas',
    uiLabel: 'Sacas',
    printLabel: 'SACAS',
    placeholder: 'Total de sacas',
    numeric: true,
    maxChars: 26,
  },
];

// Disposição dos campos no formulário (linhas; pares ficam lado a lado). `weight`
// = fração da largura da linha (colunas desiguais via grid-template-columns em
// `fr`). Referencia as keys de FIELDS — a etiqueta IMPRESSA não depende desta
// ordem (o print agent posiciona cada campo pelo rótulo, não pela ordem).
const FORM_ROWS: Array<Array<{ key: string; weight: number }>> = [
  [
    { key: 'compra', weight: 1 },
    { key: 'fechamento', weight: 1 },
  ],
  [
    { key: 'produtor', weight: 3 },
    { key: 'sacas', weight: 2 },
  ],
  [{ key: 'armazem', weight: 1 }],
  [{ key: 'lote', weight: 1 }],
];

const FIELD_BY_KEY: Record<string, FieldConfig> = Object.fromEntries(
  FIELDS.map((field) => [field.key, field])
);

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
}

export function ApprovalLabelModal({ open, onClose, session }: ApprovalLabelModalProps) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>(emptyValues);
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
    setValues(emptyValues());
    setFormError(null);
  }

  function hasUnsavedData() {
    return Object.values(values).some((v) => v.trim().length > 0);
  }

  async function handleSubmit() {
    if (submitting) return;

    // Envia TODOS os campos na ordem fixa (mesmo vazios) — o buildCustomLabel
    // posiciona por índice, então a ordem não pode "compactar".
    const lines = FIELDS.map((field) => ({
      label: field.printLabel,
      value: values[field.key].trim(),
    }));

    if (lines.every((line) => line.value.length === 0)) {
      setFormError('Preencha ao menos um campo para imprimir.');
      return;
    }

    setSubmitting(true);
    try {
      await requestCustomPrint(session, lines);
      // Sucesso: desce o sheet (phase='success') e o check central aparece
      // logo após (ver effect abaixo), auto-fechando em seguida.
      setPhase('success');
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Não foi possível enviar para impressão.';
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
    setFormError(null);
    setSubmitting(false);
  }, [open]);

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
                          onChange={(event) =>
                            setField(
                              field.key,
                              field.noSpaces
                                ? event.target.value.replace(/\s/g, '')
                                : event.target.value
                            )
                          }
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
          </div>

          {formError ? (
            <p className="nsv2-inline-error" role="alert">
              {formError}
            </p>
          ) : null}
        </div>
      </BottomSheet>

      {successVisible ? (
        <div className="app-modal-backdrop" onClick={onClose}>
          <section
            className="app-modal is-themed sample-created-modal"
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
            </header>

            <div className="app-modal-content sample-created-body">
              <div className="sample-created-check-wrap" aria-hidden="true">
                <span className="sample-created-check-ring" />
                <svg className="sample-created-check" viewBox="0 0 52 52">
                  <circle cx="26" cy="26" r="24" />
                  <path d="M14 27l8 8 16-16" />
                </svg>
              </div>

              <p className="sample-created-hint">Deve sair na impressora em alguns segundos.</p>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export type { ApprovalLabelModalProps };
