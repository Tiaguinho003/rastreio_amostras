'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AppShell } from '../../components/AppShell';
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

export default function SettingsPage() {
  const router = useRouter();
  const { session, loading, logout, setSession } = useRequireAuth();
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
  const [profileEditMode, setProfileEditMode] = useState(false);
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

  if (loading || !session) {
    return null;
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
  const initials = fullName
    .split(' ')
    .map((w: string) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="sdv-page">
        {/* Header */}
        <header className="sdv-header stg-header">
          <div className="sdv-header-top">
            <Link href="/dashboard" className="nsv2-back" aria-label="Voltar">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <span className="sdv-header-title">Meu Perfil</span>
            <span className="stg-header-spacer" />
          </div>
          <div className="stg-header-wrap">
            <div className="stg-header-avatar">
              <span className="stg-header-avatar-text">{initials}</span>
            </div>
            <div className="stg-header-text-wrap">
              <p className="stg-header-user-name">{fullName}</p>
              <p className="stg-header-user-username">@{session.user.username}</p>
            </div>
          </div>
        </header>

        {/* Content */}
        <section className="sdv-content stg-content">
          {initialLoadError ? <p className="stg-feedback is-error">{initialLoadError}</p> : null}

          {/* Card 1: Dados Pessoais */}
          <div className="sdv-card stg-card" style={{ '--i': 0 } as React.CSSProperties}>
            <div className="sdv-card-header">
              <div className="stg-card-title-row">
                <div className="stg-card-icon is-profile">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <span className="stg-card-title">Dados pessoais</span>
              </div>
              <button
                type="button"
                className="sdv-edit-btn"
                onClick={() => {
                  setProfileEditMode((v) => !v);
                  setProfileError(null);
                  setProfileMessage(null);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                </svg>
                <span className={`stg-edit-btn-label${profileEditMode ? ' is-cancel' : ''}`}>
                  {profileEditMode ? 'Cancelar' : 'Editar'}
                </span>
              </button>
            </div>
            <form className="sdv-edit-fields" onSubmit={handleProfileSubmit}>
              <label className="sdv-edit-field">
                <span className="sdv-edit-label">Nome completo</span>
                <input
                  className={`sdv-edit-input stg-input${!profileEditMode ? ' is-readonly' : ''}`}
                  value={profileForm.fullName}
                  readOnly={!profileEditMode}
                  onChange={(e) => setProfileForm((c) => ({ ...c, fullName: e.target.value }))}
                />
              </label>
              <label className="sdv-edit-field">
                <div className="stg-username-row">
                  <span className="sdv-edit-label">Usuario</span>
                  <span className="stg-badge-fixed">FIXO</span>
                </div>
                <input
                  className="sdv-edit-input stg-input is-readonly"
                  value={profileForm.username}
                  readOnly
                />
              </label>
              <label className="sdv-edit-field">
                <span className="sdv-edit-label">Telefone</span>
                <input
                  className={`sdv-edit-input stg-input${!profileEditMode ? ' is-readonly' : ''}`}
                  value={profileForm.phone}
                  readOnly={!profileEditMode}
                  onChange={(e) =>
                    setProfileForm((c) => ({ ...c, phone: maskPhoneInput(e.target.value) }))
                  }
                  placeholder="(00) 00000-0000"
                  inputMode="tel"
                />
              </label>
              {profileError ? <p className="stg-feedback is-error">{profileError}</p> : null}
              {profileMessage ? <p className="stg-feedback is-success">{profileMessage}</p> : null}
              {profileEditMode ? (
                <button
                  type="submit"
                  className={`cdm-manage-link stg-btn-save-profile${profileLoading ? ' is-disabled' : ''}`}
                  disabled={profileLoading}
                >
                  {profileLoading ? 'Salvando...' : 'Salvar alteracoes'}
                </button>
              ) : null}
            </form>
          </div>

          {/* Card 2: Email */}
          <div className="sdv-card stg-card" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="stg-card-title-row">
              <div className="stg-card-icon is-email">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </div>
              <span className="stg-card-title">Email</span>
            </div>
            <div className="stg-email-box">
              <span className="sdv-edit-label">Email atual</span>
              <div className="stg-email-box-value-row">
                <span className="stg-email-box-value">{session.user.email}</span>
                <svg className="stg-email-box-check" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m5 12.5 4.3 4.2L19 7" />
                </svg>
              </div>
            </div>
            {pendingEmailChange ? (
              <div className="stg-email-pending">
                <span className="stg-email-pending-text">
                  Pendente: <strong>{pendingEmailChange.newEmail}</strong>{' '}
                  {pendingExpiresLabel ? `(expira em ${pendingExpiresLabel})` : '(codigo expirado)'}
                </span>
              </div>
            ) : null}
            <form className="sdv-edit-fields" onSubmit={handleEmailRequest}>
              <label className="sdv-edit-field">
                <span className="sdv-edit-label">Novo email</span>
                <input
                  className="sdv-edit-input"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="Digite o novo email"
                  autoComplete="email"
                  inputMode="email"
                />
              </label>
              <button
                type="submit"
                className="sdv-cls-action-save stg-btn-request-email"
                disabled={emailLoading}
              >
                {emailLoading ? 'Enviando...' : 'Solicitar troca de email'}
              </button>
            </form>
            {pendingEmailChange ? (
              <form className="sdv-edit-fields" onSubmit={handleEmailConfirm}>
                <label className="sdv-edit-field">
                  <span className="sdv-edit-label">Codigo de confirmacao</span>
                  <input
                    className="sdv-edit-input"
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
            {emailError ? <p className="stg-feedback is-error is-top-gap">{emailError}</p> : null}
            {emailMessage ? (
              <p className="stg-feedback is-success is-top-gap">{emailMessage}</p>
            ) : null}
          </div>

          {/* Card 3: Senha */}
          <div
            className="sdv-card stg-card"
            ref={passwordSectionRef}
            style={{ '--i': 2 } as React.CSSProperties}
          >
            <div className="stg-card-title-row">
              <div className="stg-card-icon is-password">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <span className="stg-card-title">Senha</span>
            </div>
            <div className="stg-password-warning">
              <svg className="stg-password-warning-icon" viewBox="0 0 24 24" aria-hidden="true">
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
              {passwordError ? <p className="stg-feedback is-error">{passwordError}</p> : null}
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
        </section>
      </section>
    </AppShell>
  );
}
