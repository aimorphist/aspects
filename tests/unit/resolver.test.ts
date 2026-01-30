import { describe, test, expect } from 'bun:test';
import { parseInstallSpec } from '../../src/lib/resolver';

describe('parseInstallSpec', () => {
  test('parses plain registry name', () => {
    const result = parseInstallSpec('alaric');
    expect(result).toEqual({ type: 'registry', name: 'alaric', publisher: undefined, version: undefined });
  });

  test('parses registry name with version', () => {
    const result = parseInstallSpec('alaric@1.0.0');
    expect(result).toEqual({ type: 'registry', name: 'alaric', publisher: undefined, version: '1.0.0' });
  });

  test('parses qualified publisher/name', () => {
    const result = parseInstallSpec('morphist/alaric');
    expect(result).toEqual({ type: 'registry', name: 'alaric', publisher: 'morphist', version: undefined });
  });

  test('parses qualified publisher/name with version', () => {
    const result = parseInstallSpec('morphist/alaric@2.0.0');
    expect(result).toEqual({ type: 'registry', name: 'alaric', publisher: 'morphist', version: '2.0.0' });
  });

  test('parses @scope/name (strips @ for npm compat)', () => {
    const result = parseInstallSpec('@scope/name');
    expect(result).toEqual({ type: 'registry', name: 'name', publisher: 'scope', version: undefined });
  });

  test('parses @scope/name with version (strips @ for npm compat)', () => {
    const result = parseInstallSpec('@scope/name@2.0.0');
    expect(result).toEqual({ type: 'registry', name: 'name', publisher: 'scope', version: '2.0.0' });
  });

  test('parses github spec', () => {
    const result = parseInstallSpec('github:user/repo');
    expect(result).toEqual({ type: 'github', owner: 'user', repo: 'repo', ref: undefined });
  });

  test('parses github spec with ref', () => {
    const result = parseInstallSpec('github:user/repo@v1.0.0');
    expect(result).toEqual({ type: 'github', owner: 'user', repo: 'repo', ref: 'v1.0.0' });
  });

  test('parses relative local path', () => {
    const result = parseInstallSpec('./my-aspect');
    expect(result.type).toBe('local');
    if (result.type === 'local') {
      expect(result.path).toMatch(/\/my-aspect$/);
      expect(result.path).toMatch(/^\//); // absolute
    }
  });

  test('parses absolute local path', () => {
    const result = parseInstallSpec('/home/user/my-aspect');
    expect(result).toEqual({ type: 'local', path: '/home/user/my-aspect' });
  });

  test('throws on invalid github spec (no slash)', () => {
    expect(() => parseInstallSpec('github:invalid')).toThrow();
  });

  test('throws on empty github spec', () => {
    expect(() => parseInstallSpec('github:')).toThrow();
  });

  test('parses hash spec', () => {
    const result = parseInstallSpec('hash:SHjKBCXHOfpCf37aIP6EX2suRrpf4qFN9bHjL1BgMhU=');
    expect(result).toEqual({ type: 'hash', hash: 'SHjKBCXHOfpCf37aIP6EX2suRrpf4qFN9bHjL1BgMhU=' });
  });

  test('parses blake3 spec (alias for hash)', () => {
    const result = parseInstallSpec('blake3:SHjKBCXHOfpCf37aIP6EX2suRrpf4qFN9bHjL1BgMhU=');
    expect(result).toEqual({ type: 'hash', hash: 'SHjKBCXHOfpCf37aIP6EX2suRrpf4qFN9bHjL1BgMhU=' });
  });

  test('throws on short hash spec', () => {
    expect(() => parseInstallSpec('hash:abc')).toThrow(/at least 16 characters/);
  });

  test('throws on empty hash spec', () => {
    expect(() => parseInstallSpec('hash:')).toThrow(/at least 16 characters/);
  });
});
