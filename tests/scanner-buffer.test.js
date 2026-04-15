import test from 'node:test';
import assert from 'node:assert/strict';

import { createScanBuffer, SCANNER_PREFIX_STX } from '../lib/scanner/scan-buffer.js';

function makeEvent(key, timeStamp, extra = {}) {
  return {
    key,
    timeStamp,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...extra,
  };
}

function feedScan(buffer, payload, options = {}) {
  const { startAt = 1000, gap = 4, withPrefix = true, terminator = 'Enter' } = options;
  const results = [];
  let t = startAt;
  if (withPrefix) {
    results.push(buffer.processKey(makeEvent(SCANNER_PREFIX_STX, t)));
    t += gap;
  }
  for (const ch of payload) {
    results.push(buffer.processKey(makeEvent(ch, t)));
    t += gap;
  }
  results.push(buffer.processKey(makeEvent(terminator, t)));
  return results;
}

test('prefix mode: captures a complete scan ending with Enter', () => {
  const buffer = createScanBuffer();
  const results = feedScan(buffer, 'L-12345');

  // First event should be a capture-start on STX
  assert.equal(results[0].action, 'capture');
  assert.equal(results[0].reason, 'prefix-start');

  // Middle events should all be captures
  for (const r of results.slice(1, -1)) {
    assert.equal(r.action, 'capture');
  }

  const last = results[results.length - 1];
  assert.equal(last.action, 'complete');
  assert.equal(last.value, 'L-12345');
  assert.equal(last.detection, 'prefix');
});

test('prefix mode: buffer state resets after complete scan', () => {
  const buffer = createScanBuffer();
  feedScan(buffer, 'ABC123');
  assert.equal(buffer.getState().mode, 'idle');
  assert.equal(buffer.getState().buffer, '');
});

test('prefix mode: empty scan (just prefix + Enter) is ignored', () => {
  const buffer = createScanBuffer();
  const r1 = buffer.processKey(makeEvent(SCANNER_PREFIX_STX, 1000));
  const r2 = buffer.processKey(makeEvent('Enter', 1004));
  assert.equal(r1.action, 'capture');
  assert.equal(r2.action, 'ignore');
  assert.equal(r2.reason, 'prefix-empty');
});

test('prefix mode: captures Tab as terminator too', () => {
  const buffer = createScanBuffer();
  const results = feedScan(buffer, 'XYZ', { terminator: 'Tab' });
  const last = results[results.length - 1];
  assert.equal(last.action, 'complete');
  assert.equal(last.value, 'XYZ');
});

test('prefix mode: modifier keys during capture do not leak', () => {
  const buffer = createScanBuffer();
  buffer.processKey(makeEvent(SCANNER_PREFIX_STX, 1000));
  buffer.processKey(makeEvent('A', 1004));
  // Shift arrives — should stay in capture mode
  const r = buffer.processKey(makeEvent('Shift', 1008));
  assert.equal(r.action, 'capture');
  assert.equal(r.reason, 'prefix-mod');
  // Still captures subsequent letters
  const r2 = buffer.processKey(makeEvent('B', 1012));
  assert.equal(r2.action, 'capture');
  const final = buffer.processKey(makeEvent('Enter', 1016));
  assert.equal(final.action, 'complete');
  assert.equal(final.value, 'AB');
});

test('timing mode: fast consecutive keys followed by Enter detect a scan', () => {
  const buffer = createScanBuffer();
  const results = feedScan(buffer, 'LOT5678', { withPrefix: false, gap: 5 });

  // Every non-final event should be ignore (timing mode doesn't preventDefault)
  for (const r of results.slice(0, -1)) {
    assert.equal(r.action, 'ignore');
  }

  const last = results[results.length - 1];
  assert.equal(last.action, 'complete');
  assert.equal(last.value, 'LOT5678');
  assert.equal(last.detection, 'timing');
});

test('timing mode: slow (human) typing is not detected as scan', () => {
  const buffer = createScanBuffer();
  const results = feedScan(buffer, 'hello', { withPrefix: false, gap: 120 });
  const last = results[results.length - 1];
  assert.equal(last.action, 'ignore');
  assert.equal(last.reason, 'not-a-scan');
});

test('timing mode: too-short buffer is not detected as scan', () => {
  const buffer = createScanBuffer({ minScanLength: 4 });
  const results = feedScan(buffer, 'ab', { withPrefix: false, gap: 5 });
  const last = results[results.length - 1];
  assert.equal(last.action, 'ignore');
  assert.equal(last.reason, 'not-a-scan');
});

test('timing mode: even one slow gap inside a fast run disqualifies the scan', () => {
  const buffer = createScanBuffer();
  buffer.processKey(makeEvent('A', 1000));
  buffer.processKey(makeEvent('B', 1005));
  buffer.processKey(makeEvent('C', 1010));
  buffer.processKey(makeEvent('D', 1200)); // slow gap
  const r = buffer.processKey(makeEvent('Enter', 1204));
  assert.equal(r.action, 'ignore');
  assert.equal(r.reason, 'not-a-scan');
});

test('capture timeout resets stale state before accepting new input', () => {
  const buffer = createScanBuffer({ captureTimeoutMs: 500 });
  buffer.processKey(makeEvent(SCANNER_PREFIX_STX, 1000));
  buffer.processKey(makeEvent('X', 1005));
  assert.equal(buffer.getState().mode, 'capturing');
  // Next key arrives way later — timeout kicks in
  const r = buffer.processKey(makeEvent(SCANNER_PREFIX_STX, 2000));
  assert.equal(r.action, 'capture');
  assert.equal(r.reason, 'prefix-start');
  assert.equal(buffer.getState().buffer, '');
});

test('Ctrl-held keys are never treated as printable', () => {
  const buffer = createScanBuffer();
  const r = buffer.processKey(makeEvent('C', 1000, { ctrlKey: true }));
  assert.equal(r.action, 'ignore');
  assert.equal(buffer.getState().mode, 'idle');
});

test('reset() clears any in-progress state', () => {
  const buffer = createScanBuffer();
  buffer.processKey(makeEvent(SCANNER_PREFIX_STX, 1000));
  buffer.processKey(makeEvent('Q', 1004));
  buffer.reset();
  const state = buffer.getState();
  assert.equal(state.mode, 'idle');
  assert.equal(state.buffer, '');
  assert.equal(state.intervals.length, 0);
});

test('custom prefix option is respected', () => {
  const buffer = createScanBuffer({ prefix: '~' });
  const r1 = buffer.processKey(makeEvent('~', 1000));
  assert.equal(r1.action, 'capture');
  const r2 = buffer.processKey(makeEvent('A', 1004));
  assert.equal(r2.action, 'capture');
  const r3 = buffer.processKey(makeEvent('Enter', 1008));
  assert.equal(r3.action, 'complete');
  assert.equal(r3.value, 'A');
});

test('prefix detection ignores non-terminator punctuation as payload', () => {
  const buffer = createScanBuffer();
  const results = feedScan(buffer, 'A1_B2/C3');
  const last = results[results.length - 1];
  assert.equal(last.action, 'complete');
  assert.equal(last.value, 'A1_B2/C3');
});

test('timing detection: long scan (16 chars) with 10ms gaps is detected', () => {
  const buffer = createScanBuffer();
  const results = feedScan(buffer, 'ABCDEF1234567890', {
    withPrefix: false,
    gap: 10,
  });
  const last = results[results.length - 1];
  assert.equal(last.action, 'complete');
  assert.equal(last.value, 'ABCDEF1234567890');
  assert.equal(last.detection, 'timing');
});

test('Enter alone (no prior keys) is ignored', () => {
  const buffer = createScanBuffer();
  const r = buffer.processKey(makeEvent('Enter', 1000));
  assert.equal(r.action, 'ignore');
});
