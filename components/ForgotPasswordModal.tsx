'use client';

import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';

import { ApiError, requestPasswordReset, resetPasswordWithCode, verifyPasswordResetCode } from '../lib/api-client';
import { forgotPasswordRequestSchema, forgotPasswordResetSchema, forgotPasswordVerifyCodeSchema } from '../lib/form-schemas';

const OTP_LENGTH = 6;

type ForgotPasswordStep = 'request' | 'verifyCode' | 'newPassword';

interface ForgotPasswordModalProps {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function ForgotPasswordModal({ open, onClose, returnFocusRef }: ForgotPasswordModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const successTimerRef = useRef<number | null>(null);
  const lastOtpValidationRef = useRef<string | null>(null);

  const [step, setStep] = useState<ForgotPasswordStep>('request');
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(() => Array.from({ length: OTP_LENGTH }, () => ''));
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [closingAfterSuccess, setClosingAfterSuccess] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = loading || closingAfterSuccess;
  const otpValue = useMemo(() => otpDigits.join(''), [otpDigits]);

  function resetOtp() {
    setOtpDigits(Array.from({ length: OTP_LENGTH }, () => ''));
    lastOtpValidationRef.current = null;
  }

  function resetState() {
    setStep('request');
    setEmail('');
    resetOtp();
    setVerifiedCode(null);
    setPassword('');
    setLoading(false);
    setClosingAfterSuccess(false);
    setMessage(null);
    setError(null);
  }

  function restoreFocus() {
    window.requestAnimationFrame(() => {
      returnFocusRef?.current?.focus();
    });
  }

  function handleClose() {
    if (busy) {
      return;
    }

    onClose();
    restoreFocus();
  }

  function focusOtpIndex(index: number) {
    window.requestAnimationFrame(() => {
      otpInputRefs.current[index]?.focus();
      otpInputRefs.current[index]?.select();
    });
  }

  function clearOtpAndFocusFirst() {
    resetOtp();
    focusOtpIndex(0);
  }

  async function verifyOtpCode(code: string) {
    setError(null);
    setMessage(null);

    const parsed = forgotPasswordVerifyCodeSchema.safeParse({ email, code });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Dados invalidos');
      clearOtpAndFocusFirst();
      return;
    }

    setLoading(true);
    try {
      await verifyPasswordResetCode(parsed.data.email, parsed.data.code);
      setVerifiedCode(parsed.data.code);
      setStep('newPassword');
      setMessage(null);
    } catch (cause) {
      setVerifiedCode(null);
      setError(cause instanceof ApiError ? cause.message : 'Falha ao validar codigo');
      clearOtpAndFocusFirst();
    } finally {
      setLoading(false);
    }
  }

  function updateOtpDigits(startIndex: number, rawValue: string) {
    const digits = rawValue.replace(/\D/g, '').slice(0, OTP_LENGTH - startIndex).split('');

    if (digits.length === 0) {
      setOtpDigits((current) => {
        const next = [...current];
        next[startIndex] = '';
        return next;
      });
      lastOtpValidationRef.current = null;
      return;
    }

    setOtpDigits((current) => {
      const next = [...current];
      let pointer = startIndex;

      for (const digit of digits) {
        if (pointer >= OTP_LENGTH) {
          break;
        }

        next[pointer] = digit;
        pointer += 1;
      }

      return next;
    });

    lastOtpValidationRef.current = null;

    const nextIndex = Math.min(startIndex + digits.length, OTP_LENGTH - 1);
    focusOtpIndex(nextIndex);
  }

  useEffect(() => {
    if (!open) {
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }

      resetState();
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const previousScrollbarGutter = document.documentElement.style.scrollbarGutter;
    const computedBodyPaddingRight = window.getComputedStyle(document.body).paddingRight;
    const bodyPaddingRight = Number.parseFloat(computedBodyPaddingRight || '0') || 0;
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);

    document.documentElement.style.scrollbarGutter = 'stable';
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${bodyPaddingRight + scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.documentElement.style.scrollbarGutter = previousScrollbarGutter;
    };
  }, [open]);

  useEffect(() => {
    if (!open || closingAfterSuccess) {
      return;
    }

    const shouldAutoFocus =
      typeof window === 'undefined'
        ? true
        : !window.matchMedia('(pointer: coarse)').matches && window.innerWidth > 900;

    if (!shouldAutoFocus) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      if (step === 'request') {
        emailInputRef.current?.focus();
      } else if (step === 'verifyCode') {
        otpInputRefs.current[0]?.focus();
      } else {
        passwordInputRef.current?.focus();
      }
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [closingAfterSuccess, open, step]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        handleClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [busy, open]);

  useEffect(() => {
    if (step !== 'verifyCode' || busy || otpValue.length !== OTP_LENGTH) {
      return;
    }

    if (lastOtpValidationRef.current === otpValue) {
      return;
    }

    lastOtpValidationRef.current = otpValue;

    void verifyOtpCode(otpValue);
  }, [busy, email, otpValue, step]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  async function handleRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const parsed = forgotPasswordRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Dados invalidos');
      return;
    }

    setLoading(true);
    try {
      await requestPasswordReset(parsed.data.email);
      setEmail(parsed.data.email);
      setVerifiedCode(null);
      resetOtp();
      setStep('verifyCode');
      setMessage(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao solicitar codigo');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const parsed = forgotPasswordResetSchema.safeParse({
      email,
      code: verifiedCode ?? '',
      password
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Dados invalidos');
      return;
    }

    setLoading(true);
    try {
      await resetPasswordWithCode(parsed.data.email, parsed.data.code, parsed.data.password);
      setMessage('Senha redefinida com sucesso. Voce ja pode entrar com a nova senha.');
      setClosingAfterSuccess(true);
      successTimerRef.current = window.setTimeout(() => {
        onClose();
        restoreFocus();
      }, 1200);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao redefinir senha');
    } finally {
      setLoading(false);
    }
  }

  function handleVerifySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy || otpValue.length !== OTP_LENGTH || lastOtpValidationRef.current === otpValue) {
      return;
    }

    lastOtpValidationRef.current = otpValue;
    void verifyOtpCode(otpValue);
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="login-modal-backdrop"
      onClick={() => {
        if (!busy) {
          handleClose();
        }
      }}
    >
      <section
        className="login-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="login-modal-header">
          <div className="login-modal-title-wrap">
            <h2 id={titleId} className="login-modal-title">
              {step === 'request' ? 'Recuperar senha' : step === 'verifyCode' ? 'Validar codigo' : 'Nova senha'}
            </h2>
            <p id={descriptionId} className="login-modal-description">
              {step === 'request'
                ? 'Use seu email para receber o codigo.'
                : step === 'verifyCode'
                  ? 'Digite os 6 numeros enviados ao seu email.'
                  : 'Defina sua nova senha para concluir.'}
            </p>
          </div>

          <button
            type="button"
            className="login-modal-close"
            onClick={handleClose}
            aria-label="Fechar modal"
            disabled={busy}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <form
          className="login-modal-form"
          onSubmit={step === 'request' ? handleRequest : step === 'verifyCode' ? handleVerifySubmit : handleReset}
        >
          <div className="login-modal-stage">
            {step === 'request' ? (
              <label className="login-modal-field">
                <span className="login-modal-label">Email</span>
                <input
                  ref={emailInputRef}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="seuemail@exemplo.com"
                  className="login-modal-input"
                  disabled={busy}
                />
              </label>
            ) : null}

            {step === 'verifyCode' ? (
              <div className="login-modal-otp-stage">
                <p className="login-modal-step-chip">{email}</p>

                <div className="login-modal-otp-grid">
                  {otpDigits.map((digit, index) => (
                    <input
                      key={`otp-${index}`}
                      ref={(element) => {
                        otpInputRefs.current[index] = element;
                      }}
                      value={digit}
                      onChange={(event) => updateOtpDigits(index, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Backspace') {
                          event.preventDefault();
                          lastOtpValidationRef.current = null;
                          if (otpDigits[index]) {
                            setOtpDigits((current) => {
                              const next = [...current];
                              next[index] = '';
                              return next;
                            });
                            return;
                          }

                          if (index > 0) {
                            setOtpDigits((current) => {
                              const next = [...current];
                              next[index - 1] = '';
                              return next;
                            });
                            focusOtpIndex(index - 1);
                          }
                          return;
                        }

                        if (event.key === 'ArrowLeft' && index > 0) {
                          event.preventDefault();
                          focusOtpIndex(index - 1);
                        }

                        if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
                          event.preventDefault();
                          focusOtpIndex(index + 1);
                        }
                      }}
                      onFocus={(event) => event.currentTarget.select()}
                      onPaste={(event) => {
                        const pastedDigits = event.clipboardData.getData('text').replace(/\D/g, '');
                        if (!pastedDigits) {
                          return;
                        }

                        event.preventDefault();
                        updateOtpDigits(index, pastedDigits);
                      }}
                      inputMode="numeric"
                      autoComplete={index === 0 ? 'one-time-code' : 'off'}
                      pattern="[0-9]*"
                      maxLength={1}
                      className="login-modal-otp-input"
                      disabled={busy}
                      aria-label={`Digito ${index + 1} do codigo`}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {step === 'newPassword' ? (
              <div className="login-modal-password-stage">
                <p className="login-modal-step-chip">{email}</p>

                <label className="login-modal-field">
                  <span className="login-modal-label">Nova senha</span>
                  <input
                    ref={passwordInputRef}
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Minimo de 8 caracteres"
                    className="login-modal-input"
                    disabled={busy}
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="login-modal-feedback" aria-live="polite">
            {error ? <p className="error login-modal-feedback-text">{error}</p> : null}
            {!error && message ? <p className="success login-modal-feedback-text">{message}</p> : null}
          </div>

          <div className="login-modal-submit-slot">
            {step === 'request' || step === 'newPassword' ? (
              <button type="submit" className="login-modal-submit" disabled={busy}>
                {loading
                  ? 'Processando...'
                  : closingAfterSuccess
                    ? 'Concluindo...'
                    : step === 'request'
                      ? 'Enviar codigo'
                      : 'Redefinir senha'}
              </button>
            ) : (
              <div className="login-modal-submit-placeholder" aria-hidden="true" />
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
