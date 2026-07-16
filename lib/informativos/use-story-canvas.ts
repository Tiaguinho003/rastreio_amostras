// Pinta uma peca num canvas quando ela fica visivel.
//
// Existe para nao duplicar nas duas canvases da revisao o cuidado que a peca
// exige: esperar a fonte, carregar o logo e desistir se o efeito foi cancelado.

import { useEffect, useRef, type RefObject } from 'react';

import { loadLogo } from './story-draw.ts';

/** Recebe o contexto e o logo ja carregado (null se falhou). O chamador PRECISA
 * memoizar com useCallback — e a dependencia que dispara o redesenho. */
export type PaintStory = (ctx: CanvasRenderingContext2D, logo: CanvasImageSource | null) => void;

export function useStoryCanvas(
  active: boolean,
  paint: PaintStory
): RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    // O StrictMode dispara o efeito duas vezes; a flag impede que a passada
    // abortada pinte por cima da atual.
    let cancelled = false;

    async function run() {
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // A Poppins vem do next/font: sem esperar, o primeiro desenho sai num
      // fallback e a peca muda de cara ao redesenhar.
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      let logo: CanvasImageSource | null = null;
      try {
        logo = await loadLogo();
      } catch {
        // Peca sem logo e melhor que peca nenhuma; o loadLogo nao memoiza a
        // falha, entao o proximo desenho tenta de novo.
        logo = null;
      }

      if (cancelled) return;
      paint(ctx, logo);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [active, paint]);

  return ref;
}
