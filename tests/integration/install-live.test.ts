import { describe, test, expect, beforeAll, afterAll } from 'bun:test';

const REGISTRY_URL = process.env.ASPECTS_REGISTRY_URL;

describe.skipIf(!REGISTRY_URL)('Install Live Tests', () => {
  let clearApiCache: () => void;
  let clearRegistryCache: () => void;
  let installAspect: typeof import('../../src/lib/installer').installAspect;
  let searchAspects: typeof import('../../src/lib/api-client').searchAspects;

  beforeAll(async () => {
    const apiClient = await import('../../src/lib/api-client');
    const registry = await import('../../src/lib/registry');
    const installer = await import('../../src/lib/installer');

    clearApiCache = apiClient.clearApiCache;
    clearRegistryCache = registry.clearRegistryCache;
    installAspect = installer.installAspect;
    searchAspects = apiClient.searchAspects;

    clearApiCache();
    clearRegistryCache();
  });

  afterAll(() => {
    clearApiCache();
    clearRegistryCache();
  });

  test('installs a known aspect from registry', async () => {
    // Find an available aspect first
    const searchResult = await searchAspects({ limit: 1 });
    if (searchResult.results.length === 0) {
      console.log('  (skipping: no aspects in registry)');
      return;
    }

    const aspectName = searchResult.results[0]!.name;
    const result = await installAspect(
      { type: 'registry', name: aspectName },
      { force: true },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.aspect.name).toBe(aspectName);
      expect(result.source).toBe('registry');
    }
  });

  test('returns error for nonexistent aspect', async () => {
    const result = await installAspect(
      { type: 'registry', name: 'nonexistent-xyz-999' },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/not found/i);
    }
  });
});
