import type { VisitClientKind, VisitFarmSize, VisitInterestLevel } from '../types';

// Caixa de saida dos informes de visita preenchidos sem internet.
// Cada envio offline vira 1 registro em IndexedDB (sobrevive a fechar o
// app) e e removido SOMENTE depois que o servidor confirmar o recebimento
// (ver visit-sync.ts). O id gerado no aparelho dobra como Idempotency-Key:
// reenvio apos falha no meio do caminho nunca duplica o informe.

export interface VisitOutboxPayload {
  /** Declaracao do prospector ("Ja e cliente" / "Cliente novo") — sem
      lookup; o vinculo real e curadoria do ADM/Cadastro no /resumo. */
  clientKind: VisitClientKind;
  /** Legado: presente apenas em entradas enfileiradas por versoes antigas
      do app (lookup de cliente no formulario). O backend segue aceitando. */
  clientId?: string | null;
  newClientName: string | null;
  newClientCity: string | null;
  newClientPhone: string | null;
  farmSize: VisitFarmSize;
  farmSizeNotes: string | null;
  interestLevel: VisitInterestLevel;
  interestNotes: string | null;
  sellsCurrently: boolean;
  sellsToWhom: string | null;
  /** Campo 5: observacoes gerais (discursivo, opcional). */
  generalNotes: string | null;
  /** Hora local do preenchimento — vai pro backend como capturedAt. */
  capturedAt: string;
}

export interface VisitOutboxEntry {
  /** UUID gerado no aparelho; usado como Idempotency-Key no reenvio. */
  id: string;
  /** Quem preencheu. O sync so envia entradas do usuario logado. */
  userId: string;
  payload: VisitOutboxPayload;
  capturedAt: string;
  attempts: number;
  lastError: string | null;
}

const DB_NAME = 'rastreio-offline';
const DB_VERSION = 1;
const STORE_NAME = 'visit-outbox';
const USER_INDEX = 'userId';

// Disparado sempre que a fila muda (entrada nova ou removida pelo sync).
// A pagina /informe escuta pra manter o contador de pendentes em dia.
export const VISIT_OUTBOX_CHANGED_EVENT = 'rastreio:visit-outbox-changed';

function emitOutboxChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(VISIT_OUTBOX_CHANGED_EVENT));
  }
}

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex(USER_INDEX, 'userId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir IndexedDB'));
  });
}

async function runRequest<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = work(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Operacao IndexedDB falhou'));
    });
  } finally {
    db.close();
  }
}

// Pede armazenamento persistente (best-effort, uma vez por sessao do app):
// reduz o risco de o navegador limpar a fila sob pressao de espaco.
let persistRequested = false;
function requestPersistentStorage(): void {
  if (persistRequested || typeof navigator === 'undefined') {
    return;
  }
  persistRequested = true;
  navigator.storage?.persist?.().catch(() => undefined);
}

/** Salva um informe na fila local. Lanca em ambiente sem IndexedDB ou
 * falha de quota — o caller avisa o usuario que NAO foi salvo. */
export async function addVisitToOutbox(entry: VisitOutboxEntry): Promise<void> {
  if (!isIndexedDbAvailable()) {
    throw new Error('IndexedDB indisponivel neste navegador');
  }

  requestPersistentStorage();
  await runRequest('readwrite', (store) => store.put(entry));
  emitOutboxChanged();
}

export async function listVisitOutbox(userId: string): Promise<VisitOutboxEntry[]> {
  if (!isIndexedDbAvailable()) {
    return [];
  }

  try {
    const entries = await runRequest<VisitOutboxEntry[]>('readonly', (store) =>
      store.index(USER_INDEX).getAll(userId)
    );
    return entries ?? [];
  } catch {
    return [];
  }
}

export async function countVisitOutbox(userId: string): Promise<number> {
  if (!isIndexedDbAvailable()) {
    return 0;
  }

  try {
    return await runRequest<number>('readonly', (store) => store.index(USER_INDEX).count(userId));
  } catch {
    return 0;
  }
}

export async function removeVisitFromOutbox(id: string): Promise<void> {
  if (!isIndexedDbAvailable()) {
    return;
  }

  await runRequest('readwrite', (store) => store.delete(id));
  emitOutboxChanged();
}

export async function updateVisitOutboxEntry(entry: VisitOutboxEntry): Promise<void> {
  if (!isIndexedDbAvailable()) {
    return;
  }

  try {
    await runRequest('readwrite', (store) => store.put(entry));
  } catch {
    // Metadado de tentativa e best-effort; a entrada original permanece.
  }
}
