// File: server/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../db.js';

// ============ ADMIN SESSION STORE ============

interface AdminSession {
  createdAt: number;
}

const adminSessions = new Map<string, AdminSession>();
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

export function createAdminSession(): string {
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, { createdAt: Date.now() });
  return token;
}

function validateAdminSession(token: string): boolean {
  const session = adminSessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of adminSessions.entries()) {
    if (now - session.createdAt > SESSION_TTL) {
      adminSessions.delete(token);
    }
  }
}, 60 * 60 * 1000); // Every hour

// ============ TRUSTED REVERSE PROXY AUTH (optional) ============
// When the admin panel sits behind an authenticating reverse proxy (Pomerium,
// Authelia, oauth2-proxy, ...), the proxy can add a secret header to requests it
// has already authenticated. If that header carries the configured secret, the
// admin password prompt is skipped. Off unless both variables are set.

const PROXY_AUTH_HEADER = (process.env.ADMIN_PROXY_AUTH_HEADER || '').trim().toLowerCase();
const PROXY_AUTH_SECRET = (process.env.ADMIN_PROXY_AUTH_SECRET || '').trim();
const PROXY_AUTH_MIN_SECRET_LENGTH = 16;

const PROXY_AUTH_SECRET_DIGEST = crypto.createHash('sha256').update(PROXY_AUTH_SECRET).digest();

export function isProxyAuthEnabled(): boolean {
  return (
    /^[a-z0-9-]+$/.test(PROXY_AUTH_HEADER) &&
    PROXY_AUTH_SECRET.length >= PROXY_AUTH_MIN_SECRET_LENGTH
  );
}

if ((PROXY_AUTH_HEADER || PROXY_AUTH_SECRET) && !isProxyAuthEnabled()) {
  console.warn(
    `[Auth] Proxy auth is disabled: set ADMIN_PROXY_AUTH_HEADER to a valid header name and ADMIN_PROXY_AUTH_SECRET to at least ${PROXY_AUTH_MIN_SECRET_LENGTH} characters.`
  );
} else if (isProxyAuthEnabled()) {
  console.log(`[Auth] Trusted proxy auth enabled via header "${PROXY_AUTH_HEADER}"`);
}

export function isProxyAuthenticated(req: Request): boolean {
  if (!isProxyAuthEnabled()) return false;
  const value = req.headers[PROXY_AUTH_HEADER];
  if (typeof value !== 'string' || value.length === 0) return false;
  // Compare digests so the comparison is constant-time regardless of length.
  const given = crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(given, PROXY_AUTH_SECRET_DIGEST);
}

// ============ PASSWORD HASHING (scrypt) ============

export function hashPasswordServer(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPasswordServer(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const hashToVerify = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(hashToVerify, 'hex'));
}

// Legacy SHA-256 verification (for migration from v1 format)
export function verifyLegacyPassword(passwordHash: string, storedHash: string): boolean {
  if (passwordHash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(passwordHash, 'hex'), Buffer.from(storedHash, 'hex'));
}

// ============ AUTH MIDDLEWARE ============

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-admin-token'] as string;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Check session token store
  if (validateAdminSession(token)) {
    return next();
  }

  return res.status(403).json({ error: 'Invalid or expired session' });
}

// ============ RATE LIMITER ============

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function createRateLimiter(windowMs: number, max: number) {
  const store = new Map<string, RateLimitEntry>();

  // Clean up expired entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of store.entries()) {
      if (now >= entry.resetAt) store.delete(ip);
    }
  }, windowMs);

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = store.get(ip);

    if (entry && now < entry.resetAt) {
      if (entry.count >= max) {
        const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
        res.set('Retry-After', String(retryAfterSec));
        return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
      }
      entry.count++;
    } else {
      store.set(ip, { count: 1, resetAt: now + windowMs });
    }

    next();
  };
}
