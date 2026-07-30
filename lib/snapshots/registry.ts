// F3 do ciclo SN — o registro de chaves de snapshot (SN-D9).
//
// O problema que isto mata: a limpeza no logout era uma LISTA HARDCODED dentro
// do provider de auth. Cada pagina nova exigia lembrar de editar aquela lista, e
// esquecer nao quebra nada na hora — so deixa o snapshot de um usuario vivo pro
// proximo login. Num PWA que sobrevive ao logout, isso e a lista de outra
// pessoa aparecendo na primeira pintura.
//
// Agora a chave nasce AQUI e o logout itera o registro. Pagina nova = uma linha
// neste objeto, e a limpeza vem de graca.

export const SNAPSHOT_KEYS = {
  samples: 'samples-list-snapshot-v3',
  clients: 'clients-list-snapshot-v3',
  clientsCadastros: 'clients-list-snapshot-cad-v3',
  contratos: 'contratos-list-snapshot-v1',
  financeiro: 'financeiro-list-snapshot-v1',
  relatorios: 'relatorios-list-snapshot-v1',
  users: 'users-list-snapshot-v1',
} as const;

export type SnapshotKey = (typeof SNAPSHOT_KEYS)[keyof typeof SNAPSHOT_KEYS];

/** Janela padrao de validade (§5.2 do doc). O ClientsBrowser mantem os 10min
 *  proprios dele, de antes do ciclo — nao foi mexido de proposito. */
export const SNAPSHOT_TTL_MS = 30 * 60 * 1000;

/**
 * Espera do save CONTINUO. As paginas re-salvam a cada mudanca de lista/scroll;
 * sem debounce isso seria um `JSON.stringify` da lista inteira por rolagem.
 */
export const SNAPSHOT_WRITE_DEBOUNCE_MS = 400;

/** Todo snapshot carrega a hora do ultimo save — e o que o TTL le. */
export interface SnapshotEnvelope {
  savedAt: number;
}

/**
 * Leitura PURA: nao consome o snapshot. A remocao e sempre explicita
 * (`clearSnapshot`), porque a pagina re-salva continuamente enquanto o usuario
 * esta nela — consumir na leitura perderia o estado no primeiro refetch.
 *
 * Devolve `null` (e limpa) se estiver vencido, malformado ou de versao antiga.
 */
export function readSnapshot<T extends SnapshotEnvelope>(
  key: SnapshotKey,
  ttlMs: number = SNAPSHOT_TTL_MS
): T | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as T;
    if (!parsed || typeof parsed.savedAt !== 'number') {
      return null;
    }

    if (Date.now() - parsed.savedAt > ttlMs) {
      clearSnapshot(key);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeSnapshot<T extends SnapshotEnvelope>(key: SnapshotKey, value: T): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota ou modo privado: snapshot e otimizacao, nunca bloqueia o fluxo.
  }
}

export function clearSnapshot(key: SnapshotKey): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Best-effort.
  }
}

/**
 * Limpa TODOS os snapshots. Chamado no logout: num PWA que sobrevive a troca de
 * usuario, snapshot que fica pra tras e a lista de outra pessoa na primeira
 * pintura do proximo login.
 */
export function clearAllSnapshots(): void {
  Object.values(SNAPSHOT_KEYS).forEach(clearSnapshot);
}
