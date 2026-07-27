'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

import { AppShell } from '../../components/AppShell';
import { UserAvatar } from '../../components/UserAvatar';
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
import { usePushNotifications } from '../../lib/push/use-push-notifications';
import { getRoleLabel, isProspector } from '../../lib/roles';
import { useToast } from '../../lib/toast/ToastProvider';
import { mergeUserIntoSession, useRequireAuth } from '../../lib/use-auth';
import { useFocusTrap } from '../../lib/use-focus-trap';

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
    return 'Operação cancelada.';
  }

  if (cause instanceof ApiError) {
    return cause.message;
  }

  return fallback;
}

// P2: o erro de validacao mora DENTRO do campo (regra da casa) — um slot por
// campo, e nao um paragrafo solto por formulario.
type ProfileFieldName =
  | 'fullName'
  | 'username'
  | 'phone'
  | 'email'
  | 'code'
  | 'password'
  | 'confirmPassword';

type ProfileFieldErrors = Partial<Record<ProfileFieldName, string>>;

// Rótulo curto do estado das notificações (subtítulo da linha). O fallback
// cobre needs-install/unsupported sem instrução específica de iPhone.
const PUSH_STATUS_LABELS: Record<string, string> = {
  active: 'Ativadas neste aparelho',
  inactive: 'Receber neste aparelho',
  loading: 'Verificando…',
  'permission-denied': 'Bloqueadas nas permissões',
  unavailable: 'Indisponível no momento',
};

export default function ProfilePage() {
  const router = useRouter();
  const { session, loading, logout, setSession } = useRequireAuth();
  const toast = useToast();
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
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);
  const disableConfirmTrapRef = useFocusTrap(disableConfirmOpen);
  const [expandedField, setExpandedField] = useState<
    'nome' | 'usuario' | 'telefone' | 'email' | 'senha' | null
  >(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  // P2: um estado de erro POR CAMPO substitui os 6 pares mensagem/erro de
  // antes. O ganho nao e so de codigo: `profileError` era renderizado em TRES
  // linhas do acordeao (Nome, Usuario, Telefone) porque as tres compartilham
  // o mesmo submit — errar o telefone acendia o erro embaixo do nome tambem.
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!disableConfirmOpen) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDisableConfirmOpen(false);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [disableConfirmOpen]);

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

  // P2: o efeito de `?section=password` saiu. Ele rolava ate a linha da senha,
  // mas NADA no repositorio gera esse link (varredura repo-wide) — e a linha
  // pra qual ele rolava esta FECHADA por padrao, entao nem a intencao original
  // funcionava. Se um dia o deep-link voltar, ele precisa abrir o acordeao
  // (`setExpandedField('senha')`), nao so rolar.

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

  const push = usePushNotifications(session);

  if (loading || !session) {
    return null;
  }

  function toggleField(field: 'nome' | 'usuario' | 'telefone' | 'email' | 'senha') {
    setExpandedField((cur) => (cur === field ? null : field));
    // Limpa feedback transiente ao abrir/fechar um campo.
    setFieldErrors({});
  }

  // O erro some ao digitar (regra da casa), nao so no proximo submit.
  function clearFieldError(field: ProfileFieldName) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleCopy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success({ title: `${label} copiado` });
    } catch {
      toast.error({ title: 'Não foi possível copiar' });
    }
  }

  async function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = updateProfileSchema.safeParse(profileForm);
    if (!parsed.success) {
      // Cada issue volta pro SEU campo. Antes so a primeira aparecia, e num
      // paragrafo abaixo do formulario.
      const errors: ProfileFieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'fullName' || field === 'username' || field === 'phone') {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
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
      toast.success({ title: 'Perfil atualizado' });
      // Fecha a linha: o "salvo" saiu de dentro do acordeao (virou toast) e
      // deixar a linha aberta esconderia justamente o valor recem-gravado.
      setExpandedField(null);
    } catch (cause) {
      toast.error({
        title: 'Não foi possível salvar',
        description: extractErrorMessage(cause, 'Falha ao atualizar perfil'),
      });
    } finally {
      setProfileLoading(false);
    }
  }

  async function handleEmailRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = emailChangeRequestSchema.safeParse({ email: emailInput });
    if (!parsed.success) {
      setFieldErrors({ email: parsed.error.issues[0]?.message ?? 'E-mail inválido' });
      return;
    }

    if (parsed.data.email === session!.user.email) {
      setFieldErrors({ email: 'O novo e-mail deve ser diferente do atual.' });
      return;
    }

    setFieldErrors({});
    setEmailLoading(true);

    try {
      const response = await requestCurrentUserEmailChange(session!, parsed.data.email);
      setSession(mergeUserIntoSession(session!, response.user));
      toast.success({
        title: 'Código enviado',
        description: 'Confira a caixa de entrada do novo e-mail.',
      });
    } catch (cause) {
      toast.error({
        title: 'Não foi possível solicitar a troca',
        description: extractErrorMessage(cause, 'Falha ao solicitar troca de e-mail'),
      });
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleEmailConfirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = emailChangeConfirmSchema.safeParse({ code: emailCode });
    if (!parsed.success) {
      setFieldErrors({ code: parsed.error.issues[0]?.message ?? 'Código inválido' });
      return;
    }

    setFieldErrors({});
    setEmailLoading(true);

    try {
      const response = await confirmCurrentUserEmailChange(session!, parsed.data.code);
      const merged = mergeUserIntoSession(session!, response.user);
      setSession(merged);
      setEmailCode('');
      setEmailInput(merged.user.email);
      toast.success({ title: 'E-mail confirmado' });
      setExpandedField(null);
    } catch (cause) {
      toast.error({
        title: 'Não foi possível confirmar o e-mail',
        description: extractErrorMessage(cause, 'Falha ao confirmar novo e-mail'),
      });
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleResendEmailCode() {
    setFieldErrors({});
    setEmailLoading(true);

    try {
      const response = await resendCurrentUserEmailChangeCode(session!);
      setSession(mergeUserIntoSession(session!, response.user));
      toast.success({ title: 'Código reenviado' });
    } catch (cause) {
      toast.error({
        title: 'Não foi possível reenviar o código',
        description: extractErrorMessage(cause, 'Falha ao reenviar código'),
      });
    } finally {
      setEmailLoading(false);
    }
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = changePasswordSchema.safeParse({ password });
    if (!parsed.success) {
      setFieldErrors({ password: parsed.error.issues[0]?.message ?? 'Senha inválida' });
      return;
    }

    // A confirmacao e checada DEPOIS da senha: com as duas erradas, o erro que
    // interessa e o da regra ("mínimo de 8"), nao o "não coincidem".
    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'As senhas não coincidem.' });
      return;
    }

    setFieldErrors({});
    setPasswordLoading(true);

    try {
      await changeCurrentUserPassword(session!, parsed.data.password);
      // Sem toast: a troca encerra a sessao e a proxima tela e o /login, que
      // ja explica o motivo pelo `reason=session-ended`.
      setSession(null);
      router.replace('/login?reason=session-ended');
    } catch (cause) {
      toast.error({
        title: 'Não foi possível alterar a senha',
        description: extractErrorMessage(cause, 'Falha ao alterar senha'),
      });
    } finally {
      setPasswordLoading(false);
    }
  }

  const fullName = session.user.fullName ?? session.user.username;

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="sdv-page">
        {/* Header */}
        <header className="sdv-header stg-header">
          {/* RD16: a faixa de topo aqui sobrou SO pro PROSPECTOR — ele nao tem
              tabbar nem o header unico do AppShell (.fv-mtopbar), entao precisa
              do back. Os demais papeis recebem titulo + camera + avatar do
              shell; o card de perfil abaixo segue para todos. */}
          {isProspector(session.user.role) ? (
            <div className="sdv-header-top">
              <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao início">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </Link>
              <span className="sdv-header-title">Meu Perfil</span>
            </div>
          ) : null}
          <div className="stg-header-wrap">
            <UserAvatar size="lg" user={session.user} className="stg-profile-avatar" />
            <div className="stg-header-text-wrap">
              <p className="stg-header-user-name">{fullName}</p>
              {/* P-D3: o papel e texto puro. O escudo saiu — era decoracao de
                  cor num lugar onde o kit institucional pede neutralidade. */}
              <span className="stg-header-user-role">{getRoleLabel(session.user.role)}</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <section className="sdv-content stg-content">
          {/* Erro de CARGA continua banner (nao e erro de campo, e nao pode
              sumir num toast: os dados na tela podem estar velhos enquanto ele
              existir). `.spv2-error-banner` e a peca compartilhada que /samples
              e /users ja usam pro mesmo caso. */}
          {initialLoadError ? (
            <p className="spv2-error-banner" role="status">
              {initialLoadError}
            </p>
          ) : null}

          {/* Container único: Dados pessoais + Email + Senha */}
          <div className="sdv-card stg-card" style={{ '--i': 0 } as React.CSSProperties}>
            {/* Nome completo */}
            <div className={`stg-field-row${expandedField === 'nome' ? ' is-open' : ''}`}>
              <div
                className="stg-field-head"
                role="button"
                tabIndex={0}
                aria-expanded={expandedField === 'nome'}
                onClick={() => toggleField('nome')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleField('nome');
                  }
                }}
              >
                <span className="stg-field-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <span className="stg-field-main">
                  <span className="stg-field-label">Nome completo</span>
                  <span className="stg-field-value">{profileForm.fullName || '—'}</span>
                </span>
                <svg className="stg-field-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </div>
              <div className="stg-field-expand">
                <div className="stg-field-expand-inner">
                  <form className="fv-form-body" onSubmit={handleProfileSubmit}>
                    <label
                      className={`fv-form-field${fieldErrors.fullName ? ' is-field-error' : ''}`}
                    >
                      <span className="fv-form-label">Nome completo</span>
                      <input
                        value={profileForm.fullName}
                        disabled={profileLoading}
                        onChange={(e) => {
                          setProfileForm((c) => ({ ...c, fullName: e.target.value }));
                          clearFieldError('fullName');
                        }}
                      />
                      {fieldErrors.fullName ? (
                        <p className="fv-form-field-error">{fieldErrors.fullName}</p>
                      ) : null}
                    </label>
                    <button
                      type="submit"
                      className="fv-btn fv-btn-primary"
                      disabled={profileLoading}
                    >
                      {profileLoading ? 'Salvando…' : 'Salvar'}
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Usuário */}
            <div className={`stg-field-row${expandedField === 'usuario' ? ' is-open' : ''}`}>
              <div
                className="stg-field-head"
                role="button"
                tabIndex={0}
                aria-expanded={expandedField === 'usuario'}
                onClick={() => toggleField('usuario')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleField('usuario');
                  }
                }}
              >
                <span className="stg-field-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
                  </svg>
                </span>
                <span className="stg-field-main">
                  <span className="stg-field-label">Usuário</span>
                  <span className="stg-field-value">@{profileForm.username}</span>
                </span>
                <svg className="stg-field-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </div>
              <div className="stg-field-expand">
                <div className="stg-field-expand-inner">
                  <div className="stg-password-warning">
                    <svg
                      className="stg-password-warning-icon"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span className="stg-password-warning-text">
                      Alterar o usuário encerra a sessão e exige novo login.
                    </span>
                  </div>
                  <form className="fv-form-body" onSubmit={handleProfileSubmit}>
                    <label
                      className={`fv-form-field${fieldErrors.username ? ' is-field-error' : ''}`}
                    >
                      <span className="fv-form-label">Usuário</span>
                      <input
                        value={profileForm.username}
                        disabled={profileLoading}
                        autoComplete="username"
                        onChange={(e) => {
                          setProfileForm((c) => ({ ...c, username: e.target.value }));
                          clearFieldError('username');
                        }}
                      />
                      {fieldErrors.username ? (
                        <p className="fv-form-field-error">{fieldErrors.username}</p>
                      ) : null}
                    </label>
                    <button
                      type="submit"
                      className="fv-btn fv-btn-primary"
                      disabled={profileLoading}
                    >
                      {profileLoading ? 'Salvando…' : 'Salvar'}
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Telefone */}
            <div className={`stg-field-row${expandedField === 'telefone' ? ' is-open' : ''}`}>
              <div
                className="stg-field-head"
                role="button"
                tabIndex={0}
                aria-expanded={expandedField === 'telefone'}
                onClick={() => toggleField('telefone')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleField('telefone');
                  }
                }}
              >
                <span className="stg-field-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </span>
                <span className="stg-field-main">
                  <span className="stg-field-label">Telefone</span>
                  <span className="stg-field-value">{profileForm.phone || 'Não informado'}</span>
                </span>
                {profileForm.phone ? (
                  <button
                    type="button"
                    className="sdv-info-copy"
                    aria-label="Copiar telefone"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleCopy(profileForm.phone, 'Telefone');
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                ) : null}
                <svg className="stg-field-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </div>
              <div className="stg-field-expand">
                <div className="stg-field-expand-inner">
                  <form className="fv-form-body" onSubmit={handleProfileSubmit}>
                    <label className={`fv-form-field${fieldErrors.phone ? ' is-field-error' : ''}`}>
                      <span className="fv-form-label">Telefone</span>
                      <input
                        value={profileForm.phone}
                        disabled={profileLoading}
                        placeholder="(00) 00000-0000"
                        inputMode="tel"
                        onChange={(e) => {
                          setProfileForm((c) => ({ ...c, phone: maskPhoneInput(e.target.value) }));
                          clearFieldError('phone');
                        }}
                      />
                      {fieldErrors.phone ? (
                        <p className="fv-form-field-error">{fieldErrors.phone}</p>
                      ) : null}
                    </label>
                    <button
                      type="submit"
                      className="fv-btn fv-btn-primary"
                      disabled={profileLoading}
                    >
                      {profileLoading ? 'Salvando…' : 'Salvar'}
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* E-mail */}
            <div className={`stg-field-row${expandedField === 'email' ? ' is-open' : ''}`}>
              <div
                className="stg-field-head"
                role="button"
                tabIndex={0}
                aria-expanded={expandedField === 'email'}
                onClick={() => toggleField('email')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleField('email');
                  }
                }}
              >
                <span className="stg-field-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </span>
                <span className="stg-field-main">
                  <span className="stg-field-label">E-mail</span>
                  <span className="stg-field-value">{session.user.email}</span>
                </span>
                <button
                  type="button"
                  className="sdv-info-copy"
                  aria-label="Copiar e-mail"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCopy(session.user.email ?? '', 'E-mail');
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
                <svg className="stg-field-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </div>
              <div className="stg-field-expand">
                <div className="stg-field-expand-inner">
                  {pendingEmailChange ? (
                    <div className="stg-email-pending">
                      <span className="stg-email-pending-text">
                        Pendente: <strong>{pendingEmailChange.newEmail}</strong>{' '}
                        {pendingExpiresLabel
                          ? `(expira em ${pendingExpiresLabel})`
                          : '(código expirado)'}
                      </span>
                    </div>
                  ) : null}
                  <form className="fv-form-body" onSubmit={handleEmailRequest}>
                    <label className={`fv-form-field${fieldErrors.email ? ' is-field-error' : ''}`}>
                      <span className="fv-form-label">Novo e-mail</span>
                      <input
                        value={emailInput}
                        disabled={emailLoading}
                        placeholder="Digite o novo e-mail"
                        autoComplete="email"
                        inputMode="email"
                        onChange={(e) => {
                          setEmailInput(e.target.value);
                          clearFieldError('email');
                        }}
                      />
                      {fieldErrors.email ? (
                        <p className="fv-form-field-error">{fieldErrors.email}</p>
                      ) : null}
                    </label>
                    <button type="submit" className="fv-btn fv-btn-primary" disabled={emailLoading}>
                      {emailLoading ? 'Enviando…' : 'Solicitar troca de e-mail'}
                    </button>
                  </form>
                  {pendingEmailChange ? (
                    <form className="fv-form-body" onSubmit={handleEmailConfirm}>
                      <label
                        className={`fv-form-field${fieldErrors.code ? ' is-field-error' : ''}`}
                      >
                        <span className="fv-form-label">Código de confirmação</span>
                        <input
                          value={emailCode}
                          disabled={emailLoading}
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="000000"
                          onChange={(e) => {
                            setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                            clearFieldError('code');
                          }}
                        />
                        {fieldErrors.code ? (
                          <p className="fv-form-field-error">{fieldErrors.code}</p>
                        ) : null}
                      </label>
                      <div className="stg-email-confirm-row">
                        <button
                          type="submit"
                          className="fv-btn fv-btn-primary"
                          disabled={emailLoading || emailCode.length !== 6}
                        >
                          {emailLoading ? 'Confirmando…' : 'Confirmar'}
                        </button>
                        <button
                          type="button"
                          className="fv-btn fv-btn-secondary"
                          onClick={handleResendEmailCode}
                          disabled={emailLoading}
                        >
                          Reenviar
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Senha */}
            <div className={`stg-field-row${expandedField === 'senha' ? ' is-open' : ''}`}>
              <div
                className="stg-field-head"
                role="button"
                tabIndex={0}
                aria-expanded={expandedField === 'senha'}
                onClick={() => toggleField('senha')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleField('senha');
                  }
                }}
              >
                <span className="stg-field-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <span className="stg-field-main">
                  <span className="stg-field-label">Senha</span>
                  <span className="stg-field-value">••••••••</span>
                </span>
                <svg className="stg-field-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </div>
              <div className="stg-field-expand">
                <div className="stg-field-expand-inner">
                  <div className="stg-password-warning">
                    <svg
                      className="stg-password-warning-icon"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span className="stg-password-warning-text">
                      A alteração de senha encerra todas as sessões ativas e exige novo login.
                    </span>
                  </div>
                  <form className="fv-form-body" onSubmit={handlePasswordSubmit}>
                    <label
                      className={`fv-form-field${fieldErrors.password ? ' is-field-error' : ''}`}
                    >
                      <span className="fv-form-label">Nova senha</span>
                      <div className="stg-password-field-wrap">
                        <input
                          className="stg-password-input"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          disabled={passwordLoading}
                          autoComplete="new-password"
                          placeholder="Mínimo de 8 caracteres"
                          onChange={(e) => {
                            setPassword(e.target.value);
                            clearFieldError('password');
                          }}
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
                      {fieldErrors.password ? (
                        <p className="fv-form-field-error">{fieldErrors.password}</p>
                      ) : null}
                    </label>
                    <label
                      className={`fv-form-field${fieldErrors.confirmPassword ? ' is-field-error' : ''}`}
                    >
                      <span className="fv-form-label">Confirmar nova senha</span>
                      <div className="stg-password-field-wrap">
                        <input
                          className="stg-password-input"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          disabled={passwordLoading}
                          autoComplete="new-password"
                          placeholder="Repita a nova senha"
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            clearFieldError('confirmPassword');
                          }}
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
                      {fieldErrors.confirmPassword ? (
                        <p className="fv-form-field-error">{fieldErrors.confirmPassword}</p>
                      ) : null}
                    </label>
                    <button
                      type="submit"
                      className="fv-btn fv-btn-primary"
                      disabled={passwordLoading || password.length < 8}
                    >
                      {passwordLoading ? 'Salvando…' : 'Alterar senha'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>

          {/* Notificacoes (Web Push) */}
          <div className="sdv-card stg-card" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="stg-field-row">
              <div className="stg-field-head is-static">
                <span className="stg-field-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                  </svg>
                </span>
                <span className="stg-field-main">
                  <span className="stg-field-label">Notificações</span>
                  <span className="stg-field-value">
                    {PUSH_STATUS_LABELS[push.status] ?? 'Indisponível neste navegador'}
                  </span>
                </span>
                {push.status === 'inactive' || push.status === 'active' ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={push.status === 'active'}
                    aria-label={
                      push.status === 'active' ? 'Desativar notificações' : 'Ativar notificações'
                    }
                    className={`stg-push-switch${push.status === 'active' ? ' is-on' : ''}`}
                    disabled={push.busy}
                    onClick={() => {
                      if (push.status === 'active') {
                        setDisableConfirmOpen(true);
                      } else {
                        void push.enable();
                      }
                    }}
                  >
                    <span className="stg-push-switch-thumb" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
            {/* Idem: o erro do push descreve o ESTADO do switch ao lado, entao
                fica na tela enquanto durar, nao passa num toast. */}
            {push.errorMessage ? (
              <p className="spv2-error-banner" role="status">
                {push.errorMessage}
              </p>
            ) : null}
          </div>

          {disableConfirmOpen
            ? createPortal(
                <div className="app-modal-backdrop" onClick={() => setDisableConfirmOpen(false)}>
                  <section
                    ref={disableConfirmTrapRef}
                    className="app-modal is-themed app-confirm-modal"
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="push-disable-title"
                    aria-describedby="push-disable-description"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="app-modal-content">
                      <div className="app-confirm-modal-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false">
                          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                          <line x1="3" y1="3" x2="21" y2="21" />
                        </svg>
                      </div>
                      <h3 id="push-disable-title" className="app-confirm-modal-title">
                        Desativar notificações?
                      </h3>
                      <p id="push-disable-description" className="app-confirm-modal-message">
                        Se desativar, você não receberá mais notificações neste aparelho.
                      </p>
                    </div>

                    <div className="app-modal-actions">
                      <button
                        type="button"
                        className="app-modal-secondary"
                        onClick={() => setDisableConfirmOpen(false)}
                        autoFocus
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="app-modal-submit is-warning"
                        onClick={() => {
                          setDisableConfirmOpen(false);
                          void push.disable();
                        }}
                      >
                        Desativar
                      </button>
                    </div>
                  </section>
                </div>,
                document.body
              )
            : null}
        </section>
      </section>
    </AppShell>
  );
}
