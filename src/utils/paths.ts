import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, stat } from 'node:fs/promises';

/** Installation scope: global (~/.aspects) or project (./.aspects) */
export type InstallScope = 'global' | 'project';

/** Base directory for global aspects storage */
export const ASPECTS_HOME = join(homedir(), '.aspects');

/** Project-local aspects directory name */
export const PROJECT_ASPECTS_DIR_NAME = '.aspects';

/** Directory where aspect packages are stored */
export const ASPECTS_DIR = join(ASPECTS_HOME, 'aspects');

/** Directory where sets are stored */
export const SETS_DIR = join(ASPECTS_HOME, 'sets');

/** Path to the global config file */
export const CONFIG_PATH = join(ASPECTS_HOME, 'config.json');

/** Cached project root (memoized per process) */
let cachedProjectRoot: string | null = null;

/**
 * Find the project root by walking up from cwd looking for .aspects/ or aspects.json.
 * Returns null if no project root found.
 */
export async function findProjectRoot(): Promise<string | null> {
  if (cachedProjectRoot !== null) return cachedProjectRoot || null;

  let dir = process.cwd();
  const root = '/';

  while (dir !== root) {
    try {
      await stat(join(dir, PROJECT_ASPECTS_DIR_NAME));
      cachedProjectRoot = dir;
      return dir;
    } catch {
      // Try aspects.json as alternative marker
      try {
        await stat(join(dir, 'aspects.json'));
        cachedProjectRoot = dir;
        return dir;
      } catch {
        // Continue walking up
      }
    }
    dir = join(dir, '..');
  }

  cachedProjectRoot = '';
  return null;
}

/**
 * Get the aspects base directory for a given scope.
 */
export function getAspectsHome(scope: InstallScope, projectRoot?: string): string {
  if (scope === 'global') {
    return ASPECTS_HOME;
  }
  return join(projectRoot || process.cwd(), PROJECT_ASPECTS_DIR_NAME);
}

/**
 * Get the config path for a given scope.
 */
export function getConfigPath(scope: InstallScope, projectRoot?: string): string {
  return join(getAspectsHome(scope, projectRoot), 'config.json');
}

/**
 * Determine the default scope based on project detection.
 * If a project root exists, default to project scope; otherwise global.
 */
export async function getDefaultScope(): Promise<InstallScope> {
  const projectRoot = await findProjectRoot();
  return projectRoot ? 'project' : 'global';
}

/**
 * Ensure the aspects directory structure exists.
 * Creates ~/.aspects/ and ~/.aspects/aspects/ if they don't exist.
 */
export async function ensureAspectsDir(scope: InstallScope = 'global', projectRoot?: string): Promise<void> {
  const aspectsDir = join(getAspectsHome(scope, projectRoot), 'aspects');
  await mkdir(aspectsDir, { recursive: true });
}

/**
 * Ensure the sets directory exists.
 */
export async function ensureSetsDir(scope: InstallScope = 'global', projectRoot?: string): Promise<void> {
  const setsDir = join(getAspectsHome(scope, projectRoot), 'sets');
  await mkdir(setsDir, { recursive: true });
}

/**
 * Get the sets directory path.
 */
export function getSetsDir(scope: InstallScope = 'global', projectRoot?: string): string {
  return join(getAspectsHome(scope, projectRoot), 'sets');
}

/**
 * Get the path where an aspect would be installed.
 * Handles scoped packages: @scope/name -> @scope/name/
 */
export function getAspectPath(name: string, scope: InstallScope = 'global', projectRoot?: string): string {
  const aspectsDir = join(getAspectsHome(scope, projectRoot), 'aspects');
  return join(aspectsDir, name);
}
