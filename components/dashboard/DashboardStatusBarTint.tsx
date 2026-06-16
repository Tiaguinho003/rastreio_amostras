'use client';

import { useEffect } from 'react';

// Passo 1 do experimento de status bar (ver memoria
// project_ios_status_bar_scroll_color): tinge a barra do sistema conforme o
// scroll do dashboard.
//
// Em iOS PWA standalone (apple-mobile-web-app-status-bar-style:
// black-translucent) o FUNDO da barra ja segue o conteudo que passa por baixo
// do notch (hero verde -> sheet claro). O que NAO muda sozinho e a cor dos
// ICONES (relogio/bateria/sinal). Trocamos o meta `theme-color` (verde <->
// claro) pra validar no device real se o iOS atual escurece os icones sobre a
// barra clara — se sim, o efeito desejado sai de graca; se nao, partimos pro
// Passo 2 (abandonar o black-translucent). Em Android/Safari o `theme-color`
// ja dirige cor + contraste. Mesma mecanica do efeito da pagina /camera.
//
// NAO toca no DashboardMobile (escopo de outro agente): observa os elementos
// `.dashboard-scroll` / `.dashboard-hero` ja existentes via querySelector.

// Cores reais sob a barra (ver app/globals.css):
//  - topo: gradiente de `.app-shell-main.is-dashboard-route` (#1f5d43 -> #14372a)
//  - rolado: fundo do `.dashboard-sheet` (#f4f6f5)
const TOP_COLOR = '#1f5d43';
const SCROLLED_COLOR = '#f4f6f5';
// Zona morta (px) pra barra nao piscar quando o scroll fica parado no limiar.
const HYSTERESIS = 6;

// Altura da status bar. Prefere `--app-safe-area-top` (sincronizada via
// useViewportSync, imune ao cache de env() no iOS standalone); cai pro probe
// com env() caso o hook ainda nao tenha rodado.
function measureSafeTop(): number {
  const fromVar = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--app-safe-area-top')
  );
  if (Number.isFinite(fromVar)) return fromVar;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none;';
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

export function DashboardStatusBarTint() {
  useEffect(() => {
    const metaEl = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const scrollEl = document.querySelector<HTMLElement>('.dashboard-scroll');
    const heroEl = document.querySelector<HTMLElement>('.dashboard-hero');
    if (!metaEl || !scrollEl || !heroEl) return;

    // Bindings nao-nulos: o narrowing do guard acima nao se propaga pras
    // closures (apply/cleanup), entao fixamos consts ja estreitados.
    const meta = metaEl;
    const scroller = scrollEl;
    const hero = heroEl;

    const mobile = window.matchMedia('(max-width: 900px)');
    const original = meta.content;
    let safeTop = measureSafeTop();
    let scrolled = false;
    let raf = 0;

    function apply() {
      raf = 0;
      // Desktop: status bar nao se aplica — mantem o verde padrao.
      if (!mobile.matches) {
        if (scrolled) {
          scrolled = false;
          meta.content = TOP_COLOR;
        }
        return;
      }
      const bottom = hero.getBoundingClientRect().bottom;
      // Histerese: vira claro quando o hero deixa a faixa da status bar; so
      // volta ao verde quando reentra com folga.
      const next = scrolled ? bottom <= safeTop + HYSTERESIS : bottom <= safeTop;
      if (next !== scrolled) {
        scrolled = next;
        meta.content = scrolled ? SCROLLED_COLOR : TOP_COLOR;
      }
    }

    function onScroll() {
      if (!raf) raf = requestAnimationFrame(apply);
    }

    function onResize() {
      safeTop = measureSafeTop();
      apply();
    }

    apply(); // estado inicial (verde, no topo)
    scroller.addEventListener('scroll', onScroll, { passive: true });
    mobile.addEventListener('change', apply);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      scroller.removeEventListener('scroll', onScroll);
      mobile.removeEventListener('change', apply);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      meta.content = original;
    };
  }, []);

  return null;
}
