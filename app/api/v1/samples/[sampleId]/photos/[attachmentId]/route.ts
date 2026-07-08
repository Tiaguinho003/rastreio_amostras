import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs/promises';

import { getBackendApi } from '../../../../_lib/backend-api';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'data/uploads');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sampleId: string; attachmentId: string }> }
) {
  const params = await context.params;

  if (!UUID_RE.test(params.sampleId) || !UUID_RE.test(params.attachmentId)) {
    return NextResponse.json({ error: { message: 'Invalid parameters' } }, { status: 400 });
  }

  // Autorizacao centralizada: a foto agora exige sessao (LDT-D4). O metodo do
  // backend resolve o ator (401 sem sessao, 403 PROSPECTOR pela allowlist) e
  // devolve so o descritor do anexo; a leitura do arquivo fica aqui. Sem
  // PrismaClient por request — o backend reusa o cliente compartilhado.
  const descriptor = (await getBackendApi().getSampleAttachmentDescriptor({
    headers: Object.fromEntries(request.headers.entries()),
    params: { sampleId: params.sampleId, attachmentId: params.attachmentId },
    query: {},
    body: {},
  })) as { status: number; body: unknown };

  if (descriptor.status !== 200) {
    return NextResponse.json(descriptor.body, { status: descriptor.status });
  }

  const { storagePath, mimeType } = descriptor.body as { storagePath: string; mimeType: string };

  const absolutePath = path.join(UPLOADS_DIR, storagePath);
  const resolved = path.resolve(absolutePath);
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
    return NextResponse.json({ error: { message: 'Invalid path' } }, { status: 400 });
  }

  try {
    const buffer = await fs.readFile(resolved);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType || 'image/jpeg',
        'Cache-Control': 'private, max-age=3600, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: { message: 'Failed to read attachment' } }, { status: 500 });
  }
}
