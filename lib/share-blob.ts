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

  downloadFile(blob, filename);
  return 'downloaded';
}

export interface ShareFileInput {
  blob: Blob;
  filename: string;
  mimeType?: string;
}

interface ShareOrDownloadFilesOptions {
  shareTitle?: string;
  shareText?: string;
  /** Respiro entre os downloads no fallback. */
  downloadGapMs?: number;
}

const DEFAULT_DOWNLOAD_GAP_MS = 400;

/**
 * Entrega VARIOS arquivos de uma vez.
 *
 * No celular, a Web Share API aceita um array e abre UMA folha de
 * compartilhamento com tudo — que e o mais proximo de "os dois juntos" que a
 * plataforma permite. Se o canShare recusar o conjunto (alguns Safaris limitam
 * a 1 arquivo), cai para downloads em sequencia.
 *
 * AVISO sobre o fallback: a partir do 2o download na mesma origem o Chrome
 * pergunta "Fazer download de varios arquivos?". Nao ha API para detectar a
 * negacao, entao o 'downloaded' devolvido mente se o usuario negar. Por isso a
 * tela tambem oferece um "Baixar" por peca: cada botao e um gesto proprio e nao
 * dispara o prompt.
 *
 * Deliberadamente NAO faz o shareOrDownloadFile delegar para ca: o singular
 * serve o contrato de venda, o laudo e o envio fisico, e nao tem teste nenhum —
 * a duplicacao e mais barata que o risco.
 */
export async function shareOrDownloadFiles(
  inputs: ShareFileInput[],
  options?: ShareOrDownloadFilesOptions
): Promise<ShareOrDownloadResult> {
  if (inputs.length === 0) {
    throw new Error('shareOrDownloadFiles: nenhum arquivo');
  }

  const files = inputs.map(
    ({ blob, filename, mimeType }) =>
      new File([blob], filename, { type: mimeType ?? blob.type ?? 'application/octet-stream' })
  );

  const canUseShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files });

  if (canUseShare) {
    try {
      await navigator.share({
        files,
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

  const gap = options?.downloadGapMs ?? DEFAULT_DOWNLOAD_GAP_MS;
  for (let i = 0; i < inputs.length; i += 1) {
    downloadFile(inputs[i].blob, inputs[i].filename);
    if (i < inputs.length - 1 && gap > 0) {
      await new Promise((resolve) => setTimeout(resolve, gap));
    }
  }
  return 'downloaded';
}

// Download direto (salvar no dispositivo), sem tentar compartilhar. Usado quando
// o usuario escolhe "Baixar" explicitamente (vs "Exportar" = compartilhar).
export function downloadFile(blob: Blob, filename: string): void {
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
}
