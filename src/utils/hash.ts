import { blake3 as blake3Wasm } from 'hash-wasm';

/**
 * Compute Blake3 hash of a string, returned as base64.
 */
export async function blake3Hash(content: string): Promise<string> {
  const hex = await blake3Wasm(content);
  return Buffer.from(hex, 'hex').toString('base64');
}
