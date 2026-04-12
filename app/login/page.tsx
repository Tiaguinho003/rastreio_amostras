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
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordRequestedByQuery, setForgotPasswordRequestedByQuery] = useState(false);
  const forgotPasswordTriggerRef = useRef<HTMLButtonElement | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const requestedByQuery =
      new URLSearchParams(window.location.search).get('modal') === 'forgot-password';
    setForgotPasswordRequestedByQuery(requestedByQuery);

    if (requestedByQuery) {
      setForgotPasswordOpen(true);
    }
  }, []);

  useEffect(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }

    if (!error) return;

    errorTimerRef.current = setTimeout(() => setError(null), 8000);

    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (target.closest('a, button, [role="button"], input, select, textarea')) {
        setError(null);
      }
    }

    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
    };
  }, [error]);

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
      <section className="login-header">
        <div className="login-header-beans" aria-hidden="true">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <svg key={n} className={`login-bean login-bean-${n}`} viewBox="0 0 20 28">
              <ellipse cx="10" cy="14" rx="8.5" ry="12.5" fill="currentColor" />
              <path
                d="M10 2.5c-1.8 4-2.2 8-0.5 11.5s1.8 7.5 0.5 11.5"
                fill="none"
                stroke="rgba(0,0,0,0.25)"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          ))}
        </div>

        <Image
          src="/logo-safras-branco.png"
          alt="Safras e Negocios"
          width={1024}
          height={299}
          priority
          className="login-header-logo"
        />
        <h1 className="login-visually-hidden">Entrar no sistema</h1>
      </section>

      <section className="login-form-section">
        <div className="login-form-heading">
          <p className="login-form-title">Bem-vindo</p>
          <p className="login-form-subtitle">Entre para continuar</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form-fields">
            <label className={`login-field ${error && !username.trim() ? 'has-error' : ''}`}>
              <span className="login-field-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z" />
                  <path d="M4 20a8 8 0 0 1 16 0" />
                </svg>
              </span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={error && !username.trim() ? error : 'Usuario'}
                className="login-field-input"
              />
              <span className="login-visually-hidden">Usuario</span>
            </label>

            <label className={`login-field ${error && username.trim() ? 'has-error' : ''}`}>
              <span className="login-field-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoCapitalize="none"
                placeholder={error && username.trim() ? error : 'Senha'}
                className="login-field-input"
              />
              <button
                type="button"
                className="login-field-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
              <span className="login-visually-hidden">Senha</span>
            </label>
          </div>

          <div className="login-form-forgot">
            <button
              ref={forgotPasswordTriggerRef}
              type="button"
              className="login-forgot-link"
              onClick={handleOpenForgotPassword}
            >
              Esqueceu a senha?
            </button>
          </div>

          <button type="submit" disabled={loading} className="login-submit-btn">
            <span>{loading ? 'Entrando...' : 'Entrar'}</span>
            {!loading ? (
              <svg viewBox="0 0 24 24" className="login-submit-arrow" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            ) : null}
          </button>
        </form>

        <p className="login-footer-text">Safras & Negocios &copy; 2026 · v1.0</p>
      </section>

      <ForgotPasswordModal
        open={forgotPasswordOpen}
        onClose={handleCloseForgotPassword}
        returnFocusRef={forgotPasswordTriggerRef}
      />
    </main>
  );
}
