'use client';

import { useEffect, useMemo, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import {
  ApiError,
  createUser,
  getUser,
  inactivateUser,
  listUserAuditEvents,
  listUsers,
  reactivateUser,
  resetUserPassword,
  unlockUser,
  updateUser
} from '../../lib/api-client';
import { getRoleLabel } from '../../lib/roles';
import { useRequireAuth } from '../../lib/use-auth';
import type { UserAuditEventResponse, UserRole, UserStatus, UserSummary } from '../../lib/types';

const ROLE_OPTIONS: UserRole[] = ['ADMIN', 'CLASSIFIER', 'REGISTRATION', 'COMMERCIAL'];
const STATUS_OPTIONS: Array<UserStatus | ''> = ['', 'ACTIVE', 'INACTIVE'];

function blankUserForm() {
  return {
    fullName: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    role: 'CLASSIFIER' as UserRole
  };
}

export default function UsersPage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: ['ADMIN']
  });
  const [items, setItems] = useState<UserSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditItems, setAuditItems] = useState<UserAuditEventResponse[]>([]);
  const [mode, setMode] = useState<'create' | 'edit'>('edit');
  const [form, setForm] = useState(blankUserForm());
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canSave = useMemo(() => form.fullName.trim() && form.username.trim() && form.email.trim(), [form]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let active = true;
    setLoadingList(true);
    setError(null);

    listUsers(session, {
      search: appliedSearch || undefined,
      role: roleFilter || undefined,
      status: statusFilter || undefined,
      page,
      limit: 10
    })
      .then((response) => {
        if (!active) {
          return;
        }

        setItems(response.items);
        setTotalPages(response.page.totalPages);
        if (mode !== 'create' && !selectedUserId && response.items[0]) {
          setSelectedUserId(response.items[0].id);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar usuarios');
        }
      })
      .finally(() => {
        if (active) {
          setLoadingList(false);
        }
      });

    return () => {
      active = false;
    };
  }, [appliedSearch, mode, page, roleFilter, selectedUserId, session, statusFilter]);

  useEffect(() => {
    if (!session || !selectedUserId || mode === 'create') {
      return;
    }

    let active = true;
    setLoadingDetail(true);
    setError(null);

    getUser(session, selectedUserId)
      .then((response) => {
        if (!active) {
          return;
        }

        setSelectedUser(response.user);
        setForm({
          fullName: response.user.fullName,
          username: response.user.username,
          email: response.user.email,
          phone: response.user.phone ?? '',
          password: '',
          role: response.user.role
        });
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar usuario');
        }
      })
      .finally(() => {
        if (active) {
          setLoadingDetail(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mode, selectedUserId, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let active = true;
    listUserAuditEvents(session, {
      page: auditPage,
      limit: 10
    })
      .then((response) => {
        if (!active) {
          return;
        }

        setAuditItems(response.items);
        setAuditTotalPages(response.page.totalPages);
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar auditoria');
        }
      });

    return () => {
      active = false;
    };
  }, [auditPage, session]);

  if (loading || !session) {
    return null;
  }

  const authSession = session;

  function openCreateMode() {
    setMode('create');
    setSelectedUserId(null);
    setSelectedUser(null);
    setForm(blankUserForm());
    setMessage(null);
    setError(null);
  }

  function openEditMode(userId: string) {
    setMode('edit');
    setSelectedUserId(userId);
    setMessage(null);
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === 'create') {
        if (!form.password.trim()) {
          throw new Error('Senha inicial obrigatoria');
        }

        const response = await createUser(authSession, {
          fullName: form.fullName,
          username: form.username,
          email: form.email,
          phone: form.phone || null,
          password: form.password,
          role: form.role
        });

        setMessage(`Usuario criado. Senha enviada por email e exibida: ${response.generatedPassword}`);
        setMode('edit');
        setSelectedUserId(response.user.id);
      } else if (selectedUserId) {
        const response = await updateUser(authSession, selectedUserId, {
          fullName: form.fullName,
          username: form.username,
          email: form.email,
          phone: form.phone || null,
          role: form.role
        });
        setSelectedUser(response.user);
        setMessage(response.sessionRevoked ? 'Usuario atualizado e sessoes encerradas.' : 'Usuario atualizado.');
      }

      const refreshed = await listUsers(authSession, {
        search: appliedSearch || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        page,
        limit: 10
      });
      setItems(refreshed.items);
      setTotalPages(refreshed.page.totalPages);
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Falha ao salvar usuario');
    } finally {
      setSaving(false);
    }
  }

  async function handleInactivate() {
    if (!selectedUserId) {
      return;
    }

    const reasonText = window.prompt('Informe o motivo da inativacao:');
    if (!reasonText) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await inactivateUser(authSession, selectedUserId, reasonText);
      setSelectedUser(response.user);
      setMessage('Usuario inativado.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao inativar usuario');
    } finally {
      setSaving(false);
    }
  }

  async function handleReactivate() {
    if (!selectedUserId) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await reactivateUser(authSession, selectedUserId);
      setSelectedUser(response.user);
      setMessage('Usuario reativado.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao reativar usuario');
    } finally {
      setSaving(false);
    }
  }

  async function handleUnlock() {
    if (!selectedUserId) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await unlockUser(authSession, selectedUserId);
      setSelectedUser(response.user);
      setMessage('Usuario desbloqueado.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao desbloquear usuario');
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordReset() {
    if (!selectedUserId) {
      return;
    }

    const password = window.prompt('Informe a nova senha do usuario:');
    if (!password) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await resetUserPassword(authSession, selectedUserId, password);
      setMessage(`Senha redefinida. Senha exibida ao ADM: ${response.generatedPassword}`);
      setSelectedUser(response.user);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao redefinir senha');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell session={authSession} onLogout={logout} onSessionChange={setSession}>
      <section className="stack" style={{ width: 'min(1180px, calc(100vw - 2rem))', margin: '1.25rem auto 2rem' }}>
        <section className="panel stack">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap'
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>Usuarios</h2>
              <p style={{ margin: '0.45rem 0 0', color: 'var(--muted)' }}>
                Gestao administrativa de contas, bloqueios e perfis.
              </p>
            </div>

            <button type="button" onClick={openCreateMode}>
              Novo usuario
            </button>
          </div>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(300px, 360px) minmax(0, 1fr)' }}>
            <section className="stack">
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  setAppliedSearch(search);
                  setPage(1);
                }}
              >
                <label>
                  Buscar
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, usuario ou email" />
                </label>

                <label>
                  Perfil
                  <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as UserRole | '')}>
                    <option value="">Todos</option>
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {getRoleLabel(role)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Status
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as UserStatus | '')}>
                    <option value="">Todos</option>
                    {STATUS_OPTIONS.filter(Boolean).map((status) => (
                      <option key={status} value={status}>
                        {status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                      </option>
                    ))}
                  </select>
                </label>

                <button type="submit">Aplicar filtros</button>
              </form>

              <section className="stack">
                {loadingList ? <p style={{ margin: 0 }}>Carregando usuarios...</p> : null}
                {items.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => openEditMode(user.id)}
                    style={{
                      textAlign: 'left',
                      padding: '1rem',
                      borderRadius: '16px',
                      border: user.id === selectedUserId ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: 'var(--panel)',
                      cursor: 'pointer'
                    }}
                  >
                    <strong style={{ display: 'block' }}>{user.fullName}</strong>
                    <span style={{ display: 'block', color: 'var(--muted)' }}>
                      {user.username} | {user.email}
                    </span>
                    <span style={{ display: 'block', color: 'var(--muted)' }}>
                      {getRoleLabel(user.role)} | {user.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                      {user.isLocked ? ' | Bloqueado' : ''}
                    </span>
                  </button>
                ))}

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                    Anterior
                  </button>
                  <span style={{ color: 'var(--muted)' }}>
                    Pagina {page} de {totalPages}
                  </span>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Proxima
                  </button>
                </div>
              </section>
            </section>

            <section className="panel stack">
              <div>
                <h3 style={{ margin: 0 }}>{mode === 'create' ? 'Novo usuario' : 'Editar usuario'}</h3>
                <p style={{ margin: '0.45rem 0 0', color: 'var(--muted)' }}>
                  {mode === 'create'
                    ? 'Crie a conta inicial do usuario e envie a senha por email.'
                    : selectedUser
                      ? `Conta criada em ${new Date(selectedUser.createdAt).toLocaleString('pt-BR')}`
                      : 'Selecione um usuario para editar.'}
                </p>
              </div>

              <form className="stack" onSubmit={handleSubmit}>
                <label>
                  Nome completo
                  <input
                    value={form.fullName}
                    onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                  />
                </label>

                <label>
                  Usuario
                  <input
                    value={form.username}
                    onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  />
                </label>

                <label>
                  Email
                  <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
                </label>

                <label>
                  Telefone
                  <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
                </label>

                <label>
                  Perfil
                  <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as UserRole }))}>
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {getRoleLabel(role)}
                      </option>
                    ))}
                  </select>
                </label>

                {mode === 'create' ? (
                  <label>
                    Senha inicial
                    <input
                      type="password"
                      value={form.password}
                      onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    />
                  </label>
                ) : null}

                {selectedUser ? (
                  <p style={{ margin: 0, color: 'var(--muted)' }}>
                    Status: {selectedUser.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                    {selectedUser.isLocked ? ' | Bloqueado temporariamente' : ''}
                    {selectedUser.pendingEmailChange ? ` | Novo email pendente: ${selectedUser.pendingEmailChange.newEmail}` : ''}
                  </p>
                ) : null}

                {error ? <p className="error">{error}</p> : null}
                {message ? <p style={{ margin: 0, color: 'var(--muted)' }}>{message}</p> : null}

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button type="submit" disabled={!canSave || saving || loadingDetail}>
                    {saving ? 'Salvando...' : mode === 'create' ? 'Criar usuario' : 'Salvar alteracoes'}
                  </button>
                  {mode === 'edit' && selectedUser ? (
                    <>
                      {selectedUser.status === 'ACTIVE' ? (
                        <button type="button" className="secondary-button" onClick={handleInactivate} disabled={saving}>
                          Inativar
                        </button>
                      ) : (
                        <button type="button" className="secondary-button" onClick={handleReactivate} disabled={saving}>
                          Reativar
                        </button>
                      )}
                      <button type="button" className="secondary-button" onClick={handleUnlock} disabled={saving}>
                        Desbloquear
                      </button>
                      <button type="button" className="secondary-button" onClick={handlePasswordReset} disabled={saving}>
                        Redefinir senha
                      </button>
                    </>
                  ) : null}
                </div>
              </form>
            </section>
          </div>
        </section>

        <section className="panel stack">
          <div>
            <h3 style={{ margin: 0 }}>Auditoria</h3>
            <p style={{ margin: '0.45rem 0 0', color: 'var(--muted)' }}>
              Eventos mais recentes de criacao, edicao, acessos e alteracoes administrativas.
            </p>
          </div>

          <section className="stack">
            {auditItems.map((item) => (
              <article
                key={item.eventId}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '1rem',
                  background: 'var(--panel)'
                }}
              >
                <strong style={{ display: 'block' }}>{item.eventType}</strong>
                <span style={{ display: 'block', color: 'var(--muted)' }}>
                  {new Date(item.createdAt).toLocaleString('pt-BR')}
                </span>
                <span style={{ display: 'block', color: 'var(--muted)' }}>
                  Ator: {item.actorUser ? `${item.actorUser.fullName} (${item.actorUser.username})` : 'Sistema'}
                </span>
                <span style={{ display: 'block', color: 'var(--muted)' }}>
                  Alvo: {item.targetUser ? `${item.targetUser.fullName} (${item.targetUser.username})` : 'Nao aplicavel'}
                </span>
                {item.reasonText ? <p style={{ margin: '0.5rem 0 0' }}>Motivo: {item.reasonText}</p> : null}
              </article>
            ))}

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                type="button"
                className="secondary-button"
                disabled={auditPage <= 1}
                onClick={() => setAuditPage((current) => current - 1)}
              >
                Anterior
              </button>
              <span style={{ color: 'var(--muted)' }}>
                Pagina {auditPage} de {auditTotalPages}
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={auditPage >= auditTotalPages}
                onClick={() => setAuditPage((current) => current + 1)}
              >
                Proxima
              </button>
            </div>
          </section>
        </section>
      </section>
    </AppShell>
  );
}
