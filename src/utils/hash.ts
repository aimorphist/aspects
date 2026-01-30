import { blake3 } from '@noble/hashes/blake3.js';
import { base58 } from '@scure/base';

/**
 * Compute Blake3 hash of a string, returned as base58.
 * Uses same libraries as webapp for guaranteed hash compatibility.
 */
export function blake3Hash(content: string): string {
  const hash = blake3(new TextEncoder().encode(content));
  return base58.encode(hash);
}

/**
 * Canonicalize an object for deterministic hashing.
 * Deep-sorts all object keys recursively; arrays preserve order.
 * Required for content-addressable storage where both client
 * and server must compute identical hashes for the same content.
 */
export function canonicalizeAspect(obj: unknown): string {
  return JSON.stringify(obj, (_, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce((sorted, key) => {
          sorted[key] = value[key];
          return sorted;
        }, {} as Record<string, unknown>);
    }
    return value;
  });
}

/**
 * Compute Blake3 hash of an aspect object, returned as base58.
 * Canonicalizes the object (deep-sorted keys) before hashing
 * to ensure deterministic hashes regardless of key order.
 */
export function blake3HashAspect(aspect: object): string {
  return blake3Hash(canonicalizeAspect(aspect));
}
