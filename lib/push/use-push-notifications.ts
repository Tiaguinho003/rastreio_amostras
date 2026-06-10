'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ApiError,
  deletePushSubscription,
  getPushConfig,
  savePushSubscription,
} from '../api-client';
import { isIOS, isStandalone } from '../platform';
import type { SessionData } from '../types';

// Estado e acoes do toggle de notificacoes nativas (card no Perfil).
//
// Regras de plataforma que moldam este hook:
//   * iOS so suporta Web Push em PWA INSTALADA na tela de inicio (16.4+) —
//     fora dela o estado e `needs-install`, nunca um erro.
//   * `Notification.requestPermission()` PRECISA rodar direto no gesto do
//     usuario (transient activation). Por isso a public key e o registration
//     sao pre-carregados no mount: o enable() nao tem await de rede ANTES
//     do prompt.
//   * NUNCA usar `navigator.serviceWorker.ready` — sem SW registrado (dev,
//     primeiro load) a promise pendura pra sempre. getRegistration() +
//     timeout curto.

export type PushStatus =
  | 'loading'
  | 'unsupported'
  | 'needs-install'
  | 'permission-denied'
  | 'unavailable'
  | 'inactive'
  | 'active';

const REGISTRATION_TIMEOUT_MS = 3000;

function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

async function getRegistrationWithTimeout(): Promise<ServiceWorkerRegistration | null> {
  try {
    const registration = await Promise.race([
      navigator.serviceWorker.getRegistration(),
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), REGISTRATION_TIMEOUT_MS);
      }),
    ]);
    return registration ?? null;
  } catch {
    return null;
  }
}

// applicationServerKey precisa ser Uint8Array (Safari nao aceita a string
// base64url crua).
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(session: SessionData | null) {
  const [status, setStatus] = useState<PushStatus>('loading');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const publicKeyRef = useRef<string | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // Avaliacao inicial: suporte -> registration -> permissao -> config do
  // backend (public key + se ESTE endpoint esta inscrito pro usuario atual).
  useEffect(() => {
    if (!session) {
      return;
    }

    let active = true;

    async function evaluate() {
      if (!isPushSupported()) {
        if (isIOS() && !isStandalone()) {
          // iPhone no Safari "normal": da pra resolver instalando o app.
          setStatus('needs-install');
        } else {
          setStatus('unsupported');
        }
        return;
      }

      if (isIOS() && !isStandalone()) {
        setStatus('needs-install');
        return;
      }

      const registration = await getRegistrationWithTimeout();
      if (!active) {
        return;
      }

      if (!registration) {
        // Sem SW (dev, ou primeiro load antes do activate): sem como
        // inscrever. Tratamos como nao-suportado neste momento.
        setStatus('unsupported');
        return;
      }
      registrationRef.current = registration;

      if (Notification.permission === 'denied') {
        setStatus('permission-denied');
        return;
      }

      let endpoint: string | null = null;
      try {
        const subscription = await registration.pushManager.getSubscription();
        endpoint = subscription?.endpoint ?? null;
      } catch {
        endpoint = null;
      }

      try {
        const config = await getPushConfig(session!, endpoint);
        if (!active) {
          return;
        }

        publicKeyRef.current = config.publicKey;
        setStatus(
          config.subscribed && Notification.permission === 'granted' ? 'active' : 'inactive'
        );
      } catch (cause) {
        if (!active) {
          return;
        }

        if (cause instanceof ApiError && cause.status === 501) {
          setStatus('unavailable');
          return;
        }

        setErrorMessage('Não foi possível carregar o estado das notificações.');
        setStatus('inactive');
      }
    }

    void evaluate();
    return () => {
      active = false;
    };
  }, [session]);

  const enable = useCallback(async () => {
    if (!session || busy) {
      return;
    }

    const registration = registrationRef.current;
    const publicKey = publicKeyRef.current;
    if (!registration || !publicKey) {
      setErrorMessage('Notificações indisponíveis neste aparelho.');
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    try {
      // PRIMEIRA chamada do fluxo — precisa estar dentro do gesto.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'permission-denied' : 'inactive');
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('subscription incompleta');
      }

      await savePushSubscription(session, {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent,
      });

      setStatus('active');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 501) {
        setStatus('unavailable');
        return;
      }

      setErrorMessage(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível ativar as notificações. Tente novamente.'
      );
      setStatus('inactive');
    } finally {
      setBusy(false);
    }
  }, [busy, session]);

  const disable = useCallback(async () => {
    if (!session || busy) {
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    try {
      const registration = registrationRef.current;
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        // Backend primeiro (best-effort), depois o unsubscribe local SEMPRE.
        try {
          await deletePushSubscription(session, subscription.endpoint);
        } catch {
          // Sem rede/501: o prune por 404/410 limpa no proximo envio.
        }
        await subscription.unsubscribe().catch(() => undefined);
      }

      setStatus('inactive');
    } finally {
      setBusy(false);
    }
  }, [busy, session]);

  return { status, busy, errorMessage, enable, disable };
}
