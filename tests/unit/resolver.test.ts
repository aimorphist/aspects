import { describe, test, expect } from 'bun:test';
import { parseInstallSpec } from '../../src/lib/resolver';

describe('parseInstallSpec', () => {
  test('parses plain registry name', () => {
    const result = parseInstallSpec('alaric');
    expect(result).toEqual({ type: 'registry', name: 'alaric', version: undefined });
  });

  test('parses registry name with version', () => {
    const result = parseInstallSpec('alaric@1.0.0');
    expect(result).toEqual({ type: 'registry', name: 'alaric', version: '1.0.0' });
  });

  test('parses scoped package name', () => {
    const result = parseInstallSpec('@scope/name');
    expect(result).toEqual({ type: 'registry', name: '@scope/name', version: undefined });
  });

  test('parses scoped package name with version', () => {
    const result = parseInstallSpec('@scope/name@2.0.0');
    expect(result).toEqual({ type: 'registry', name: '@scope/name', version: '2.0.0' });
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
});
