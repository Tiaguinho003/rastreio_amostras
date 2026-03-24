const DEFAULT_MAX_DIMENSION = 1920;
const DEFAULT_QUALITY = 0.8;
const COMPRESSION_THRESHOLD_BYTES = 1024 * 1024; // 1 MB

interface CompressImageOptions {
  maxDimension?: number;
  quality?: number;
}

export async function compressImage(file: File, options?: CompressImageOptions): Promise<File> {
  if (file.size <= COMPRESSION_THRESHOLD_BYTES) {
    return file;
  }

  const maxDimension = options?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options?.quality ?? DEFAULT_QUALITY;

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  let targetWidth = width;
  let targetHeight = height;

  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      targetWidth = maxDimension;
      targetHeight = Math.round((height / width) * maxDimension);
    } else {
      targetHeight = maxDimension;
      targetWidth = Math.round((width / height) * maxDimension);
    }
  }

  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }

  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });

  if (blob.size >= file.size) {
    return file;
  }

  const compressedName = file.name.replace(/\.[^.]+$/, '.jpg');
  return new File([blob], compressedName, { type: 'image/jpeg', lastModified: Date.now() });
}
