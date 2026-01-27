import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { ApiClientError } from '../../src/lib/api-client';

// Mock api-client
let apiGetRegistryImpl: () => Promise<unknown>;
let apiGetAspectImpl: (name: string) => Promise<unknown>;
let apiSearchImpl: (params: Record<string, unknown>) => Promise<unknown>;

mock.module('../../src/lib/api-client', () => ({
  getRegistry: async () => apiGetRegistryImpl(),
  getAspect: async (name: string) => apiGetAspectImpl(name),
  searchAspects: async (params: Record<string, unknown>) => apiSearchImpl(params),
  clearApiCache: () => {},
  ApiClientError,
}));

// Mock ofetch for the GitHub fallback path
let ofetchImpl: (url: string) => Promise<unknown>;
mock.module('ofetch', () => ({
  ofetch: async (url: string, _opts?: Record<string, unknown>) => ofetchImpl(url),
}));

// Mock config
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
  fetchRegistryIndex,
  getRegistryAspect,
  searchRegistry,
  getAspectDetail,
  clearRegistryCache,
} = await import('../../src/lib/registry');

describe('registry', () => {
  beforeEach(() => {
    clearRegistryCache();
    // Default: API succeeds
    apiGetRegistryImpl = async () => ({
      version: 2,
      updated: '2026-01-01',
      aspects: {
        'test-aspect': {
          latest: '1.0.0',
          versions: { '1.0.0': { url: 'https://example.com/test.json' } },
        },
      },
    });
    apiGetAspectImpl = async (name: string) => ({
      name,
      publisher: 'test',
      latest: '1.0.0',
      created: '2026-01-01',
      modified: '2026-01-01',
      trust: 'community',
      stats: { downloads: { total: 0, weekly: 0 } },
      versions: {
        '1.0.0': {
          published: '2026-01-01',
          sha256: 'abc',
          size: 100,
          aspect: {
            name,
            displayName: 'Test Aspect',
            tagline: 'A test',
            category: 'assistant',
          },
        },
      },
    });
    apiSearchImpl = async () => ({ total: 0, results: [] });
    ofetchImpl = async () => { throw new Error('Should not reach GitHub fallback'); };
  });

  describe('fetchRegistryIndex', () => {
    test('returns API result when available', async () => {
      const index = await fetchRegistryIndex();
      expect(index).toHaveProperty('aspects');
      expect(index.aspects).toHaveProperty('test-aspect');
    });

    test('falls back to GitHub URL when API fails', async () => {
      apiGetRegistryImpl = async () => { throw new Error('API unavailable'); };
      ofetchImpl = async (url: string) => {
        if (url.includes('raw.githubusercontent.com')) {
          return {
            version: 1,
            updated: '2026-01-01',
            aspects: { 'fallback-aspect': { latest: '1.0.0', versions: {} } },
          };
        }
        throw new Error('Unknown URL');
      };

      const index = await fetchRegistryIndex();
      expect(index.aspects).toHaveProperty('fallback-aspect');
    });
  });

  describe('getRegistryAspect', () => {
    test('returns aspect from API', async () => {
      // getRegistryAspect converts ApiAspectDetail to RegistryAspect
      // RegistryAspect has: latest, versions, metadata (no "name" field)
      const aspect = await getRegistryAspect('test-aspect');
      expect(aspect).not.toBeNull();
      expect(aspect?.latest).toBe('1.0.0');
      expect(aspect?.metadata?.publisher).toBe('test');
    });

    test('returns null for 404 from API', async () => {
      apiGetAspectImpl = async () => {
        throw new ApiClientError('Not found', 404, 'not_found');
      };

      const aspect = await getRegistryAspect('nonexistent');
      expect(aspect).toBeNull();
    });

    test('falls back to index on non-404 API error', async () => {
      apiGetAspectImpl = async () => {
        throw new ApiClientError('Server error', 500);
      };

      // Index has 'test-aspect', so fallback should find it
      const aspect = await getRegistryAspect('test-aspect');
      expect(aspect).not.toBeNull();
      expect(aspect?.latest).toBe('1.0.0');
    });
  });

  describe('searchRegistry', () => {
    test('delegates to api searchAspects', async () => {
      let receivedParams: unknown = null;
      apiSearchImpl = async (params: Record<string, unknown>) => {
        receivedParams = params;
        return { total: 1, results: [{ name: 'found' }] };
      };

      const result = await searchRegistry({ q: 'wizard' });
      expect(result.total).toBe(1);
      expect(receivedParams).toEqual({ q: 'wizard' });
    });
  });

  describe('getAspectDetail', () => {
    test('returns detail from API', async () => {
      const detail = await getAspectDetail('test-aspect');
      expect(detail).not.toBeNull();
      expect(detail?.name).toBe('test-aspect');
    });

    test('returns null on 404', async () => {
      apiGetAspectImpl = async () => {
        throw new ApiClientError('Not found', 404, 'not_found');
      };
      const detail = await getAspectDetail('nonexistent');
      expect(detail).toBeNull();
    });

    test('throws on non-404 errors', async () => {
      apiGetAspectImpl = async () => {
        throw new ApiClientError('Server error', 500);
      };
      try {
        await getAspectDetail('test');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        expect((err as InstanceType<typeof ApiClientError>).statusCode).toBe(500);
      }
    });
  });

  describe('clearRegistryCache', () => {
    test('allows re-fetching after clear', async () => {
      let fetchCount = 0;
      apiGetRegistryImpl = async () => {
        fetchCount++;
        return { version: 2, updated: '2026-01-01', aspects: {} };
      };

      await fetchRegistryIndex();
      await fetchRegistryIndex();
      expect(fetchCount).toBe(1); // cached

      clearRegistryCache();
      await fetchRegistryIndex();
      expect(fetchCount).toBe(2); // re-fetched
    });
  });
});
