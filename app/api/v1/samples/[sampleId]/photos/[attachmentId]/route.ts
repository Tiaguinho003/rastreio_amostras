import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs/promises';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'data/uploads');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ sampleId: string; attachmentId: string }> }
) {
  const params = await context.params;

  if (!UUID_RE.test(params.sampleId) || !UUID_RE.test(params.attachmentId)) {
    return NextResponse.json({ error: { message: 'Invalid parameters' } }, { status: 400 });
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const attachment = await prisma.sampleAttachment.findFirst({
      where: {
        id: params.attachmentId,
        sampleId: params.sampleId,
      },
    });

    if (!attachment || !attachment.storagePath) {
      return NextResponse.json({ error: { message: 'Attachment not found' } }, { status: 404 });
    }

    const absolutePath = path.join(UPLOADS_DIR, attachment.storagePath);
    const resolved = path.resolve(absolutePath);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
      return NextResponse.json({ error: { message: 'Invalid path' } }, { status: 400 });
    }

    const buffer = await fs.readFile(resolved);
    const mimeType = attachment.mimeType || 'image/jpeg';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'private, max-age=3600, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: { message: 'Failed to read attachment' } }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
