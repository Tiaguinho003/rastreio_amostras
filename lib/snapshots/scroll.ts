// F3 do ciclo SN — leitura/restauracao de scroll para snapshot de lista.
//
// Extraido de `app/(app)/samples/page.tsx`, onde era privado. As 4 paginas que
// ganharam snapshot na F3 usam o mesmo par.
//
// Quem rola e o CONTAINER INTERNO da lista, nao a janela: as rotas do app sao
// "em camada" (AppShell), e la o `.app-shell-main` mobile e
// `height: 100lvh; overflow: hidden`. O fallback pro `window` e defensivo — vale
// se alguma pagina algum dia sair da camada.

export function readListScrollTop(container: HTMLElement | null): number {
  if (container && container.scrollHeight - container.clientHeight > 1) {
    return container.scrollTop;
  }
  if (typeof window === 'undefined') {
    return 0;
  }
  return window.scrollY || document.documentElement.scrollTop || 0;
}

export function applyListScrollTop(container: HTMLElement | null, top: number): void {
  if (container && container.scrollHeight - container.clientHeight > 1) {
    container.scrollTo({ top });
    return;
  }
  if (typeof window !== 'undefined') {
    window.scrollTo({ top });
  }
}

const RESTORE_MAX_ATTEMPTS = 20;
const RESTORE_TOLERANCE_PX = 2;

/**
 * Restaura o scroll REAPLICANDO a cada frame ate acertar (±2px) ou esgotar ~20
 * frames. Um `scrollTo` unico NAO basta, por dois motivos que ja custaram caro:
 *
 * 1. a altura so assenta depois de alguns frames (safe-areas, sheet, settle de
 *    scroll do iOS) — o scrollTo "pegava" perto do topo e a posicao se perdia;
 * 2. `useIsDesktop()` comeca `false` e vira `true` DEPOIS da hidratacao, entao
 *    no desktop o primeiro paint monta a lista mobile e o container de scroll e
 *    trocado logo em seguida. Por isso o container vem como GETTER: cada frame
 *    le o ref de novo e acerta o container que sobrou.
 *
 * Para cedo ao acertar, pra nao brigar com um scroll do usuario. Devolve o
 * cleanup (cancela o rAF pendente) — use como retorno do efeito.
 */
export function restoreListScrollTop(
  getContainer: () => HTMLElement | null,
  top: number
): () => void {
  if (typeof window === 'undefined' || top <= 0) {
    return () => {};
  }

  let raf = 0;
  let attempts = 0;
  const tick = () => {
    applyListScrollTop(getContainer(), top);
    attempts += 1;
    const reached = Math.abs(readListScrollTop(getContainer()) - top) <= RESTORE_TOLERANCE_PX;
    if (reached || attempts >= RESTORE_MAX_ATTEMPTS) {
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  tick();

  return () => cancelAnimationFrame(raf);
}
