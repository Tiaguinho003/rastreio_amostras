'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PhotoZoomViewerProps {
  src: string;
  alt: string;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;

export function PhotoZoomViewer({ src, alt, onClose }: PhotoZoomViewerProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const pinchRef = useRef<{ startDistance: number; startScale: number } | null>(null);
  const panRef = useRef<{
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const lastTapRef = useRef(0);

  const clampOffset = useCallback((nextOffset: { x: number; y: number }, nextScale: number) => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img || nextScale <= 1) return { x: 0, y: 0 };
    const stageRect = stage.getBoundingClientRect();
    const scaledW = img.clientWidth * nextScale;
    const scaledH = img.clientHeight * nextScale;
    const maxX = Math.max(0, (scaledW - stageRect.width) / 2);
    const maxY = Math.max(0, (scaledH - stageRect.height) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, nextOffset.x)),
      y: Math.max(-maxY, Math.min(maxY, nextOffset.y)),
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      const prevScale = scaleRef.current;
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prevScale + delta * prevScale));
      if (nextScale === prevScale) return;
      setScale(nextScale);
      setOffset((prev) => clampOffset(prev, nextScale));
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const d = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        pinchRef.current = { startDistance: d, startScale: scaleRef.current };
        panRef.current = null;
        lastTapRef.current = 0;
        return;
      }
      if (e.touches.length === 1) {
        const now = Date.now();
        const timeSinceTap = now - lastTapRef.current;
        const isDouble = lastTapRef.current > 0 && timeSinceTap < DOUBLE_TAP_MS;

        if (isDouble) {
          e.preventDefault();
          const next = scaleRef.current > 1 ? 1 : DOUBLE_TAP_SCALE;
          setScale(next);
          setOffset({ x: 0, y: 0 });
          lastTapRef.current = 0;
          panRef.current = null;
          return;
        }

        lastTapRef.current = now;

        if (scaleRef.current > 1) {
          e.preventDefault();
          const t = e.touches[0];
          panRef.current = {
            pointerX: t.clientX,
            pointerY: t.clientY,
            offsetX: offsetRef.current.x,
            offsetY: offsetRef.current.y,
          };
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const d = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const ratio = d / pinchRef.current.startDistance;
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchRef.current.startScale * ratio));
        setScale(next);
        setOffset((prev) => clampOffset(prev, next));
        return;
      }
      if (e.touches.length === 1 && panRef.current) {
        e.preventDefault();
        const t = e.touches[0];
        const start = panRef.current;
        setOffset(
          clampOffset(
            {
              x: start.offsetX + (t.clientX - start.pointerX),
              y: start.offsetY + (t.clientY - start.pointerY),
            },
            scaleRef.current
          )
        );
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
      if (e.touches.length === 0) panRef.current = null;
    };

    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('touchstart', onTouchStart, { passive: false });
    stage.addEventListener('touchmove', onTouchMove, { passive: false });
    stage.addEventListener('touchend', onTouchEnd);
    stage.addEventListener('touchcancel', onTouchEnd);

    return () => {
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchmove', onTouchMove);
      stage.removeEventListener('touchend', onTouchEnd);
      stage.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [clampOffset]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const start = panRef.current;
      if (!start) return;
      setOffset(
        clampOffset(
          {
            x: start.offsetX + (e.clientX - start.pointerX),
            y: start.offsetY + (e.clientY - start.pointerY),
          },
          scaleRef.current
        )
      );
    };
    const onMouseUp = () => {
      panRef.current = null;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [clampOffset]);

  const onMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if (scaleRef.current <= 1) return;
    e.preventDefault();
    panRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      offsetX: offsetRef.current.x,
      offsetY: offsetRef.current.y,
    };
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === stageRef.current) return;
    e.preventDefault();
    if (scale > 1) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
    } else {
      setScale(DOUBLE_TAP_SCALE);
      setOffset({ x: 0, y: 0 });
    }
  };

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === stageRef.current) onClose();
  };

  const cursor = scale > 1 ? (panRef.current ? 'grabbing' : 'grab') : 'zoom-in';

  return (
    <div
      ref={stageRef}
      className="pzv-stage"
      role="dialog"
      aria-modal="true"
      aria-label="Foto ampliada"
      onClick={onStageClick}
      onDoubleClick={onDoubleClick}
    >
      <button
        type="button"
        className="pzv-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Fechar"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M18 6L6 18M6 6l12 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </button>
      {/* next/image nao se aplica: foto local com dimensoes dinamicas via transform */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="pzv-image"
        draggable={false}
        onMouseDown={onMouseDown}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          cursor,
        }}
      />
    </div>
  );
}
