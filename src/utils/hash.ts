import { createHash } from 'node:crypto';

/**
 * Compute SHA-256 hash of a string.
 */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}
