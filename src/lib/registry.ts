import { ofetch } from 'ofetch';
import * as api from './api-client';
import type {
  RegistryIndex,
  RegistryAspect,
  ApiAspectDetail,
  ApiVersionContent,
  ApiSearchResult,
} from './types';

const FALLBACK_REGISTRY_URL = 'https://raw.githubusercontent.com/aimorphist/aspects/main/registry/index.json';

let cachedIndex: RegistryIndex | null = null;

/**
 * Fetch the full registry index.
 * Tries the REST API first, falls back to static GitHub URL.
 */
export async function fetchRegistryIndex(): Promise<RegistryIndex> {
  if (cachedIndex) return cachedIndex;

  try {
    cachedIndex = await api.getRegistry();
    return cachedIndex;
  } catch {
    // Fallback to static GitHub registry
    try {
      const result = await ofetch(FALLBACK_REGISTRY_URL, { parseResponse: JSON.parse });
      if (!result) throw new Error('Registry returned empty response');
      cachedIndex = result as RegistryIndex;
      return cachedIndex;
    } catch (err) {
      throw new Error(`Failed to fetch registry: ${(err as Error).message}`);
    }
  }
}

/**
 * Get info about an aspect from the registry.
 * Uses the API for direct lookup, falls back to full index.
 */
export async function getRegistryAspect(name: string): Promise<RegistryAspect | null> {
  try {
    const detail = await api.getAspect(name);
    return apiDetailToRegistryAspect(detail);
  } catch (err) {
    if (err instanceof api.ApiClientError && err.statusCode === 404) {
      return null;
    }
    // Fallback: try fetching from full index
    try {
      const index = await fetchRegistryIndex();
      return index.aspects[name] ?? null;
    } catch {
      throw err; // Re-throw the original API error
    }
  }
}

/**
 * Fetch a specific version of an aspect from the API.
 */
export async function fetchAspectVersion(
  name: string,
  version: string,
): Promise<ApiVersionContent> {
  return api.getAspectVersion(name, version);
}

/**
 * Fetch the aspect content as raw text (legacy compatibility).
 * For new code, prefer fetchAspectVersion() which returns parsed content.
 */
export async function fetchAspectContent(url: string): Promise<string> {
  return await ofetch(url, { responseType: 'text' });
}

/**
 * Search the registry using the API.
 */
export async function searchRegistry(params: {
  q?: string;
  category?: string;
  trust?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiSearchResult> {
  return api.searchAspects(params);
}

/**
 * Get detailed aspect info from the API.
 */
export async function getAspectDetail(name: string): Promise<ApiAspectDetail | null> {
  try {
    return await api.getAspect(name);
  } catch (err) {
    if (err instanceof api.ApiClientError && err.statusCode === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Clear all cached registry data.
 */
export function clearRegistryCache(): void {
  cachedIndex = null;
  api.clearApiCache();
}

/**
 * Fetch aspect version content by blake3 hash.
 */
export async function fetchAspectByHash(hash: string): Promise<ApiVersionContent> {
  return api.getAspectByHash(hash);
}

// --- Internal helpers ---

function apiDetailToRegistryAspect(detail: ApiAspectDetail): RegistryAspect {
  const versions: Record<string, { published: string; url: string; blake3?: string; size?: number }> = {};

  for (const [ver, info] of Object.entries(detail.versions)) {
    versions[ver] = {
      published: info.published,
      url: '', // API-based installs don't use URLs
      blake3: info.blake3,
      size: info.size,
    };
  }

  return {
    latest: detail.latest,
    versions,
    metadata: {
      displayName: detail.versions[detail.latest]?.aspect?.displayName ?? detail.name,
      tagline: detail.versions[detail.latest]?.aspect?.tagline ?? '',
      category: detail.versions[detail.latest]?.aspect?.category,
      tags: detail.versions[detail.latest]?.aspect?.tags,
      publisher: detail.publisher,
      trust: detail.trust,
    },
  };
}
