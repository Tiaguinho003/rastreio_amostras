'use client';

import { useFocusTrap } from '../../lib/use-focus-trap';

type Props = {
  open: boolean;
  reassignedCount: number;
  onConfirm: () => void;
  onBack: () => void;
};

export function CancelInactivationDialog({ open, reassignedCount, onConfirm, onBack }: Props) {
  const focusTrapRef = useFocusTrap(open);

  if (!open) return null;

  const hasPartial = reassignedCount > 0;

  return (
    <div className="app-modal-backdrop cancel-inactivation-dialog-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal cancel-inactivation-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-inactivation-title"
        aria-describedby="cancel-inactivation-description"
      >
        <header className="cancel-inactivation-dialog__header">
          <h3 id="cancel-inactivation-title">Cancelar inativação?</h3>
        </header>

        <div className="cancel-inactivation-dialog__body" id="cancel-inactivation-description">
          {hasPartial ? (
            <>
              <p className="cancel-inactivation-dialog__warning">
                <strong>Atenção:</strong> as <strong>{reassignedCount}</strong> reatribuições já
                salvas <strong>não serão revertidas</strong>.
              </p>
              <p>
                O usuário continuará ativo, mas os clientes reatribuídos manterão os novos
                responsáveis.
              </p>
            </>
          ) : (
            <p>Nenhuma alteração foi feita. O usuário continuará ativo.</p>
          )}
        </div>

        <footer className="cancel-inactivation-dialog__footer">
          <button type="button" className="app-modal-secondary" onClick={onBack}>
            Voltar
          </button>
          <button type="button" className="app-modal-submit is-danger" onClick={onConfirm}>
            Sim, cancelar
          </button>
        </footer>
      </section>
    </div>
  );
}
