'use client';

import { useState, type FormEvent } from 'react';

import { ApiError, requestCustomPrint } from '../../lib/api-client';
import { useToast } from '../../lib/toast/ToastProvider';
import type { SessionData } from '../../lib/types';

// TEMPORARIO: card de etiqueta avulsa no fim do dashboard admin. Imprime na
// MESMA impressora das amostras (via print agent) uma etiqueta com 6 campos
// editaveis, sem QR, logo pequeno, 1 copia por clique (cliques ilimitados).
// Para remover: apagar este arquivo + o uso no DashboardMobile + os endpoints
// /custom-print + a tabela custom_print_job.

interface FieldConfig {
  key: string;
  uiLabel: string; // rotulo no formulario (amigavel)
  printLabel: string; // rotulo impresso na etiqueta (abreviado, maiusculo)
  placeholder: string;
  numeric?: boolean;
}

const FIELDS: FieldConfig[] = [
  { key: 'producer', uiLabel: 'Produtor', printLabel: 'PRODUTOR', placeholder: 'Nome do produtor' },
  {
    key: 'sacks',
    uiLabel: 'Sacas',
    printLabel: 'SACAS',
    placeholder: 'Qtd. de sacas',
    numeric: true,
  },
  {
    key: 'warehouseLot',
    uiLabel: 'Lote armazém',
    printLabel: 'L. ARMAZEM',
    placeholder: 'Lote no armazém',
  },
  { key: 'warehouse', uiLabel: 'Armazém', printLabel: 'ARMAZEM', placeholder: 'Nome do armazém' },
  {
    key: 'brokerPurchase',
    uiLabel: 'Nº compra corretor',
    printLabel: 'N. COMPRA CORRETOR',
    placeholder: 'Número da compra',
  },
  {
    key: 'c6Term',
    uiLabel: 'Nº termo C6',
    printLabel: 'N. TERMO C6',
    placeholder: 'Número do termo',
  },
];

function emptyValues(): Record<string, string> {
  const acc: Record<string, string> = {};
  for (const field of FIELDS) {
    acc[field.key] = '';
  }
  return acc;
}

interface CustomLabelPrintCardProps {
  session: SessionData;
}

export function CustomLabelPrintCard({ session }: CustomLabelPrintCardProps) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>(emptyValues);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (formError) {
      setFormError(null);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const lines = FIELDS.map((field) => ({
      label: field.printLabel,
      value: values[field.key].trim(),
    })).filter((line) => line.value.length > 0);

    if (lines.length === 0) {
      setFormError('Preencha ao menos um campo para imprimir.');
      return;
    }

    setSubmitting(true);
    try {
      await requestCustomPrint(session, lines);
      toast.success({
        title: 'Etiqueta enviada para impressão',
        description: 'Deve sair na impressora em alguns segundos.',
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Não foi possível enviar para impressão.';
      toast.error({ title: 'Falha ao imprimir', description: message });
    } finally {
      setSubmitting(false);
    }
  }

  function handleClear() {
    setValues(emptyValues());
    setFormError(null);
  }

  return (
    <section className="clp-card" aria-labelledby="clp-title">
      <header className="clp-head">
        <span className="clp-badge" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9V3h12v6" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="7" rx="1" />
          </svg>
        </span>
        <div className="clp-head-text">
          <h2 id="clp-title" className="clp-title">
            Etiqueta avulsa
          </h2>
          <p className="clp-subtitle">Imprime na impressora de etiquetas</p>
        </div>
      </header>

      <form className="clp-form" onSubmit={handleSubmit} noValidate>
        {FIELDS.map((field) => (
          <label key={field.key} className="clp-field">
            <span className="clp-field-label">{field.uiLabel}</span>
            <input
              className="clp-input"
              type="text"
              inputMode={field.numeric ? 'numeric' : 'text'}
              value={values[field.key]}
              onChange={(event) => setField(field.key, event.target.value)}
              placeholder={field.placeholder}
              maxLength={80}
              autoComplete="off"
            />
          </label>
        ))}

        {formError ? (
          <p className="clp-error" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="clp-actions">
          <button type="button" className="clp-clear" onClick={handleClear} disabled={submitting}>
            Limpar
          </button>
          <button type="submit" className="clp-submit" disabled={submitting}>
            {submitting ? 'Enviando…' : 'Imprimir etiqueta'}
          </button>
        </div>
      </form>
    </section>
  );
}
