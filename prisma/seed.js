import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function normalizeCanonical(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function normalizeRole(value) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();

  if (normalized === 'ADM') {
    return 'ADMIN';
  }

  if (normalized === 'CLASSIFICADOR') {
    return 'CLASSIFIER';
  }

  if (normalized === 'REGISTRO') {
    return 'REGISTRATION';
  }

  if (normalized === 'COMERCIAL') {
    return 'COMMERCIAL';
  }

  return normalized;
}

function readBootstrapEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required to seed the initial administrator`);
  }

  return value.trim();
}

async function importLegacyUsers() {
  const raw = process.env.LOCAL_AUTH_USERS_JSON;
  if (!raw) {
    return false;
  }

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return false;
  }

  for (const entry of parsed) {
    const passwordHash =
      typeof entry.passwordHash === 'string' && entry.passwordHash.length > 0
        ? entry.passwordHash
        : typeof entry.password === 'string' && entry.password.length > 0
          ? await bcrypt.hash(entry.password, 10)
          : null;

    if (!passwordHash) {
      continue;
    }

    const role = normalizeRole(entry.role);
    const fullName =
      typeof entry.fullName === 'string' && entry.fullName.trim().length > 0
        ? entry.fullName.trim()
        : typeof entry.name === 'string' && entry.name.trim().length > 0
          ? entry.name.trim()
          : typeof entry.displayName === 'string' && entry.displayName.trim().length > 0
            ? entry.displayName.trim()
            : String(entry.username ?? '').trim();
    const username = String(entry.username ?? '').trim();
    const email =
      typeof entry.email === 'string' && entry.email.trim().length > 0
        ? entry.email.trim()
        : `${normalizeCanonical(username)}@bootstrap.local`;
    const phone =
      typeof entry.phone === 'string' && entry.phone.trim().length > 0 ? entry.phone.trim() : null;

    if (!username || !email || !fullName || !role) {
      continue;
    }

    await prisma.user.create({
      data: {
        id: entry.id ?? randomUUID(),
        fullName,
        username,
        usernameCanonical: normalizeCanonical(username),
        email,
        emailCanonical: normalizeCanonical(email),
        phone,
        passwordHash,
        role,
        status: 'ACTIVE',
        initialPasswordDecision: 'PENDING'
      }
    });
  }

  return true;
}

async function createBootstrapAdmin() {
  const fullName = readBootstrapEnv('BOOTSTRAP_ADMIN_FULL_NAME');
  const username = readBootstrapEnv('BOOTSTRAP_ADMIN_USERNAME');
  const email = readBootstrapEnv('BOOTSTRAP_ADMIN_EMAIL');
  const password = readBootstrapEnv('BOOTSTRAP_ADMIN_PASSWORD');

  await prisma.user.create({
    data: {
      id: randomUUID(),
      fullName,
      username,
      usernameCanonical: normalizeCanonical(username),
      email,
      emailCanonical: normalizeCanonical(email),
      phone: null,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'ADMIN',
      status: 'ACTIVE',
      initialPasswordDecision: 'PENDING'
    }
  });
}

async function main() {
  const totalUsers = await prisma.user.count();
  if (totalUsers > 0) {
    return;
  }

  const imported = await importLegacyUsers();
  if (imported) {
    return;
  }

  await createBootstrapAdmin();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
