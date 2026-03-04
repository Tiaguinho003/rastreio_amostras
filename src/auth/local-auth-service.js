import { timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

import { HttpError } from '../contracts/errors.js';
import { isKnownRole } from './roles.js';
import { issueAccessToken, verifyAccessToken } from './token-service.js';

function normalizeUser(user, { allowPlaintextPasswords }) {
  if (!user || typeof user !== 'object') {
    throw new Error('Invalid local auth user entry');
  }

  const { id, username, password, passwordHash, role, displayName = null } = user;

  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Local auth user requires id');
  }

  if (typeof username !== 'string' || username.length === 0) {
    throw new Error('Local auth user requires username');
  }

  if (!isKnownRole(role)) {
    throw new Error(`Local auth user has invalid role: ${role}`);
  }

  const hasPasswordHash = typeof passwordHash === 'string' && passwordHash.length > 0;
  const hasPlaintextPassword = typeof password === 'string' && password.length > 0;

  if (!hasPasswordHash && !hasPlaintextPassword) {
    if (allowPlaintextPasswords) {
      throw new Error('Local auth user requires passwordHash or password');
    }
    throw new Error('Local auth user requires passwordHash');
  }

  if (!hasPasswordHash && !allowPlaintextPasswords && hasPlaintextPassword) {
    throw new Error('Local auth user requires passwordHash');
  }

  return {
    id,
    username,
    password: !hasPasswordHash && hasPlaintextPassword ? password : null,
    passwordHash: hasPasswordHash ? passwordHash : null,
    role,
    displayName
  };
}

function secureStringEquals(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function verifyUserPassword(user, providedPassword) {
  if (typeof providedPassword !== 'string') {
    return false;
  }

  if (typeof user.passwordHash === 'string' && user.passwordHash.length > 0) {
    try {
      return bcrypt.compareSync(providedPassword, user.passwordHash);
    } catch {
      return false;
    }
  }

  if (typeof user.password === 'string' && user.password.length > 0) {
    return secureStringEquals(user.password, providedPassword);
  }

  return false;
}

function parseBearerToken(headerValue) {
  if (typeof headerValue !== 'string') {
    throw new HttpError(401, 'Authorization header is required');
  }

  const [scheme, token] = headerValue.trim().split(/\s+/, 2);
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'Authorization must use Bearer token');
  }

  return token;
}

export class LocalAuthService {
  constructor({ users, secret, allowPlaintextPasswords = false }) {
    if (!Array.isArray(users) || users.length === 0) {
      throw new Error('LocalAuthService requires at least one user');
    }

    this.allowPlaintextPasswords = Boolean(allowPlaintextPasswords);
    this.users = users.map((user) => normalizeUser(user, { allowPlaintextPasswords: this.allowPlaintextPasswords }));
    this.userByUsername = new Map(this.users.map((user) => [user.username, user]));
    this.secret = secret;
  }

  login({ username, password }) {
    if (typeof username !== 'string' || username.length === 0 || typeof password !== 'string') {
      throw new HttpError(422, 'username and password are required');
    }

    const user = this.userByUsername.get(username);
    if (!user || !verifyUserPassword(user, password)) {
      throw new HttpError(401, 'Invalid username or password');
    }

    const { token, expiresAt } = issueAccessToken(
      {
        userId: user.id,
        role: user.role,
        username: user.username
      },
      { secret: this.secret }
    );

    return {
      accessToken: token,
      tokenType: 'Bearer',
      expiresAt,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName
      }
    };
  }

  authenticateAuthorizationHeader(authorizationHeader) {
    const token = parseBearerToken(authorizationHeader);
    const claims = verifyAccessToken(token, { secret: this.secret });

    return {
      actorType: 'USER',
      actorUserId: claims.userId,
      role: claims.role,
      username: claims.username
    };
  }
}
