import { describe, test, expect } from 'bun:test';
import { blake3Hash } from '../../src/utils/hash';

describe('blake3Hash', () => {
  test('returns a base64 string', async () => {
    const hash = await blake3Hash('test');
    expect(typeof hash).toBe('string');
    // base64 for 32-byte digest = 44 chars
    expect(hash.length).toBe(44);
  });

  test('produces consistent hashes', async () => {
    const a = await blake3Hash('hello world');
    const b = await blake3Hash('hello world');
    expect(a).toBe(b);
  });

  test('produces different hashes for different inputs', async () => {
    const a = await blake3Hash('hello');
    const b = await blake3Hash('world');
    expect(a).not.toBe(b);
  });

  test('handles empty string', async () => {
    const hash = await blake3Hash('');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(44);
  });
});
