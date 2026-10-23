import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Refresh tokens are high-entropy random JWTs, so a fast SHA-256 digest is
 * sufficient for at-rest protection (unlike passwords, which use argon2).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenHashesMatch(storedHash: string, token: string): boolean {
  const a = Buffer.from(storedHash, 'hex');
  const b = Buffer.from(hashToken(token), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
