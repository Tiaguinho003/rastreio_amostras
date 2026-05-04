'use client';

import type { ClientSummary, ClientUnitSummary } from '../../lib/types';
import { isClientComplete, labelForMissing } from '../../lib/clients/client-completeness';

type ClientCompleteChecklistProps = {
  client: ClientSummary | null | undefined;
  /**
   * Callback opcional disparado quando o usuario clica num item da
   * checklist. Permite ao caller abrir modal/scroll pra campo.
   * `target.kind` distingue entre campo do Client direto, campo de
   * unidade especifica, ou "criar nova filial".
   */
  onMissingClick?: (target: ChecklistTarget) => void;
};

export type ChecklistTarget =
  | { kind: 'client-field'; field: string }
  | { kind: 'unit-field'; unitId: string; field: string }
  | { kind: 'create-unit' };

function unitNameById(units: ClientUnitSummary[], unitId: string): string {
  const unit = units.find((u) => u.id === unitId);
  return unit?.name ?? unitId.slice(0, 8);
}

// Q-11: checklist passivo no topo da detail page. So aparece quando ha
// algum campo recomendado faltando. Cada item e clicavel se o caller
// passou onMissingClick.
export function ClientCompleteChecklist({ client, onMissingClick }: ClientCompleteChecklistProps) {
  const result = isClientComplete(client);
  if (result.complete) {
    return null;
  }

  const units: ClientUnitSummary[] = Array.isArray(client?.units) ? client.units : [];

  // Agrupa por contexto (client direto vs cada unidade) pra render estruturada.
  const clientFieldKeys: string[] = [];
  const unitsMap = new Map<string, string[]>();
  let needsCreateUnit = false;

  for (const key of result.missing) {
    if (key === 'units') {
      needsCreateUnit = true;
      continue;
    }
    const unitMatch = key.match(/^units\[([^\]]+)\]\.(.+)$/);
    if (unitMatch) {
      const id = unitMatch[1];
      const field = unitMatch[2];
      const arr = unitsMap.get(id) ?? [];
      arr.push(field);
      unitsMap.set(id, arr);
    } else {
      clientFieldKeys.push(key);
    }
  }

  const handleClick = (target: ChecklistTarget) => {
    if (onMissingClick) onMissingClick(target);
  };

  return (
    <section className="sdv-completeness-checklist" role="status" aria-live="polite">
      <header className="sdv-completeness-checklist__header">
        <span className="sdv-completeness-checklist__icon" aria-hidden="true">
          🟠
        </span>
        <div className="sdv-completeness-checklist__heading">
          <strong>Cadastro incompleto</strong>
          <span className="sdv-completeness-checklist__subtitle">
            Faltam {result.missing.length} campo{result.missing.length === 1 ? '' : 's'} recomendado
            {result.missing.length === 1 ? '' : 's'} para fechar o cadastro.
          </span>
        </div>
      </header>

      {clientFieldKeys.length > 0 && (
        <div className="sdv-completeness-checklist__group">
          <span className="sdv-completeness-checklist__group-title">Cliente</span>
          <ul className="sdv-completeness-checklist__list">
            {clientFieldKeys.map((field) => (
              <li key={`client-${field}`}>
                <button
                  type="button"
                  className="sdv-completeness-checklist__item"
                  onClick={() => handleClick({ kind: 'client-field', field })}
                  disabled={!onMissingClick}
                >
                  {labelForMissing(field)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {needsCreateUnit && (
        <div className="sdv-completeness-checklist__group">
          <span className="sdv-completeness-checklist__group-title">Filiais</span>
          <ul className="sdv-completeness-checklist__list">
            <li>
              <button
                type="button"
                className="sdv-completeness-checklist__item"
                onClick={() => handleClick({ kind: 'create-unit' })}
                disabled={!onMissingClick}
              >
                Cadastrar pelo menos uma filial
              </button>
            </li>
          </ul>
        </div>
      )}

      {Array.from(unitsMap.entries()).map(([unitId, fields]) => (
        <div className="sdv-completeness-checklist__group" key={`unit-${unitId}`}>
          <span className="sdv-completeness-checklist__group-title">
            Filial · {unitNameById(units, unitId)}
          </span>
          <ul className="sdv-completeness-checklist__list">
            {fields.map((field) => (
              <li key={`unit-${unitId}-${field}`}>
                <button
                  type="button"
                  className="sdv-completeness-checklist__item"
                  onClick={() => handleClick({ kind: 'unit-field', unitId, field })}
                  disabled={!onMissingClick}
                >
                  {labelForMissing(`units[${unitId}].${field}`)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
