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
            <div className="login-field-anchor">
              <div className="login-card-coffee-frame" aria-hidden="true">
                <Image
                  src="/login-coffee-beans.png"
                  alt=""
                  width={200}
                  height={267}
                  className="login-card-coffee"
                />
              </div>

              <label className="login-field-shell login-field-shell-light">
                <span className="login-visually-hidden">Usuario</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Usuario"
                  className="login-field-input"
                />
              </label>
            </div>

            <label className="login-field-shell login-field-shell-strong">
              <span className="login-visually-hidden">Senha</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
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
              Esqueci minha senha
            </button>

            <button
              type="submit"
              disabled={loading}
              className="login-card-submit"
              aria-label={loading ? 'Entrando...' : 'Entrar'}
              title={loading ? 'Entrando...' : 'Entrar'}
            >
              <Image
                src="/login-enter-icon.png"
                alt=""
                width={42}
                height={42}
                aria-hidden="true"
                className="login-card-submit-icon"
              />
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
