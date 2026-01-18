import { resolve, isAbsolute } from 'node:path';
import type { InstallSpec } from './types';

/**
 * Parse an install spec string into a typed InstallSpec.
 * 
 * Examples:
 *   "alaric"           → { type: 'registry', name: 'alaric' }
 *   "alaric@1.0.0"     → { type: 'registry', name: 'alaric', version: '1.0.0' }
 *   "@scope/name"      → { type: 'registry', name: '@scope/name' }
 *   "github:user/repo" → { type: 'github', owner: 'user', repo: 'repo' }
 *   "./path"           → { type: 'local', path: '/abs/path' }
 *   "/abs/path"        → { type: 'local', path: '/abs/path' }
 */
export function parseInstallSpec(spec: string): InstallSpec {
  // GitHub source
  if (spec.startsWith('github:')) {
    const rest = spec.slice(7);
    const parts = rest.split('@');
    const ownerRepo = parts[0];
    if (!ownerRepo) {
      throw new Error(`Invalid GitHub spec: ${spec}. Expected github:owner/repo`);
    }
    const ref = parts[1];
    const [owner, repo] = ownerRepo.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid GitHub spec: ${spec}. Expected github:owner/repo`);
    }
    return { type: 'github', owner, repo, ref };
  }

  // Local path (starts with . or /)
  if (spec.startsWith('.') || spec.startsWith('/')) {
    const absolutePath = isAbsolute(spec) ? spec : resolve(process.cwd(), spec);
    return { type: 'local', path: absolutePath };
  }

  // Registry (with optional @version)
  // Handle scoped packages: @scope/name@version
  let name: string;
  let version: string | undefined;

  if (spec.startsWith('@')) {
    // Scoped: @scope/name or @scope/name@version
    const lastAtIndex = spec.lastIndexOf('@');
    if (lastAtIndex > 0 && spec.indexOf('/') < lastAtIndex) {
      // Has version: @scope/name@1.0.0
      name = spec.slice(0, lastAtIndex);
      version = spec.slice(lastAtIndex + 1);
    } else {
      // No version: @scope/name
      name = spec;
    }
  } else {
    // Unscoped: name or name@version
    const atIndex = spec.indexOf('@');
    if (atIndex > 0) {
      name = spec.slice(0, atIndex);
      version = spec.slice(atIndex + 1);
    } else {
      name = spec;
    }
  }

  return { type: 'registry', name, version };
}
