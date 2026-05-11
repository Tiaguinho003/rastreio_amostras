'use client';

import { useEffect, useRef, useState } from 'react';

// Overlay de diagnostico pra investigar o bug "bottom nav levantada" em
// PWA standalone (iOS Safari + Android Chrome). Mostra valores de
// viewport/safe-area em tempo real + timeline de mudancas pra identificar
// qual evento "destrava" o layout.
//
// Ativacao: `localStorage.setItem('debug-viewport', '1')` no devtools
// OU adicionar `?dvp=1` na URL. Persiste no localStorage apos primeira
// ativacao via query string.
//
// Posicao top-right pra nao cobrir a tabbar. Botao copiar JSON copia o
// snapshot atual + timeline pro clipboard.

type ViewportSnapshot = {
  t: number;
  label: string;
  innerW: number;
  innerH: number;
  visualW: number | null;
  visualH: number | null;
  visualOffsetTop: number | null;
  visualOffsetLeft: number | null;
  visualScale: number | null;
  safeAreaTop: number;
  safeAreaBottom: number;
  safeAreaLeft: number;
  safeAreaRight: number;
  scrollY: number;
  documentH: number;
  bodyH: number;
  // Estado do DOM/CSS adicional pra diagnostico do bug "barra bege":
  bodyClasses: string;
  bodyOverflow: string;
  appShellMainH: number | null; // altura computed do .app-shell-main
  appShellMainMinH: string | null; // min-height computed
  tabbarBottom: string | null; // bottom computed da .mobile-tabbar
  tabbarTransform: string | null; // transform computed
  containerScrolls: Record<string, number>; // scrollTop dos scrollables internos
};

type Timeline = ViewportSnapshot[];

function readSafeArea(): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  if (typeof document === 'undefined') {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
  // Cria element invisivel pra ler env(safe-area-inset-*) computado.
  const probe = document.createElement('div');
  probe.style.cssText = `
    position: fixed;
    visibility: hidden;
    pointer-events: none;
    top: 0; left: 0;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  `;
  document.body.appendChild(probe);
  const computed = window.getComputedStyle(probe);
  const result = {
    top: parseFloat(computed.paddingTop) || 0,
    bottom: parseFloat(computed.paddingBottom) || 0,
    left: parseFloat(computed.paddingLeft) || 0,
    right: parseFloat(computed.paddingRight) || 0,
  };
  document.body.removeChild(probe);
  return result;
}

function captureSnapshot(label: string, startTime: number): ViewportSnapshot {
  const safe = readSafeArea();

  // Captura estado de elementos DOM criticos pra diagnosticar onde
  // o layout fica errado mesmo quando viewport metrics estao OK.
  const appShellMain = document.querySelector('.app-shell-main') as HTMLElement | null;
  const tabbar = document.querySelector('.mobile-tabbar') as HTMLElement | null;
  const appShellStyle = appShellMain ? window.getComputedStyle(appShellMain) : null;
  const tabbarStyle = tabbar ? window.getComputedStyle(tabbar) : null;

  const scrollableSelectors = [
    '.sdv-content',
    '.dashboard-sheet',
    '.bottom-sheet-body',
    '.new-sample-step-body-content-details',
    '.client-detail-modal-form',
    '.client-quick-create-body',
    '.client-reg-modal-body',
    '.sample-classification-step-body',
    '.samples-page-v2-sheet',
    '.clients-v2-sheet',
    '.nsv2-body',
    '.nsv2-body-form',
  ];
  const containerScrolls: Record<string, number> = {};
  for (const sel of scrollableSelectors) {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el && el.scrollTop !== undefined) {
      containerScrolls[sel] = el.scrollTop;
    }
  }

  return {
    t: Math.round(performance.now() - startTime),
    label,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    visualW: window.visualViewport?.width ?? null,
    visualH: window.visualViewport?.height ?? null,
    visualOffsetTop: window.visualViewport?.offsetTop ?? null,
    visualOffsetLeft: window.visualViewport?.offsetLeft ?? null,
    visualScale: window.visualViewport?.scale ?? null,
    safeAreaTop: safe.top,
    safeAreaBottom: safe.bottom,
    safeAreaLeft: safe.left,
    safeAreaRight: safe.right,
    scrollY: window.scrollY,
    documentH: document.documentElement.clientHeight,
    bodyH: document.body.clientHeight,
    bodyClasses: document.body.className,
    bodyOverflow: window.getComputedStyle(document.body).overflow,
    appShellMainH: appShellMain?.clientHeight ?? null,
    appShellMainMinH: appShellStyle?.minHeight ?? null,
    tabbarBottom: tabbarStyle?.bottom ?? null,
    tabbarTransform: tabbarStyle?.transform ?? null,
    containerScrolls,
  };
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari quirk
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getDeviceInfo(): string {
  if (typeof window === 'undefined') return 'ssr';
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const platform = isIOS ? 'iOS' : isAndroid ? 'Android' : 'other';
  const standalone = isStandalone() ? 'standalone' : 'browser';
  return `${platform}/${standalone}`;
}

export function ViewportDebugOverlay() {
  const [active, setActive] = useState(false);
  const [snapshot, setSnapshot] = useState<ViewportSnapshot | null>(null);
  const [timeline, setTimeline] = useState<Timeline>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [showRawJson, setShowRawJson] = useState<string | null>(null);
  const startTimeRef = useRef<number>(0);

  // ⚠️ TEMPORARIO: ativado SEMPRE em prod pra capturar dados do bug
  // "barra bege apos teclado" em iOS 26 PWA standalone. Em PWA instalada,
  // localStorage e isolado da Safari (iOS quirk) — usuario nao consegue
  // ativar via ?dvp=1 nem via DevTools (nao existe em standalone). Esta
  // linha vai ser revertida pra ativacao condicional apos coletar o
  // snapshot necessario.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setActive(true);
  }, []);

  // Captura timeline e atualiza snapshot atual.
  useEffect(() => {
    if (!active || typeof window === 'undefined') return;

    startTimeRef.current = performance.now();
    const initial = captureSnapshot('mount', startTimeRef.current);
    setSnapshot(initial);
    setTimeline([initial]);

    const append = (label: string) => {
      const snap = captureSnapshot(label, startTimeRef.current);
      setSnapshot(snap);
      setTimeline((prev) => [...prev.slice(-19), snap]);
    };

    // Capturas em pontos do tempo pra ver settlement.
    const t100 = window.setTimeout(() => append('t+100ms'), 100);
    const t500 = window.setTimeout(() => append('t+500ms'), 500);
    const t1500 = window.setTimeout(() => append('t+1500ms'), 1500);
    const t3000 = window.setTimeout(() => append('t+3000ms'), 3000);

    const onResize = () => append('window.resize');
    const onOrientation = () => append('orientationchange');
    const onVisualResize = () => append('visualViewport.resize');
    const onVisualScroll = () => append('visualViewport.scroll');
    const onFocus = () => append('focusin');
    const onBlur = () => append('focusout');

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientation);
    window.visualViewport?.addEventListener('resize', onVisualResize);
    window.visualViewport?.addEventListener('scroll', onVisualScroll);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);

    return () => {
      window.clearTimeout(t100);
      window.clearTimeout(t500);
      window.clearTimeout(t1500);
      window.clearTimeout(t3000);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientation);
      window.visualViewport?.removeEventListener('resize', onVisualResize);
      window.visualViewport?.removeEventListener('scroll', onVisualScroll);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onBlur);
    };
  }, [active]);

  if (!active || !snapshot) return null;

  const handleCopy = async () => {
    const data = {
      device: getDeviceInfo(),
      ua: navigator.userAgent,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      current: snapshot,
      timeline,
    };
    const json = JSON.stringify(data, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      alert('Snapshot copiado.');
    } catch {
      // Fallback iOS standalone PWA: clipboard pode falhar sem gesture
      // explicito. Mostra modal com textarea selecionavel onde o user
      // pode dar tap-and-hold pra "Selecionar Tudo" + "Copiar".
      setShowRawJson(json);
    }
  };

  const handleClose = () => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem('debug-viewport');
    setActive(false);
  };

  const standaloneFlag = isStandalone() ? 'PWA' : 'browser';

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top) + 8px)',
        right: '8px',
        zIndex: 999999,
        background: 'rgba(0, 0, 0, 0.82)',
        color: '#0f0',
        font: '10px/1.3 ui-monospace, monospace',
        padding: '6px 8px',
        borderRadius: '6px',
        maxWidth: 'calc(100vw - 16px)',
        pointerEvents: 'auto',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
        <strong style={{ color: '#fff' }}>vp-debug</strong>
        <span>{getDeviceInfo()}</span>
        <span style={{ color: standaloneFlag === 'PWA' ? '#0f0' : '#fa0' }}>{standaloneFlag}</span>
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            color: '#0ff',
            border: '1px solid #0ff',
            borderRadius: '3px',
            cursor: 'pointer',
            font: 'inherit',
            padding: '0 4px',
          }}
        >
          {collapsed ? '▼' : '▲'}
        </button>
      </div>
      {!collapsed && (
        <>
          <div>
            inner: {snapshot.innerW}×{snapshot.innerH}
          </div>
          <div>
            visual: {snapshot.visualW}×{snapshot.visualH} top={snapshot.visualOffsetTop}
          </div>
          <div style={{ color: '#ff0' }}>
            safe-bot: <strong>{snapshot.safeAreaBottom}px</strong> safe-top: {snapshot.safeAreaTop}
            px
          </div>
          <div>
            doc: {snapshot.documentH} body: {snapshot.bodyH} y: {snapshot.scrollY}
          </div>
          <div style={{ marginTop: '4px', borderTop: '1px solid #333', paddingTop: '4px' }}>
            <strong style={{ color: '#fff' }}>timeline (last {timeline.length}):</strong>
            <div style={{ maxHeight: '120px', overflow: 'auto' }}>
              {timeline
                .slice()
                .reverse()
                .map((s, i) => (
                  <div key={i} style={{ color: '#aaa' }}>
                    +{s.t}ms <span style={{ color: '#0ff' }}>{s.label}</span> ih={s.innerH} vh=
                    {s.visualH} sb={s.safeAreaBottom}
                  </div>
                ))}
            </div>
          </div>
          <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
            <button
              onClick={handleCopy}
              style={{
                background: '#080',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                padding: '3px 8px',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              Copiar JSON
            </button>
            <button
              onClick={handleClose}
              style={{
                background: '#800',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                padding: '3px 8px',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              Fechar
            </button>
          </div>
        </>
      )}
      {showRawJson && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.92)',
            zIndex: 9999999,
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}>
            Tap-and-hold no texto abaixo → Selecionar Tudo → Copiar
          </div>
          <textarea
            readOnly
            value={showRawJson}
            style={{
              flex: 1,
              width: '100%',
              background: '#111',
              color: '#0f0',
              font: '10px/1.4 ui-monospace, monospace',
              padding: '8px',
              border: '1px solid #444',
              borderRadius: '4px',
              resize: 'none',
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            onClick={() => setShowRawJson(null)}
            style={{
              background: '#800',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '10px',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}
