import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs/promises';

import { getPrismaClient } from '../../../../../../../src/db/prisma-client.js';
import { executeBackend, readJsonBody } from '../../../../_lib/adapter';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'data/uploads');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{
    clientId: string;
    attachmentId: string;
  }>;
};

// Download do anexo. Mesmo padrao da foto da amostra: acesso por UUIDs
// (client + attachment) + guard de path-traversal. Serve inline.
export async function GET(_request: NextRequest, context: RouteContext) {
  const params = await context.params;

  if (!UUID_RE.test(params.clientId) || !UUID_RE.test(params.attachmentId)) {
    return NextResponse.json({ error: { message: 'Invalid parameters' } }, { status: 400 });
  }

  try {
    const prisma = getPrismaClient();
    const attachment = await prisma.clientAttachment.findFirst({
      where: { id: params.attachmentId, clientId: params.clientId },
    });

    if (!attachment || !attachment.storagePath) {
      return NextResponse.json({ error: { message: 'Attachment not found' } }, { status: 404 });
    }

    const resolved = path.resolve(path.join(UPLOADS_DIR, attachment.storagePath));
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
      return NextResponse.json({ error: { message: 'Invalid path' } }, { status: 400 });
    }

    const buffer = await fs.readFile(resolved);
    const mimeType = attachment.mimeType || 'application/octet-stream';
    const safeName = (attachment.fileName || 'arquivo').replace(/["\\\r\n]/g, '_');

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${safeName}"`,
        'Cache-Control': 'private, max-age=3600, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: { message: 'Failed to read attachment' } }, { status: 500 });
  }
}

// Vincula o anexo a uma filial do cliente. Definitivo: 409 se ja vinculado.
export async function PATCH(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const body = await readJsonBody(request);
  return executeBackend('linkClientAttachmentUnit', request, { params, body });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return executeBackend('deleteClientAttachment', request, { params });
}
