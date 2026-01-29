// file: src/lib/crypto.ts

/**
 * SHA-256 hash function that works in both secure and non-secure contexts.
 * Uses Web Crypto API when available, falls back to pure JS implementation.
 */
export async function hashPassword(password: string): Promise<string> {
  // Check if Web Crypto API is available (secure context)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return hashWithWebCrypto(password);
  }
  
  // Fallback to pure JavaScript implementation
  console.warn('[Crypto] Web Crypto API not available, using fallback SHA-256 implementation');
  return hashWithFallback(password);
}

/**
 * Hash using Web Crypto API (preferred, requires secure context)
 */
async function hashWithWebCrypto(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Pure JavaScript SHA-256 implementation for non-secure contexts.
 * This produces identical output to the Web Crypto API version.
 */
async function hashWithFallback(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  return sha256(data);
}

/**
 * Pure JavaScript SHA-256 implementation
 * Based on the FIPS 180-4 specification
 */
function sha256(message: Uint8Array): string {
  // SHA-256 constants - first 32 bits of the fractional parts of the cube roots of the first 64 primes
  const K: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  // Initial hash values - first 32 bits of the fractional parts of the square roots of the first 8 primes
  const H: number[] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  // Helper functions
  const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;
  const sigma0 = (x: number): number => (rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22)) >>> 0;
  const sigma1 = (x: number): number => (rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25)) >>> 0;
  const gamma0 = (x: number): number => (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
  const gamma1 = (x: number): number => (rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10)) >>> 0;
  const ch = (x: number, y: number, z: number): number => ((x & y) ^ (~x & z)) >>> 0;
  const maj = (x: number, y: number, z: number): number => ((x & y) ^ (x & z) ^ (y & z)) >>> 0;
  const add = (...args: number[]): number => args.reduce((a, b) => (a + b) >>> 0, 0);

  // Pre-processing: Padding the message
  const msgLen = message.length;
  const bitLen = msgLen * 8;
  
  // Calculate padding: message + 1 byte (0x80) + padding zeros + 8 bytes (length)
  // Total must be multiple of 64 bytes (512 bits)
  const padLength = 64 - ((msgLen + 9) % 64);
  const totalLength = msgLen + 1 + (padLength === 64 ? 0 : padLength) + 8;
  
  // Create padded message
  const padded = new Uint8Array(totalLength);
  
  // Copy original message
  for (let i = 0; i < msgLen; i++) {
    padded[i] = message[i];
  }
  
  // Append bit '1' (0x80)
  padded[msgLen] = 0x80;
  
  // Append length as 64-bit big-endian integer
  // For messages < 2^32 bits, high 32 bits are 0
  const lenPos = totalLength - 8;
  padded[lenPos] = 0;
  padded[lenPos + 1] = 0;
  padded[lenPos + 2] = 0;
  padded[lenPos + 3] = 0;
  padded[lenPos + 4] = (bitLen >>> 24) & 0xff;
  padded[lenPos + 5] = (bitLen >>> 16) & 0xff;
  padded[lenPos + 6] = (bitLen >>> 8) & 0xff;
  padded[lenPos + 7] = bitLen & 0xff;

  // Process each 64-byte (512-bit) block
  for (let offset = 0; offset < totalLength; offset += 64) {
    // Prepare message schedule (W)
    const W: number[] = new Array(64);
    
    // First 16 words are directly from the block (big-endian)
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      W[i] = ((padded[j] << 24) | (padded[j + 1] << 16) | (padded[j + 2] << 8) | padded[j + 3]) >>> 0;
    }
    
    // Extend to 64 words
    for (let i = 16; i < 64; i++) {
      W[i] = add(gamma1(W[i - 2]), W[i - 7], gamma0(W[i - 15]), W[i - 16]);
    }

    // Initialize working variables
    let [a, b, c, d, e, f, g, h] = H;

    // Main compression loop
    for (let i = 0; i < 64; i++) {
      const T1 = add(h, sigma1(e), ch(e, f, g), K[i], W[i]);
      const T2 = add(sigma0(a), maj(a, b, c));
      h = g;
      g = f;
      f = e;
      e = add(d, T1);
      d = c;
      c = b;
      b = a;
      a = add(T1, T2);
    }

    // Update hash values
    H[0] = add(H[0], a);
    H[1] = add(H[1], b);
    H[2] = add(H[2], c);
    H[3] = add(H[3], d);
    H[4] = add(H[4], e);
    H[5] = add(H[5], f);
    H[6] = add(H[6], g);
    H[7] = add(H[7], h);
  }

  // Produce final hash as hex string
  return H.map(h => h.toString(16).padStart(8, '0')).join('');
}

/**
 * Check if we're in a secure context
 */
export function isSecureContext(): boolean {
  return typeof crypto !== 'undefined' && crypto.subtle !== undefined;
}