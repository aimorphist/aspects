import { ofetch } from 'ofetch';
import type { RegistryIndex, RegistryAspect } from './types';

const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/aimorphist/aspects/main/registry/index.json';

let cachedIndex: RegistryIndex | null = null;

/**
 * Fetch the registry index.
 */
export async function fetchRegistryIndex(registryUrl?: string): Promise<RegistryIndex> {
  if (cachedIndex) return cachedIndex;
  
  const url = registryUrl ?? DEFAULT_REGISTRY_URL;
  try {
    const result = await ofetch(url, { parseResponse: JSON.parse });
    if (!result) {
      throw new Error('Registry returned empty response');
    }
    cachedIndex = result as RegistryIndex;
    return cachedIndex;
  } catch (err) {
    throw new Error(`Failed to fetch registry from ${url}: ${(err as Error).message}`);
  }
}

/**
 * Get info about an aspect from the registry.
 */
export async function getRegistryAspect(name: string): Promise<RegistryAspect | null> {
  const index = await fetchRegistryIndex();
  return index.aspects[name] ?? null;
}

/**
 * Fetch the aspect.yaml content from the registry.
 */
export async function fetchAspectYaml(url: string): Promise<string> {
  return await ofetch(url, { responseType: 'text' });
}

/**
 * Clear the cached registry index (useful for testing).
 */
export function clearRegistryCache(): void {
  cachedIndex = null;
}
