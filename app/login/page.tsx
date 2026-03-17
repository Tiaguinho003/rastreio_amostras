'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { login, ApiError, getCurrentSession } from '../../lib/api-client';
import { loginSchema } from '../../lib/form-schemas';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginReason, setLoginReason] = useState<string | null>(null);

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

    if (typeof window !== 'undefined') {
      setLoginReason(new URLSearchParams(window.location.search).get('reason'));
    }

    return () => {
      active = false;
    };
  }, [router]);

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

  return (
    <main className="login-page">
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

          <div className="login-card-copy">
            <h1 className="login-visually-hidden">Entrar no sistema</h1>
            <p className="login-card-subtitle">Rastreio interno de amostras</p>
          </div>
        </div>

        {loginReason === 'session-expired' ? (
          <p className="login-card-hint">Sua sessao expirou. Entre novamente.</p>
        ) : null}
        {loginReason === 'session-ended' ? (
          <p className="login-card-hint">Sua sessao foi encerrada. Entre novamente.</p>
        ) : null}

        <form className="login-card-form" onSubmit={handleSubmit}>
          <div className="login-card-fields">
            <Image
              src="/login-coffee-beans.png"
              alt=""
              width={146}
              height={146}
              aria-hidden="true"
              className="login-card-coffee"
            />

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

          <Link href="/forgot-password" className="login-card-link">
            Esqueci minha senha
          </Link>

          {error ? <p className="error login-card-error">{error}</p> : null}

          <button type="submit" disabled={loading} className="login-card-submit">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
