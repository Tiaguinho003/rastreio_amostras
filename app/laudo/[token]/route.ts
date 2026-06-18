import { NextRequest, NextResponse } from 'next/server';

import { getBackendApi } from '../../api/v1/_lib/backend-api';

// Rota PUBLICA do laudo (Etiqueta de Envio, fase 4): o destinatario escaneia o
// QR e abre /laudo/<token> sem login. Token valido => stream do PDF congelado
// INLINE (D6: abre no navegador). Invalido (revogado/expirado/inexistente) =>
// pagina HTML minima de indisponivel (D10). Sempre dinamica (valida o token + le
// o arquivo a cada acesso) e nao indexavel.
export const dynamic = 'force-dynamic';

type ReportBody = {
  buffer?: Buffer;
  contentType?: string;
  fileName?: string;
};

function unavailableHtml(title: string, message: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${title} — Safras &amp; Negócios</title>
    <style>
      :root {
        color-scheme: light;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #f9f8f3;
        color: #2e3a32;
      }
      .card {
        max-width: 420px;
        width: 100%;
        background: #fff;
        border: 1px solid #e3e6e1;
        border-radius: 16px;
        padding: 40px 28px;
        text-align: center;
        box-shadow: 0 10px 30px rgba(16, 44, 28, 0.08);
      }
      .badge {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        margin: 0 auto 20px;
        background: #eaf1ec;
      }
      .badge svg {
        width: 28px;
        height: 28px;
      }
      h1 {
        font-size: 20px;
        margin: 0 0 10px;
        color: #19432b;
      }
      p {
        font-size: 15px;
        line-height: 1.5;
        margin: 0;
        color: #55615a;
      }
      .brand {
        margin-top: 28px;
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #8a948c;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="badge" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#19432b"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <path d="M12 16h.01" />
        </svg>
      </div>
      <h1>${title}</h1>
      <p>${message}</p>
      <div class="brand">Safras &amp; Negócios</div>
    </main>
  </body>
</html>`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const params = await context.params;

  const api = getBackendApi();
  const result = await api.servePublicReportShare({
    headers: Object.fromEntries(request.headers.entries()),
    params: { token: params.token },
    query: {},
    body: {},
  });

  if (result.status === 200) {
    const payload = result.body as ReportBody;
    const pdfBytes = Buffer.isBuffer(payload.buffer)
      ? payload.buffer
      : Buffer.from(payload.buffer ?? []);
    const fileName =
      typeof payload.fileName === 'string' && payload.fileName.trim()
        ? payload.fileName
        : 'laudo.pdf';

    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        // inline => o navegador abre o PDF (D6: "apenas o PDF").
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Content-Length': String(pdfBytes.byteLength),
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  // Caminho de erro (D10): pagina minima com a marca. 429 = rate-limit;
  // 410 = revogado/expirado; demais (404/422/500) = nao encontrado.
  let status: number;
  let title: string;
  let message: string;
  if (result.status === 429) {
    status = 429;
    title = 'Muitas tentativas';
    message = 'Você fez muitas solicitações em pouco tempo. Aguarde um instante e tente novamente.';
  } else if (result.status === 410) {
    status = 410;
    title = 'Laudo indisponível';
    message = 'Este laudo não está mais disponível. Ele pode ter sido revogado ou ter expirado.';
  } else {
    status = 404;
    title = 'Laudo não encontrado';
    message = 'Não encontramos um laudo para este link. Confira o QR code ou solicite um novo.';
  }

  return new NextResponse(unavailableHtml(title, message), {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
