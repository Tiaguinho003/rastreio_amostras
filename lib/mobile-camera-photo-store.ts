const MOBILE_CAMERA_DB_NAME = 'rastreio-mobile-camera';
const MOBILE_CAMERA_STORE_NAME = 'handoff';
const MOBILE_CAMERA_PENDING_PHOTO_KEY = 'pending-arrival-photo';
const MOBILE_CAMERA_MAX_AGE_MS = 1000 * 60 * 30;

type PendingArrivalPhotoRecord = {
  createdAt: number;
  file: Blob;
  fileName: string;
  mimeType: string;
};

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

export async function savePendingArrivalPhoto(file: File) {
  await runStoreRequest('readwrite', (store) =>
    store.put(
      {
        createdAt: Date.now(),
        file,
        fileName: file.name || 'arrival-photo.jpg',
        mimeType: file.type || 'image/jpeg'
      } satisfies PendingArrivalPhotoRecord,
      MOBILE_CAMERA_PENDING_PHOTO_KEY
    )
  );
}

export async function clearPendingArrivalPhoto() {
  await runStoreRequest('readwrite', (store) => store.delete(MOBILE_CAMERA_PENDING_PHOTO_KEY));
}

export async function consumePendingArrivalPhoto() {
  const stored = await runStoreRequest<PendingArrivalPhotoRecord | undefined>('readonly', (store) =>
    store.get(MOBILE_CAMERA_PENDING_PHOTO_KEY)
  );

  if (!stored) {
    return null;
  }

  await clearPendingArrivalPhoto();

  if (Date.now() - stored.createdAt > MOBILE_CAMERA_MAX_AGE_MS) {
    return null;
  }

  const fileLike = stored.file;
  if (fileLike instanceof File) {
    return fileLike;
  }

  return new File([fileLike], stored.fileName || 'arrival-photo.jpg', {
    type: stored.mimeType || fileLike.type || 'image/jpeg',
    lastModified: stored.createdAt
  });
}
