import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

/** Base directory for aspects storage */
export const ASPECTS_HOME = join(homedir(), '.aspects');

/** Directory where aspect packages are stored */
export const ASPECTS_DIR = join(ASPECTS_HOME, 'aspects');

/** Path to the config file */
export const CONFIG_PATH = join(ASPECTS_HOME, 'config.json');

/**
 * Ensure the aspects directory structure exists.
 * Creates ~/.aspects/ and ~/.aspects/aspects/ if they don't exist.
 */
export async function ensureAspectsDir(): Promise<void> {
  await mkdir(ASPECTS_DIR, { recursive: true });
}

/**
 * Get the path where an aspect would be installed.
 * Handles scoped packages: @scope/name -> @scope/name/
 */
export function getAspectPath(name: string): string {
  return join(ASPECTS_DIR, name);
}
