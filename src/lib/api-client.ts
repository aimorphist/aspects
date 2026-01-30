import { ofetch, type FetchError } from 'ofetch';
import { getRegistryUrl, getAuthToken } from './config';
import type {
  Aspect,
  RegistryIndex,
  ApiAspectDetail,
  ApiVersionContent,
  ApiSearchResult,
  ApiPublishResponse,
  ApiAnonymousPublishResponse,
  ApiUnpublishResponse,
  ApiDeviceCode,
  ApiDevicePoll,
  ApiStats,
  ApiCategories,
} from './types';

// --- Cache ---

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
}

export function clearApiCache(): void {
  cache.clear();
}

// --- Error handling ---

export class ApiClientError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

function parseApiError(err: unknown): ApiClientError {
  const fetchErr = err as FetchError;
  const status = fetchErr?.statusCode ?? fetchErr?.status ?? 0;
  const body = fetchErr?.data;

  if (body && typeof body === 'object' && 'message' in body) {
    return new ApiClientError(
      (body as { message: string }).message,
      status as number,
      (body as { error?: string }).error,
    );
  }

  if (status === 0 || !status) {
    return new ApiClientError(
      'Network error. Check your connection and try again.',
      0,
      'network_error',
    );
  }

  return new ApiClientError(
    `Request failed with status ${status}`,
    status as number,
  );
}

// --- Fetch with retry ---

const MAX_RETRIES = 3;
const TIMEOUT_MS = 30_000;

async function apiFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    auth?: boolean;
    baseUrl?: string;
  } = {},
): Promise<T> {
  const baseUrl = options.baseUrl ?? await getRegistryUrl();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (options.auth) {
    const token = await getAuthToken();
    if (!token) {
      throw new ApiClientError(
        'Not logged in. Run "aspects login" first.',
        401,
        'unauthorized',
      );
    }
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await ofetch<T>(url, {
        method: (options.method ?? 'GET') as 'GET' | 'POST' | 'DELETE',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        timeout: TIMEOUT_MS,
        parseResponse: JSON.parse,
      });
    } catch (err) {
      lastError = err;
      const fetchErr = err as FetchError;
      const status = fetchErr?.statusCode ?? fetchErr?.status ?? 0;

      // Don't retry client errors (4xx) except rate limits
      if (status >= 400 && status < 500 && status !== 429) {
        throw parseApiError(err);
      }

      // Retry on 429 or 5xx
      if (attempt < MAX_RETRIES && (status === 429 || status >= 500 || status === 0)) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }
  }

  throw parseApiError(lastError);
}

// --- API Methods ---

/**
 * GET /registry — Full registry index (cached 5 min)
 */
export async function getRegistry(baseUrl?: string): Promise<RegistryIndex> {
  const cacheKey = `registry:${baseUrl ?? 'default'}`;
  const cached = getCached<RegistryIndex>(cacheKey);
  if (cached) return cached;

  const data = await apiFetch<RegistryIndex>('/registry', { baseUrl });
  setCache(cacheKey, data, 5 * 60 * 1000); // 5 min TTL
  return data;
}

/**
 * GET /aspects/:name — Aspect metadata with all versions
 */
export async function getAspect(name: string): Promise<ApiAspectDetail> {
  return apiFetch<ApiAspectDetail>(`/aspects/${encodeURIComponent(name)}`);
}

/**
 * GET /aspects/:name/:version — Specific version content
 */
export async function getAspectVersion(
  name: string,
  version: string,
): Promise<ApiVersionContent> {
  return apiFetch<ApiVersionContent>(
    `/aspects/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
  );
}

/**
 * GET /search — Full-text search
 */
export async function searchAspects(params: {
  q?: string;
  category?: string;
  trust?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiSearchResult> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set('q', params.q);
  if (params.category) searchParams.set('category', params.category);
  if (params.trust) searchParams.set('trust', params.trust);
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.offset) searchParams.set('offset', String(params.offset));

  const query = searchParams.toString();
  return apiFetch<ApiSearchResult>(`/search${query ? `?${query}` : ''}`);
}

/**
 * POST /aspects — Publish a new aspect (auth required)
 */
export async function publishAspect(aspect: Aspect): Promise<ApiPublishResponse> {
  return apiFetch<ApiPublishResponse>('/aspects', {
    method: 'POST',
    body: { aspect },
    auth: true,
  });
}

/**
 * POST /aspects/blob — Publish anonymously by hash (no auth)
 * Content-addressable storage: same content = same hash, idempotent
 */
export async function publishAnonymous(aspect: Aspect): Promise<ApiAnonymousPublishResponse> {
  return apiFetch<ApiAnonymousPublishResponse>('/aspects/blob', {
    method: 'POST',
    body: aspect,
    auth: false,
  });
}

/**
 * GET /aspects/blob/:hash — Fetch aspect by blake3 hash (no auth)
 */
export async function getAspectByHash(hash: string): Promise<ApiVersionContent> {
  return apiFetch<ApiVersionContent>(`/aspects/blob/${encodeURIComponent(hash)}`);
}

/**
 * DELETE /aspects/:name/:version — Unpublish a version (auth required)
 */
export async function unpublishAspect(
  name: string,
  version: string,
): Promise<ApiUnpublishResponse> {
  return apiFetch<ApiUnpublishResponse>(
    `/aspects/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
    { method: 'DELETE', auth: true },
  );
}

/**
 * GET /stats — Aggregate statistics
 */
export async function getStats(): Promise<ApiStats> {
  const cached = getCached<ApiStats>('stats');
  if (cached) return cached;

  const data = await apiFetch<ApiStats>('/stats');
  setCache('stats', data, 5 * 60 * 1000); // 5 min TTL
  return data;
}

/**
 * GET /categories — Official categories list
 */
export async function getCategories(): Promise<ApiCategories> {
  const cached = getCached<ApiCategories>('categories');
  if (cached) return cached;

  const data = await apiFetch<ApiCategories>('/categories');
  setCache('categories', data, 24 * 60 * 60 * 1000); // 24 hr TTL
  return data;
}

/**
 * POST /auth/device — Initiate device authorization
 */
export async function initiateDeviceAuth(): Promise<ApiDeviceCode> {
  return apiFetch<ApiDeviceCode>('/auth/device', { method: 'POST' });
}

/**
 * POST /auth/device/poll — Poll for authorization result
 */
export async function pollDeviceAuth(
  deviceCode: string,
  codeVerifier: string,
): Promise<ApiDevicePoll> {
  // Don't retry on poll — caller handles polling loop
  const baseUrl = await getRegistryUrl();
  const url = `${baseUrl}/auth/device/poll`;

  return ofetch<ApiDevicePoll>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ device_code: deviceCode, code_verifier: codeVerifier }),
    timeout: TIMEOUT_MS,
    parseResponse: JSON.parse,
  });
}
