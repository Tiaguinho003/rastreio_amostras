'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { UserAvatar } from '../../components/UserAvatar';
import {
  ApiError,
  changeCurrentUserPassword,
  confirmCurrentUserEmailChange,
  getCurrentUser,
  requestCurrentUserEmailChange,
  resendCurrentUserEmailChangeCode,
  updateCurrentUserProfile,
} from '../../lib/api-client';
import { maskPhoneInput } from '../../lib/client-field-formatters';
import {
  changePasswordSchema,
  emailChangeConfirmSchema,
  emailChangeRequestSchema,
  updateProfileSchema,
} from '../../lib/form-schemas';
import { usePushNotifications } from '../../lib/push/use-push-notifications';
import { getRoleLabel, isProspector } from '../../lib/roles';
import { useToast } from '../../lib/toast/ToastProvider';
import { mergeUserIntoSession, useRequireAuth } from '../../lib/use-auth';

function formatExpiresAt(expiresAt: string): string | null {
  const expires = new Date(expiresAt);
  const now = Date.now();
  const diffMs = expires.getTime() - now;

  if (diffMs <= 0) {
    return null;
  }

  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes <= 1) {
    return 'menos de 1 minuto';
  }

  return `${minutes} minutos`;
}

function extractErrorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof DOMException && cause.name === 'AbortError') {
    return 'Operacao cancelada.';
  }

  if (cause instanceof ApiError) {
    return cause.message;
  }

  return fallback;
}

// Rótulo curto do estado das notificações (subtítulo da linha). O fallback
// cobre needs-install/unsupported sem instrução específica de iPhone.
const PUSH_STATUS_LABELS: Record<string, string> = {
  active: 'Ativadas neste aparelho',
  inactive: 'Receber neste aparelho',
  loading: 'Verificando…',
  'permission-denied': 'Bloqueadas nas permissões',
  unavailable: 'Indisponível no momento',
};

export default function ProfilePage() {
  const router = useRouter();
  const { session, loading, logout, setSession } = useRequireAuth();
  const toast = useToast();
  const passwordSectionRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const profileLoadedRef = useRef(false);

  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    username: '',
    phone: '',
  });
  const [emailInput, setEmailInput] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [expandedField, setExpandedField] = useState<
    'nome' | 'usuario' | 'telefone' | 'email' | 'senha' | null
  >(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const loadProfile = useCallback(
    (targetSession: typeof session) => {
      if (!targetSession) {
        return;
      }

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      setInitialLoadError(null);

      getCurrentUser(targetSession)
        .then((response) => {
          if (controller.signal.aborted) {
            return;
          }

          setSession(mergeUserIntoSession(targetSession, response.user));
          setProfileForm({
            fullName:
              typeof response.user?.fullName === 'string'
                ? response.user.fullName
                : targetSession.user.fullName,
            username:
              typeof response.user?.username === 'string'
                ? response.user.username
                : targetSession.user.username,
            phone:
              typeof response.user?.phone === 'string' ? maskPhoneInput(response.user.phone) : '',
          });
          setEmailInput(
            typeof response.user?.email === 'string'
              ? response.user.email
              : targetSession.user.email
          );
        })
        .catch((cause) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') {
            return;
          }

          setInitialLoadError(
            cause instanceof ApiError
              ? cause.message
              : 'Falha ao carregar perfil. Os dados exibidos podem estar desatualizados.'
          );
          setProfileForm({
            fullName: targetSession.user.fullName,
            username: targetSession.user.username,
            phone: '',
          });
          setEmailInput(targetSession.user.email ?? '');
        });
    },
    [setSession]
  );

  useEffect(() => {
    if (!session || profileLoadedRef.current) {
      return;
    }

    profileLoadedRef.current = true;
    loadProfile(session);
  }, [session, loadProfile]);

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('section') === 'password'
    ) {
      passwordSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const pendingEmailChange = useMemo(() => {
    const pending = session?.user.pendingEmailChange ?? null;
    if (!pending || !pending.requestId) {
      return null;
    }

    return pending;
  }, [session]);

  const pendingExpiresLabel = useMemo(() => {
    if (!pendingEmailChange) {
      return null;
    }

    return formatExpiresAt(pendingEmailChange.expiresAt);
  }, [pendingEmailChange]);

  const push = usePushNotifications(session);

  if (loading || !session) {
    return null;
  }

  function toggleField(field: 'nome' | 'usuario' | 'telefone' | 'email' | 'senha') {
    setExpandedField((cur) => (cur === field ? null : field));
    // Limpa feedback transiente ao abrir/fechar um campo.
    setProfileError(null);
    setProfileMessage(null);
    setEmailError(null);
    setEmailMessage(null);
    setPasswordError(null);
    setPasswordMessage(null);
  }

  async function handleCopy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success({ title: `${label} copiado` });
    } catch {
      toast.error({ title: 'Não foi possível copiar' });
    }
  }

  async function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileMessage(null);
    setProfileError(null);

    const parsed = updateProfileSchema.safeParse(profileForm);
    if (!parsed.success) {
      setProfileError(parsed.error.issues[0]?.message ?? 'Dados invalidos');
      return;
    }

    setProfileLoading(true);

    try {
      const response = await updateCurrentUserProfile(session!, {
        fullName: parsed.data.fullName,
        username: parsed.data.username,
        phone: parsed.data.phone || null,
      });

      if (response.sessionRevoked) {
        setSession(null);
        router.replace('/login?reason=session-ended');
        return;
      }

      setSession(mergeUserIntoSession(session!, response.user));
      setProfileMessage('Perfil atualizado.');
    } catch (cause) {
      setProfileError(extractErrorMessage(cause, 'Falha ao atualizar perfil'));
    } finally {
      setProfileLoading(false);
    }
  }

  async function handleEmailRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailMessage(null);
    setEmailError(null);

    const parsed = emailChangeRequestSchema.safeParse({ email: emailInput });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? 'Email invalido');
      return;
    }

    if (parsed.data.email === session!.user.email) {
      setEmailError('O novo email deve ser diferente do email atual.');
      return;
    }

    setEmailLoading(true);

    try {
      const response = await requestCurrentUserEmailChange(session!, parsed.data.email);
      setSession(mergeUserIntoSession(session!, response.user));
      setEmailMessage('Codigo enviado para o novo email.');
    } catch (cause) {
      setEmailError(extractErrorMessage(cause, 'Falha ao solicitar troca de email'));
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleEmailConfirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailMessage(null);
    setEmailError(null);

    const parsed = emailChangeConfirmSchema.safeParse({ code: emailCode });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? 'Codigo invalido');
      return;
    }

    setEmailLoading(true);

    try {
      const response = await confirmCurrentUserEmailChange(session!, parsed.data.code);
      const merged = mergeUserIntoSession(session!, response.user);
      setSession(merged);
      setEmailCode('');
      setEmailInput(merged.user.email);
      setEmailMessage('Email confirmado com sucesso.');
    } catch (cause) {
      setEmailError(extractErrorMessage(cause, 'Falha ao confirmar novo email'));
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleResendEmailCode() {
    setEmailMessage(null);
    setEmailError(null);
    setEmailLoading(true);

    try {
      const response = await resendCurrentUserEmailChangeCode(session!);
      setSession(mergeUserIntoSession(session!, response.user));
      setEmailMessage('Codigo reenviado.');
    } catch (cause) {
      setEmailError(extractErrorMessage(cause, 'Falha ao reenviar codigo'));
    } finally {
      setEmailLoading(false);
    }
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);

    if (password !== confirmPassword) {
      setPasswordError('As senhas nao coincidem.');
      return;
    }

    const parsed = changePasswordSchema.safeParse({ password });
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? 'Senha invalida');
      return;
    }

    setPasswordLoading(true);

    try {
      await changeCurrentUserPassword(session!, parsed.data.password);
      setSession(null);
      router.replace('/login?reason=session-ended');
    } catch (cause) {
      setPasswordError(extractErrorMessage(cause, 'Falha ao alterar senha'));
    } finally {
      setPasswordLoading(false);
    }
  }

  const fullName = session.user.fullName ?? session.user.username;

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="sdv-page">
        {/* Header */}
        <header className="sdv-header stg-header">
          <div className="sdv-header-top">
            {/* Esquerda: back (prospector, que nao tem navbar) ou spacer
                invisivel (demais papeis), pra manter o titulo centrado com o
                menu de conta a direita. */}
            {isProspector(session.user.role) ? (
              <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao início">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </Link>
            ) : (
              <span
                className="nsv2-back"
                aria-hidden="true"
                style={{ visibility: 'hidden', pointerEvents: 'none' }}
              />
            )}
            <span className="sdv-header-title">Meu Perfil</span>
            <HeaderAvatarMenu session={session} onLogout={logout} />
          </div>
          <div className="stg-header-wrap">
            <UserAvatar size="lg" user={session.user} className="stg-profile-avatar" />
            <div className="stg-header-text-wrap">
              <p className="stg-header-user-name">{fullName}</p>
              <span className="stg-header-user-role">
                <svg
                  className="stg-header-user-role-icon"
                  viewBox="0 0 24 24"
                  focusable="false"
                  aria-hidden="true"
                >
                  <path d="M12 3 5 5.5v6c0 4.5 3 8.3 7 9.5 4-1.2 7-5 7-9.5v-6L12 3z" />
                  <path d="m9 12 2 2 4-4.5" />
                </svg>
                {getRoleLabel(session.user.role)}
              </span>
            </div>
          </div>
        </header>

        {/* Content */}
        <section className="sdv-content stg-content">
          {initialLoadError ? <p className="stg-feedback is-error">{initialLoadError}</p> : null}

          {/* Container único: Dados pessoais + Email + Senha */}
          <div className="sdv-card stg-card" style={{ '--i': 0 } as React.CSSProperties}>
            {/* Nome completo */}
            <div className={`stg-field-row${expandedField === 'nome' ? ' is-open' : ''}`}>
              <div
                className="stg-field-head"
                role="button"
                tabIndex={0}
                aria-expanded={expandedField === 'nome'}
                onClick={() => toggleField('nome')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleField('nome');
                  }
                }}
              >
                <span className="stg-field-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <span className="stg-field-main">
                  <span className="stg-field-label">Nome completo</span>
                  <span className="stg-field-value">{profileForm.fullName || '—'}</span>
                </span>
                <svg className="stg-field-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </div>
              <div className="stg-field-expand">
                <div className="stg-field-expand-inner">
                  <form className="sdv-edit-fields" onSubmit={handleProfileSubmit}>
                    <label className="sdv-edit-field">
                      <span className="sdv-edit-label">Nome completo</span>
                      <input
                        className="sdv-edit-input stg-input"
                        value={profileForm.fullName}
                        onChange={(e) =>
                          setProfileForm((c) => ({ ...c, fullName: e.target.value }))
                        }
                      />
                    </label>
                    {profileError ? <p className="stg-feedback is-error">{profileError}</p> : null}
                    {profileMessage ? (
                      <p className="stg-feedback is-success">{profileMessage}</p>
                    ) : null}
                    <button
                      type="submit"
                      className={`cdm-manage-link stg-btn-save-profile${profileLoading ? ' is-disabled' : ''}`}
                      disabled={profileLoading}
                    >
                      {profileLoading ? 'Salvando...' : 'Salvar'}
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Usuário */}
            <div className={`stg-field-row${expandedField === 'usuario' ? ' is-open' : ''}`}>
              <div
                className="stg-field-head"
                role="button"
                tabIndex={0}
                aria-expanded={expandedField === 'usuario'}
                onClick={() => toggleField('usuario')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleField('usuario');
                  }
                }}
              >
                <span className="stg-field-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
                  </svg>
                </span>
                <span className="stg-field-main">
                  <span className="stg-field-label">Usuário</span>
                  <span className="stg-field-value">@{profileForm.username}</span>
                </span>
                <svg className="stg-field-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </div>
              <div className="stg-field-expand">
                <div className="stg-field-expand-inner">
                  <div className="stg-password-warning">
                    <svg
                      className="stg-password-warning-icon"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span className="stg-password-warning-text">
                      Alterar o usuário encerra a sessão e exige novo login.
                    </span>
                  </div>
                  <form className="sdv-edit-fields" onSubmit={handleProfileSubmit}>
                    <label className="sdv-edit-field">
                      <span className="sdv-edit-label">Usuário</span>
                      <input
                        className="sdv-edit-input stg-input"
                        value={profileForm.username}
                        onChange={(e) =>
                          setProfileForm((c) => ({ ...c, username: e.target.value }))
                        }
                        autoComplete="username"
                      />
                    </label>
                    {profileError ? <p className="stg-feedback is-error">{profileError}</p> : null}
                    {profileMessage ? (
                      <p className="stg-feedback is-success">{profileMessage}</p>
                    ) : null}
                    <button
                      type="submit"
                      className={`cdm-manage-link stg-btn-save-profile${profileLoading ? ' is-disabled' : ''}`}
                      disabled={profileLoading}
                    >
                      {profileLoading ? 'Salvando...' : 'Salvar'}
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Telefone */}
            <div className={`stg-field-row${expandedField === 'telefone' ? ' is-open' : ''}`}>
              <div
                className="stg-field-head"
                role="button"
                tabIndex={0}
                aria-expanded={expandedField === 'telefone'}
                onClick={() => toggleField('telefone')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleField('telefone');
                  }
                }}
              >
                <span className="stg-field-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </span>
                <span className="stg-field-main">
                  <span className="stg-field-label">Telefone</span>
                  <span className="stg-field-value">{profileForm.phone || 'Não informado'}</span>
                </span>
                {profileForm.phone ? (
                  <button
                    type="button"
                    className="stg-field-copy"
                    aria-label="Copiar telefone"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleCopy(profileForm.phone, 'Telefone');
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                ) : null}
                <svg className="stg-field-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </div>
              <div className="stg-field-expand">
                <div className="stg-field-expand-inner">
                  <form className="sdv-edit-fields" onSubmit={handleProfileSubmit}>
                    <label className="sdv-edit-field">
                      <span className="sdv-edit-label">Telefone</span>
                      <input
                        className="sdv-edit-input stg-input"
                        value={profileForm.phone}
                        onChange={(e) =>
                          setProfileForm((c) => ({ ...c, phone: maskPhoneInput(e.target.value) }))
                        }
                        placeholder="(00) 00000-0000"
                        inputMode="tel"
                      />
                    </label>
                    {profileError ? <p className="stg-feedback is-error">{profileError}</p> : null}
                    {profileMessage ? (
                      <p className="stg-feedback is-success">{profileMessage}</p>
                    ) : null}
                    <button
                      type="submit"
                      className={`cdm-manage-link stg-btn-save-profile${profileLoading ? ' is-disabled' : ''}`}
                      disabled={profileLoading}
                    >
                      {profileLoading ? 'Salvando...' : 'Salvar'}
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* E-mail */}
            <div className={`stg-field-row${expandedField === 'email' ? ' is-open' : ''}`}>
              <div
                className="stg-field-head"
                role="button"
                tabIndex={0}
                aria-expanded={expandedField === 'email'}
                onClick={() => toggleField('email')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleField('email');
                  }
                }}
              >
                <span className="stg-field-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </span>
                <span className="stg-field-main">
                  <span className="stg-field-label">E-mail</span>
                  <span className="stg-field-value">{session.user.email}</span>
                </span>
                <button
                  type="button"
                  className="stg-field-copy"
                  aria-label="Copiar e-mail"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCopy(session.user.email ?? '', 'E-mail');
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
                <svg className="stg-field-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </div>
              <div className="stg-field-expand">
                <div className="stg-field-expand-inner">
                  {pendingEmailChange ? (
                    <div className="stg-email-pending">
                      <span className="stg-email-pending-text">
                        Pendente: <strong>{pendingEmailChange.newEmail}</strong>{' '}
                        {pendingExpiresLabel
                          ? `(expira em ${pendingExpiresLabel})`
                          : '(codigo expirado)'}
                      </span>
                    </div>
                  ) : null}
                  <form className="sdv-edit-fields" onSubmit={handleEmailRequest}>
                    <label className="sdv-edit-field">
                      <span className="sdv-edit-label">Novo e-mail</span>
                      <input
                        className="sdv-edit-input"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="Digite o novo e-mail"
                        autoComplete="email"
                        inputMode="email"
                      />
                    </label>
                    <button
                      type="submit"
                      className="sdv-cls-action-save stg-btn-request-email"
                      disabled={emailLoading}
                    >
                      {emailLoading ? 'Enviando...' : 'Solicitar troca de e-mail'}
                    </button>
                  </form>
                  {pendingEmailChange ? (
                    <form className="sdv-edit-fields" onSubmit={handleEmailConfirm}>
                      <label className="sdv-edit-field">
                        <span className="sdv-edit-label">Código de confirmação</span>
                        <input
                          className="sdv-edit-input"
                          value={emailCode}
                          onChange={(e) =>
                            setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                          }
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="000000"
                        />
                      </label>
                      <div className="stg-email-confirm-row">
                        <button
                          type="submit"
                          className={`cdm-manage-link${emailLoading || emailCode.length !== 6 ? ' is-disabled' : ''}`}
                          disabled={emailLoading || emailCode.length !== 6}
                        >
                          {emailLoading ? 'Confirmando...' : 'Confirmar'}
                        </button>
                        <button
                          type="button"
                          className="sdv-cls-action-save"
                          onClick={handleResendEmailCode}
                          disabled={emailLoading}
                        >
                          Reenviar
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {emailError ? (
                    <p className="stg-feedback is-error is-top-gap">{emailError}</p>
                  ) : null}
                  {emailMessage ? (
                    <p className="stg-feedback is-success is-top-gap">{emailMessage}</p>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Senha */}
            <div
              className={`stg-field-row${expandedField === 'senha' ? ' is-open' : ''}`}
              ref={passwordSectionRef}
            >
              <div
                className="stg-field-head"
                role="button"
                tabIndex={0}
                aria-expanded={expandedField === 'senha'}
                onClick={() => toggleField('senha')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleField('senha');
                  }
                }}
              >
                <span className="stg-field-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <span className="stg-field-main">
                  <span className="stg-field-label">Senha</span>
                  <span className="stg-field-value">••••••••</span>
                </span>
                <svg className="stg-field-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </div>
              <div className="stg-field-expand">
                <div className="stg-field-expand-inner">
                  <div className="stg-password-warning">
                    <svg
                      className="stg-password-warning-icon"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span className="stg-password-warning-text">
                      A alteracao de senha encerra todas as sessoes ativas e exige novo login.
                    </span>
                  </div>
                  <form className="sdv-edit-fields" onSubmit={handlePasswordSubmit}>
                    <label className="sdv-edit-field">
                      <span className="sdv-edit-label">Nova senha</span>
                      <div className="stg-password-field-wrap">
                        <input
                          className="sdv-edit-input stg-password-input"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="new-password"
                          placeholder="Minimo de 8 caracteres"
                        />
                        <button
                          type="button"
                          className="stg-password-toggle"
                          onClick={() => setShowPassword((v) => !v)}
                          tabIndex={-1}
                          aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        >
                          <svg className="stg-password-eye" viewBox="0 0 24 24" aria-hidden="true">
                            {showPassword ? (
                              <>
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </>
                            ) : (
                              <>
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </>
                            )}
                          </svg>
                        </button>
                      </div>
                    </label>
                    <label className="sdv-edit-field">
                      <span className="sdv-edit-label">Confirmar nova senha</span>
                      <div className="stg-password-field-wrap">
                        <input
                          className="sdv-edit-input stg-password-input"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          autoComplete="new-password"
                          placeholder="Repita a nova senha"
                        />
                        <button
                          type="button"
                          className="stg-password-toggle"
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          tabIndex={-1}
                          aria-label={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        >
                          <svg className="stg-password-eye" viewBox="0 0 24 24" aria-hidden="true">
                            {showConfirmPassword ? (
                              <>
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </>
                            ) : (
                              <>
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </>
                            )}
                          </svg>
                        </button>
                      </div>
                    </label>
                    {passwordError ? (
                      <p className="stg-feedback is-error">{passwordError}</p>
                    ) : null}
                    {passwordMessage ? (
                      <p className="stg-feedback is-success">{passwordMessage}</p>
                    ) : null}
                    <button
                      type="submit"
                      className="sdv-cls-action-save stg-btn-save-password"
                      disabled={passwordLoading || password.length < 8}
                    >
                      {passwordLoading ? 'Salvando...' : 'Alterar senha'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>

          {/* Notificacoes (Web Push) */}
          <div className="sdv-card stg-card" style={{ '--i': 3 } as React.CSSProperties}>
            <div className="stg-field-row">
              <div className="stg-field-head is-static">
                <span className="stg-field-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                  </svg>
                </span>
                <span className="stg-field-main">
                  <span className="stg-field-label">Notificações</span>
                  <span className="stg-field-value">
                    {PUSH_STATUS_LABELS[push.status] ?? 'Indisponível neste navegador'}
                  </span>
                </span>
                {push.status === 'inactive' || push.status === 'active' ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={push.status === 'active'}
                    aria-label={
                      push.status === 'active' ? 'Desativar notificações' : 'Ativar notificações'
                    }
                    className={`stg-push-switch${push.status === 'active' ? ' is-on' : ''}`}
                    disabled={push.busy}
                    onClick={() => {
                      if (push.status === 'active') {
                        void push.disable();
                      } else {
                        void push.enable();
                      }
                    }}
                  >
                    <span className="stg-push-switch-thumb" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
            {push.errorMessage ? (
              <p className="stg-feedback is-error is-top-gap">{push.errorMessage}</p>
            ) : null}
          </div>

          {/* Sair da conta — botao unico vermelho, alinhado a direita no
              fim da pagina (substituiu o antigo card descritivo). */}
          <div className="stg-logout-row" style={{ '--i': 4 } as React.CSSProperties}>
            <button
              type="button"
              className="stg-logout-btn"
              onClick={() => {
                void logout();
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sair da conta</span>
            </button>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
