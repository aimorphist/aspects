import { join } from 'node:path';
import { getAspectPath } from '../utils/paths';
import { getInstalledAspect } from './config';
import { parseAspectFile } from './parser';
import type { Aspect } from './types';

/**
 * Load an installed aspect by name.
 */
export async function loadInstalledAspect(name: string): Promise<Aspect | null> {
  const installed = await getInstalledAspect(name);
  if (!installed) return null;

  // Use custom path for local installs, otherwise standard path
  const aspectDir = installed.path ?? getAspectPath(name);
  const yamlPath = join(aspectDir, 'aspect.yaml');

  const result = await parseAspectFile(yamlPath);
  return result.success ? result.aspect : null;
}
