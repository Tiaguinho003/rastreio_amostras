'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type MobileTabbarItem = {
  href: string;
  mobileLabel: string;
  icon: ReactNode;
  emphasis?: 'primary' | 'default';
};

interface MobileTabbarProps {
  items: MobileTabbarItem[];
  isActive: (href: string) => boolean;
}

// Renderiza a barra de navegacao inferior via React Portal direto no
// document.body, fora da arvore do AppShell e do PageTransition.
//
// Motivo (Q.mobile.tabbar fix): durante navegacao, o
// .page-transition-content recebe `will-change: transform, opacity`
// (CSS animation pt-enter-*) por 300ms. CSS spec diz que qualquer
// ancestor com will-change:transform vira o containing block de
// position:fixed descendentes — entao a tabbar dentro do AppShell
// ficava fixed em relacao ao .page-transition-content (menor que o
// viewport), nao em relacao ao viewport. Em PWA standalone iOS/Android,
// essa diferenca aparece como "tabbar levantada" — ela fica acima da
// edge inferior por nao cobrir o area do home indicator.
//
// Renderizando via Portal no body, a tabbar nunca tem
// .page-transition-content (nem qualquer outro wrapper com transform)
// como ancestor. Sempre fixed em relacao ao viewport.
export function MobileTabbar({ items, isActive }: MobileTabbarProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  const tabbar = (
    <nav className="mobile-tabbar" aria-label="Paginas principais">
      <div className="mobile-tabbar-inner">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-tabbar-link${item.emphasis === 'primary' ? ' is-primary' : ''}${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="mobile-tabbar-pill">
                <span className="mobile-tabbar-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="mobile-tabbar-label">{item.mobileLabel}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );

  return createPortal(tabbar, document.body);
}
