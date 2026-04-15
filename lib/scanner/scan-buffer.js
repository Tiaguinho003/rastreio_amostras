// Pure JavaScript buffer that detects HID barcode scanner input in a stream of
// keydown events. No React / DOM assumptions — unit testable via node:test.
//
// Two detection modes:
//   1) PREFIX MODE (preferred) — scanner is configured to emit a control char
//      (default `\u0002` / STX) before the payload. We enter capture mode on
//      the prefix and ask the caller to preventDefault every following key.
//   2) TIMING MODE (fallback) — no prefix available. We watch intervals: if
//      chars arrive with <=30ms gaps and total length >=4, we treat the run
//      ending on Enter/Tab as a scan. Characters leak into the focused field
//      before we know; production setups should prefer prefix mode.

export const SCANNER_PREFIX_STX = '\u0002';

const DEFAULTS = Object.freeze({
  prefix: SCANNER_PREFIX_STX,
  maxIntervalMs: 30,
  minScanLength: 4,
  captureTimeoutMs: 1000,
  terminatorKeys: ['Enter', 'Tab'],
});

function hasModifier(event) {
  return Boolean(event.ctrlKey || event.metaKey || event.altKey);
}

function isPrintable(event) {
  if (hasModifier(event)) {
    return false;
  }
  return typeof event.key === 'string' && event.key.length === 1;
}

export function createScanBuffer(options = {}) {
  const prefix = options.prefix ?? DEFAULTS.prefix;
  const maxIntervalMs = options.maxIntervalMs ?? DEFAULTS.maxIntervalMs;
  const minScanLength = options.minScanLength ?? DEFAULTS.minScanLength;
  const captureTimeoutMs = options.captureTimeoutMs ?? DEFAULTS.captureTimeoutMs;
  const terminatorKeys = options.terminatorKeys ?? DEFAULTS.terminatorKeys;

  const isTerminator = (key) => terminatorKeys.includes(key);

  let mode = 'idle';
  let buffer = '';
  let intervals = [];
  let lastKeyAt = 0;

  function reset() {
    mode = 'idle';
    buffer = '';
    intervals = [];
    lastKeyAt = 0;
  }

  function now(event) {
    if (typeof event.timeStamp === 'number' && Number.isFinite(event.timeStamp)) {
      return event.timeStamp;
    }
    return Date.now();
  }

  function maybeTimeout(currentNow) {
    if (mode !== 'idle' && lastKeyAt !== 0 && currentNow - lastKeyAt > captureTimeoutMs) {
      reset();
      return true;
    }
    return false;
  }

  function processKey(event) {
    const currentNow = now(event);
    maybeTimeout(currentNow);
    const key = event.key;

    // --- PREFIX MODE ---
    if (mode === 'idle' && !hasModifier(event) && key === prefix) {
      mode = 'capturing';
      buffer = '';
      intervals = [];
      lastKeyAt = currentNow;
      return { action: 'capture', reason: 'prefix-start' };
    }

    if (mode === 'capturing') {
      if (isTerminator(key)) {
        const value = buffer;
        reset();
        if (value.length === 0) {
          return { action: 'ignore', reason: 'prefix-empty' };
        }
        return { action: 'complete', value, detection: 'prefix' };
      }
      if (isPrintable(event)) {
        buffer += key;
        lastKeyAt = currentNow;
        return { action: 'capture', reason: 'prefix-char' };
      }
      // Modifier or non-printable during capture: stay in capture, don't leak
      return { action: 'capture', reason: 'prefix-mod' };
    }

    // --- TIMING FALLBACK MODE ---
    if (mode === 'idle' && isPrintable(event)) {
      mode = 'tracking';
      buffer = key;
      intervals = [];
      lastKeyAt = currentNow;
      return { action: 'ignore', reason: 'tracking-start' };
    }

    if (mode === 'tracking') {
      if (isPrintable(event)) {
        const delta = currentNow - lastKeyAt;
        intervals.push(delta);
        buffer += key;
        lastKeyAt = currentNow;
        return { action: 'ignore', reason: 'tracking-char' };
      }
      if (isTerminator(key)) {
        const isFastEnough = intervals.length > 0 && intervals.every((gap) => gap <= maxIntervalMs);
        const isLongEnough = buffer.length >= minScanLength;
        const value = buffer;
        reset();
        if (isFastEnough && isLongEnough) {
          return { action: 'complete', value, detection: 'timing' };
        }
        return { action: 'ignore', reason: 'not-a-scan' };
      }
      return { action: 'ignore', reason: 'tracking-mod' };
    }

    return { action: 'ignore', reason: 'idle' };
  }

  function getState() {
    return {
      mode,
      buffer,
      intervals: intervals.slice(),
      lastKeyAt,
    };
  }

  return { processKey, reset, getState };
}
