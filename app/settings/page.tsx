'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useRequireAuth } from '../../lib/use-auth';

export default function SettingsPage() {
  const router = useRouter();
  const { session, loading, logout, setSession } = useRequireAuth();
  const passwordSectionRef = useRef<HTMLElement | null>(null);
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
    if (!session) {
      return;
    }

    let active = true;
    getCurrentUser(session)
      .then((response) => {
        if (!active) {
          return;
        }

        setSession({
          ...session,
          user: {
            ...session.user,
            email: response.user.email,
            fullName: response.user.fullName,
            displayName: response.user.fullName,
            username: response.user.username,
            status: response.user.status,
            initialPasswordDecision: response.user.initialPasswordDecision,
            pendingEmailChange: response.user.pendingEmailChange
          }
        } as typeof session);
        setProfileForm({
          fullName: response.user.fullName,
          username: response.user.username,
          phone: response.user.phone ?? ''
        });
        setEmailInput(response.user.email);
      })
      .catch(() => {
        setProfileForm({
          fullName: session.user.fullName,
          username: session.user.username,
          phone: ''
        });
        setEmailInput(session.user.email ?? '');
      });

    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('section') === 'password') {
      passwordSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const pendingEmailChange = useMemo(() => session?.user.pendingEmailChange ?? null, [session]);

  if (loading || !session) {
    return null;
  }

  const authSession = session;

  async function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileLoading(true);
    setProfileMessage(null);
    setProfileError(null);

    try {
      const response = await updateCurrentUserProfile(authSession, {
        fullName: profileForm.fullName,
        username: profileForm.username,
        phone: profileForm.phone || null
      });

      if (response.sessionRevoked) {
        setSession(null);
        router.replace('/login?reason=session-ended');
        return;
      }

      setSession({
        ...authSession,
        user: {
          ...authSession.user,
          fullName: response.user.fullName,
          displayName: response.user.fullName,
          username: response.user.username,
          status: response.user.status,
          initialPasswordDecision: response.user.initialPasswordDecision,
          pendingEmailChange: response.user.pendingEmailChange,
          email: response.user.email
        }
      });
      setProfileMessage('Perfil atualizado.');
    } catch (cause) {
      setProfileError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar perfil');
    } finally {
      setProfileLoading(false);
    }
  }

  async function handleEmailRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailLoading(true);
    setEmailMessage(null);
    setEmailError(null);

    try {
      const response = await requestCurrentUserEmailChange(authSession, emailInput);
      setSession({
        ...authSession,
        user: {
          ...authSession.user,
          pendingEmailChange: response.user.pendingEmailChange
        }
      });
      setEmailMessage('Codigo enviado para o novo email.');
    } catch (cause) {
      setEmailError(cause instanceof ApiError ? cause.message : 'Falha ao solicitar troca de email');
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleEmailConfirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailLoading(true);
    setEmailMessage(null);
    setEmailError(null);

    try {
      const response = await confirmCurrentUserEmailChange(authSession, emailCode);
      setSession({
        ...authSession,
        user: {
          ...authSession.user,
          email: response.user.email,
          pendingEmailChange: response.user.pendingEmailChange
        }
      });
      setEmailCode('');
      setEmailInput(response.user.email);
      setEmailMessage('Email confirmado com sucesso.');
    } catch (cause) {
      setEmailError(cause instanceof ApiError ? cause.message : 'Falha ao confirmar novo email');
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleResendEmailCode() {
    setEmailLoading(true);
    setEmailMessage(null);
    setEmailError(null);

    try {
      const response = await resendCurrentUserEmailChangeCode(authSession);
      setSession({
        ...authSession,
        user: {
          ...authSession.user,
          pendingEmailChange: response.user.pendingEmailChange
        }
      });
      setEmailMessage('Codigo reenviado.');
    } catch (cause) {
      setEmailError(cause instanceof ApiError ? cause.message : 'Falha ao reenviar codigo');
    } finally {
      setEmailLoading(false);
    }
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordLoading(true);
    setPasswordMessage(null);
    setPasswordError(null);

    try {
      await changeCurrentUserPassword(authSession, password);
      setSession(null);
      router.replace('/login?reason=session-ended');
    } catch (cause) {
      setPasswordError(cause instanceof ApiError ? cause.message : 'Falha ao alterar senha');
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <AppShell session={authSession} onLogout={logout} onSessionChange={setSession}>
      <section className="stack" style={{ width: 'min(1180px, calc(100vw - 2rem))', margin: '1.25rem auto 2rem' }}>
        <section className="panel stack">
          <div>
            <h2 style={{ margin: 0 }}>Meu perfil</h2>
            <p style={{ margin: '0.45rem 0 0', color: 'var(--muted)' }}>
              Atualize seus dados, senha e email de acesso.
            </p>
          </div>

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
              Email atual: <strong>{authSession.user.email}</strong>
            </p>
            {pendingEmailChange ? (
              <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)' }}>
                Novo email pendente: <strong>{pendingEmailChange.newEmail}</strong>
              </p>
            ) : null}
          </div>

          <form className="stack" onSubmit={handleEmailRequest}>
            <label>
              Novo email
              <input value={emailInput} onChange={(event) => setEmailInput(event.target.value)} autoComplete="email" />
            </label>

            <button type="submit" disabled={emailLoading}>
              {emailLoading ? 'Enviando...' : 'Solicitar troca de email'}
            </button>
          </form>

          {pendingEmailChange ? (
            <form className="stack" onSubmit={handleEmailConfirm}>
              <label>
                Codigo de confirmacao
                <input value={emailCode} onChange={(event) => setEmailCode(event.target.value)} inputMode="numeric" />
              </label>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="submit" disabled={emailLoading}>
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
              />
            </label>

            {passwordError ? <p className="error">{passwordError}</p> : null}
            {passwordMessage ? <p style={{ margin: 0, color: 'var(--muted)' }}>{passwordMessage}</p> : null}

            <button type="submit" disabled={passwordLoading}>
              {passwordLoading ? 'Salvando...' : 'Alterar senha'}
            </button>
          </form>
        </section>
      </section>
    </AppShell>
  );
}
