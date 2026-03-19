const MOBILE_CAMERA_DB_NAME = 'rastreio-mobile-camera';
const MOBILE_CAMERA_STORE_NAME = 'handoff';
const MOBILE_CAMERA_PENDING_PHOTO_KEY = 'pending-arrival-photo';
const MOBILE_CAMERA_MAX_AGE_MS = 1000 * 60 * 30;

type PendingArrivalPhotoRecord = {
  createdAt: number;
  confirmed?: boolean;
  file: Blob;
  fileName: string;
  mimeType: string;
};

export type ConsumedPendingArrivalPhoto = {
  confirmed: boolean;
  createdAt: number;
  file: File;
  handoffId: string;
};

function buildPendingPhotoStorageKey(handoffId?: string | null) {
  if (typeof handoffId === 'string' && handoffId.trim().length > 0) {
    return `${MOBILE_CAMERA_PENDING_PHOTO_KEY}:${handoffId.trim()}`;
  }

  return MOBILE_CAMERA_PENDING_PHOTO_KEY;
}

function ensureIndexedDb() {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    throw new Error('IndexedDB indisponivel neste navegador.');
  }

  return window.indexedDB;
}

function openMobileCameraDb() {
  const indexedDb = ensureIndexedDb();

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDb.open(MOBILE_CAMERA_DB_NAME, 1);

    request.onerror = () => {
      reject(request.error ?? new Error('Falha ao abrir o armazenamento local da camera.'));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MOBILE_CAMERA_STORE_NAME)) {
        db.createObjectStore(MOBILE_CAMERA_STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

async function runStoreRequest<T>(mode: IDBTransactionMode, handler: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openMobileCameraDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(MOBILE_CAMERA_STORE_NAME, mode);
    const store = transaction.objectStore(MOBILE_CAMERA_STORE_NAME);
    const request = handler(store);

    request.onerror = () => {
      reject(request.error ?? new Error('Falha na operacao do armazenamento local da camera.'));
    };

    transaction.oncomplete = () => {
      resolve(request.result);
      db.close();
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Falha ao concluir a operacao do armazenamento local da camera.'));
      db.close();
    };
  });
}

export async function savePendingArrivalPhoto(file: File, options?: { confirmed?: boolean; handoffId?: string }) {
  const handoffId =
    typeof options?.handoffId === 'string' && options.handoffId.trim().length > 0 ? options.handoffId.trim() : 'default';

  await runStoreRequest('readwrite', (store) =>
    store.put(
      {
        createdAt: Date.now(),
        confirmed: options?.confirmed ?? false,
        file,
        fileName: file.name || 'arrival-photo.jpg',
        mimeType: file.type || 'image/jpeg'
      } satisfies PendingArrivalPhotoRecord,
      buildPendingPhotoStorageKey(handoffId)
    )
  );

  console.info('STORAGE_SAVE', {
    handoffId,
    confirmed: options?.confirmed ?? false,
    fileName: file.name || 'arrival-photo.jpg',
    fileSize: file.size
  });

  return handoffId;
}

export async function clearPendingArrivalPhoto(handoffId?: string | null) {
  const normalizedHandoffId =
    typeof handoffId === 'string' && handoffId.trim().length > 0 ? handoffId.trim() : 'default';
  await runStoreRequest('readwrite', (store) => store.delete(buildPendingPhotoStorageKey(handoffId)));
  console.info('STORAGE_CLEAR', { handoffId: normalizedHandoffId });
}

export async function readPendingArrivalPhoto(handoffId?: string | null) {
  const normalizedHandoffId =
    typeof handoffId === 'string' && handoffId.trim().length > 0 ? handoffId.trim() : 'default';
  const stored = await runStoreRequest<PendingArrivalPhotoRecord | undefined>('readonly', (store) =>
    store.get(buildPendingPhotoStorageKey(normalizedHandoffId))
  );

  if (!stored) {
    console.warn('STORAGE_READ', { handoffId: normalizedHandoffId, found: false });
    return null;
  }

  if (Date.now() - stored.createdAt > MOBILE_CAMERA_MAX_AGE_MS) {
    console.warn('STORAGE_READ', { handoffId: normalizedHandoffId, found: false, expired: true });
    await clearPendingArrivalPhoto(normalizedHandoffId);
    return null;
  }

  const fileLike = stored.file;
  if (fileLike instanceof File) {
    console.info('STORAGE_READ', {
      handoffId: normalizedHandoffId,
      found: true,
      confirmed: stored.confirmed ?? true,
      fileName: fileLike.name,
      fileSize: fileLike.size
    });
    return {
      confirmed: stored.confirmed ?? true,
      createdAt: stored.createdAt,
      file: fileLike,
      handoffId: normalizedHandoffId
    } satisfies ConsumedPendingArrivalPhoto;
  }

  console.info('STORAGE_READ', {
    handoffId: normalizedHandoffId,
    found: true,
    confirmed: stored.confirmed ?? true,
    fileName: stored.fileName || 'arrival-photo.jpg'
  });
  return {
    confirmed: stored.confirmed ?? true,
    createdAt: stored.createdAt,
    file: new File([fileLike], stored.fileName || 'arrival-photo.jpg', {
      type: stored.mimeType || fileLike.type || 'image/jpeg',
      lastModified: stored.createdAt
    }),
    handoffId: normalizedHandoffId
  } satisfies ConsumedPendingArrivalPhoto;
}

export async function consumePendingArrivalPhoto(handoffId?: string | null) {
  const stored = await readPendingArrivalPhoto(handoffId);
  if (!stored) {
    return null;
  }

  await clearPendingArrivalPhoto(stored.handoffId);
  return stored;
}
