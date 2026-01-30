import { resolve, isAbsolute } from 'node:path';
import type { InstallSpec } from './types';

/**
 * Parse an install spec string into a typed InstallSpec.
 * 
 * Examples:
 *   "alaric"              → { type: 'registry', name: 'alaric' }
 *   "alaric@1.0.0"        → { type: 'registry', name: 'alaric', version: '1.0.0' }
 *   "morphist/alaric"     → { type: 'registry', name: 'alaric', publisher: 'morphist' }
 *   "morphist/alaric@1.0" → { type: 'registry', name: 'alaric', publisher: 'morphist', version: '1.0' }
 *   "blake3:<hash>"       → { type: 'hash', hash: '<hash>' }
 *   "hash:<hash>"         → { type: 'hash', hash: '<hash>' } (alias)
 *   "github:user/repo"    → { type: 'github', owner: 'user', repo: 'repo' }
 *   "./path"              → { type: 'local', path: '/abs/path' }
 *   "/abs/path"           → { type: 'local', path: '/abs/path' }
 */
export function parseInstallSpec(spec: string): InstallSpec {
  // Hash-based (content-addressed) - support both "blake3:" and "hash:" prefixes
  if (spec.startsWith('blake3:') || spec.startsWith('hash:')) {
    const hash = spec.startsWith('blake3:') ? spec.slice(7) : spec.slice(5);
    if (hash.length < 16) {
      throw new Error(`Invalid hash spec: ${spec}. Hash must be at least 16 characters.`);
    }
    return { type: 'hash', hash };
  }

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

  // Registry: qualified (publisher/name) or unqualified (name)
  // Format: [publisher/]name[@version]
  let name: string;
  let publisher: string | undefined;
  let version: string | undefined;

  // Split off version first (last @)
  const atIndex = spec.lastIndexOf('@');
  let nameWithPublisher: string;
  if (atIndex > 0) {
    nameWithPublisher = spec.slice(0, atIndex);
    version = spec.slice(atIndex + 1);
  } else {
    nameWithPublisher = spec;
  }

  // Check for qualified name (publisher/name or @publisher/name)
  const slashIndex = nameWithPublisher.indexOf('/');
  if (slashIndex > 0) {
    publisher = nameWithPublisher.slice(0, slashIndex);
    // Strip leading @ from publisher (npm-style compat)
    if (publisher.startsWith('@')) {
      publisher = publisher.slice(1);
    }
    name = nameWithPublisher.slice(slashIndex + 1);
    if (!name) {
      throw new Error(`Invalid spec: ${spec}. Expected publisher/name format.`);
    }
  } else {
    name = nameWithPublisher;
  }

  return { type: 'registry', name, publisher, version };
}

/**
 * Format a registry spec back to string form.
 */
export function formatRegistrySpec(name: string, publisher?: string, version?: string): string {
  let spec = publisher ? `${publisher}/${name}` : name;
  if (version) spec += `@${version}`;
  return spec;
}
