'use client';

// Som de obturador de camera via Web Audio API (zero assets). Um obturador
// real e MECANICO: nao e um tom, e um "ka-chak" de ruido filtrado — dois
// impulsos curtos (abre/espelho sobe, depois fecha/espelho desce), cada um
// com um click agudo (ruido em banda alta) + um corpo grave curtissimo (o
// "baque" da massa). A versao antiga usava osciladores square (1800/900 Hz),
// por isso soava eletronica, sem relacao com camera.
// Mesmo padrao de AudioContext compartilhado do lib/scanner/scanner-sound.ts.

let sharedAudioContext: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

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

// Buffer de ruido branco reutilizavel (~300ms), gerado uma vez. Cada clack
// le um trecho com offset diferente pra os dois nao soarem identicos.
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }
  const length = Math.floor(ctx.sampleRate * 0.3);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return noiseBuffer;
}

type ClackOptions = {
  clickHz: number; // centro do bandpass do click agudo
  clickQ: number; // Q baixo = banda larga = "click" (Q alto soaria tonal)
  clickGain: number;
  clickDecay: number; // segundos
  bodyHz: number; // teto do lowpass do corpo grave
  bodyGain: number;
  bodyDecay: number;
  offset: number; // ponto de leitura no buffer de ruido (segundos)
};

// Um "clack" mecanico = click agudo (ruido em bandpass) + corpo grave curto.
function mechanicalClack(
  ctx: AudioContext,
  noise: AudioBuffer,
  destination: AudioNode,
  startTime: number,
  opts: ClackOptions
) {
  // Click agudo: ruido -> bandpass -> highpass -> envelope rapido.
  const clickSrc = ctx.createBufferSource();
  clickSrc.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = opts.clickHz;
  band.Q.value = opts.clickQ;
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 1400;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.0001, startTime);
  clickGain.gain.exponentialRampToValueAtTime(opts.clickGain, startTime + 0.0012);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, startTime + opts.clickDecay);
  clickSrc.connect(band);
  band.connect(high);
  high.connect(clickGain);
  clickGain.connect(destination);
  clickSrc.start(startTime, opts.offset, opts.clickDecay + 0.03);

  // Corpo grave: ruido (outro trecho) -> lowpass -> envelope curtissimo.
  const bodySrc = ctx.createBufferSource();
  bodySrc.buffer = noise;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = opts.bodyHz;
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.0001, startTime);
  bodyGain.gain.exponentialRampToValueAtTime(opts.bodyGain, startTime + 0.002);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, startTime + opts.bodyDecay);
  bodySrc.connect(low);
  low.connect(bodyGain);
  bodyGain.connect(destination);
  bodySrc.start(startTime, opts.offset + 0.05, opts.bodyDecay + 0.03);
}

export function playShutterSound() {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  try {
    const noise = getNoiseBuffer(ctx);
    const now = ctx.currentTime;

    // Master unico pra controlar o nivel geral. Sem compressor de proposito:
    // ele clampava o 1o clack (o "ka", que deve ser o mais forte) durante o
    // proprio attack e soltava no 2o, invertendo a dinamica. Os picos somados
    // ficam ~0.8 (sem clipping), entao nao ha o que limitar.
    const master = ctx.createGain();
    master.gain.value = 1.0;
    master.connect(ctx.destination);

    // Clack 1 — abre (espelho sobe): o "ka", mais brilhante e mais forte.
    mechanicalClack(ctx, noise, master, now, {
      clickHz: 3400,
      clickQ: 0.7,
      clickGain: 1.12,
      clickDecay: 0.045,
      bodyHz: 280,
      bodyGain: 0.51,
      bodyDecay: 0.03,
      offset: 0.01,
    });

    // Clack 2 — fecha (espelho desce): o "chak", ~85ms depois, mais grave/curto.
    mechanicalClack(ctx, noise, master, now + 0.085, {
      clickHz: 2600,
      clickQ: 0.8,
      clickGain: 0.88,
      clickDecay: 0.038,
      bodyHz: 230,
      bodyGain: 0.42,
      bodyDecay: 0.028,
      offset: 0.14,
    });
  } catch {
    // ignore audio failures — non-critical
  }
}
