# Phase 4: Install Command Implementation Plan

## Overview

Implement `aspects install <spec>` for registry and local sources. This is the core functionality that makes the CLI useful.

## Current State

- Parser + validation working (`src/lib/parser.ts`, `src/lib/schema.ts`)
- Config management working (`src/lib/config.ts`)
- Path helpers working (`src/utils/paths.ts`)
- `InstallSpec` type defined in `types.ts`
- Install command is a stub
- Sample aspects exist in `registry/aspects/`

## Desired End State

```bash
# Install from registry
aspects install alaric
aspects install alaric@1.0.0

# Install from local path (registers, doesn't copy)
aspects install ./my-aspect
aspects install /path/to/aspect.yaml

# GitHub (parsed but not yet supported)
aspects install github:user/repo  # → "GitHub install coming soon"
```

### Verification

```bash
bun run dev install alaric        # Downloads from registry
bun run dev install ./registry/aspects/alaric  # Registers local path
bun run dev list                  # Shows installed
bun run dev info alaric           # Shows details
bun run typecheck                 # No errors
```

## What We're NOT Doing

- GitHub source support (Phase 7)
- Signature verification (Phase 8)
- Version resolution/ranges (just exact versions)
- Scoped packages (@publisher/name) — parse but treat as simple name for now

---

## Phase 4.1: Update Types + Resolver

### Overview

Add `path` field to `InstalledAspect` for local installs, implement spec parsing.

### Changes Required:

#### 1. Update `src/lib/types.ts`

Add optional path field for local installs:

```typescript
export interface InstalledAspect {
  version: string;
  source: 'registry' | 'github' | 'local';
  installedAt: string;
  sha256: string;
  path?: string;  // For local installs - absolute path to aspect dir
}
```

#### 2. Create `src/lib/resolver.ts`

```typescript
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
    const [ownerRepo, ref] = rest.split('@');
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
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes
- [x] Resolver correctly parses all spec formats

---

## Phase 4.2: Registry Client

### Overview

Create registry index.json and implement fetch logic.

### Changes Required:

#### 1. Create `registry/index.json`

```json
{
  "version": 1,
  "updated": "2026-01-18T00:00:00Z",
  "aspects": {
    "alaric": {
      "latest": "1.0.0",
      "versions": {
        "1.0.0": {
          "published": "2026-01-18T00:00:00Z",
          "url": "https://raw.githubusercontent.com/morphist/aspects/main/registry/aspects/alaric/aspect.yaml"
        }
      },
      "metadata": {
        "displayName": "Alaric the Wizard",
        "tagline": "Quirky wizard, D&D expert, can run campaigns",
        "publisher": "morphist",
        "trust": "verified"
      }
    },
    "default": {
      "latest": "1.0.0",
      "versions": {
        "1.0.0": {
          "published": "2026-01-18T00:00:00Z",
          "url": "https://raw.githubusercontent.com/morphist/aspects/main/registry/aspects/default/aspect.yaml"
        }
      },
      "metadata": {
        "displayName": "Morphist Default",
        "tagline": "Helpful voice AI assistant",
        "publisher": "morphist",
        "trust": "verified"
      }
    }
  }
}
```

#### 2. Add registry types to `src/lib/types.ts`

```typescript
/** Registry index.json structure */
export interface RegistryIndex {
  version: number;
  updated: string;
  aspects: Record<string, RegistryAspect>;
}

export interface RegistryAspect {
  latest: string;
  versions: Record<string, RegistryVersion>;
  metadata: {
    displayName: string;
    tagline: string;
    publisher?: string;
    trust: 'verified' | 'community';
  };
}

export interface RegistryVersion {
  published: string;
  url: string;
  sha256?: string;
  size?: number;
}
```

#### 3. Create `src/lib/registry.ts`

```typescript
import { ofetch } from 'ofetch';
import type { RegistryIndex, RegistryAspect } from './types';

const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/morphist/aspects/main/registry/index.json';

let cachedIndex: RegistryIndex | null = null;

/**
 * Fetch the registry index.
 */
export async function fetchRegistryIndex(registryUrl?: string): Promise<RegistryIndex> {
  if (cachedIndex) return cachedIndex;
  
  const url = registryUrl ?? DEFAULT_REGISTRY_URL;
  cachedIndex = await ofetch<RegistryIndex>(url);
  return cachedIndex;
}

/**
 * Get info about an aspect from the registry.
 */
export async function getRegistryAspect(name: string): Promise<RegistryAspect | null> {
  const index = await fetchRegistryIndex();
  return index.aspects[name] ?? null;
}

/**
 * Fetch the aspect.yaml content from the registry.
 */
export async function fetchAspectYaml(url: string): Promise<string> {
  return await ofetch<string>(url, { responseType: 'text' });
}

/**
 * Clear the cached registry index (useful for testing).
 */
export function clearRegistryCache(): void {
  cachedIndex = null;
}
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes
- [x] Registry types defined correctly

---

## Phase 4.3: Installer Core

### Overview

Implement the core installation logic that handles both registry and local sources.

### Changes Required:

#### 1. Create `src/utils/hash.ts`

```typescript
import { createHash } from 'node:crypto';

/**
 * Compute SHA-256 hash of a string.
 */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}
```

#### 2. Create `src/lib/installer.ts`

```typescript
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { InstallSpec, InstalledAspect, Aspect } from './types';
import { parseAspectYaml, parseAspectFile } from './parser';
import { getRegistryAspect, fetchAspectYaml } from './registry';
import { addInstalledAspect, getInstalledAspect } from './config';
import { getAspectPath, ensureAspectsDir } from '../utils/paths';
import { sha256 } from '../utils/hash';
import { log } from '../utils/logger';

export interface InstallResult {
  success: true;
  aspect: Aspect;
  source: 'registry' | 'local';
  alreadyInstalled?: boolean;
} | {
  success: false;
  error: string;
}

/**
 * Install an aspect from a parsed spec.
 */
export async function installAspect(spec: InstallSpec): Promise<InstallResult> {
  switch (spec.type) {
    case 'registry':
      return installFromRegistry(spec.name, spec.version);
    case 'local':
      return installFromLocal(spec.path);
    case 'github':
      return { success: false, error: 'GitHub install not yet supported. Coming in a future release!' };
  }
}

/**
 * Install from the registry.
 */
async function installFromRegistry(name: string, version?: string): Promise<InstallResult> {
  // Fetch registry info
  const registryAspect = await getRegistryAspect(name);
  if (!registryAspect) {
    return { success: false, error: `Aspect "${name}" not found in registry` };
  }

  const targetVersion = version ?? registryAspect.latest;
  const versionInfo = registryAspect.versions[targetVersion];
  if (!versionInfo) {
    const available = Object.keys(registryAspect.versions).join(', ');
    return { 
      success: false, 
      error: `Version "${targetVersion}" not found. Available: ${available}` 
    };
  }

  // Check if already installed at same version
  const existing = await getInstalledAspect(name);
  if (existing && existing.version === targetVersion) {
    const aspect = await loadAspectFromPath(getAspectPath(name));
    if (aspect) {
      return { success: true, aspect, source: 'registry', alreadyInstalled: true };
    }
  }

  // Fetch aspect.yaml
  log.start(`Fetching ${name}@${targetVersion}...`);
  let yamlContent: string;
  try {
    yamlContent = await fetchAspectYaml(versionInfo.url);
  } catch (err) {
    return { success: false, error: `Failed to fetch aspect: ${(err as Error).message}` };
  }

  // Parse and validate
  const parseResult = parseAspectYaml(yamlContent);
  if (!parseResult.success) {
    return { success: false, error: `Invalid aspect.yaml: ${parseResult.errors.join(', ')}` };
  }

  // Log warnings
  if (parseResult.warnings.length > 0) {
    parseResult.warnings.forEach(w => log.warn(w));
  }

  const aspect = parseResult.aspect;

  // Verify name matches
  if (aspect.name !== name) {
    return { 
      success: false, 
      error: `Aspect name mismatch: expected "${name}", got "${aspect.name}"` 
    };
  }

  // Store to ~/.aspects/aspects/<name>/
  await ensureAspectsDir();
  const aspectDir = getAspectPath(name);
  await mkdir(aspectDir, { recursive: true });
  await writeFile(join(aspectDir, 'aspect.yaml'), yamlContent);

  // Update config
  const hash = sha256(yamlContent);
  await addInstalledAspect(name, {
    version: aspect.version,
    source: 'registry',
    installedAt: new Date().toISOString(),
    sha256: hash,
  });

  return { success: true, aspect, source: 'registry' };
}

/**
 * Install from a local path.
 */
async function installFromLocal(path: string): Promise<InstallResult> {
  // Determine if path is a directory or file
  let yamlPath: string;
  let aspectDir: string;
  
  try {
    const stats = await stat(path);
    if (stats.isDirectory()) {
      aspectDir = path;
      yamlPath = join(path, 'aspect.yaml');
    } else {
      yamlPath = path;
      aspectDir = dirname(path);
    }
  } catch {
    return { success: false, error: `Path not found: ${path}` };
  }

  // Parse and validate
  const parseResult = await parseAspectFile(yamlPath);
  if (!parseResult.success) {
    return { success: false, error: parseResult.errors.join(', ') };
  }

  if (parseResult.warnings.length > 0) {
    parseResult.warnings.forEach(w => log.warn(w));
  }

  const aspect = parseResult.aspect;

  // Read content for hash
  const yamlContent = await readFile(yamlPath, 'utf-8');
  const hash = sha256(yamlContent);

  // Check if already installed from same path
  const existing = await getInstalledAspect(aspect.name);
  if (existing && existing.path === aspectDir && existing.sha256 === hash) {
    return { success: true, aspect, source: 'local', alreadyInstalled: true };
  }

  // Register in config (don't copy files)
  await addInstalledAspect(aspect.name, {
    version: aspect.version,
    source: 'local',
    installedAt: new Date().toISOString(),
    sha256: hash,
    path: aspectDir,
  });

  return { success: true, aspect, source: 'local' };
}

/**
 * Helper to load aspect from a path.
 */
async function loadAspectFromPath(aspectDir: string): Promise<Aspect | null> {
  const result = await parseAspectFile(join(aspectDir, 'aspect.yaml'));
  return result.success ? result.aspect : null;
}
```

#### 3. Update `src/lib/aspect-loader.ts`

Handle local installs with custom paths:

```typescript
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
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes
- [x] hash.ts correctly computes sha256

---

## Phase 4.4: Wire Up Install Command

### Overview

Connect installer to the CLI command with nice output.

### Changes Required:

#### 1. Update `src/commands/install.ts`

```typescript
import { defineCommand } from 'citty';
import { log } from '../utils/logger';
import { parseInstallSpec } from '../lib/resolver';
import { installAspect } from '../lib/installer';

export default defineCommand({
  meta: {
    name: 'install',
    description: 'Install an aspect from registry or local path',
  },
  args: {
    spec: {
      type: 'positional',
      description: 'Aspect name, @scope/name, github:user/repo, or path',
      required: true,
    },
  },
  async run({ args }) {
    let spec;
    try {
      spec = parseInstallSpec(args.spec);
    } catch (err) {
      log.error((err as Error).message);
      process.exit(1);
    }

    const result = await installAspect(spec);

    if (!result.success) {
      log.error(result.error);
      process.exit(1);
    }

    const { aspect, source, alreadyInstalled } = result;

    if (alreadyInstalled) {
      log.info(`${aspect.displayName} (${aspect.name}@${aspect.version}) already installed`);
    } else {
      log.success(`Installed ${aspect.displayName} (${aspect.name}@${aspect.version})`);
    }

    console.log();
    console.log(`  ${aspect.tagline}`);
    if (source === 'local') {
      console.log(`  Source: local`);
    }
    console.log();
  },
});
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes
- [x] `bun run dev install ./registry/aspects/alaric` registers local aspect
- [x] `bun run dev list` shows installed aspect
- [x] `bun run dev info alaric` shows details

#### Manual Verification:
- [x] `bun run dev install alaric` fetches from registry (once pushed to GitHub)
- [x] Reinstalling same version shows "already installed"
- [x] Installing non-existent aspect shows clear error
- [x] Installing from invalid path shows clear error

---

## Testing Strategy

### Local Testing (no network):
```bash
# Install from local path
bun run dev install ./registry/aspects/alaric
bun run dev list
bun run dev info alaric

# Try invalid paths
bun run dev install ./nonexistent
bun run dev install ./registry/aspects/_test-invalid
```

### Network Testing (after pushing to GitHub):
```bash
# Clear local install first
rm -rf ~/.aspects/aspects/alaric
# Remove from config manually or implement remove command

# Install from registry
bun run dev install alaric
bun run dev install default
```

---

## Implementation Order

1. Update `InstalledAspect` type with `path` field
2. Create `src/lib/resolver.ts`
3. Add registry types to `types.ts`
4. Create `registry/index.json`
5. Create `src/lib/registry.ts`
6. Create `src/utils/hash.ts`
7. Create `src/lib/installer.ts`
8. Update `src/lib/aspect-loader.ts`
9. Update `src/commands/install.ts`
10. Test locally

---

## References

- V1 plan: `docs/plans/v1-implementation.md`
- Phase 3 plan: `docs/plans/phase-3-parser-validation.md`
- Existing types: `src/lib/types.ts`
- Parser: `src/lib/parser.ts`
