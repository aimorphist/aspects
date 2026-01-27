import { describe, test, expect, beforeAll, afterAll } from 'bun:test';

const REGISTRY_URL = process.env.ASPECTS_REGISTRY_URL;

describe.skipIf(!REGISTRY_URL)('API Live Tests', () => {
  let api: typeof import('../../src/lib/api-client');

  beforeAll(async () => {
    api = await import('../../src/lib/api-client');
    api.clearApiCache();
  });

  afterAll(() => {
    api.clearApiCache();
  });

  describe('GET /registry', () => {
    test('returns a valid registry index', async () => {
      const index = await api.getRegistry();
      expect(index).toHaveProperty('aspects');
      expect(typeof index.aspects).toBe('object');
    });
  });

  describe('GET /search', () => {
    test('returns results for empty query', async () => {
      const result = await api.searchAspects({});
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
    });

    test('returns results for text query', async () => {
      const result = await api.searchAspects({ q: 'assistant' });
      expect(result).toHaveProperty('total');
      expect(typeof result.total).toBe('number');
    });

    test('respects limit parameter', async () => {
      const result = await api.searchAspects({ limit: 2 });
      expect(result.results.length).toBeLessThanOrEqual(2);
    });

    test('filters by category when results exist', async () => {
      const result = await api.searchAspects({ category: 'roleplay' });
      for (const item of result.results) {
        expect(item.category).toBe('roleplay');
      }
    });
  });

  describe('GET /aspects/:name', () => {
    test('returns detail for a known aspect', async () => {
      // First search for any available aspect
      const searchResult = await api.searchAspects({ limit: 1 });
      if (searchResult.results.length === 0) {
        console.log('  (skipping: no aspects in registry)');
        return;
      }

      const aspectName = searchResult.results[0]!.name;
      const detail = await api.getAspect(aspectName);
      expect(detail.name).toBe(aspectName);
      expect(detail).toHaveProperty('versions');
      expect(detail).toHaveProperty('latest');
      expect(detail).toHaveProperty('publisher');
    });

    test('throws 404 for nonexistent aspect', async () => {
      try {
        await api.getAspect('nonexistent-aspect-xyz-999');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(api.ApiClientError);
        expect((err as InstanceType<typeof api.ApiClientError>).statusCode).toBe(404);
      }
    });
  });

  describe('GET /aspects/:name/:version', () => {
    test('returns version content for a known aspect', async () => {
      const searchResult = await api.searchAspects({ limit: 1 });
      if (searchResult.results.length === 0) {
        console.log('  (skipping: no aspects in registry)');
        return;
      }

      const aspectName = searchResult.results[0]!.name;
      const version = await api.getAspectVersion(aspectName, 'latest');
      expect(version).toHaveProperty('content');
      expect(version.content).toHaveProperty('name');
      expect(version.content).toHaveProperty('prompt');
    });
  });

  describe('GET /stats', () => {
    test('returns aggregate stats', async () => {
      const stats = await api.getStats();
      expect(stats).toHaveProperty('total_aspects');
      expect(typeof stats.total_aspects).toBe('number');
    });
  });

  describe('GET /categories', () => {
    test('returns categories list', async () => {
      const cats = await api.getCategories();
      expect(cats).toHaveProperty('categories');
      expect(Array.isArray(cats.categories)).toBe(true);
    });
  });
});
