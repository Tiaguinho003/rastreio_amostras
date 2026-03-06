'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { login, ApiError } from '../../lib/api-client';
import { loginSchema } from '../../lib/form-schemas';
import { getSession, isSessionExpired, saveSession } from '../../lib/session';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginReason, setLoginReason] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (session && !isSessionExpired(session)) {
      router.replace('/dashboard');
    }

    if (typeof window !== 'undefined') {
      setLoginReason(new URLSearchParams(window.location.search).get('reason'));
    }
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
      const session = await login(parsed.data.username, parsed.data.password);
      saveSession(session);
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
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <section className="panel" style={{ width: 'min(430px, 92vw)' }}>
        <h2 style={{ marginTop: 0 }}>Entrar no sistema</h2>
        <p style={{ color: 'var(--muted)' }}>Use seu usuario e senha para acessar o sistema.</p>

        {loginReason === 'session-expired' ? (
          <p style={{ color: 'var(--muted)' }}>Sua sessao expirou. Entre novamente.</p>
        ) : null}
        {loginReason === 'session-ended' ? (
          <p style={{ color: 'var(--muted)' }}>Sua sessao foi encerrada. Entre novamente.</p>
        ) : null}

        <form className="stack" onSubmit={handleSubmit}>
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

          <Link href="/forgot-password">Esqueci minha senha</Link>
        </form>
      </section>
    </main>
  );
}
