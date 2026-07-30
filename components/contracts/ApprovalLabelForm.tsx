'use client';

import { useEffect, useState } from 'react';

import { OriginLotChips } from '../OriginLotChips';
import {
  ApiError,
  sendApprovalLabel,
  setSaleContractPurchaseNumber,
  updateRegistration,
} from '../../lib/api-client';
import { useToast } from '../../lib/toast/ToastProvider';
import type {
  ApprovalLabelPrefill,
  ApprovalOriginLotLockReason,
  SessionData,
} from '../../lib/types';

// Etiqueta de Aprovação — o FORMULÁRIO (RC-D127). Era um BottomSheet próprio
// (ApprovalLabelModal, Fase I / D112–D119) aberto por um botão do Detalhes; desde a
// RC-D126 ele é o conteúdo da aba "Aprovação", sem superfície própria: os campos já
// estão à vista e o único botão imprime.
//
// O que veio inteiro do modal, porque é a regra e não a moldura:
//   - RC-D98/D99/D100: só DOIS campos são editáveis — "Nº compra" e "Lotes de origem" —
//     e os dois GRAVAM DE VOLTA antes de imprimir (o número no contrato, os lotes no
//     cadastro do lote). Os outros quatro são leitura: pertencem ao contrato, e editá-los
//     aqui só faria o papel divergir do sistema.
//   - D114: o envio é AUDITADO — sendApprovalLabel grava o custom_print_job + a linha da
//     approval_label_log na mesma transação, sempre com saleContractId (AP12).
//   - RC-D101: não há "Limpar". Com quatro campos travados ele só zeraria os dois que
//     CASCATEIAM — seria um botão de apagar o Nº compra do contrato e o lote de origem
//     do cadastro num clique.
//
// O que ficou para trás com o sheet: o efeito de sucesso (o sheet descia e um check
// central auto-fechava a tela). Numa aba não há o que fechar — o sucesso é um toast, e o
// pai recarrega o prefill, que é o que traz os valores recém-gravados.

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

// Rótulo impresso do Lote. O form manda o texto CRU numa única linha LOTE; o
// recorte do papel (16 chars por código, 7 + "+" acima de 8) é do backend, no
// splitOriginLotForLabel — a MESMA função do prefill (RC-D100).
const LOTE_PRINT_LABEL = 'LOTE';

// Quantos códigos a grade 4x2 do papel comporta. Acima disso o backend imprime
// 7 + "+", e o form diz isso ao operador — recorte silencioso mentiria sobre o
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

interface ApprovalLabelFormProps {
  session: SessionData;
  /** Vínculo da auditoria: o contrato de origem, sempre presente (AP12 — não há
   *  mais etiqueta avulsa). */
  saleContractId: string;
  prefill: ApprovalLabelPrefill;
  /** Disparado APÓS o envio gravar (ou depois de a cascata gravar sem imprimir).
   *  O pai recarrega contrato + timeline + prefill. */
  onSent?: (() => void) | null;
}

export function ApprovalLabelForm({
  session,
  saleContractId,
  prefill,
  onSent = null,
}: ApprovalLabelFormProps) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>(() => valuesFromPrefill(prefill));
  // Texto CRU do lote de origem (ver originLotFromPrefill).
  const [originLot, setOriginLot] = useState<string>(() => originLotFromPrefill(prefill));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const lotsEditable = prefill.originLot.editable === true;
  const lockReason = prefill.originLot.lockReason ?? null;

  // Re-semeia quando o prefill troca — o que acontece depois de um envio, porque a
  // cascata mudou o contrato e o pai refaz a busca. Traz o valor novo; não desfaz nada.
  useEffect(() => {
    setValues(valuesFromPrefill(prefill));
    setOriginLot(originLotFromPrefill(prefill));
    setFormError(null);
  }, [prefill]);

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (formError) setFormError(null);
  }

  async function handleSubmit() {
    if (submitting) return;

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
      if (purchaseChanged) {
        await setSaleContractPurchaseNumber(session, saleContractId, {
          purchaseNumber: values.compra.trim(),
          expectedVersion: prefill.contractVersion,
        });
        saved = true;
      }

      // Envio AUDITADO (D114): job de impressão + linha da approval_label_log
      // na mesma transação; saleContractId sempre presente (AP12).
      await sendApprovalLabel(session, { saleContractId, lines });
      toast.success({
        title: 'Etiqueta enviada',
        description: 'Deve sair na impressora em alguns segundos.',
      });
      // Avisa o pai que o envio foi gravado: contrato, timeline e prefill voltam
      // frescos. Só no sucesso — e no caso "gravou mas não imprimiu", abaixo.
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
        ? 'O contrato ou o lote mudou em outra tela. Feche e abra o contrato de novo.'
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
      // A aba fica com os dados na tela: o caminho de recuperação é apertar
      // "Gerar etiqueta" de novo, e a cascata já gravada não repete (nada mudou).
      if (saved) onSent?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ctr-approval-form">
      {/* RC-D98: uma nota para os QUATRO travados, não quatro hints — a origem
          deles é a mesma, e repetir a frase por campo é ruído. */}
      <p className="ctr-locked-hint">Fechamento, produtor, armazém e sacas vêm do contrato.</p>

      <div className="fv-form-body">
        {FORM_ROWS.map((row) => (
          <div
            key={row.map((cell) => cell.key).join('-')}
            className="fv-form-row"
            style={{
              gridTemplateColumns: row.map((cell) => `minmax(0, ${cell.weight}fr)`).join(' '),
            }}
          >
            {row.map((cell) => {
              const field = FIELD_BY_KEY[cell.key];
              // Campo travado: o valor + a instrução de onde trocar, não um
              // <input disabled> (`forms` §3 — não pode parecer clicável). O molde
              // é o do Vendedor derivado do lote (RC-D37).
              if (field.locked) {
                return (
                  <div key={field.key} className="fv-form-field">
                    <span className="fv-form-label">{field.uiLabel}</span>
                    <p className="ctr-locked-value" aria-disabled="true">
                      {values[field.key] || '—'}
                    </p>
                  </div>
                );
              }
              return (
                <label key={field.key} className="fv-form-field">
                  <span className="fv-form-label">{field.uiLabel}</span>
                  <input
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
        <div className="fv-form-field ctr-approval-lots">
          <span className="fv-form-label">Lotes de origem</span>
          <OriginLotChips
            value={originLot}
            onChange={(next) => {
              setOriginLot(next);
              if (formError) setFormError(null);
            }}
            disabled={!lotsEditable || submitting}
            placeholder="Código do lote"
          />
          {lockReason ? <p className="ctr-locked-hint">{LOCK_HINT[lockReason]}</p> : null}
          {/* O papel comporta 8; acima disso o backend imprime 7 + "+". O
              cadastro guarda todos — dizer isso evita a leitura de que a
              etiqueta perdeu os lotes. */}
          {countLots(originLot) > LOTS_ON_LABEL ? (
            <p className="ctr-locked-hint">
              A etiqueta comporta {LOTS_ON_LABEL} códigos; os demais saem como “+”.
            </p>
          ) : null}
        </div>
      </div>

      {formError ? (
        <p className="fv-form-field-error" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="ctr-details-actions">
        <button
          type="button"
          className="ctr-btn"
          disabled={submitting}
          onClick={() => {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            void handleSubmit();
          }}
        >
          {submitting ? 'Enviando...' : 'Gerar etiqueta'}
        </button>
      </div>
    </div>
  );
}
