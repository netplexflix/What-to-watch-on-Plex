// File: server/src/services/encryption.ts
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let encryptionKey: Buffer | null = null;

export function initEncryption(dataPath: string): void {
  const keyFromEnv = process.env.WTW_ENCRYPTION_KEY;

  if (keyFromEnv) {
    // Use provided key (hex-encoded 32 bytes = 64 hex chars)
    if (keyFromEnv.length !== 64) {
      throw new Error('WTW_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
    }
    encryptionKey = Buffer.from(keyFromEnv, 'hex');
  } else {
    // Auto-generate and persist in data directory
    const keyFile = path.join(dataPath, '.encryption_key');
    if (fs.existsSync(keyFile)) {
      encryptionKey = Buffer.from(fs.readFileSync(keyFile, 'utf-8').trim(), 'hex');
    } else {
      encryptionKey = crypto.randomBytes(32);
      fs.writeFileSync(keyFile, encryptionKey.toString('hex'), { mode: 0o600 });
      console.log('[Encryption] Generated new encryption key');
    }
  }
}

function getKey(): Buffer {
  if (!encryptionKey) {
    throw new Error('Encryption not initialized. Call initEncryption() first.');
  }
  return encryptionKey;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: base64(iv + authTag + ciphertext)
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decrypt(encoded: string): string {
  const key = getKey();
  const data = Buffer.from(encoded, 'base64');
  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted data');
  }
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}

// Check if a value looks like it's already encrypted (base64-encoded with enough length)
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  // Encrypted values are base64 and contain at least IV + auth tag (28 bytes = ~38 base64 chars)
  try {
    const buf = Buffer.from(value, 'base64');
    return buf.length >= IV_LENGTH + AUTH_TAG_LENGTH && value !== buf.toString('utf8');
  } catch {
    return false;
  }
}

// Safely encrypt a token - returns null for null/undefined, encrypts otherwise
export function encryptToken(token: string | null | undefined): string | null {
  if (!token) return null;
  return encrypt(token);
}

// Safely decrypt a token - returns null for null/undefined
// If decryption fails (e.g. plaintext token from before migration), returns the original value
export function decryptToken(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    return decrypt(token);
  } catch {
    // If decryption fails, it might be a plaintext token from before migration
    return token;
  }
}
