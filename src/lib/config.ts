import { readFile, writeFile } from 'node:fs/promises';
import { CONFIG_PATH, ensureAspectsDir } from '../utils/paths';
import type { AspectsConfig } from './types';

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
