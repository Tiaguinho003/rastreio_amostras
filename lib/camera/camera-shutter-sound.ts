'use client';

// Som de shutter via Web Audio API. Mesmo padrao do
// lib/scanner/scanner-sound.ts (AudioContext compartilhado lazy).
// Zero assets. Disparado em captureFromVideoStream do app/camera/page.tsx.

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (sharedAudioContext) {
    return sharedAudioContext;
  }
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  try {
    sharedAudioContext = new Ctor();
    return sharedAudioContext;
  } catch {
    return null;
  }
}

export function playShutterSound() {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  try {
    const now = ctx.currentTime;

    // Click 1 — agudo curto (simula "ka").
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(1800, now);
    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.exponentialRampToValueAtTime(0.18, now + 0.005);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.06);

    // Click 2 — mais grave, levemente atrasado (simula "chak").
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(900, now + 0.04);
    gain2.gain.setValueAtTime(0.0001, now + 0.04);
    gain2.gain.exponentialRampToValueAtTime(0.16, now + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.04);
    osc2.stop(now + 0.14);
  } catch {
    // ignore audio failures — non-critical
  }
}
