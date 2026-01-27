import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resolveRegistryUrl } from '../../src/lib/config';

describe('resolveRegistryUrl', () => {
  test('returns default URL when no env or config', () => {
    const url = resolveRegistryUrl(undefined, undefined);
    expect(url).toBe('https://getaspects.com/api/v1');
  });

  test('env var overrides everything', () => {
    const url = resolveRegistryUrl('http://custom.example.com/api/v1', 'http://config.example.com/api/v1');
    expect(url).toBe('http://custom.example.com/api/v1');
  });

  test('config overrides default when no env var', () => {
    const url = resolveRegistryUrl(undefined, 'http://config.example.com/api/v1');
    expect(url).toBe('http://config.example.com/api/v1');
  });

  test('env var takes priority over config', () => {
    const url = resolveRegistryUrl('http://env.example.com/api/v1', 'http://config.example.com/api/v1');
    expect(url).toBe('http://env.example.com/api/v1');
  });

  test('empty string env var is treated as falsy', () => {
    const url = resolveRegistryUrl('', 'http://config.example.com/api/v1');
    expect(url).toBe('http://config.example.com/api/v1');
  });

  test('empty string config is treated as falsy', () => {
    const url = resolveRegistryUrl(undefined, '');
    expect(url).toBe('https://getaspects.com/api/v1');
  });
});

// Note: getRegistryUrl() integration with process.env is tested via
// resolveRegistryUrl() above, which is the pure function it delegates to.
// Testing getRegistryUrl() directly in unit tests is unreliable because
// other test files mock the config module, and Bun's module cache
// makes dynamic imports return the mocked version.
