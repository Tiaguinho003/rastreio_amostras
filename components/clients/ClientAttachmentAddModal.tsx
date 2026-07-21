'use client';

import { useEffect, useRef, useState } from 'react';

import { BottomSheet } from '../BottomSheet';
import { SuccessCheckOverlay } from '../SuccessCheckOverlay';
import type { ClientUnitSummary } from '../../lib/types';

// Rodada 6 FV: "Adicionar anexo" deixou de ser um input de arquivo direto no
// card — virou PAINEL LATERAL proprio, no molde dos demais paineis do detalhe
// (side-sheet stacked, seta ← da borda cancela): campo QUADRADO pra escolher
// o arquivo + vinculo opcional com a filial + Salvar no footer sticky. No
// sucesso o check canonico aparece e o pai fecha de volta pro detalhe.
type Props = {
  open: boolean;
  /** Filiais ATIVAS do cliente (PF); vazio esconde o campo de vinculo. */
  units: ClientUnitSummary[];
  saving: boolean;
  success: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSave: (file: File, unitId: string | null) => Promise<void> | void;
};

export function ClientAttachmentAddModal({
  open,
  units,
  saving,
  success,
  errorMessage,
  onClose,
  onSave,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [unitId, setUnitId] = useState('');

  // Reset ao fechar — o proximo open comeca limpo.
  useEffect(() => {
    if (open) return;
    setFile(null);
    setUnitId('');
  }, [open]);

  // objectURL do thumbnail segue o arquivo selecionado; revoga o anterior.
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (selected) setFile(selected);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || saving) return;
    await onSave(file, unitId || null);
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDismissAttempt={() => !saving && !success}
      title="Novo anexo"
      ariaLabel="Novo anexo"
      stacked
      closeVariant="edge-back"
      dragDisabled={saving || success}
      className="client-panel-sheet client-attachment-add-sheet side-sheet"
      footer={
        success ? null : (
          <button
            type="submit"
            form="client-attachment-add-form"
            className="app-modal-submit"
            disabled={saving || !file}
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        )
      }
    >
      <>
        {errorMessage ? <p className="cudm-error">{errorMessage}</p> : null}

        <form id="client-attachment-add-form" className="caa-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          <button
            type="button"
            className={`caa-drop${file ? ' has-file' : ''}`}
            onClick={() => inputRef.current?.click()}
            disabled={saving}
          >
            {file ? (
              previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="caa-drop-img" src={previewUrl} alt="Arquivo selecionado" />
              ) : (
                <span className="caa-drop-file">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  <span className="caa-drop-name">{file.name}</span>
                </span>
              )
            ) : (
              <span className="caa-drop-empty">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                <span>Escolher arquivo</span>
                <span className="caa-drop-hint">JPEG, PNG, WebP ou PDF</span>
              </span>
            )}
            {file ? <span className="caa-drop-swap">Trocar arquivo</span> : null}
          </button>

          {units.length > 0 ? (
            <label className="app-modal-field">
              <span className="app-modal-label">Filial (opcional)</span>
              <select
                className="app-modal-input"
                value={unitId}
                disabled={saving}
                onChange={(event) => setUnitId(event.target.value)}
              >
                <option value="">Sem vínculo</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name ?? `Filial ${unit.code}`}
                  </option>
                ))}
              </select>
              <span className="caa-hint">O vínculo com a filial é definitivo.</span>
            </label>
          ) : null}
        </form>

        <SuccessCheckOverlay show={success} />
      </>
    </BottomSheet>
  );
}
