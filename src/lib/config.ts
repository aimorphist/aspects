import { readFile, writeFile } from 'node:fs/promises';
import { CONFIG_PATH, ensureAspectsDir } from '../utils/paths';
import type { AspectsConfig, AuthTokens } from './types';

const DEFAULT_REGISTRY_API_URL = 'http://localhost:5173/api/v1';

/**
 * Default config for new installations
 */
export function createDefaultConfig(): AspectsConfig {
  return {
    version: 1,
    installed: {},
    settings: {},
  };
}

/**
 * Read the config file. Creates default if doesn't exist.
 */
export async function readConfig(): Promise<AspectsConfig> {
  await ensureAspectsDir();

  try {
    const content = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(content) as AspectsConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      const config = createDefaultConfig();
      await writeConfig(config);
      return config;
    }
    throw err;
  }
}

/**
 * Write the config file.
 */
export async function writeConfig(config: AspectsConfig): Promise<void> {
  await ensureAspectsDir();
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Add an installed aspect to the config.
 */
export async function addInstalledAspect(
  name: string,
  info: AspectsConfig['installed'][string]
): Promise<void> {
  const config = await readConfig();
  config.installed[name] = info;
  await writeConfig(config);
}

/**
 * Remove an installed aspect from the config.
 */
export async function removeInstalledAspect(name: string): Promise<boolean> {
  const config = await readConfig();
  if (!(name in config.installed)) {
    return false;
  }
  delete config.installed[name];
  await writeConfig(config);
  return true;
}

/**
 * Get info about an installed aspect.
 */
export async function getInstalledAspect(
  name: string
): Promise<AspectsConfig['installed'][string] | null> {
  const config = await readConfig();
  return config.installed[name] ?? null;
}

/**
 * List all installed aspects.
 */
export async function listInstalledAspects(): Promise<
  Array<{ name: string } & AspectsConfig['installed'][string]>
> {
  const config = await readConfig();
  return Object.entries(config.installed).map(([name, info]) => ({
    name,
    ...info,
  }));
}

// --- Auth helpers ---

/**
 * Get the registry API base URL from config or default.
 */
export async function getRegistryUrl(): Promise<string> {
  const config = await readConfig();
  return config.settings.registryUrl ?? DEFAULT_REGISTRY_API_URL;
}

/**
 * Get stored auth token, or null if not logged in.
 */
export async function getAuthToken(): Promise<string | null> {
  const config = await readConfig();
  if (!config.auth?.accessToken) return null;

  // Check if token is expired
  if (config.auth.expiresAt && new Date(config.auth.expiresAt) < new Date()) {
    return null;
  }

  return config.auth.accessToken;
}

/**
 * Get full auth info, or null if not logged in.
 */
export async function getAuth(): Promise<AuthTokens | null> {
  const config = await readConfig();
  return config.auth ?? null;
}

/**
 * Check if user is currently logged in with a valid token.
 */
export async function isLoggedIn(): Promise<boolean> {
  return (await getAuthToken()) !== null;
}

/**
 * Store auth tokens after successful login.
 */
export async function setAuthTokens(tokens: AuthTokens): Promise<void> {
  const config = await readConfig();
  config.auth = tokens;
  await writeConfig(config);
}

/**
 * Clear auth tokens (logout).
 */
export async function clearAuth(): Promise<void> {
  const config = await readConfig();
  delete config.auth;
  await writeConfig(config);
}
