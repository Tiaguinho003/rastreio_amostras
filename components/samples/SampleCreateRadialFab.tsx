'use client';

// FAB de criação na página /samples (Lotes). Dois modos:
//
// - 'idle': mostra "+". Tap abre um LEQUE (speed-dial) de 2 opções circulares
//   que parecem sair de DENTRO do FAB: Lote sobe direto ACIMA do FAB e Liga vai
//   direto À ESQUERDA (canto inferior direito). Ao abrir, o FAB encolhe, vira
//   circular e o "+" gira 45° virando "×"; a página escurece (scrim no tier de
//   modal) e fica não-clicável. A tabbar é portalada no body (fora da isolation
//   do shell), então o scrim — preso DENTRO do shell (z-0) — não a alcança só
//   por z-index. Enquanto o leque existe, body.is-fab-fan-open eleva o shell
//   inteiro acima da tabbar (regra em globals.css, media query mobile) pra que o
//   scrim a escureça junto com o resto, em vez de fazê-la sumir como os modais.
//   Só as opções respondem; tap fora fecha o leque. Fechamento reverte tudo.
//
// - 'blendArrow' (Liga F1.1 + F1.D): substitui "+" por seta direita ->.
//   Disabled (opacity 40% + cursor not-allowed) quando selectedCount < 2.
//   Tap habilitado dispara onContinue. Cabeado em B1.4 (modo selecao).
//
// CSS em app/globals.css (seção "Leque do FAB de Lotes"): .fab-fan-backdrop
// (scrim escuro), .fab-fan / .fab-fan-option (opções circulares + rótulo ao
// lado, posicionadas a partir das vars --fab-* do FAB), e o transform do FAB
// em .cv2-fab.is-expanded:not(.is-informe-fab) (encolher + circular + z-index).
// NÃO reusa as classes .fab-menu-* / .fab-radial-backdrop (essas continuam do
// InformeCreateRadialFab). Reusa tokens existentes (--brand-green, .cv2-fab).

import { useEffect, useRef, useState } from 'react';

type MenuAction = 'unit' | 'blend';

type SampleCreateRadialFabProps =
  | {
      mode: 'idle';
      onCreateUnit: () => void;
      onStartBlendSelection: () => void;
      disabled?: boolean;
    }
  | {
      mode: 'blendArrow';
      selectedCount: number;
      onContinue: () => void;
    };

const TOOLTIP_BLEND_DISABLED = 'Selecione pelo menos 2 amostras';
// Duracao do fechamento — precisa bater com a transition de transform do
// `.fab-fan-option` (sem `.is-open`) no globals.css, pra o unmount esperar a
// animacao de "recolher pra dentro do FAB" terminar.
const CLOSE_ANIMATION_MS = 360;

export function SampleCreateRadialFab(props: SampleCreateRadialFabProps) {
  // State machine de duas variaveis:
  // - mounted: leque existe no DOM (true durante abertura, aberto e fechamento).
  // - open: classe `.is-open` aplicada — dispara as transitions (opções emergem
  //         do FAB, scrim faz fade-in, FAB encolhe + "+"→"×").
  // Pattern duplo-RAF em openMenu garante que o paint inicial (mounted=true,
  // open=false → opções colapsadas no FAB) aconteca ANTES de setOpen(true), pra
  // que as transitions CSS disparem corretamente.
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pulsingOption, setPulsingOption] = useState<MenuAction | null>(null);
  // Guard contra taps rapidos em sequencia: depois que uma acao e
  // disparada, ignora outros taps ate o pulse terminar + cleanup.
  const actionFiredRef = useRef(false);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRafRef = useRef<number | null>(null);

  function openMenu() {
    // Se vier de um fechamento em andamento, cancela o unmount pendente
    // e reabre — as transitions interpolam suavemente do estado atual.
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setMounted(true);
    if (openRafRef.current) cancelAnimationFrame(openRafRef.current);
    openRafRef.current = requestAnimationFrame(() => {
      openRafRef.current = requestAnimationFrame(() => {
        openRafRef.current = null;
        setOpen(true);
      });
    });
  }

  function closeMenu() {
    if (openRafRef.current) {
      cancelAnimationFrame(openRafRef.current);
      openRafRef.current = null;
    }
    setOpen(false);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setMounted(false);
      closeTimerRef.current = null;
    }, CLOSE_ANIMATION_MS);
  }

  // Escape fecha o expandido.
  useEffect(() => {
    if (props.mode !== 'idle' || !open) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMenu();
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [open, props.mode]);

  // Enquanto o leque existe (abrindo / aberto / fechando), marca o body pra
  // elevar o shell acima da tabbar — que vive num portal no body, fora da
  // isolation do .mobile-edge-shell. Sem isso o scrim (preso no shell) fica
  // por baixo da tabbar e ela escapa do escurecimento. Atrelado a `mounted`
  // pra cobrir tambem o fade-out do scrim. Ver regra `body.is-fab-fan-open`
  // em globals.css. Em modo blendArrow `mounted` nunca vira true (sem leque).
  useEffect(() => {
    if (!mounted) return;
    document.body.classList.add('is-fab-fan-open');
    return () => document.body.classList.remove('is-fab-fan-open');
  }, [mounted]);

  // Cleanup de timers/RAFs no unmount.
  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (openRafRef.current) cancelAnimationFrame(openRafRef.current);
    };
  }, []);

  if (props.mode === 'blendArrow') {
    const isDisabled = props.selectedCount < 2;
    return (
      <button
        type="button"
        className={`cv2-fab is-blend-arrow${isDisabled ? ' is-disabled' : ''}`}
        aria-label={
          isDisabled ? TOOLTIP_BLEND_DISABLED : `Continuar com ${props.selectedCount} amostras`
        }
        title={isDisabled ? TOOLTIP_BLEND_DISABLED : undefined}
        onClick={() => {
          if (!isDisabled) props.onContinue();
        }}
        disabled={isDisabled}
      >
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      </button>
    );
  }

  // Mode 'idle'
  const handleMainTap = () => {
    if (props.disabled) return;
    if (open) closeMenu();
    else openMenu();
  };

  const handleOptionTap = (action: MenuAction) => {
    if (actionFiredRef.current) return; // race protection
    actionFiredRef.current = true;
    setPulsingOption(action);
    pulseTimeoutRef.current = setTimeout(() => {
      setPulsingOption(null);
      closeMenu();
      if (action === 'unit') {
        // NewSampleModal abre e seu backdrop cobre o leque enquanto
        // ele fecha em paralelo — sem jank visual.
        props.onCreateUnit();
        actionFiredRef.current = false;
      } else {
        // Mode troca pra 'blendArrow' e o early return do component
        // desmontaria o leque instantaneamente. Espera o close
        // animation completar antes pra que o user veja a transicao.
        setTimeout(() => {
          props.onStartBlendSelection();
          actionFiredRef.current = false;
        }, CLOSE_ANIMATION_MS);
      }
    }, 130);
  };

  const handleBackdropTap = () => {
    if (actionFiredRef.current) return;
    closeMenu();
  };

  // Classe is-expanded no FAB acompanha o `open` — quando o user pede pra
  // fechar (open=false), o FAB cresce de volta e "×"→"+" junto com o leque.
  const fabIsExpanded = mounted && open;

  return (
    <>
      {mounted && (
        <div
          className={`fab-fan-backdrop${open ? ' is-open' : ''}`}
          onPointerDown={handleBackdropTap}
          aria-hidden="true"
        />
      )}

      {mounted && (
        <div className="fab-fan" role="menu" aria-label="Opções de criação" aria-hidden={!open}>
          {/* Lote — acima do FAB */}
          <button
            type="button"
            className={`fab-fan-option is-lote${open ? ' is-open' : ''}${
              pulsingOption === 'unit' ? ' is-pulsing' : ''
            }`}
            aria-label="Novo lote"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => handleOptionTap('unit')}
          >
            <span className="fab-fan-option-label">Lote</span>
            <span className="fab-fan-option-circle">
              <svg
                className="fab-fan-option-icon"
                viewBox="0 0 24 24"
                focusable="false"
                aria-hidden="true"
              >
                {/* Grao de cafe: oval levemente rotacionado (-18°) + crease
                    S-shape ao longo do eixo longo. */}
                <g transform="rotate(-18 12 12)">
                  <path d="M12 3c-3.9 0-6 4-6 9s2.1 9 6 9 6-4 6-9-2.1-9-6-9z" />
                  <path d="M14.5 5.5c-3 4-3 9 0 13" />
                </g>
              </svg>
            </span>
          </button>

          {/* Liga — à esquerda do FAB */}
          <button
            type="button"
            className={`fab-fan-option is-liga${open ? ' is-open' : ''}${
              pulsingOption === 'blend' ? ' is-pulsing' : ''
            }`}
            aria-label="Nova liga"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => handleOptionTap('blend')}
          >
            <span className="fab-fan-option-label">Liga</span>
            <span className="fab-fan-option-circle">
              <svg
                className="fab-fan-option-icon"
                viewBox="0 0 24 24"
                focusable="false"
                aria-hidden="true"
              >
                <path d="M6 4v6a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V4" />
                <path d="M10 14v6" />
                <path d="M14 14v6" />
              </svg>
            </span>
          </button>
        </div>
      )}

      <button
        type="button"
        className={`cv2-fab${fabIsExpanded ? ' is-expanded' : ''}`}
        aria-label={open ? 'Fechar opções de criação' : 'Criar novo lote'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={handleMainTap}
        disabled={props.disabled}
      >
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
    </>
  );
}
