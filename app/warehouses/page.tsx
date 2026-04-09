'use client';

import Link from 'next/link';
import { type FormEvent, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { ApiError, createWarehouse, listWarehouses, updateWarehouse, inactivateWarehouse, reactivateWarehouse } from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { WarehouseSummary, WarehouseStatus } from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';
import { isAdmin } from '../../lib/roles';

const WAREHOUSE_PAGE_LIMIT = 15;

type WarehouseChipFilter = 'all' | 'active' | 'inactive';

const WAREHOUSE_CHIP_DEFINITIONS: ReadonlyArray<{ id: WarehouseChipFilter; label: string; color: string | null; status: WarehouseStatus | null }> = [
  { id: 'all', label: 'Todos', color: null, status: null },
  { id: 'active', label: 'Ativo', color: '#27AE60', status: 'ACTIVE' },
  { id: 'inactive', label: 'Inativo', color: '#E74C3C', status: 'INACTIVE' }
];

// brand-green / brand-green-soft / brand-green-deep (paleta Safras)
const AVATAR_COLORS = ['#1f5d43', '#2f6b4a', '#173c30', '#0D47A1', '#1565C0', '#4E342E', '#5D4037', '#6D4C41', '#AD1457', '#C62828', '#6A1B9A', '#4527A0', '#00695C', '#00838F', '#E65100'];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
}

function getWarehouseInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function warehouseStatusLabel(status: WarehouseStatus) {
  return status === 'ACTIVE' ? 'Ativo' : 'Inativo';
}

interface WarehousesListState {
  items: WarehouseSummary[];
  total: number;
  totalPages: number;
  currentPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  detail: WarehouseSummary | null;
  detailOpen: boolean;
}

type WarehousesListAction =
  | { type: 'fetch' }
  | { type: 'success'; items: WarehouseSummary[]; total: number; totalPages: number; hasPrev: boolean; hasNext: boolean }
  | { type: 'error'; message: string }
  | { type: 'setPage'; page: number }
  | { type: 'openDetail'; warehouse: WarehouseSummary }
  | { type: 'closeDetail' }
  | { type: 'updateDetail'; warehouse: WarehouseSummary };

const WAREHOUSES_INITIAL: WarehousesListState = {
  items: [],
  total: 0,
  totalPages: 1,
  currentPage: 1,
  hasPrev: false,
  hasNext: false,
  loading: true,
  error: null,
  selectedId: null,
  detail: null,
  detailOpen: false
};

function warehousesListReducer(state: WarehousesListState, action: WarehousesListAction): WarehousesListState {
  switch (action.type) {
    case 'fetch':
      return { ...state, loading: true, error: null };
    case 'success':
      return { ...state, items: action.items, total: action.total, totalPages: action.totalPages, hasPrev: action.hasPrev, hasNext: action.hasNext, loading: false, error: null };
    case 'error':
      return { ...state, loading: false, error: action.message };
    case 'setPage':
      return { ...state, currentPage: action.page };
    case 'openDetail':
      return { ...state, detailOpen: true, detail: action.warehouse, selectedId: action.warehouse.id };
    case 'closeDetail':
      return { ...state, detailOpen: false, detail: null, selectedId: null };
    case 'updateDetail':
      return { ...state, detail: action.warehouse, items: state.items.map((w) => w.id === action.warehouse.id ? action.warehouse : w) };
    default:
      return state;
  }
}

export default function WarehousesPageWrapper() {
  return (
    <Suspense>
      <WarehousesPage />
    </Suspense>
  );
}

function WarehousesPage() {
  const { session, loading, logout } = useRequireAuth();

  const [state, dispatch] = useReducer(warehousesListReducer, WAREHOUSES_INITIAL);
  const detailTrapRef = useFocusTrap(state.detailOpen);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [activeChip, setActiveChip] = useState<WarehouseChipFilter>('all');
  const [sortAZ, setSortAZ] = useState(true);
  const searchDebounceRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createAddress, setCreateAddress] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createTrapRef = useFocusTrap(createOpen);

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [statusAction, setStatusAction] = useState<'inactivate' | 'reactivate' | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const refreshList = useCallback(async (search: string, page: number) => {
    if (!session) return;
    dispatch({ type: 'fetch' });
    try {
      const chipDef = WAREHOUSE_CHIP_DEFINITIONS.find((c) => c.id === activeChip);
      const result = await listWarehouses(session, { search: search || undefined, page, limit: WAREHOUSE_PAGE_LIMIT, status: chipDef?.status ?? undefined });
      dispatch({ type: 'success', items: result.items, total: result.page.total, totalPages: result.page.totalPages, hasPrev: result.page.hasPrev, hasNext: result.page.hasNext });
    } catch (cause) {
      dispatch({ type: 'error', message: cause instanceof ApiError ? cause.message : 'Falha ao carregar armazens' });
    }
  }, [session, activeChip]);

  useEffect(() => {
    if (!session || loading) return;

    if (!isAdmin(session.user.role)) return;

    refreshList(appliedSearch, state.currentPage);
  }, [session, loading, appliedSearch, state.currentPage, refreshList]);

  useEffect(() => {
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = window.setTimeout(() => {
      setAppliedSearch(searchInput.trim());
      dispatch({ type: 'setPage', page: 1 });
    }, 400);
    return () => {
      if (searchDebounceRef.current !== null) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchInput]);

  useEffect(() => {
    dispatch({ type: 'setPage', page: 1 });
  }, [activeChip]);

  const displayWarehouses = useMemo(() => {
    const sorted = [...state.items].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, 'pt-BR');
      return sortAZ ? cmp : -cmp;
    });
    return sorted;
  }, [state.items, sortAZ]);

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setAppliedSearch(searchInput.trim());
    dispatch({ type: 'setPage', page: 1 });
  }

  function openDetail(warehouse: WarehouseSummary) {
    setEditMode(false);
    setEditError(null);
    setStatusAction(null);
    setStatusError(null);
    dispatch({ type: 'openDetail', warehouse });
  }

  function closeDetail() {
    dispatch({ type: 'closeDetail' });
    setEditMode(false);
    setStatusAction(null);
  }

  function startEdit() {
    if (!state.detail) return;
    setEditName(state.detail.name);
    setEditAddress(state.detail.address ?? '');
    setEditPhone(state.detail.phone ?? '');
    setEditError(null);
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
    setEditError(null);
  }

  async function handleSaveEdit() {
    if (!session || !state.detail) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError('Nome e obrigatorio');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const result = await updateWarehouse(session, state.detail.id, {
        name: trimmedName,
        address: editAddress.trim() || null,
        phone: editPhone.trim() || null,
        reasonText: 'Edicao via painel admin'
      });
      dispatch({ type: 'updateDetail', warehouse: result.warehouse });
      setEditMode(false);
    } catch (cause) {
      setEditError(cause instanceof ApiError ? cause.message : 'Falha ao salvar');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleCreateWarehouse() {
    if (!session) return;
    const trimmedName = createName.trim();
    if (!trimmedName) {
      setCreateError('Nome e obrigatorio');
      return;
    }
    setCreateSaving(true);
    setCreateError(null);
    try {
      const result = await createWarehouse(session, {
        name: trimmedName,
        address: createAddress.trim() || null,
        phone: createPhone.trim() || null
      });
      setCreateOpen(false);
      setCreateName('');
      setCreateAddress('');
      setCreatePhone('');
      dispatch({ type: 'setPage', page: 1 });
      await refreshList('', 1);
      openDetail(result.warehouse);
    } catch (cause) {
      setCreateError(cause instanceof ApiError ? cause.message : 'Falha ao criar armazem');
    } finally {
      setCreateSaving(false);
    }
  }

  async function handleStatusChange() {
    if (!session || !state.detail || !statusAction) return;
    const reason = statusReason.trim();
    if (!reason) {
      setStatusError('Informe o motivo');
      return;
    }
    setStatusSaving(true);
    setStatusError(null);
    try {
      const fn = statusAction === 'inactivate' ? inactivateWarehouse : reactivateWarehouse;
      const result = await fn(session, state.detail.id, { reasonText: reason });
      dispatch({ type: 'updateDetail', warehouse: result.warehouse });
      setStatusAction(null);
      setStatusReason('');
      await refreshList(appliedSearch, state.currentPage);
    } catch (cause) {
      setStatusError(cause instanceof ApiError ? cause.message : 'Falha ao alterar status');
    } finally {
      setStatusSaving(false);
    }
  }

  if (loading || !session) {
    return null;
  }

  if (!isAdmin(session.user.role)) {
    return (
      <AppShell session={session} onLogout={logout}>
        <section className="clients-page-v2">
          <header className="clients-v2-header">
            <Link href="/dashboard" className="nsv2-back" aria-label="Voltar"><svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg></Link>
            <div className="clients-v2-header-center"><h2 className="nsv2-title">Armazens</h2></div>
          </header>
          <section className="clients-v2-sheet">
            <div className="spv2-list-scroll">
              <div className="spv2-empty"><p className="spv2-empty-text">Acesso restrito a administradores</p></div>
            </div>
          </section>
        </section>
      </AppShell>
    );
  }

  const userFullName = session.user.fullName ?? session.user.username;
  const userAvatarInitials = userFullName.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  return (
    <AppShell session={session} onLogout={logout}>
      <section className="clients-page-v2">
        <header className="clients-v2-header">
          <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </Link>
          <div className="clients-v2-header-center">
            <h2 className="nsv2-title">Armazens</h2>
          </div>
          <button type="button" className="nsv2-avatar" aria-label="Abrir menu de perfil" onClick={() => window.dispatchEvent(new CustomEvent('open-profile-sheet'))}>
            <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
          </button>
        </header>

        <div className="hero-search-wrap">
          <form className="hero-search-bar" role="search" onSubmit={handleSearchSubmit}>
            <svg className="hero-search-icon" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m16.2 16.2 4.1 4.1" />
            </svg>
            <input
              className="hero-search-input"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar por nome..."
              autoComplete="off"
              spellCheck={false}
            />
          </form>
        </div>

        <section className="clients-v2-sheet">
          <div className="spv2-chips">
            {WAREHOUSE_CHIP_DEFINITIONS.map((chip) => {
              const isActive = activeChip === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  className={`spv2-chip${isActive ? ' is-active' : ''}`}
                  style={isActive && chip.color ? { background: `${chip.color}14`, borderColor: chip.color } : undefined}
                  onClick={() => setActiveChip(chip.id)}
                >
                  {chip.color ? <span className="spv2-chip-dot" style={{ background: chip.color }} /> : null}
                  <span className="spv2-chip-label" style={isActive && chip.color ? { color: chip.color } : undefined}>{chip.label}</span>
                </button>
              );
            })}
          </div>

          <div className="spv2-list-meta">
            <span className="spv2-list-count">{displayWarehouses.length} armazens</span>
            <button type="button" className="spv2-sort-btn" onClick={() => setSortAZ((v) => !v)}>
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h6" /></svg>
              <span>{sortAZ ? 'A-Z' : 'Z-A'}</span>
            </button>
          </div>

          {state.loading ? (
            <div className="spv2-list-scroll"><div className="spv2-empty"><p className="spv2-empty-text">Carregando...</p></div></div>
          ) : displayWarehouses.length === 0 ? (
            <div className="spv2-list-scroll">
              <div className="spv2-empty">
                <svg className="spv2-empty-icon" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 36 }}>
                  <path d="M3 21V8l9-5 9 5v13" fill="none" stroke="#ddd" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M9 21v-6h6v6" fill="none" stroke="#ddd" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="spv2-empty-text">Nenhum armazem encontrado</p>
                <p className="spv2-empty-sub">Tente outro termo de busca</p>
              </div>
            </div>
          ) : (
            <div ref={scrollRef} className="spv2-list-scroll" tabIndex={-1}>
              {displayWarehouses.map((warehouse, i) => {
                const avatarColor = getAvatarColor(warehouse.name);
                const initials = getWarehouseInitials(warehouse.name);
                return (
                  <button
                    key={warehouse.id}
                    type="button"
                    className="cv2-card"
                    style={{ animationDelay: `${i * 0.04}s` }}
                    onClick={() => openDetail(warehouse)}
                  >
                    <span className="cv2-card-avatar" style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}cc)`, boxShadow: `0 2px 8px ${avatarColor}4D` }}>
                      <span>{initials}</span>
                    </span>
                    <div className="cv2-card-content">
                      <div className="cv2-card-top">
                        <span className="cv2-card-name">{warehouse.name}</span>
                        <span className={`cv2-card-type ${warehouse.status === 'ACTIVE' ? 'is-pf' : 'is-pj'}`}>
                          {warehouseStatusLabel(warehouse.status)}
                        </span>
                      </div>
                      <div className="cv2-card-bottom">
                        <span className="cv2-card-role is-none">{warehouse.address ?? 'Sem endereco'}</span>
                      </div>
                    </div>
                    <svg className="spv2-card-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                  </button>
                );
              })}
            </div>
          )}

          <footer className="spv2-footer">
            <button type="button" className="spv2-page-btn" disabled={!state.hasPrev || state.loading} onClick={() => dispatch({ type: 'setPage', page: state.currentPage - 1 })}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6" /></svg>
            </button>
            <span className="spv2-page-info"><strong>{state.currentPage}</strong> / {state.totalPages}</span>
            <button type="button" className="spv2-page-btn" disabled={!state.hasNext || state.loading} onClick={() => dispatch({ type: 'setPage', page: state.currentPage + 1 })}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6" /></svg>
            </button>
          </footer>
        </section>
      </section>

      {/* FAB */}
      <button type="button" className="cv2-fab" aria-label="Cadastrar novo armazem" onClick={() => { setCreateOpen(true); setCreateName(''); setCreateAddress(''); setCreatePhone(''); setCreateError(null); }}>
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
      </button>

      {/* Create modal */}
      {createOpen ? (
        <div className="client-modal-backdrop" onClick={() => setCreateOpen(false)}>
          <section ref={createTrapRef} className="cdm-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="cdm-header">
              <div className="cdm-header-copy">
                <h3 className="cdm-header-name">Novo armazem</h3>
              </div>
              <button type="button" className="cdm-close" onClick={() => setCreateOpen(false)} aria-label="Fechar">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>
            <div className="cdm-info-grid" style={{ gap: '0.7rem' }}>
              <label className="sdv-edit-field">
                <span className="sdv-edit-label">Nome *</span>
                <input className="sdv-edit-input" value={createName} onChange={(e) => { setCreateName(e.target.value); setCreateError(null); }} disabled={createSaving} placeholder="Ex: Armazem Central" autoFocus />
              </label>
              <label className="sdv-edit-field">
                <span className="sdv-edit-label">Endereco</span>
                <input className="sdv-edit-input" value={createAddress} onChange={(e) => setCreateAddress(e.target.value)} disabled={createSaving} placeholder="Opcional" />
              </label>
              <label className="sdv-edit-field">
                <span className="sdv-edit-label">Telefone</span>
                <input className="sdv-edit-input" value={createPhone} onChange={(e) => setCreatePhone(e.target.value)} disabled={createSaving} placeholder="Opcional" />
              </label>
            </div>
            {createError ? <p className="error" style={{ margin: '0.6rem 0 0', fontSize: '0.78rem' }}>{createError}</p> : null}
            <button type="button" className="cdm-manage-link" style={{ marginTop: '1rem' }} disabled={createSaving} onClick={handleCreateWarehouse}>
              {createSaving ? 'Salvando...' : 'Criar armazem'}
            </button>
          </section>
        </div>
      ) : null}

      {/* Detail modal */}
      {state.detailOpen && state.detail ? (
        <div className="client-modal-backdrop" onClick={closeDetail}>
          <section ref={detailTrapRef} className="cdm-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="cdm-header">
              {(() => {
                const detailColor = getAvatarColor(state.detail.name);
                const detailInitials = getWarehouseInitials(state.detail.name);
                return (
                  <span className="cdm-header-avatar" style={{ background: `linear-gradient(135deg, ${detailColor}, ${detailColor}cc)` }}>
                    <span>{detailInitials}</span>
                  </span>
                );
              })()}
              <div className="cdm-header-copy">
                <h3 className="cdm-header-name">{state.detail.name}</h3>
                <div className="cdm-header-meta">
                  <span className={`cdm-header-status ${state.detail.status === 'ACTIVE' ? 'is-active' : 'is-inactive'}`}>
                    {warehouseStatusLabel(state.detail.status)}
                  </span>
                </div>
              </div>
              <button type="button" className="cdm-close" onClick={closeDetail} aria-label="Fechar">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>

            {editMode ? (
              <div className="cdm-info-grid" style={{ gap: '0.7rem' }}>
                <label className="sdv-edit-field">
                  <span className="sdv-edit-label">Nome *</span>
                  <input className="sdv-edit-input" value={editName} onChange={(e) => { setEditName(e.target.value); setEditError(null); }} disabled={editSaving} autoFocus />
                </label>
                <label className="sdv-edit-field">
                  <span className="sdv-edit-label">Endereco</span>
                  <input className="sdv-edit-input" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} disabled={editSaving} />
                </label>
                <label className="sdv-edit-field">
                  <span className="sdv-edit-label">Telefone</span>
                  <input className="sdv-edit-input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} disabled={editSaving} />
                </label>
                {editError ? <p className="error" style={{ margin: '0.2rem 0 0', fontSize: '0.78rem' }}>{editError}</p> : null}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
                  <button type="button" className="cdm-manage-link" style={{ flex: 1 }} disabled={editSaving} onClick={handleSaveEdit}>
                    {editSaving ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button type="button" className="cdm-manage-link" style={{ flex: 1, background: '#e0e0e0', color: '#555' }} disabled={editSaving} onClick={cancelEdit}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : statusAction ? (
              <div className="cdm-info-grid" style={{ gap: '0.7rem' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#555' }}>
                  {statusAction === 'inactivate'
                    ? `Tem certeza que deseja inativar "${state.detail.name}"?`
                    : `Reativar "${state.detail.name}"?`}
                </p>
                <label className="sdv-edit-field">
                  <span className="sdv-edit-label">Motivo *</span>
                  <input className="sdv-edit-input" value={statusReason} onChange={(e) => { setStatusReason(e.target.value); setStatusError(null); }} disabled={statusSaving} placeholder="Informe o motivo" autoFocus />
                </label>
                {statusError ? <p className="error" style={{ margin: '0.2rem 0 0', fontSize: '0.78rem' }}>{statusError}</p> : null}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
                  <button type="button" className="cdm-manage-link" style={{ flex: 1, background: statusAction === 'inactivate' ? 'linear-gradient(135deg, #C62828, #E53935)' : undefined }} disabled={statusSaving} onClick={handleStatusChange}>
                    {statusSaving ? 'Salvando...' : statusAction === 'inactivate' ? 'Inativar' : 'Reativar'}
                  </button>
                  <button type="button" className="cdm-manage-link" style={{ flex: 1, background: '#e0e0e0', color: '#555' }} disabled={statusSaving} onClick={() => { setStatusAction(null); setStatusReason(''); setStatusError(null); }}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="cdm-info-grid">
                  <div className="cdm-info-row">
                    <div className="cdm-info-item">
                      <span className="cdm-info-label">Endereco</span>
                      <span className="cdm-info-value">{state.detail.address ?? 'Nao informado'}</span>
                    </div>
                    <div className="cdm-info-item">
                      <span className="cdm-info-label">Telefone</span>
                      <span className="cdm-info-value">{state.detail.phone ?? 'Nao informado'}</span>
                    </div>
                  </div>
                  {state.detail.sampleCount !== null && state.detail.sampleCount !== undefined ? (
                    <div className="cdm-info-row">
                      <div className="cdm-info-item">
                        <span className="cdm-info-label">Amostras vinculadas</span>
                        <span className="cdm-info-value">{state.detail.sampleCount}</span>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
                  <button type="button" className="cdm-manage-link" style={{ flex: 1 }} onClick={startEdit}>
                    Editar
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true" style={{ width: 16, height: 16 }}>
                      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                  </button>
                  {state.detail.status === 'ACTIVE' ? (
                    <button type="button" className="cdm-manage-link" style={{ flex: 1, background: 'linear-gradient(135deg, #C62828, #E53935)' }} onClick={() => { setStatusAction('inactivate'); setStatusReason(''); setStatusError(null); }}>
                      Inativar
                    </button>
                  ) : (
                    <button type="button" className="cdm-manage-link" style={{ flex: 1, background: 'linear-gradient(135deg, #1f5d43, #2f6b4a)' /* brand-green / brand-green-soft */ }} onClick={() => { setStatusAction('reactivate'); setStatusReason(''); setStatusError(null); }}>
                      Reativar
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
