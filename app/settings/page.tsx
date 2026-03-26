'use client';

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
  updateCurrentUserProfile
} from '../../lib/api-client';
import {
  changePasswordSchema,
  emailChangeConfirmSchema,
  emailChangeRequestSchema,
  updateProfileSchema
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
  const passwordSectionRef = useRef<HTMLElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const profileLoadedRef = useRef(false);

  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    username: '',
    phone: ''
  });
  const [emailInput, setEmailInput] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [password, setPassword] = useState('');
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
            fullName: typeof response.user?.fullName === 'string' ? response.user.fullName : targetSession.user.fullName,
            username: typeof response.user?.username === 'string' ? response.user.username : targetSession.user.username,
            phone: typeof response.user?.phone === 'string' ? response.user.phone : ''
          });
          setEmailInput(typeof response.user?.email === 'string' ? response.user.email : targetSession.user.email);
        })
        .catch((cause) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') {
            return;
          }

          setInitialLoadError(
            cause instanceof ApiError ? cause.message : 'Falha ao carregar perfil. Os dados exibidos podem estar desatualizados.'
          );
          setProfileForm({
            fullName: targetSession.user.fullName,
            username: targetSession.user.username,
            phone: ''
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
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('section') === 'password') {
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
        phone: parsed.data.phone || null
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

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="stack" style={{ width: 'min(1180px, calc(100vw - 2rem))', margin: '1.25rem auto 2rem' }}>
        {initialLoadError ? (
          <p className="error" style={{ margin: 0 }}>
            {initialLoadError}
          </p>
        ) : null}

        <section className="panel stack">
          <h2 style={{ margin: 0 }}>Perfil</h2>

          <form className="stack" onSubmit={handleProfileSubmit}>
            <label>
              Nome completo
              <input
                value={profileForm.fullName}
                onChange={(event) => setProfileForm((current) => ({ ...current, fullName: event.target.value }))}
              />
            </label>

            <label>
              Usuario
              <input
                value={profileForm.username}
                onChange={(event) => setProfileForm((current) => ({ ...current, username: event.target.value }))}
              />
            </label>

            <label>
              Telefone
              <input
                value={profileForm.phone}
                onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))}
              />
            </label>

            {profileError ? <p className="error">{profileError}</p> : null}
            {profileMessage ? <p style={{ margin: 0, color: 'var(--muted)' }}>{profileMessage}</p> : null}

            <button type="submit" disabled={profileLoading}>
              {profileLoading ? 'Salvando...' : 'Salvar perfil'}
            </button>
          </form>
        </section>

        <section className="panel stack">
          <div>
            <h3 style={{ margin: 0 }}>Email</h3>
            <p style={{ margin: '0.45rem 0 0', color: 'var(--muted)' }}>
              Email atual: <strong>{session.user.email}</strong>
            </p>
            {pendingEmailChange ? (
              <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)' }}>
                Novo email pendente: <strong>{pendingEmailChange.newEmail}</strong>
                {pendingExpiresLabel ? (
                  <span> (expira em {pendingExpiresLabel})</span>
                ) : (
                  <span style={{ color: 'var(--danger)' }}> (codigo expirado — reenvie)</span>
                )}
              </p>
            ) : null}
          </div>

          <form className="stack" onSubmit={handleEmailRequest}>
            <label>
              Novo email
              <input
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                autoComplete="email"
                inputMode="email"
              />
            </label>

            <button type="submit" disabled={emailLoading}>
              {emailLoading ? 'Enviando...' : 'Solicitar troca de email'}
            </button>
          </form>

          {pendingEmailChange ? (
            <form className="stack" onSubmit={handleEmailConfirm}>
              <label>
                Codigo de confirmacao
                <input
                  value={emailCode}
                  onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                />
              </label>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="submit" disabled={emailLoading || emailCode.length !== 6}>
                  {emailLoading ? 'Confirmando...' : 'Confirmar novo email'}
                </button>
                <button type="button" className="secondary-button" onClick={handleResendEmailCode} disabled={emailLoading}>
                  Reenviar codigo
                </button>
              </div>
            </form>
          ) : null}

          {emailError ? <p className="error">{emailError}</p> : null}
          {emailMessage ? <p style={{ margin: 0, color: 'var(--muted)' }}>{emailMessage}</p> : null}
        </section>

        <section ref={passwordSectionRef} className="panel stack">
          <div>
            <h3 style={{ margin: 0 }}>Senha</h3>
            <p style={{ margin: '0.45rem 0 0', color: 'var(--muted)' }}>
              A alteracao de senha encerra suas sessoes ativas e exige novo login.
            </p>
          </div>

          <form className="stack" onSubmit={handlePasswordSubmit}>
            <label>
              Nova senha
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="Minimo de 8 caracteres"
              />
            </label>

            {passwordError ? <p className="error">{passwordError}</p> : null}
            {passwordMessage ? <p style={{ margin: 0, color: 'var(--muted)' }}>{passwordMessage}</p> : null}

            <button type="submit" disabled={passwordLoading || password.length < 8}>
              {passwordLoading ? 'Salvando...' : 'Alterar senha'}
            </button>
          </form>
        </section>
      </section>
    </AppShell>
  );
}
