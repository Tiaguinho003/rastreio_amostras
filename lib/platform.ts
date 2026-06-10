// Deteccao de plataforma/modo de exibicao da PWA. SSR-safe: tudo retorna
// false fora do browser. Extraido do ViewportDebugOverlay pra reuso (push
// notifications precisam saber se e iOS fora da tela de inicio).

export function isStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari quirk: PWA instalada reporta navigator.standalone.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isAndroid(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return /Android/.test(navigator.userAgent);
}
