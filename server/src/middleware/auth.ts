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
