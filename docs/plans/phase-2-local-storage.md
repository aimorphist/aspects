# Phase 2: Local Storage — Implementation Plan

> **Goal**: Read/write to `~/.aspects/` with working `list` command

## Overview

Implement the local storage layer for aspects. After this phase, the CLI can:
- Create `~/.aspects/` directory structure on first run
- Read/write `config.json` with installed aspects
- `aspects list` shows actually installed aspects (or "no aspects installed")

## Current State Analysis

- Types defined in `src/lib/types.ts`: `AspectsConfig`, `InstalledAspect`
- CLI scaffold complete with stub commands
- No paths.ts or config.ts yet
- `list` command just prints "not yet implemented"

## Desired End State

### Directory Structure Created
```
~/.aspects/
├── config.json   # { "version": 1, "installed": {}, "settings": {} }
└── aspects/      # empty directory, ready for installed aspects
```

### Working Commands
```bash
$ bun run dev list
No aspects installed.

# After manually adding to config.json for testing:
$ bun run dev list
Installed aspects:
  alaric@1.0.0          Quirky wizard, D&D expert
```

### Verification
```bash
# Config dir created
ls ~/.aspects/
# Should show: aspects/  config.json

# Config file has correct structure
cat ~/.aspects/config.json
# Should show: {"version":1,"installed":{},"settings":{}}

# List command works
bun run dev list
# Should show: No aspects installed.
```

## What We're NOT Doing

- Actual installation logic (Phase 4)
- YAML parsing (Phase 3)
- Registry fetching (Phase 4)
- Other commands beyond `list`

---

## Implementation Approach

1. Create `paths.ts` with path helpers and directory creation
2. Create `config.ts` with read/write/default config logic
3. Update `list` command to use config
4. Test the full flow

---

## Phase 2.1: Path Utilities

### `src/utils/paths.ts`

**Purpose**: Cross-platform path resolution and directory creation

```typescript
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
```

---

## Phase 2.2: Config Management

### `src/lib/config.ts`

**Purpose**: Read/write config.json with proper defaults

```typescript
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
```

---

## Phase 2.3: Update List Command

### `src/commands/list.ts`

**Purpose**: Show installed aspects from config

```typescript
import { defineCommand } from 'citty';
import { listInstalledAspects } from '../lib/config';
import { log } from '../utils/logger';

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List installed aspects',
  },
  args: {},
  async run() {
    const installed = await listInstalledAspects();
    
    if (installed.length === 0) {
      log.info('No aspects installed.');
      log.info('Run `aspects install <name>` to install an aspect.');
      return;
    }
    
    console.log('Installed aspects:\n');
    
    for (const aspect of installed) {
      const source = aspect.source === 'local' ? ' (local)' : '';
      console.log(`  ${aspect.name}@${aspect.version}${source}`);
    }
    
    console.log();
  },
});
```

---

## Phase 2.4: Update Types (Minor)

### `src/lib/types.ts`

**Changes**: Make `settings` non-optional in AspectsConfig for cleaner defaults

```typescript
// Change this:
export interface AspectsConfig {
  version: 1;
  installed: Record<string, InstalledAspect>;
  settings?: {
    registryUrl?: string;
  };
}

// To this:
export interface AspectsConfig {
  version: 1;
  installed: Record<string, InstalledAspect>;
  settings: {
    registryUrl?: string;
  };
}
```

---

## Success Criteria

### Automated Verification

```bash
# Clean up any existing test data
rm -rf ~/.aspects

# Type checking passes
bun run typecheck

# CLI initializes config on first run
bun run dev list
# Should print "No aspects installed."

# Config dir created
test -d ~/.aspects/aspects && echo "✓ aspects dir exists"

# Config file created with correct structure
cat ~/.aspects/config.json
# Should show: {"version":1,"installed":{},"settings":{}}

# Manually test with fake installed aspect
cat > ~/.aspects/config.json << 'EOF'
{
  "version": 1,
  "installed": {
    "alaric": {
      "version": "1.0.0",
      "source": "registry",
      "installedAt": "2026-01-18T12:00:00Z",
      "sha256": "abc123"
    }
  },
  "settings": {}
}
EOF

# List should now show the aspect
bun run dev list
# Should show: alaric@1.0.0

# Reset to empty
rm -rf ~/.aspects
```

### Manual Verification

- [ ] `~/.aspects/` directory created automatically
- [ ] Config file is valid JSON with correct structure
- [ ] List command shows "No aspects installed." when empty
- [ ] List command shows aspects when config has entries
- [ ] No crashes on malformed config (graceful error)

---

## Implementation Order

1. Create `src/utils/paths.ts`
2. Create `src/lib/config.ts`
3. Update `src/lib/types.ts` (make settings non-optional)
4. Update `src/commands/list.ts`
5. Test with `bun run dev list`
6. Verify `~/.aspects/` structure
7. Test with manual config entry

---

## Estimated Time

~30 minutes

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/utils/paths.ts` | Create |
| `src/lib/config.ts` | Create |
| `src/lib/types.ts` | Modify (settings non-optional) |
| `src/commands/list.ts` | Replace |

---

## References

- High-level plan: `docs/plans/v1-implementation.md`
- Phase 1 plan: `docs/plans/phase-1-cli-scaffold.md`
