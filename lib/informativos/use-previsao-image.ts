// Recebe o print da previsao do tempo que o usuario cola/arrasta/escolhe.
//
// NADA sobe para o servidor (P1): o arquivo vira um objectURL de MESMA ORIGEM,
// e desenhado no canvas e sai no PNG. Por ser mesma origem, o canvas nao e
// contaminado e o toBlob() continua funcionando — era exatamente o risco que uma
// imagem de CDN externo traria.
//
// A regra de magic bytes do CLAUDE.md (item 5) NAO se aplica aqui: ela amarra a
// validacao a src/uploads/, onde a fronteira e o servidor e o arquivo e
// persistido. Aqui a fronteira e o navegador do proprio usuario e nada e salvo.
// De todo modo o img.decode() e um gate MAIS FORTE que magic bytes — um header
// PNG valido com corpo corrompido passa no magic bytes e falha no decode.

import { useCallback, useEffect, useRef, useState } from 'react';

import { type Size } from './story-layout.ts';

export interface PrevisaoImage {
  /** objectURL vivo — serve de miniatura no form e de asset do canvas. */
  url: string;
  /** Dimensoes naturais, o que o layout precisa para o encaixe. */
  size: Size;
  image: HTMLImageElement;
}

export interface UsePrevisaoImage {
  previsao: PrevisaoImage | null;
  error: string | null;
  accept: (file: File | null | undefined) => Promise<void>;
  clear: () => void;
}

export function usePrevisaoImage(): UsePrevisaoImage {
  const [previsao, setPrevisao] = useState<PrevisaoImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const revoke = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  // Sem isto vaza um blob a cada Ctrl+V.
  useEffect(() => revoke, [revoke]);

  const clear = useCallback(() => {
    revoke();
    setPrevisao(null);
    setError(null);
  }, [revoke]);

  const accept = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        setError('Escolha uma imagem — o print da previsão do tempo.');
        return;
      }
      // SVG nao tem tamanho intrinseco (decodifica 0x0) e pode referenciar
      // recurso externo. O encaixe precisa das dimensoes reais.
      if (file.type === 'image/svg+xml') {
        setError('Esse formato não serve. Cole um print (PNG ou JPEG).');
        return;
      }

      const url = URL.createObjectURL(file);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const size = { w: image.naturalWidth, h: image.naturalHeight };
        if (!(size.w > 0) || !(size.h > 0)) {
          throw new Error('imagem sem dimensoes');
        }
        revoke();
        urlRef.current = url;
        setPrevisao({ url, size, image });
        setError(null);
      } catch {
        URL.revokeObjectURL(url);
        setError('Não foi possível ler a imagem. Tente outro arquivo.');
      }
    },
    [revoke]
  );

  return { previsao, error, accept, clear };
}
