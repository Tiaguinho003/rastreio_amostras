'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { FinanceiroCard } from '../../components/financeiro/FinanceiroCard';
import { listFinanceiro } from '../../lib/api-client';
import { FINANCEIRO_ROLES, isAdmin } from '../../lib/roles';
import { useRequireAuth } from '../../lib/use-auth';
import type { FinanceiroReceivable } from '../../lib/types';

// Financeiro (Fase F): corretagem a receber por fechamento (ADMIN + COMMERCIAL).
// Relatorio derivado (sem persistencia). ADMIN ve todos + quebra por corretor;
// COMMERCIAL ve so os seus e so a propria cota — o backend ja projeta por papel.

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function FinanceiroPage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: FINANCEIRO_ROLES,
  });

  const [items, setItems] = useState<FinanceiroReceivable[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const refresh = useCallback(async () => {
    if (!session) return;
    setListLoading(true);
    try {
      const res = await listFinanceiro(session);
      setItems(res.items);
    } catch {
      /* lista vazia em falha */
    } finally {
      setListLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void refresh();
  }, [session, refresh]);

  const mode: 'admin' | 'commercial' =
    session && isAdmin(session.user.role) ? 'admin' : 'commercial';

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      if (it.contractNumber.toLowerCase().includes(q)) return true;
      if (it.brokers) return it.brokers.some((b) => b.name.toLowerCase().includes(q));
      return false;
    });
  }, [items, search]);

  const totalGeral = useMemo(
    () =>
      visible.reduce(
        (sum, it) => sum + (mode === 'admin' ? it.commissionTotal : (it.myShare ?? 0)),
        0
      ),
    [visible, mode]
  );

  if (loading || !session) return null;

  const avatarInitials = (() => {
    const base = (session.user.fullName ?? session.user.username ?? '').trim();
    if (!base) return '?';
    const parts = base.split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return (first + last).toUpperCase() || '?';
  })();

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="clients-page-v2 fin-page">
        <header className="clients-v2-header">
          <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div className="clients-v2-header-center">
            <h2 className="nsv2-title">Financeiro</h2>
          </div>
          <HeaderAvatarMenu session={session} onLogout={logout} />
          <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
            <span className="nsv2-avatar-initials">{avatarInitials}</span>
          </Link>
        </header>

        <div className="fin-total" role="status">
          <span className="fin-total-label">
            {mode === 'admin' ? 'Total a receber' : 'Seu total a receber'}
          </span>
          <span className="fin-total-value">{BRL.format(totalGeral)}</span>
        </div>

        <div className="hero-search-wrap">
          <form
            className="hero-search-bar"
            role="search"
            onSubmit={(event) => event.preventDefault()}
          >
            <input
              className="hero-search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={mode === 'admin' ? 'Buscar nº ou corretor...' : 'Buscar nº...'}
              autoComplete="off"
              spellCheck={false}
            />
            {search ? (
              <button
                type="button"
                className="hero-search-clear-input"
                aria-label="Limpar busca"
                onClick={() => setSearch('')}
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            ) : (
              <span className="hero-search-submit" aria-hidden="true">
                <svg className="hero-search-icon-search" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16.2 16.2 4.1 4.1" />
                </svg>
              </span>
            )}
          </form>
        </div>

        <section className="clients-v2-sheet">
          <div className="spv2-list-meta">
            <span className="spv2-list-count">{visible.length} fechamento(s)</span>
          </div>

          <div className="spv2-list-scroll">
            {listLoading ? (
              <div className="spv2-empty">
                <p className="spv2-empty-text">Carregando...</p>
              </div>
            ) : visible.length === 0 ? (
              <div className="spv2-empty">
                <p className="spv2-empty-text">Nenhuma corretagem a receber</p>
              </div>
            ) : (
              <div className="fin-list">
                {visible.map((it) => (
                  <FinanceiroCard
                    key={it.id}
                    item={it}
                    mode={mode}
                    isExpanded={expandedIds.has(it.id)}
                    onToggle={() => toggleExpand(it.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </section>
    </AppShell>
  );
}
