// F5 do ciclo SN — o carimbo de "visto por ultimo" (SN-D2 / §3.5).
//
// A splash de entrada nova nao e um loader: e apresentacao de marca, e por isso
// so aparece quando a abertura e MESMO uma entrada — depois de um tempo fora, e
// nao a cada volta de segundo plano.
//
// 🔴 Por que a regra de tempo existe: no iOS o sistema mata o processo do PWA
// com frequencia, entao toda volta pro app vira um DOCUMENTO NOVO. Sem a regra,
// trocar pro WhatsApp por um minuto ja traria a tela de volta — que e
// exatamente a irritacao que a F1 tirou ao apagar o splash antigo.
//
// Logica pura, sem React, no molde de `lib/navigation/nav-progress.ts`.

const STORAGE_KEY = 'rastreio.last-seen.v1';

/** Tempo fora a partir do qual a abertura conta como ENTRADA. */
export const BOOT_MARK_AWAY_MS = 4 * 60 * 60 * 1000;

/**
 * `number`    — carimbo valido.
 * `null`      — storage acessivel, mas SEM registro (1a abertura, ou apagado).
 * `undefined` — storage indisponivel (modo privado, quota, SSR).
 *
 * 🔴 A distincao entre os dois ultimos e o motivo deste arquivo existir, e ela
 * decide o comportamento: sem registro a tela DEVE aparecer (e a primeira
 * abertura depois de instalar, o momento de marca certo); sem storage ela NAO
 * pode, porque ali o carimbo nunca persistiria e a tela voltaria em TODA
 * abertura — a irritacao que a regra de tempo veio evitar.
 */
export function readLastSeen(): number | null | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return undefined;
  }

  if (raw === null) {
    return null;
  }

  const parsed = Number(raw);
  // Carimbo corrompido (outra versao do app, edicao manual) cai como "sem
  // registro": o storage responde, so o valor nao serve.
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Marca o instante em que o app foi visto. Chamado na montagem e ao sair. */
export function touchLastSeen(now: number = Date.now()): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    // Quota/modo privado: o carimbo e best-effort. Sem ele, `readLastSeen`
    // devolve `undefined` e a tela nao aparece — que e o lado seguro.
  }
}

/** A abertura conta como ENTRADA? */
export function shouldShowBootMark(now: number = Date.now()): boolean {
  const lastSeen = readLastSeen();

  if (lastSeen === undefined) {
    return false;
  }

  if (lastSeen === null) {
    return true;
  }

  // Relogio do aparelho para tras (fuso, ajuste manual) daria uma diferenca
  // negativa; tratar como "acabou de ver" e o certo — nao inventar uma entrada.
  return now - lastSeen > BOOT_MARK_AWAY_MS;
}
