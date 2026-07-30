import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOOT_MARK_AWAY_MS,
  readLastSeen,
  shouldShowBootMark,
  touchLastSeen,
} from '../lib/boot/last-seen.ts';

// F5 do ciclo SN — o carimbo que decide se a abertura conta como ENTRADA
// (SN-D2 / §3.5). Logica pura, mas depende de `window.localStorage`, entao cada
// caso instala um duble. E o primeiro teste do projeto a fingir `window`.

const STORAGE_KEY = 'rastreio.last-seen.v1';

/**
 * `ok`     — storage funcionando (devolve o Map por tras, pra plantar valores).
 * `throws` — storage que lanca em tudo (modo privado, quota).
 * `none`   — sem `window` (SSR).
 *
 * As funcoes conferem `typeof window` na CHAMADA, nao no import: instalar o
 * duble no corpo do teste basta.
 */
function installWindow(mode: 'ok' | 'throws' | 'none'): Map<string, string> {
  const store = new Map<string, string>();
  const scope = globalThis as { window?: unknown };

  if (mode === 'none') {
    delete scope.window;
    return store;
  }

  const localStorage =
    mode === 'throws'
      ? {
          getItem(): string | null {
            throw new Error('SecurityError: storage indisponivel');
          },
          setItem(): void {
            throw new Error('QuotaExceededError');
          },
        }
      : {
          getItem: (key: string): string | null => store.get(key) ?? null,
          setItem: (key: string, value: string): void => {
            store.set(key, value);
          },
        };

  scope.window = { localStorage };
  return store;
}

test.afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

test('sem window (SSR) nao mostra', () => {
  installWindow('none');
  assert.equal(readLastSeen(), undefined);
  assert.equal(shouldShowBootMark(Date.now()), false);
});

test('storage que lanca (modo privado) NAO mostra', () => {
  installWindow('throws');
  assert.equal(readLastSeen(), undefined);
  // 🔴 O caso que justifica o `undefined` separado do `null`: ali o carimbo
  // nunca persistiria, entao mostrar significaria a tela em TODA abertura.
  assert.equal(shouldShowBootMark(Date.now()), false);
  // E gravar tambem nao pode derrubar o app.
  assert.doesNotThrow(() => touchLastSeen(Date.now()));
});

test('sem registro (1a abertura depois de instalar) MOSTRA', () => {
  installWindow('ok');
  assert.equal(readLastSeen(), null);
  assert.equal(shouldShowBootMark(Date.now()), true);
});

test('carimbo corrompido conta como sem registro', () => {
  const store = installWindow('ok');
  store.set(STORAGE_KEY, 'ontem de manha');
  assert.equal(readLastSeen(), null);
  assert.equal(shouldShowBootMark(Date.now()), true);
});

test('pouco tempo fora nao mostra; mais que o limiar mostra', () => {
  installWindow('ok');
  const now = 1_700_000_000_000;

  touchLastSeen(now - (BOOT_MARK_AWAY_MS - 60_000)); // 1min a menos que 4h
  assert.equal(shouldShowBootMark(now), false);

  touchLastSeen(now - (BOOT_MARK_AWAY_MS + 60_000)); // 1min a mais que 4h
  assert.equal(shouldShowBootMark(now), true);
});

test('exatamente no limiar nao mostra (a comparacao e estrita)', () => {
  installWindow('ok');
  const now = 1_700_000_000_000;
  touchLastSeen(now - BOOT_MARK_AWAY_MS);
  assert.equal(shouldShowBootMark(now), false);
});

test('relogio do aparelho para tras nao inventa uma entrada', () => {
  installWindow('ok');
  const now = 1_700_000_000_000;
  // Carimbo no FUTURO (ajuste de fuso/hora): a diferenca fica negativa.
  touchLastSeen(now + 10 * BOOT_MARK_AWAY_MS);
  assert.equal(shouldShowBootMark(now), false);
});

test('touchLastSeen sobrescreve o carimbo anterior', () => {
  installWindow('ok');
  touchLastSeen(1_000);
  assert.equal(readLastSeen(), 1_000);
  touchLastSeen(2_000);
  assert.equal(readLastSeen(), 2_000);
});
