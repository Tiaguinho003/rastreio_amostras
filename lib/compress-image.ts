const DEFAULT_MAX_DIMENSION_HQ = 3072;
const DEFAULT_MAX_DIMENSION_LEGACY = 1920;
const DEFAULT_QUALITY_HQ = 0.95;
const DEFAULT_QUALITY_LEGACY = 0.88;

interface CompressImageOptions {
  maxDimension?: number;
  quality?: number;
}

interface DeviceCaps {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  highQualityEnabled?: boolean;
}

export function isHighQualityEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PHOTO_HIGH_QUALITY !== 'false';
}

export function pickMaxDimensionFromEnv(caps: DeviceCaps): number {
  if (caps.highQualityEnabled === false) return DEFAULT_MAX_DIMENSION_LEGACY;
  const mem = caps.deviceMemory ?? 8;
  const cores = caps.hardwareConcurrency ?? 8;
  if (mem <= 2) return 2048;
  if (mem <= 4 && cores <= 4) return 2560;
  return DEFAULT_MAX_DIMENSION_HQ;
}

export function pickQualityFromEnv(caps: Pick<DeviceCaps, 'highQualityEnabled'>): number {
  return caps.highQualityEnabled === false ? DEFAULT_QUALITY_LEGACY : DEFAULT_QUALITY_HQ;
}

function pickMaxDimension(): number {
  const hq = isHighQualityEnabled();
  if (typeof navigator === 'undefined') {
    return hq ? DEFAULT_MAX_DIMENSION_HQ : DEFAULT_MAX_DIMENSION_LEGACY;
  }
  return pickMaxDimensionFromEnv({
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    highQualityEnabled: hq,
  });
}

function pickQuality(): number {
  return pickQualityFromEnv({ highQualityEnabled: isHighQualityEnabled() });
}

interface DecodedImage {
  bitmap: ImageBitmap | null;
  image: HTMLImageElement | null;
  width: number;
  height: number;
  cleanup: () => void;
}

async function decodeImage(file: Blob): Promise<DecodedImage | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return {
      bitmap,
      image: null,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  } catch {
    // Fall through to HTMLImageElement path — Safari decodes HEIC via OS here even when
    // createImageBitmap fails.
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      bitmap: null,
      image: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function createEncodingCanvas(
  width: number,
  height: number
): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } | null {
  let canvas: OffscreenCanvas;
  try {
    canvas = new OffscreenCanvas(width, height);
  } catch {
    return null;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

export async function compressImage(file: File, options?: CompressImageOptions): Promise<File> {
  const maxDimension = options?.maxDimension ?? pickMaxDimension();
  const quality = options?.quality ?? pickQuality();

  const decoded = await decodeImage(file);
  if (!decoded) return file;

  const { bitmap, image, width: srcWidth, height: srcHeight, cleanup } = decoded;
  if (!srcWidth || !srcHeight) {
    cleanup();
    return file;
  }

  let targetWidth = srcWidth;
  let targetHeight = srcHeight;
  if (srcWidth > maxDimension || srcHeight > maxDimension) {
    if (srcWidth >= srcHeight) {
      targetWidth = maxDimension;
      targetHeight = Math.round((srcHeight / srcWidth) * maxDimension);
    } else {
      targetHeight = maxDimension;
      targetWidth = Math.round((srcWidth / srcHeight) * maxDimension);
    }
  }

  const encoder = createEncodingCanvas(targetWidth, targetHeight);
  if (!encoder) {
    cleanup();
    return file;
  }

  const { canvas, ctx } = encoder;
  const source: CanvasImageSource = bitmap ?? image!;
  try {
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
  } catch {
    cleanup();
    return file;
  }
  cleanup();

  let blob: Blob;
  try {
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  } catch {
    return file;
  }

  if (blob.size >= file.size) {
    return file;
  }

  const compressedName = file.name.replace(/\.[^.]+$/, '.jpg');
  return new File([blob], compressedName, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
