import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { resolveSessionCookieSecureMode } from '../../../../src/auth/session-cookie-policy.js';
import { getPrismaClient } from '../../../../src/db/prisma-client.js';
import { resolveMaxUploadSizeBytes } from '../../../../src/uploads/upload-policy.js';

type CheckStatus = 'ok' | 'error';

type CheckResult = {
  status: CheckStatus;
  details?: Record<string, unknown>;
};

function buildNoStoreHeaders() {
  return {
    'Cache-Control': 'no-store',
  };
}

function nowIso() {
  return new Date().toISOString();
}

function resolveUploadsDir() {
  const configured = process.env.UPLOADS_DIR;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim();
  }

  return path.resolve(process.cwd(), 'data/uploads');
}

function resolveEmailOutboxDir() {
  const configured = process.env.EMAIL_OUTBOX_DIR;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim();
  }

  return path.resolve(process.cwd(), 'data/email-outbox');
}

function readRequiredConfig(name: string, missing: string[]) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    missing.push(name);
  }
}

function validateRuntimeConfig(): CheckResult {
  const missing: string[] = [];
  const invalid: string[] = [];
  readRequiredConfig('DATABASE_URL', missing);
  readRequiredConfig('AUTH_SECRET', missing);

  const configuredTransport = process.env.EMAIL_TRANSPORT?.trim().toLowerCase();
  const transport =
    configuredTransport && configuredTransport.length > 0
      ? configuredTransport
      : process.env.NODE_ENV === 'production'
        ? 'smtp'
        : 'outbox';
  let sessionCookieSecureMode: string | null = null;
  let maxUploadSizeBytes: number | null = null;

  if (!['smtp', 'outbox'].includes(transport)) {
    invalid.push('EMAIL_TRANSPORT');
  }

  try {
    sessionCookieSecureMode = resolveSessionCookieSecureMode(process.env.SESSION_COOKIE_SECURE);
  } catch {
    invalid.push('SESSION_COOKIE_SECURE');
  }

  try {
    maxUploadSizeBytes = resolveMaxUploadSizeBytes(process.env.MAX_UPLOAD_SIZE_BYTES);
  } catch {
    invalid.push('MAX_UPLOAD_SIZE_BYTES');
  }

  if (transport === 'smtp') {
    readRequiredConfig('SMTP_HOST', missing);
    readRequiredConfig('SMTP_PORT', missing);
    readRequiredConfig('SMTP_FROM', missing);
  }

  return missing.length === 0 && invalid.length === 0
    ? {
        status: 'ok',
        details: {
          transport,
          uploadsDir: resolveUploadsDir(),
          emailOutboxDir: resolveEmailOutboxDir(),
          sessionCookieSecureMode,
          maxUploadSizeBytes,
        },
      }
    : {
        status: 'error',
        details: {
          missing,
          transport,
          invalid,
          uploadsDir: resolveUploadsDir(),
          emailOutboxDir: resolveEmailOutboxDir(),
          sessionCookieSecureMode,
          maxUploadSizeBytes,
        },
      };
}

async function validateDatabase(): Promise<CheckResult> {
  const prisma = getPrismaClient();
  await prisma.$queryRawUnsafe('SELECT 1');

  return {
    status: 'ok',
  };
}

async function validateUploads(): Promise<CheckResult> {
  const uploadsDir = resolveUploadsDir();
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.access(uploadsDir, fsConstants.R_OK | fsConstants.W_OK);

  return {
    status: 'ok',
    details: {
      path: uploadsDir,
    },
  };
}

async function validateEmailOutbox(): Promise<CheckResult> {
  const transport =
    process.env.EMAIL_TRANSPORT?.trim().toLowerCase() ||
    (process.env.NODE_ENV === 'production' ? 'smtp' : 'outbox');
  if (transport !== 'outbox') {
    return {
      status: 'ok',
      details: {
        mode: transport,
      },
    };
  }

  const outboxDir = resolveEmailOutboxDir();
  await fs.mkdir(outboxDir, { recursive: true });
  await fs.access(outboxDir, fsConstants.R_OK | fsConstants.W_OK);

  return {
    status: 'ok',
    details: {
      path: outboxDir,
      mode: transport,
    },
  };
}

export function createLivenessResponse() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: nowIso(),
    },
    {
      status: 200,
      headers: buildNoStoreHeaders(),
    }
  );
}

export async function createReadinessResponse() {
  const config = validateRuntimeConfig();

  let database: CheckResult = { status: 'ok' };
  let uploads: CheckResult = { status: 'ok' };
  let emailOutbox: CheckResult = { status: 'ok' };

  if (config.status === 'ok') {
    try {
      database = await validateDatabase();
    } catch (error) {
      database = {
        status: 'error',
        details: {
          message: error instanceof Error ? error.message : 'Database readiness check failed',
        },
      };
    }

    try {
      uploads = await validateUploads();
    } catch (error) {
      uploads = {
        status: 'error',
        details: {
          message: error instanceof Error ? error.message : 'Uploads readiness check failed',
          path: resolveUploadsDir(),
        },
      };
    }

    try {
      emailOutbox = await validateEmailOutbox();
    } catch (error) {
      emailOutbox = {
        status: 'error',
        details: {
          message: error instanceof Error ? error.message : 'Email outbox readiness check failed',
          path: resolveEmailOutboxDir(),
        },
      };
    }
  }

  const overallStatus = [config.status, database.status, uploads.status, emailOutbox.status].every(
    (item) => item === 'ok'
  )
    ? 'ok'
    : 'error';

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: nowIso(),
      checks: {
        config,
        database,
        uploads,
        emailOutbox,
      },
    },
    {
      status: overallStatus === 'ok' ? 200 : 503,
      headers: buildNoStoreHeaders(),
    }
  );
}
