'use client';

import Link from 'next/link';
import { useState } from 'react';

import { ApiError, requestPasswordReset, resetPasswordWithCode } from '../../lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      await requestPasswordReset(email);
      setStep('reset');
      setMessage('Codigo enviado para o email informado.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao solicitar codigo');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      await resetPasswordWithCode(email, code, password);
      setMessage('Senha redefinida com sucesso. Voce ja pode voltar ao login.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao redefinir senha');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <section className="panel stack" style={{ width: 'min(430px, 92vw)' }}>
        <div>
          <h2 style={{ marginTop: 0 }}>Recuperar senha</h2>
          <p style={{ color: 'var(--muted)', margin: '0.45rem 0 0' }}>
            Informe seu email para receber um codigo de recuperacao.
          </p>
        </div>

        <form className="stack" onSubmit={step === 'request' ? handleRequest : handleReset}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>

          {step === 'reset' ? (
            <>
              <label>
                Codigo
                <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" />
              </label>

              <label>
                Nova senha
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </label>
            </>
          ) : null}

          {error ? <p className="error">{error}</p> : null}
          {message ? <p style={{ margin: 0, color: 'var(--muted)' }}>{message}</p> : null}

          <button type="submit" disabled={loading}>
            {loading ? 'Processando...' : step === 'request' ? 'Enviar codigo' : 'Redefinir senha'}
          </button>
        </form>

        <Link href="/login">Voltar ao login</Link>
      </section>
    </main>
  );
}
