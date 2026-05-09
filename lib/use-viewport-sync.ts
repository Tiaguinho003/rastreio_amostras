'use client';

import { useEffect } from 'react';

// Sincroniza valores de viewport / safe-area com CSS custom properties
// atualizadas em runtime, contornando bugs conhecidos de cache do iOS
// Safari em PWA standalone:
//   * `env(safe-area-inset-bottom)` nem sempre recalcula apos
//     orientationchange / keyboard close.
//   * `100dvh` pode reportar valor stale apos os mesmos eventos.
//
// Como o iOS so recompute esses valores em reflow (paint), usamos um
// probe div escondido com padding-bottom: env(...) e lemos o
// computed style em mount, orientationchange, visualViewport.resize
// e focusout. Setamos `--app-safe-area-bottom` no document.documentElement.
//
// Tambem forcamos reflow lendo offsetHeight apos cada update.
//
// O .mobile-tabbar usa `var(--app-safe-area-bottom)` em vez de
// `env(safe-area-inset-bottom)` diretamente — assim a tabbar sempre
// reflete o valor atualizado, nao o valor cacheado pelo iOS.
export function useViewportSync() {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    // Probe div: lemos env(safe-area-inset-bottom) computado num
    // elemento real do DOM. iOS atualiza o computed style ao reflow,
    // mesmo quando o env() em outro lugar (a tabbar) esta cacheado.
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 1px',
      'height: 1px',
      'pointer-events: none',
      'visibility: hidden',
      'padding-top: env(safe-area-inset-top)',
      'padding-bottom: env(safe-area-inset-bottom)',
      'padding-left: env(safe-area-inset-left)',
      'padding-right: env(safe-area-inset-right)',
    ].join(';');
    document.body.appendChild(probe);

    let rafId: number | null = null;

    const update = () => {
      // Force reflow lendo offsetHeight do body. Em iOS, isso obriga
      // o WebKit a recompute o env(safe-area-inset-*) no probe.
      void document.body.offsetHeight;

      const computed = window.getComputedStyle(probe);
      const top = parseFloat(computed.paddingTop) || 0;
      const bottom = parseFloat(computed.paddingBottom) || 0;
      const left = parseFloat(computed.paddingLeft) || 0;
      const right = parseFloat(computed.paddingRight) || 0;

      const root = document.documentElement;
      root.style.setProperty('--app-safe-area-top', `${top}px`);
      root.style.setProperty('--app-safe-area-bottom', `${bottom}px`);
      root.style.setProperty('--app-safe-area-left', `${left}px`);
      root.style.setProperty('--app-safe-area-right', `${right}px`);
    };

    const scheduleUpdate = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        update();
      });
    };

    // Mount: 3 leituras pra cobrir cold start em iOS (env() pode
    // settle alguns frames apos primeiro paint).
    update();
    const t100 = window.setTimeout(scheduleUpdate, 100);
    const t500 = window.setTimeout(scheduleUpdate, 500);

    // Orientation change: iOS nao recompute env() automaticamente —
    // forcamos via offsetHeight read + setTimeout pra cobrir os
    // frames apos a transicao de orientation terminar.
    const onOrientation = () => {
      scheduleUpdate();
      window.setTimeout(scheduleUpdate, 200);
      window.setTimeout(scheduleUpdate, 600);
    };

    // Visual viewport resize: dispara em keyboard open/close +
    // orientation. Atualiza imediato.
    const onVisualResize = () => {
      scheduleUpdate();
    };

    // Focus out: keyboard fechou, valores podem ter mudado.
    const onFocusOut = () => {
      // Aguardar 1 frame antes de medir — keyboard close em iOS
      // tem delay entre focusout e viewport settle.
      requestAnimationFrame(() => {
        scheduleUpdate();
        window.setTimeout(scheduleUpdate, 200);
      });
    };

    window.addEventListener('orientationchange', onOrientation);
    window.visualViewport?.addEventListener('resize', onVisualResize);
    document.addEventListener('focusout', onFocusOut);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.clearTimeout(t100);
      window.clearTimeout(t500);
      window.removeEventListener('orientationchange', onOrientation);
      window.visualViewport?.removeEventListener('resize', onVisualResize);
      document.removeEventListener('focusout', onFocusOut);
      probe.remove();
    };
  }, []);
}
