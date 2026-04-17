export type ShareOrDownloadResult = 'shared' | 'downloaded' | 'cancelled';

interface ShareOrDownloadOptions {
  mimeType?: string;
  shareTitle?: string;
  shareText?: string;
}

export async function shareOrDownloadFile(
  blob: Blob,
  filename: string,
  options?: ShareOrDownloadOptions
): Promise<ShareOrDownloadResult> {
  const mimeType = options?.mimeType ?? blob.type ?? 'application/octet-stream';
  const file = new File([blob], filename, { type: mimeType });

  const canUseShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });

  if (canUseShare) {
    try {
      await navigator.share({
        files: [file],
        ...(options?.shareTitle ? { title: options.shareTitle } : {}),
        ...(options?.shareText ? { text: options.shareText } : {}),
      });
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return 'cancelled';
      }
      throw error;
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
  return 'downloaded';
}
