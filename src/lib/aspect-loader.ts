import { join } from 'node:path';
import { getAspectPath } from '../utils/paths';
import { parseAspectFile } from './parser';
import type { Aspect } from './types';

/**
 * Load an installed aspect by name.
 */
export async function loadInstalledAspect(name: string): Promise<Aspect | null> {
  const aspectDir = getAspectPath(name);
  const yamlPath = join(aspectDir, 'aspect.yaml');

  const result = await parseAspectFile(yamlPath);

  if (!result.success) {
    return null;
  }

  return result.aspect;
}
