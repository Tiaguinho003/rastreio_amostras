'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef } from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
}

const DURATION = 300;

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const contentRef = useRef<HTMLDivElement>(null);
  const prevPathnameRef = useRef(pathname);
  const snapshotHtmlRef = useRef('');
  const snapshotScrollRef = useRef(0);
  const isPopStateRef = useRef(false);
  const transitioningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitLayerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPopState() {
      isPopStateRef.current = true;
    }

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (contentRef.current && !transitioningRef.current) {
      snapshotHtmlRef.current = contentRef.current.innerHTML;
      snapshotScrollRef.current = window.scrollY;
    }
  });

  useIsomorphicLayoutEffect(() => {
    if (pathname === prevPathnameRef.current) {
      return;
    }

    const content = contentRef.current;

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (exitLayerRef.current) {
      exitLayerRef.current.remove();
      exitLayerRef.current = null;
    }

    if (content) {
      content.classList.remove(
        'page-transition-enter',
        'page-transition-enter--forward',
        'page-transition-enter--back'
      );
    }

    transitioningRef.current = false;

    const prevPathname = prevPathnameRef.current;
    prevPathnameRef.current = pathname;

    if (!content || !snapshotHtmlRef.current) {
      return;
    }

    const isBack = isPopStateRef.current;
    isPopStateRef.current = false;
    const direction = isBack ? 'back' : 'forward';

    transitioningRef.current = true;

    const exitLayer = document.createElement('div');
    exitLayer.className = `page-transition-exit page-transition-exit--${direction}`;
    exitLayer.setAttribute('aria-hidden', 'true');
    exitLayer.setAttribute('data-from', prevPathname);

    const exitInner = document.createElement('div');
    exitInner.className = 'page-transition-exit-inner';
    exitInner.style.transform = `translateY(-${snapshotScrollRef.current}px)`;
    exitInner.innerHTML = snapshotHtmlRef.current;

    exitLayer.appendChild(exitInner);
    content.parentElement!.appendChild(exitLayer);
    exitLayerRef.current = exitLayer;

    content.classList.add('page-transition-enter', `page-transition-enter--${direction}`);

    timerRef.current = setTimeout(() => {
      timerRef.current = null;

      if (exitLayerRef.current) {
        exitLayerRef.current.remove();
        exitLayerRef.current = null;
      }

      if (content) {
        content.classList.remove(
          'page-transition-enter',
          'page-transition-enter--forward',
          'page-transition-enter--back'
        );
      }

      transitioningRef.current = false;
    }, DURATION);
  }, [pathname]);

  return (
    <div className="page-transition-root">
      <div ref={contentRef} className="page-transition-content">
        {children}
      </div>
    </div>
  );
}
