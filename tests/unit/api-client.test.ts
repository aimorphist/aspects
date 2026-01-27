import { describe, test, expect, beforeEach, mock, afterEach } from 'bun:test';

// Track calls to ofetch
let ofetchCalls: Array<{ url: string; options?: Record<string, unknown> }> = [];
let ofetchImpl: (url: string, options?: Record<string, unknown>) => Promise<unknown>;

// Mock ofetch before importing api-client
mock.module('ofetch', () => ({
  ofetch: async (url: string, options?: Record<string, unknown>) => {
    ofetchCalls.push({ url, options });
    return ofetchImpl(url, options);
  },
}));

// Mock config to avoid filesystem access
mock.module('../../src/lib/config', () => ({
  getRegistryUrl: () => Promise.resolve('https://test.example.com/api/v1'),
  getAuthToken: () => Promise.resolve(null),
  resolveRegistryUrl: (env: string | undefined, config: string | undefined) => {
    if (env) return env;
    if (config) return config;
    return 'https://getaspects.com/api/v1';
  },
}));

const {
  getRegistry,
  getAspect,
  getAspectVersion,
  searchAspects,
  publishAspect,
  getStats,
  getCategories,
  clearApiCache,
  ApiClientError,
} = await import('../../src/lib/api-client');

describe('api-client', () => {
  beforeEach(() => {
    clearApiCache();
    ofetchCalls = [];
    // Default: resolve successfully
    ofetchImpl = async () => ({});
  });

  describe('getRegistry', () => {
    test('fetches registry index', async () => {
      const fakeIndex = { version: 2, updated: '2026-01-01', aspects: {} };
      ofetchImpl = async () => fakeIndex;

      const result = await getRegistry();
      expect(result).toEqual(fakeIndex);
      expect(ofetchCalls).toHaveLength(1);
      expect(ofetchCalls[0]!.url).toBe('https://test.example.com/api/v1/registry');
    });

    test('returns cached result on second call', async () => {
      const fakeIndex = { version: 2, updated: '2026-01-01', aspects: {} };
      ofetchImpl = async () => fakeIndex;

      await getRegistry();
      const result = await getRegistry();
      expect(result).toEqual(fakeIndex);
      expect(ofetchCalls).toHaveLength(1); // only one actual fetch
    });

    test('re-fetches after cache clear', async () => {
      const fakeIndex = { version: 2, updated: '2026-01-01', aspects: {} };
      ofetchImpl = async () => fakeIndex;

      await getRegistry();
      clearApiCache();
      await getRegistry();
      expect(ofetchCalls).toHaveLength(2);
    });
  });

  describe('getAspect', () => {
    test('fetches aspect by name', async () => {
      const fakeDetail = { name: 'alaric', publisher: 'morphist', latest: '1.0.0', versions: {} };
      ofetchImpl = async () => fakeDetail;

      const result = await getAspect('alaric');
      expect(result.name).toBe('alaric');
      expect(ofetchCalls[0]!.url).toBe('https://test.example.com/api/v1/aspects/alaric');
    });

    test('URL-encodes special characters in name', async () => {
      ofetchImpl = async () => ({ name: '@scope/name' });
      await getAspect('@scope/name');
      expect(ofetchCalls[0]!.url).toContain('%40scope%2Fname');
    });
  });

  describe('getAspectVersion', () => {
    test('fetches specific version', async () => {
      const fakeVersion = { name: 'alaric', version: '1.0.0', content: {}, sha256: 'abc', size: 100 };
      ofetchImpl = async () => fakeVersion;

      const result = await getAspectVersion('alaric', '1.0.0');
      expect(result.name).toBe('alaric');
      expect(ofetchCalls[0]!.url).toBe('https://test.example.com/api/v1/aspects/alaric/1.0.0');
    });

    test('handles "latest" as version', async () => {
      ofetchImpl = async () => ({ name: 'alaric', version: '2.0.0', content: {} });
      await getAspectVersion('alaric', 'latest');
      expect(ofetchCalls[0]!.url).toBe('https://test.example.com/api/v1/aspects/alaric/latest');
    });
  });

  describe('searchAspects', () => {
    test('passes query parameters', async () => {
      ofetchImpl = async () => ({ total: 0, results: [] });
      await searchAspects({ q: 'wizard', category: 'roleplay', limit: 10 });
      const url = ofetchCalls[0]!.url;
      expect(url).toContain('q=wizard');
      expect(url).toContain('category=roleplay');
      expect(url).toContain('limit=10');
    });

    test('works with no params', async () => {
      ofetchImpl = async () => ({ total: 0, results: [] });
      await searchAspects({});
      expect(ofetchCalls[0]!.url).toMatch(/\/search$/);
    });

    test('passes offset parameter', async () => {
      ofetchImpl = async () => ({ total: 0, results: [] });
      await searchAspects({ q: 'test', offset: 20 });
      expect(ofetchCalls[0]!.url).toContain('offset=20');
    });
  });

  describe('error handling', () => {
    test('wraps 404 as ApiClientError', async () => {
      ofetchImpl = async () => {
        const err = new Error('Not found') as Error & { statusCode: number; data: unknown };
        err.statusCode = 404;
        err.data = { error: 'not_found', message: 'Aspect not found' };
        throw err;
      };

      try {
        await getAspect('nonexistent');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        expect((err as InstanceType<typeof ApiClientError>).statusCode).toBe(404);
        expect((err as InstanceType<typeof ApiClientError>).errorCode).toBe('not_found');
      }
    });

    test('wraps 401 as ApiClientError', async () => {
      ofetchImpl = async () => {
        const err = new Error('Unauthorized') as Error & { statusCode: number; data: unknown };
        err.statusCode = 401;
        err.data = { error: 'unauthorized', message: 'Invalid token' };
        throw err;
      };

      try {
        await getAspect('test');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        expect((err as InstanceType<typeof ApiClientError>).statusCode).toBe(401);
      }
    });
  });

  describe('caching', () => {
    test('getStats caches results', async () => {
      ofetchImpl = async () => ({ total_aspects: 5, total_downloads: 100 });
      await getStats();
      await getStats();
      expect(ofetchCalls).toHaveLength(1);
    });

    test('getCategories caches results', async () => {
      ofetchImpl = async () => ({ categories: [{ id: 'assistant', name: 'Assistant' }] });
      await getCategories();
      await getCategories();
      expect(ofetchCalls).toHaveLength(1);
    });
  });

  describe('publishAspect', () => {
    test('sends POST request', async () => {
      // publishAspect requires auth, which is mocked to return null,
      // so it should throw an unauthorized error
      try {
        await publishAspect({} as never);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        expect((err as InstanceType<typeof ApiClientError>).statusCode).toBe(401);
        expect((err as InstanceType<typeof ApiClientError>).errorCode).toBe('unauthorized');
      }
    });
  });
});
