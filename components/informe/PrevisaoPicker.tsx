'use client';

// Entrada do print da previsao do tempo: colar (Ctrl+V), arrastar ou escolher o
// arquivo. No PC o caminho curto e Win+Shift+S -> Ctrl+V; no celular o seletor
// abre a galeria.

import { useCallback, useEffect, useRef, useState } from 'react';

import { type PrevisaoImage } from '../../lib/informativos/use-previsao-image';

interface PrevisaoPickerProps {
  previsao: PrevisaoImage | null;
  error: string | null;
  invalid?: boolean;
  onAccept: (file: File | null | undefined) => void;
  onClear: () => void;
}

function imagemDoClipboard(items: DataTransferItemList | undefined): File | null {
  if (!items) return null;
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

export function PrevisaoPicker({
  previsao,
  error,
  invalid,
  onAccept,
  onClear,
}: PrevisaoPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  // Contador de enter/leave: sem ele o realce pisca ao passar sobre os filhos.
  const dragDepth = useRef(0);

  // Colar em qualquer lugar do modal — o usuario da Ctrl+V sem clicar na caixa.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const file = imagemDoClipboard(event.clipboardData?.items);
      // Sem imagem no clipboard: nao interferir. Colar texto num input tem que
      // continuar funcionando.
      if (!file) return;
      event.preventDefault();
      onAccept(file);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onAccept]);

  // ARMADILHA DE PERDA TOTAL: o default do browser para um arquivo solto FORA
  // da caixa e NAVEGAR ate ele — o PNG abre e os campos ja digitados evaporam,
  // sem aviso e sem volta. Enquanto esta tela vive, o window recusa o drop.
  useEffect(() => {
    const swallow = (event: DragEvent) => event.preventDefault();
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      onAccept(event.dataTransfer.files?.[0]);
    },
    [onAccept]
  );

  return (
    <div className="inf-field">
      <span className="inf-field-label">Previsão do tempo</span>

      <div
        className={`ifm-drop${dragging ? ' is-dragging' : ''}${invalid ? ' has-error' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={() => {
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDragging(false);
          }
        }}
        onDrop={handleDrop}
      >
        {previsao ? (
          <div className="ifm-drop-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previsao.url} alt="Print da previsão do tempo" className="ifm-drop-thumb" />
            <div className="ifm-drop-meta">
              <span className="ifm-drop-dim">
                {previsao.size.w} × {previsao.size.h}
              </span>
              <div className="ifm-drop-meta-actions">
                <button
                  type="button"
                  className="ifm-drop-link"
                  onClick={() => inputRef.current?.click()}
                >
                  Trocar
                </button>
                <button type="button" className="ifm-drop-link is-remove" onClick={onClear}>
                  Remover
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="ifm-drop-empty"
            onClick={() => inputRef.current?.click()}
          >
            <span className="ifm-drop-title">Cole o print aqui</span>
            <span className="ifm-drop-hint">Ctrl+V, arraste o arquivo, ou toque para escolher</span>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="ifm-drop-input"
          onChange={(e) => {
            onAccept(e.target.files?.[0]);
            // Permite escolher o MESMO arquivo de novo depois de remover.
            e.target.value = '';
          }}
        />
      </div>

      {error ? <p className="inf-card-error">{error}</p> : null}
    </div>
  );
}
