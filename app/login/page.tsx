'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ForgotPasswordModal } from '../../components/ForgotPasswordModal';
import { login, ApiError, getCurrentSession } from '../../lib/api-client';
import { loginSchema } from '../../lib/form-schemas';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordRequestedByQuery, setForgotPasswordRequestedByQuery] = useState(false);
  const forgotPasswordTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlOverscrollBehavior = document.documentElement.style.overscrollBehavior;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverflowX = document.body.style.overflowX;
    const previousBodyOverflowY = document.body.style.overflowY;
    const previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;

    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overflow = 'hidden';
    document.body.style.overflowX = 'hidden';
    document.body.style.overflowY = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscrollBehavior;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overflowX = previousBodyOverflowX;
      document.body.style.overflowY = previousBodyOverflowY;
      document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
    };
  }, []);

  useEffect(() => {
    let active = true;

    getCurrentSession()
      .then(() => {
        if (active) {
          router.replace('/dashboard');
        }
      })
      .catch(() => {
        // no active cookie session
      });

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const requestedByQuery = new URLSearchParams(window.location.search).get('modal') === 'forgot-password';
    setForgotPasswordRequestedByQuery(requestedByQuery);

    if (requestedByQuery) {
      setForgotPasswordOpen(true);
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ username, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Dados invalidos');
      return;
    }

    setLoading(true);
    try {
      await login(parsed.data.username, parsed.data.password);
      router.replace('/dashboard');
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha inesperada ao autenticar');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleOpenForgotPassword() {
    setForgotPasswordOpen(true);
  }

  function handleCloseForgotPassword() {
    setForgotPasswordOpen(false);

    if (forgotPasswordRequestedByQuery) {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('modal');
      const nextPath = `${nextUrl.pathname}${nextUrl.search}`;

      setForgotPasswordRequestedByQuery(false);
      router.replace(nextPath || '/login', { scroll: false });
    }
  }

  return (
    <main className="login-page mobile-edge-shell mobile-edge-shell-login">
      <section className="login-card">
        <div className="login-card-brand" aria-label="Safras">
          <Image
            src="/logo-laudo.png"
            alt="Safras & negocios"
            width={296}
            height={296}
            priority
            className="login-card-brand-image"
          />
          <h1 className="login-visually-hidden">Entrar no sistema</h1>
        </div>

        <form className="login-card-form" onSubmit={handleSubmit}>
          <div className="login-card-fields">
            <label className="login-field-shell">
              <span className="login-visually-hidden">Usuario</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Usuário"
                className="login-field-input"
              />
            </label>

            <label className="login-field-shell">
              <span className="login-visually-hidden">Senha</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoCapitalize="none"
                placeholder="Senha"
                className="login-field-input"
              />
            </label>
          </div>

          <div className="login-card-actions">
            <button
              ref={forgotPasswordTriggerRef}
              type="button"
              className="login-card-link"
              onClick={handleOpenForgotPassword}
            >
              Esqueceu a senha?
            </button>

            <button
              type="submit"
              disabled={loading}
              className="login-card-submit"
              aria-label={loading ? 'Entrando...' : 'Entrar'}
              title={loading ? 'Entrando...' : 'Entrar'}
            >
              <svg
                viewBox="0 0 48 48"
                fill="currentColor"
                aria-hidden="true"
                className="login-card-submit-icon"
              >
                <path d="M20 4h18a6 6 0 0 1 6 6v28a6 6 0 0 1-6 6H20v-5h18a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H20V4z" />
                <path d="M4 22h22.34l-7.17-7.17L22 12l12 12-12 12-2.83-2.83L26.34 26H4v-4z" />
              </svg>
              <span className="login-visually-hidden">{loading ? 'Entrando...' : 'Entrar'}</span>
            </button>
          </div>

          <div className="login-card-feedback" aria-live="polite">
            {error ? <p className="error login-card-error">{error}</p> : null}
          </div>
        </form>
      </section>

      <ForgotPasswordModal
        open={forgotPasswordOpen}
        onClose={handleCloseForgotPassword}
        returnFocusRef={forgotPasswordTriggerRef}
      />
    </main>
  );
}
