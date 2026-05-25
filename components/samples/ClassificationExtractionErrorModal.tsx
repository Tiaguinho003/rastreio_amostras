'use client';

import { useEffect } from 'react';

import { useFocusTrap } from '../../lib/use-focus-trap';

// Q.cls.2 sub-caminhos 3a/3b: avisos de falha na extracao da IA, com
// distincao entre lote ilegivel (a IA rodou mas nao achou o lote) e
// erro tecnico (timeout, OpenAI offline, network). Caminhos diferentes
// pra evitar empurrar o operador a tirar mais fotos quando o problema
// e do servidor.
//
// 3a (illegible): "Tirar outra" + (opcional) "Continuar manual" + "Cancelar"
// 3b (technical): "Tirar outra" + "Continuar manual" + "Cancelar"
//
// F3.10 expandido: o botao "Continuar manual" pode aparecer em ambos
// os kinds — basta o caller passar onContinueManual. Em illegible
// preserva extracao parcial; em technical zera (logica em startManualMode).
//
// "Continuar manual" abre o ManualConfirmModal pra confirmar
// a decisao antes de seguir; depois da confirmacao, ReviewModal abre em
// modo manual (lote/sacas/safra editaveis).

type Kind = 'illegible' | 'technical';

type Props = {
  open: boolean;
  kind: Kind;
  // 3b only — detalhe tecnico opcional (ex: "Tempo limite excedido").
  // Aparece como linha extra abaixo da descricao.
  technicalDetail?: string | null;
  onCancel: () => void;
  onRetake: () => void;
  // Abre o 2o modal de confirmacao do modo manual. Opcional em ambos os
  // kinds — quando presente, o botao "Continuar manual" e renderizado.
  onContinueManual?: () => void;
};

const COPY: Record<Kind, { title: string; description: string; body: string; iconColor: string }> =
  {
    illegible: {
      title: 'Não foi possível identificar o lote',
      description: 'A IA processou a foto mas não conseguiu ler o número do lote.',
      body: 'Tente fotografar a ficha de novo focando bem no campo do lote, com boa iluminação e sem reflexo.',
      iconColor: '#D4A017',
    },
    technical: {
      title: 'Erro ao processar a foto',
      description: 'Serviço de extração indisponível no momento.',
      body: 'Você pode tirar outra foto e tentar novamente, ou seguir preenchendo a ficha manualmente.',
      iconColor: '#C0392B',
    },
  };

export function ClassificationExtractionErrorModal({
  open,
  kind,
  technicalDetail,
  onCancel,
  onRetake,
  onContinueManual,
}: Props) {
  const focusTrapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const copy = COPY[kind];

  return (
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed extraction-error-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="extraction-error-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="extraction-error-title" className="app-modal-title">
              {copy.title}
            </h3>
            <p className="app-modal-description">{copy.description}</p>
          </div>
          <button type="button" className="app-modal-close" onClick={onCancel} aria-label="Fechar">
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="app-modal-content extraction-error-content">
          <div className="extraction-error-body">
            <svg
              className="extraction-error-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              style={{ color: copy.iconColor }}
            >
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
              <line
                x1="12"
                y1="8"
                x2="12"
                y2="13"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <circle cx="12" cy="16.6" r="1.05" fill="currentColor" />
            </svg>
            <p className="extraction-error-text">{copy.body}</p>
            {kind === 'technical' && technicalDetail ? (
              <p className="extraction-error-detail">
                <span className="extraction-error-detail-label">Detalhe técnico:</span>{' '}
                {technicalDetail}
              </p>
            ) : null}
          </div>

          <div className="app-modal-actions extraction-error-actions">
            <button type="button" className="app-modal-submit" onClick={onRetake}>
              Tirar outra foto
            </button>
            {onContinueManual ? (
              <button type="button" className="app-modal-secondary" onClick={onContinueManual}>
                Continuar manual
              </button>
            ) : null}
            <button type="button" className="app-modal-secondary" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
