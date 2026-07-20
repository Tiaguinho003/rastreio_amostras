'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { CLASSIFICATION_TYPE_LABEL } from '../../lib/classification-form';
import type { ClassificationType, UserLookupItem } from '../../lib/types';

// Etapa "Tipo e classificadores" (D2, rodada 2) — corpo do BottomSheet da
// camera, no molde do ClassificationReviewSheetBody. Substitui os dois modais
// centrais que existiam antes (ClassificationTypeModal + Classifier), que
// interrompiam o fluxo com overlays e deixavam o back do Android sair da
// pagina.
//
// Dois campos empilhados, ambos com o MESMO comportamento (D3): campo fechado
// de altura fixa que abre uma lista flutuante ao toque.
// - Tipo: single-select, fecha ao escolher. Obrigatorio.
// - Classificadores: multi. Os selecionados viram chips com "x" numa fila que
//   DESLIZA na horizontal (D4) — a altura do campo nunca muda.
//
// Reuso de CSS (zero classe nova): a casca/dropdown vem do `.chip-select-*`
// (campo de altura fixa dos filtros/modais) e a fila de chips vem do
// `.samples-filter-chips-row` + `.samples-filter-token*`, que ja entrega
// nowrap + overflow-x + scrollbar escondida.

export type ClassifierEntry = { id: string; fullName: string; username: string };

/** Qual das duas listas esta aberta — o estado vive no pai porque o dismiss do
 *  sheet (ESC / voltar do Android) precisa fechar a lista em vez de descartar
 *  a classificacao. */
export type MetaOpenField = 'type' | 'classifiers' | null;

type Props = {
  selectedType: ClassificationType | null;
  onSelectType: (type: ClassificationType) => void;
  currentUserId: string;
  availableUsers: UserLookupItem[];
  selectedClassifiers: ClassifierEntry[];
  onToggleUser: (user: UserLookupItem) => void;
  onRemoveClassifier: (userId: string) => void;
  loadingUsers: boolean;
  userPickerError: string | null;
  onRetryLoad: () => void;
  /** Erro do save (banner no topo da etapa). */
  errorMessage?: string | null;
  /** Mostra o "Obrigatorio" dentro do campo de tipo (setado ao tentar salvar). */
  showTypeError: boolean;
  saving: boolean;
  openField: MetaOpenField;
  onOpenFieldChange: (field: MetaOpenField) => void;
};

const TYPE_OPTIONS = Object.keys(CLASSIFICATION_TYPE_LABEL) as ClassificationType[];

export function ClassificationMetaStepBody({
  selectedType,
  onSelectType,
  currentUserId,
  availableUsers,
  selectedClassifiers,
  onToggleUser,
  onRemoveClassifier,
  loadingUsers,
  userPickerError,
  onRetryLoad,
  errorMessage,
  showTypeError,
  saving,
  openField,
  onOpenFieldChange,
}: Props) {
  const typeTriggerRef = useRef<HTMLDivElement>(null);
  const classifiersTriggerRef = useRef<HTMLDivElement>(null);
  const typeWrapRef = useRef<HTMLDivElement>(null);
  const classifiersWrapRef = useRef<HTMLDivElement>(null);

  // Toque fora do campo aberto fecha a lista. O ESC NAO e tratado aqui: quem
  // decide e o onDismissAttempt do sheet (ele fecha a lista antes de cogitar
  // descartar a classificacao) — dois listeners de ESC no mesmo document
  // disparariam as duas coisas de uma vez.
  useEffect(() => {
    if (openField === null) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      const wrap = openField === 'type' ? typeWrapRef.current : classifiersWrapRef.current;
      if (wrap && !wrap.contains(target)) onOpenFieldChange(null);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [openField, onOpenFieldChange]);

  // Abre pra CIMA quando nao ha espaco abaixo DENTRO do body rolavel do sheet.
  // Medir contra window.innerHeight (como faz o ChipMultiSelectField) e errado
  // aqui: o fundo da janela fica abaixo do rodape do sheet, entao a conta diz
  // que cabe e o dropdown sai recortado. Mesma heuristica do NewSampleModal.
  function shouldDropUp(trigger: HTMLElement | null): boolean {
    if (!trigger) return false;
    const body = trigger.closest('.bottom-sheet-body');
    if (!body) return false;
    const rect = trigger.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const spaceBelow = bodyRect.bottom - rect.bottom;
    const spaceAbove = rect.top - bodyRect.top;
    return spaceBelow < 210 && spaceAbove > spaceBelow;
  }

  function toggleField(field: Exclude<MetaOpenField, null>) {
    if (saving) return;
    onOpenFieldChange(openField === field ? null : field);
  }

  // So uma lista fica aberta por vez (o pai guarda `openField`), entao a classe
  // de drop-up e recalculada no momento do render que segue a abertura.
  const typeDropUp = openField === 'type' && shouldDropUp(typeTriggerRef.current);
  const classifiersDropUp =
    openField === 'classifiers' && shouldDropUp(classifiersTriggerRef.current);

  function renderField(
    label: string,
    field: Exclude<MetaOpenField, null>,
    wrapRef: React.RefObject<HTMLDivElement | null>,
    triggerRef: React.RefObject<HTMLDivElement | null>,
    dropUp: boolean,
    hasError: boolean,
    inner: ReactNode,
    dropdown: ReactNode
  ) {
    const open = openField === field;
    return (
      <div className={`chip-select-field${hasError ? ' is-field-error' : ''}`}>
        <span className="review-field-label">{label}</span>
        <div className={`chip-select-wrap${open && dropUp ? ' is-drop-up' : ''}`} ref={wrapRef}>
          <div
            ref={triggerRef}
            className={`chip-select${open ? ' is-open' : ''}${saving ? ' is-disabled' : ''}`}
            role="button"
            tabIndex={saving ? -1 : 0}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={label}
            onClick={() => toggleField(field)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleField(field);
              }
            }}
          >
            {inner}
            <svg className="chip-select-chevron" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
          {open && !saving ? dropdown : null}
        </div>
      </div>
    );
  }

  const typeField = renderField(
    'Tipo do grão',
    'type',
    typeWrapRef,
    typeTriggerRef,
    typeDropUp,
    showTypeError && !selectedType,
    selectedType ? (
      <span className="chip-select-value">{CLASSIFICATION_TYPE_LABEL[selectedType]}</span>
    ) : (
      // Erro DENTRO do campo (placeholder vermelho suave), nunca abaixo —
      // convencao do projeto (feedback-messages §3).
      <span className={`chip-select-placeholder${showTypeError ? ' is-error' : ''}`}>
        {showTypeError ? 'Obrigatório' : 'Selecione o tipo'}
      </span>
    ),
    <div className="chip-select-dropdown" role="listbox" aria-label="Tipo do grão">
      <ul className="chip-select-list">
        {TYPE_OPTIONS.map((type) => {
          const isSelected = selectedType === type;
          return (
            <li key={type}>
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`chip-select-option${isSelected ? ' is-selected' : ''}`}
                onClick={() => {
                  onSelectType(type);
                  onOpenFieldChange(null);
                }}
              >
                <span className="chip-select-option-label">{CLASSIFICATION_TYPE_LABEL[type]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const classifiersField = renderField(
    'Classificadores',
    'classifiers',
    classifiersWrapRef,
    classifiersTriggerRef,
    classifiersDropUp,
    false,
    selectedClassifiers.length === 0 ? (
      <span className="chip-select-placeholder">Selecione quem classificou</span>
    ) : (
      // D4: fila de chips numa UNICA linha que rola na horizontal — o campo
      // nunca cresce em altura, por mais classificadores que entrem.
      <div className="samples-filter-chips-row">
        {selectedClassifiers.map((entry) => (
          <span key={entry.id} className="samples-filter-token" title={entry.fullName}>
            <span className="samples-filter-token-label">{entry.fullName}</span>
            <button
              type="button"
              className="samples-filter-token-remove"
              aria-label={`Remover ${entry.fullName}`}
              disabled={saving}
              // Sem o stopPropagation o clique sobe pro campo e abre a lista.
              onClick={(event) => {
                event.stopPropagation();
                onRemoveClassifier(entry.id);
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    ),
    <div className="chip-select-dropdown" role="listbox" aria-multiselectable="true">
      {loadingUsers ? (
        <p className="chip-select-empty">Carregando…</p>
      ) : userPickerError ? (
        <div className="classifier-error">
          <span>{userPickerError}</span>
          <button type="button" className="classifier-retry" onClick={onRetryLoad}>
            Tentar novamente
          </button>
        </div>
      ) : availableUsers.length === 0 ? (
        <p className="chip-select-empty">Nenhum usuário encontrado.</p>
      ) : (
        <ul className="chip-select-list">
          {availableUsers.map((user) => {
            const isSelected = selectedClassifiers.some((entry) => entry.id === user.id);
            return (
              <li key={user.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`chip-select-option${isSelected ? ' is-selected' : ''}`}
                  onClick={() => onToggleUser(user)}
                >
                  <span className="chip-select-check" aria-hidden="true">
                    {isSelected ? (
                      <svg viewBox="0 0 24 24">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="chip-select-option-label">{user.fullName}</span>
                  {user.id === currentUserId ? (
                    <span className="chip-select-option-sub">você</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div className="cms-step">
      {errorMessage ? <p className="sdv-modal-error">{errorMessage}</p> : null}
      {typeField}
      {classifiersField}
      <p className="cms-hint">
        Você já entra como classificador. Toque no campo para incluir quem conferiu junto.
      </p>
    </div>
  );
}
