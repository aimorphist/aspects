import { join } from 'node:path';
import { getAspectPath, findProjectRoot, type InstallScope } from '../utils/paths';
import { getInstalledAspect, findInstalledAspect } from './config';
import { parseAspectFile } from './parser';
import type { Aspect, InstalledAspect } from './types';

const ASPECT_FILENAME = 'aspect.json';
const LEGACY_FILENAME = 'aspect.yaml';

/**
 * Result from findAndLoadAspect - includes aspect, scope, and install metadata.
 */
export interface FoundAspect {
  aspect: Aspect;
  scope: InstallScope;
  meta: InstalledAspect;
}

/**
 * Find and load an aspect by name, searching both project and global scopes.
 * Prefers project scope if the aspect exists in both.
 * 
 * This is the canonical way to look up an installed aspect by name.
 */
export async function findAndLoadAspect(name: string): Promise<FoundAspect | null> {
  const projectRoot = await findProjectRoot() || undefined;
  const installed = await findInstalledAspect(name, projectRoot);
  
  if (installed.length === 0) return null;
  
  // Prefer project scope if available
  const match = installed.find(i => i.scope === 'project') || installed[0]!;
  const aspect = await loadInstalledAspect(name, match.scope, projectRoot);
  
  if (!aspect) return null;
  
  return {
    aspect,
    scope: match.scope,
    meta: match,
  };
}

/**
 * Load an installed aspect by name.
 * Tries aspect.json first, falls back to aspect.yaml for backwards compat.
 * 
 * NOTE: For most use cases, prefer findAndLoadAspect() which searches both scopes.
 * Use this when you already know the scope (e.g., iterating listInstalledAspects).
 */
export async function loadInstalledAspect(
  name: string,
  scope: InstallScope = 'global',
  projectRoot?: string,
): Promise<Aspect | null> {
  const installed = await getInstalledAspect(name, scope, projectRoot);
  if (!installed) return null;

  // Use custom path for local installs, otherwise standard path
  const aspectDir = installed.localPath ?? getAspectPath(name, scope, projectRoot);

  // Try aspect.json first
  const jsonResult = await parseAspectFile(join(aspectDir, ASPECT_FILENAME));
  if (jsonResult.success) return jsonResult.aspect;

  // Fall back to aspect.yaml
  const yamlResult = await parseAspectFile(join(aspectDir, LEGACY_FILENAME));
  return yamlResult.success ? yamlResult.aspect : null;
}
