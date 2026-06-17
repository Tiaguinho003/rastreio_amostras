'use client';

import { useEffect, useRef, useState } from 'react';

import { ANIMATION_MS, BottomSheet } from './BottomSheet';
import { ApiError, requestCustomPrint } from '../lib/api-client';
import { useToast } from '../lib/toast/ToastProvider';
import type { SessionData } from '../lib/types';

// Modal da Etiqueta de Aprovação (ex-"avulsa"). Mesmo padrão do NewSampleModal:
// bottom-sheet saindo de baixo + efeito de sucesso (check animado) que
// auto-fecha. Aberto pela opção "Aprovação" do leque do "+" em /samples.
// Imprime na MESMA impressora das amostras (via print agent), sem QR, 1 cópia
// por envio. Pipeline intacto: requestCustomPrint → fila custom_print_job.
// Acesso garantido pelo gate da página (/samples = NON_PROSPECTOR_ROLES) + gate
// central do PROSPECTOR no backend.

interface FieldConfig {
  key: string;
  uiLabel: string; // rótulo no formulário (amigável)
  printLabel: string; // rótulo impresso na etiqueta (abreviado, maiúsculo)
  placeholder: string;
  numeric?: boolean;
  noSpaces?: boolean; // bloqueia espaço no input (só caracteres)
  maxChars?: number; // limite de caracteres do input (default 80)
}

// Campos de VALOR ÚNICO (impressos). O Lote NÃO está aqui: virou um grupo de
// campos dinâmicos (ver `lots` no componente). Os printLabel saem MAIÚSCULOS com
// ":" na etiqueta (o ":" é adicionado pelo buildCustomLabel).
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

// Rótulo impresso do Lote. O campo virou grupo dinâmico: no envio, os lotes
// não-vazios são juntados numa ÚNICA linha LOTE (a divisão por quantidade na
// etiqueta — substituindo o wrap automático — é o próximo passo).
const LOTE_PRINT_LABEL = 'LOTE';
const LOT_MAX_CHARS = 16;

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
}

export function ApprovalLabelModal({ open, onClose, session }: ApprovalLabelModalProps) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>(emptyValues);
  const [lots, setLots] = useState<Lot[]>(freshLots);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // 'form' = bottom-sheet visível; 'success' = sheet desceu, aguardando o check.
  const [phase, setPhase] = useState<'form' | 'success'>('form');
  // O check central só aparece depois que o sheet termina de descer.
  const [successVisible, setSuccessVisible] = useState(false);

  // Scroll-into-view do lote recém-adicionado (acompanha quando ele quebra pra
  // próxima linha). lotsRef = fila de lotes; o flag dispara o scroll no effect.
  const lotsRef = useRef<HTMLDivElement | null>(null);
  const scrollToNewLotRef = useRef(false);

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (formError) setFormError(null);
  }

  function setLot(id: number, value: string) {
    setLots((prev) => prev.map((lot) => (lot.id === id ? { ...lot, value } : lot)));
    if (formError) setFormError(null);
  }

  function addLot() {
    // Sem auto-foco: o campo é criado vazio; o teclado só abre quando o usuário
    // toca no campo pra digitar. Só sinaliza o scroll-into-view do campo novo.
    scrollToNewLotRef.current = true;
    setLots((prev) => [...prev, { id: nextLotId(), value: '' }]);
    if (formError) setFormError(null);
  }

  function removeLot(id: number) {
    // O último lote nunca some (precisa de ao menos um campo).
    setLots((prev) => (prev.length > 1 ? prev.filter((lot) => lot.id !== id) : prev));
  }

  function handleClear() {
    setValues(emptyValues());
    setLots(freshLots());
    setFormError(null);
  }

  function hasUnsavedData() {
    return (
      Object.values(values).some((v) => v.trim().length > 0) ||
      lots.some((lot) => lot.value.trim().length > 0)
    );
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

  // Rola o corpo do modal pra mostrar o lote recém-adicionado. `block: 'nearest'`
  // só rola quando o campo está fora de vista (ex.: quebrou pra próxima linha);
  // se já está visível, não mexe. Sem foco — não abre teclado.
  useEffect(() => {
    if (!scrollToNewLotRef.current) return;
    scrollToNewLotRef.current = false;
    const fields = lotsRef.current?.querySelectorAll<HTMLElement>('.alm-lot-field');
    const last = fields?.[fields.length - 1];
    if (!last) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    last.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [lots.length]);

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

            {/* Grupo de Lotes (campos dinâmicos). "+" cria mais um ao lado (máx.
                3 + botão por linha; o 4º quebra). "×" remove (some quando só 1). */}
            <div className="alm-lots-group">
              <span className="nsv2-field-label">Lotes</span>
              <div className="alm-lots" ref={lotsRef}>
                {lots.map((lot, index) => (
                  <div key={lot.id} className="alm-lot-field">
                    <input
                      className="nsv2-field-input alm-input alm-lot-input"
                      type="text"
                      value={lot.value}
                      onChange={(event) => setLot(lot.id, event.target.value)}
                      placeholder={`Lote ${index + 1}`}
                      aria-label={`Lote ${index + 1}`}
                      maxLength={LOT_MAX_CHARS}
                      autoComplete="off"
                    />
                    {lots.length > 1 ? (
                      <button
                        type="button"
                        className="alm-lot-remove"
                        aria-label={`Remover lote ${index + 1}`}
                        onClick={() => removeLot(lot.id)}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="alm-lot-add"
                  aria-label="Adicionar lote"
                  onClick={addLot}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
            </div>
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
