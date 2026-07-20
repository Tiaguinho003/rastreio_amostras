'use client';

import { type ChangeEvent, type KeyboardEvent, useState } from 'react';

// Input de CHIPS pro "Lote de origem" (múltiplos códigos). Interface por STRING:
// recebe/devolve a string canônica (códigos juntados por ", ") — os consumidores
// (criação/edição) mantêm o estado como string. Cada código vira uma pílula
// removível; digitar espaço/vírgula/ponto-e-vírgula (ou colar) confirma; Enter
// confirma o rascunho; Backspace no vazio remove o último. Deduplica. Sem limite
// de quantidade (o declaredOriginLot é ilimitado; a etiqueta é que corta em 8).
// O split usa o MESMO separador do label (splitOriginLotForLabel) e da liga
// (deriveBlendOriginLot): o traço NÃO separa (faz parte do código, ex.: "PA-01").

const CANON_SEP = ', ';
const SPLIT_RE = /[\s,;]+/;

function toChips(value: string): string[] {
  return value
    .split(SPLIT_RE)
    .map((token) => token.trim())
    .filter(Boolean);
}

interface OriginLotChipsProps {
  value: string;
  onChange: (value: string) => void;
  maxCharsPerChip?: number;
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  onFocus?: () => void;
}

export function OriginLotChips({
  value,
  onChange,
  maxCharsPerChip = 16,
  placeholder = 'Código do lote',
  disabled = false,
  hasError = false,
  onFocus,
}: OriginLotChipsProps) {
  const [draft, setDraft] = useState('');
  const chips = toChips(value);

  function setChips(next: string[]) {
    onChange(next.join(CANON_SEP));
  }

  function addTokens(tokens: string[]) {
    const cleaned = tokens
      .map((token) => token.trim().toUpperCase().slice(0, maxCharsPerChip))
      .filter(Boolean);
    if (cleaned.length === 0) return;
    const next = [...chips];
    for (const token of cleaned) if (!next.includes(token)) next.push(token);
    setChips(next);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value.replace(/\n/g, '');
    // Separador digitado/colado: confirma os tokens completos e guarda o parcial.
    if (/[\s,;]/.test(raw)) {
      const parts = raw.split(SPLIT_RE);
      const last = parts.pop() ?? '';
      addTokens(parts);
      setDraft(last);
    } else {
      setDraft(raw);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (draft.trim()) {
        addTokens([draft]);
        setDraft('');
      }
    } else if (event.key === 'Backspace' && draft === '' && chips.length > 0) {
      setChips(chips.slice(0, -1));
    }
  }

  function handleBlur() {
    if (draft.trim()) {
      addTokens([draft]);
      setDraft('');
    }
  }

  return (
    <div className={`olc-wrap${disabled ? ' is-disabled' : ''}${hasError ? ' has-error' : ''}`}>
      {chips.map((chip, index) => (
        <span key={`${chip}-${index}`} className="olc-chip">
          <span className="olc-chip-text">{chip}</span>
          {!disabled ? (
            <button
              type="button"
              className="olc-chip-remove"
              aria-label={`Remover lote ${chip}`}
              onClick={() => setChips(chips.filter((_, idx) => idx !== index))}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
      {!disabled ? (
        <input
          className="olc-input"
          type="text"
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={onFocus}
          placeholder={chips.length === 0 ? placeholder : ''}
          autoComplete="off"
          inputMode="text"
        />
      ) : chips.length === 0 ? (
        <span className="olc-empty">—</span>
      ) : null}
    </div>
  );
}
