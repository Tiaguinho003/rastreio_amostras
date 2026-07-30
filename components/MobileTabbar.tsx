'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { LinkPendingProbe } from './NavProgressBar';

export type MobileTabbarItem = {
  href: string;
  mobileLabel: string;
  icon: ReactNode;
};

interface MobileTabbarProps {
  items: MobileTabbarItem[];
  isActive: (href: string) => boolean;
}

// Renderiza a barra de navegacao inferior via React Portal direto no
// document.body, fora da arvore do AppShell.
//
// Motivo ORIGINAL (Q.mobile.tabbar fix), hoje historico: durante a navegacao o
// `.page-transition-content` do antigo `<PageTransition>` recebia
// `will-change: transform, opacity` por 300ms, e pela spec do CSS qualquer
// ancestral com will-change:transform vira o containing block dos descendentes
// `position: fixed`. A tabbar dentro do AppShell ficava fixed em relacao a
// esse wrapper (menor que o viewport), nao ao viewport — em PWA standalone
// iOS/Android isso aparecia como "tabbar levantada", acima da edge inferior,
// sem cobrir a area do home indicator.
//
// A F2 do ciclo SN (SN-D5') apagou o PageTransition: a transicao virou
// animacao de OPACIDADE na propria `.app-shell-page-content`, sem transform e
// sem will-change — a causa original nao existe mais.
//
// O portal FICA assim mesmo, e de proposito: (a) a tabbar e chrome do shell,
// nao conteudo da pagina, e o body e o unico ancestral que garante `fixed`
// contra o viewport independente do que qualquer pagina faca com transform;
// (b) trazer ela de volta pra arvore reabriria o bug em toda pagina que use
// transform num ancestral. Ver skill `modals` §"Portal".
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
              className={`mobile-tabbar-link${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="mobile-tabbar-pill">
                <span className="mobile-tabbar-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="mobile-tabbar-label">{item.mobileLabel}</span>
              </span>
              {/* SN-D11: publica o `pending` deste link pra barra do topo. So
                  funciona dentro da arvore do <Link>, por isso mora aqui. */}
              <LinkPendingProbe />
            </Link>
          );
        })}
      </div>
    </nav>
  );

  return createPortal(tabbar, document.body);
}
