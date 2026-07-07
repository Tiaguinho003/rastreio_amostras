import type { SampleEligibilityReason, SampleSnapshot } from '../types';

// Seleção do modo Liga em /samples. A seleção guarda o SNAPSHOT completo do
// lote (não só o id): o sheet de confirmação e o dropdown de revisão precisam
// de lote/sacas/elegibilidade mesmo quando o item saiu da lista atual (busca/
// filtro trocam a lista inteira via success-initial). Antes desta extração a
// seleção era um Set<string> e todo consumo filtrava a lista visível — lotes
// selecionados fora da busca sumiam silenciosamente da liga criada.
// A ordem de inserção do Map = ordem de seleção do usuário.

export type BlendSelection = Map<string, SampleSnapshot>;

export interface ReconcileRemoval {
  id: string;
  lot: string;
  reason: SampleEligibilityReason;
}

export interface ReconcileResult {
  selection: BlendSelection;
  removed: ReconcileRemoval[];
  changed: boolean;
}

// Reconcilia a seleção com uma resposta fresca da lista (refetch por busca/
// filtro/modo/revalidação):
// - id presente na resposta -> ATUALIZA o snapshot guardado (sacas/eligibility
//   frescos re-sincronizam o sheet);
// - presente e inelegível -> remove (o chamador exibe o toast);
// - ausente da resposta (fora dos filtros atuais) -> mantém como está.
export function reconcileSelection(
  selection: BlendSelection,
  items: SampleSnapshot[]
): ReconcileResult {
  if (selection.size === 0) {
    return { selection, removed: [], changed: false };
  }

  const itemsById = new Map(items.map((item) => [item.id, item]));
  const next: BlendSelection = new Map();
  const removed: ReconcileRemoval[] = [];
  let changed = false;

  for (const [id, stored] of selection) {
    const fresh = itemsById.get(id);
    if (!fresh) {
      next.set(id, stored);
      continue;
    }
    if (fresh.eligibility && !fresh.eligibility.eligible) {
      removed.push({
        id,
        lot: fresh.internalLotNumber ?? '—',
        reason: fresh.eligibility.reason,
      });
      changed = true;
      continue;
    }
    next.set(id, fresh);
    changed = true;
  }

  return changed ? { selection: next, removed, changed } : { selection, removed, changed };
}

export function toggleSelection(selection: BlendSelection, sample: SampleSnapshot): BlendSelection {
  const next = new Map(selection);
  if (next.has(sample.id)) {
    next.delete(sample.id);
  } else {
    next.set(sample.id, sample);
  }
  return next;
}
