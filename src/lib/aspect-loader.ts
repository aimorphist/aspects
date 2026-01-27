import { join } from 'node:path';
import { getAspectPath } from '../utils/paths';
import { getInstalledAspect } from './config';
import { parseAspectFile } from './parser';
import type { Aspect } from './types';

const ASPECT_FILENAME = 'aspect.json';
const LEGACY_FILENAME = 'aspect.yaml';

/**
 * Load an installed aspect by name.
 * Tries aspect.json first, falls back to aspect.yaml for backwards compat.
 */
export async function loadInstalledAspect(name: string): Promise<Aspect | null> {
  const installed = await getInstalledAspect(name);
  if (!installed) return null;

  // Use custom path for local installs, otherwise standard path
  const aspectDir = installed.path ?? getAspectPath(name);

  // Try aspect.json first
  const jsonResult = await parseAspectFile(join(aspectDir, ASPECT_FILENAME));
  if (jsonResult.success) return jsonResult.aspect;

  // Fall back to aspect.yaml
  const yamlResult = await parseAspectFile(join(aspectDir, LEGACY_FILENAME));
  return yamlResult.success ? yamlResult.aspect : null;
}
