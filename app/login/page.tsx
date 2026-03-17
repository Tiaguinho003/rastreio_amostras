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
      <section className="panel login-card">
        <div className="login-card-brand" aria-label="Safras">
          <Image
            src="/logo-safras-branco.png"
            alt="Safras"
            width={220}
            height={64}
            priority
            className="login-card-brand-image"
          />
        </div>

        <div className="login-card-copy">
          <p className="login-card-kicker">Operacao interna</p>
          <h2 className="login-card-title">Entrar no sistema</h2>
          <p className="login-card-subtitle">Use seu usuario e senha para acessar o sistema.</p>
        </div>

        {loginReason === 'session-expired' ? (
          <p className="login-card-hint">Sua sessao expirou. Entre novamente.</p>
        ) : null}
        {loginReason === 'session-ended' ? (
          <p className="login-card-hint">Sua sessao foi encerrada. Entre novamente.</p>
        ) : null}

        <form className="stack login-card-form" onSubmit={handleSubmit}>
          <label>
            Usuario
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>

          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          {error ? <p className="error">{error}</p> : null}

          <button type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <Link href="/forgot-password" className="login-card-link">
            Esqueci minha senha
          </Link>
        </form>
      </section>
    </main>
  );
}
