'use client';

import { useEffect, useRef } from 'react';

import { createScanBuffer, SCANNER_PREFIX_STX } from './scan-buffer.js';

export type ScannerDetection = 'prefix' | 'timing';

export interface ScannerEvent {
  value: string;
  detection: ScannerDetection;
}

export interface UseGlobalScannerOptions {
  onScan: (event: ScannerEvent) => void;
  onCaptureStart?: () => void;
  onCaptureEnd?: () => void;
  enabled?: boolean;
  prefix?: string;
  maxIntervalMs?: number;
  minScanLength?: number;
  captureTimeoutMs?: number;
}

interface ScanBufferHandle {
  processKey: (event: {
    key: string;
    timeStamp?: number;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
  }) => {
    action: 'ignore' | 'capture' | 'complete';
    value?: string;
    detection?: ScannerDetection;
    reason?: string;
  };
  reset: () => void;
  getState: () => { mode: string; buffer: string; intervals: number[]; lastKeyAt: number };
}

/**
 * Attaches a global keydown listener in capture phase to detect HID barcode
 * scanner input. When a complete scan is detected, calls onScan with the
 * decoded payload. Uses prefix detection (primary) and timing heuristic
 * (fallback).
 */
export function useGlobalScanner({
  onScan,
  onCaptureStart,
  onCaptureEnd,
  enabled = true,
  prefix = SCANNER_PREFIX_STX,
  maxIntervalMs = 30,
  minScanLength = 4,
  captureTimeoutMs = 1000,
}: UseGlobalScannerOptions) {
  const onScanRef = useRef(onScan);
  const onCaptureStartRef = useRef(onCaptureStart);
  const onCaptureEndRef = useRef(onCaptureEnd);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    onCaptureStartRef.current = onCaptureStart;
  }, [onCaptureStart]);

  useEffect(() => {
    onCaptureEndRef.current = onCaptureEnd;
  }, [onCaptureEnd]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return undefined;
    }

    const bufferHandle = createScanBuffer({
      prefix,
      maxIntervalMs,
      minScanLength,
      captureTimeoutMs,
    }) as unknown as ScanBufferHandle;

    let isCapturing = false;

    const handleKeyDown = (event: KeyboardEvent) => {
      const result = bufferHandle.processKey({
        key: event.key,
        timeStamp: event.timeStamp,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
      });

      if (result.action === 'capture') {
        if (!isCapturing) {
          isCapturing = true;
          onCaptureStartRef.current?.();
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (result.action === 'complete' && typeof result.value === 'string' && result.detection) {
        if (isCapturing) {
          isCapturing = false;
          onCaptureEndRef.current?.();
        }
        // Prevent the terminator (Enter/Tab) from submitting forms or moving focus
        event.preventDefault();
        event.stopPropagation();
        onScanRef.current({ value: result.value, detection: result.detection });
        return;
      }

      // ignore: let the browser handle normally, and if we were capturing we
      // shouldn't be anymore
      if (isCapturing) {
        isCapturing = false;
        onCaptureEndRef.current?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      bufferHandle.reset();
      if (isCapturing) {
        isCapturing = false;
        onCaptureEndRef.current?.();
      }
    };
  }, [enabled, prefix, maxIntervalMs, minScanLength, captureTimeoutMs]);
}
