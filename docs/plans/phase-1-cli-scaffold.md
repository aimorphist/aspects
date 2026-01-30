# Phase 1: Core CLI Scaffold - Implementation Plan

> **Goal**: `npx aspects` runs and shows help with all command stubs

## Overview

Set up the CLI foundation with citty, create the command structure, configure package.json for npm publishing, and verify it works via `npx aspects`.

## Current State Analysis

- Fresh bun-initialized repo with `index.ts` that just logs "Hello via Bun!"
- `package.json` is minimal, missing `bin` entry and dependencies
- No `src/` directory structure
- tsconfig.json is already configured for ESNext + bundler mode

## Desired End State

```bash
$ npx aspects
aspects v0.1.0 - Package manager for AI personality aspects

Usage: aspects <command> [options]

Commands:
  install <name>    Install an aspect from registry or source
  list              List installed aspects
  search [query]    Search the aspect registry
  info <name>       Show details about an aspect
  remove <name>     Remove an installed aspect
  update [name]     Update installed aspect(s)

Options:
  -h, --help        Show this help message
  -v, --version     Show version number
```

### Verification

```bash
# All of these should work:
bun run src/cli.ts --help        # Shows help
bun run src/cli.ts --version     # Shows 0.1.0
bun run src/cli.ts install foo   # Shows "install command not yet implemented"
bun run src/cli.ts list          # Shows "list command not yet implemented"
```

## What We're NOT Doing

- Actual command implementations (just stubs that print "not yet implemented")
- Registry fetching
- Local storage (~/.aspects/)
- YAML parsing
- Any business logic

---

## Implementation Approach

1. Update package.json with proper config + deps
2. Create src/ directory structure
3. Implement types.ts with core interfaces
4. Implement cli.ts with main command + subcommands
5. Create stub commands
6. Test via `bun run` and verify help output

---

## Phase 1.1: Package Configuration ✅

### Changes Required

#### 1. `package.json` ✅

**File**: `package.json`
**Changes**: Complete rewrite with proper CLI config

```json
{
  "name": "aspects",
  "version": "0.1.0",
  "description": "Package manager for AI personality aspects",
  "author": "Morphist",
  "license": "MIT",
  "type": "module",
  "bin": {
    "aspects": "./dist/cli.js"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "dev": "bun run src/cli.ts",
    "build": "bun build src/cli.ts --outdir dist --target node --format esm",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "citty": "^0.1.6",
    "consola": "^3.2.3",
    "ofetch": "^1.3.4",
    "yaml": "^2.4.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5"
  }
}
```

**Key points**:
- `bin.aspects` points to built output (for npm)
- `scripts.dev` runs directly with bun (for development)
- Dependencies added for future phases

---

## Phase 1.2: Directory Structure ✅

### Create Directories ✅

```bash
mkdir -p src/commands src/lib src/utils
```

### Files to Create

```
src/
├── cli.ts              # Main entry point
├── commands/
│   ├── install.ts      # Stub
│   ├── list.ts         # Stub
│   ├── search.ts       # Stub
│   ├── info.ts         # Stub
│   ├── remove.ts       # Stub
│   └── update.ts       # Stub
├── lib/
│   └── types.ts        # Core interfaces
└── utils/
    └── logger.ts       # Consola wrapper
```

---

## Phase 1.3: Core Types ✅

#### `src/lib/types.ts` ✅

**Purpose**: Define core TypeScript interfaces (from v1 plan)

```typescript
/**
 * Aspect package schema (parsed from aspect.yaml)
 */
export interface Aspect {
  schemaVersion: number;
  name: string;
  publisher?: string;
  version: string;
  displayName: string;
  tagline: string;
  icon?: string;
  author?: string;
  license?: string;

  voiceHints?: {
    speed?: 'slow' | 'normal' | 'fast';
    emotions?: string[];
    styleHints?: string;
  };

  modes?: Record<string, {
    description: string;
    autoNarration?: boolean;
  }>;

  resources?: {
    voice?: {
      recommended?: {
        provider: string;
        voiceId: string;
      };
    };
    model?: {
      recommended?: {
        provider: string;
        modelId: string;
      };
    };
    skills?: string[];
  };

  prompt: string;
}

/**
 * Aspect summary for registry listing (without full prompt)
 */
export interface AspectSummary {
  name: string;
  version: string;
  displayName: string;
  tagline: string;
  publisher?: string;
  trust: 'verified' | 'community' | 'local';
  signature?: string;
}

/**
 * Local configuration stored at ~/.aspects/config.json
 */
export interface AspectsConfig {
  version: 1;
  installed: Record<string, InstalledAspect>;
  settings?: {
    registryUrl?: string;
  };
}

export interface InstalledAspect {
  version: string;
  source: 'registry' | 'github' | 'local';
  installedAt: string;
  sha256: string;
}

/**
 * Parsed install specification
 */
export type InstallSpec =
  | { type: 'registry'; name: string; version?: string }
  | { type: 'github'; owner: string; repo: string; ref?: string }
  | { type: 'local'; path: string };
```

---

## Phase 1.4: Logger Utility ✅

#### `src/utils/logger.ts` ✅

**Purpose**: Wrap consola with project-specific formatting

```typescript
import { consola } from 'consola';

export const logger = consola.create({
  formatOptions: {
    date: false,
  },
});

export const log = {
  info: logger.info.bind(logger),
  success: logger.success.bind(logger),
  warn: logger.warn.bind(logger),
  error: logger.error.bind(logger),
  box: logger.box.bind(logger),
  start: logger.start.bind(logger),
};
```

---

## Phase 1.5: Command Stubs ✅

Each command is a simple stub that prints "not yet implemented".

#### `src/commands/install.ts`

```typescript
import { defineCommand } from 'citty';
import { log } from '../utils/logger';

export default defineCommand({
  meta: {
    name: 'install',
    description: 'Install an aspect from registry or source',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Aspect name, @scope/name, github:user/repo, or path',
      required: true,
    },
    version: {
      type: 'string',
      alias: 'v',
      description: 'Specific version to install',
    },
  },
  run({ args }) {
    log.info(`install command: ${args.name}${args.version ? `@${args.version}` : ''}`);
    log.warn('Not yet implemented');
  },
});
```

#### `src/commands/list.ts`

```typescript
import { defineCommand } from 'citty';
import { log } from '../utils/logger';

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List installed aspects',
  },
  args: {},
  run() {
    log.info('list command');
    log.warn('Not yet implemented');
  },
});
```

#### `src/commands/search.ts`

```typescript
import { defineCommand } from 'citty';
import { log } from '../utils/logger';

export default defineCommand({
  meta: {
    name: 'search',
    description: 'Search the aspect registry',
  },
  args: {
    query: {
      type: 'positional',
      description: 'Search query',
      required: false,
    },
  },
  run({ args }) {
    log.info(`search command: ${args.query || '(all)'}`);
    log.warn('Not yet implemented');
  },
});
```

#### `src/commands/info.ts`

```typescript
import { defineCommand } from 'citty';
import { log } from '../utils/logger';

export default defineCommand({
  meta: {
    name: 'info',
    description: 'Show details about an aspect',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Aspect name',
      required: true,
    },
  },
  run({ args }) {
    log.info(`info command: ${args.name}`);
    log.warn('Not yet implemented');
  },
});
```

#### `src/commands/remove.ts`

```typescript
import { defineCommand } from 'citty';
import { log } from '../utils/logger';

export default defineCommand({
  meta: {
    name: 'remove',
    description: 'Remove an installed aspect',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Aspect name to remove',
      required: true,
    },
  },
  run({ args }) {
    log.info(`remove command: ${args.name}`);
    log.warn('Not yet implemented');
  },
});
```

#### `src/commands/update.ts`

```typescript
import { defineCommand } from 'citty';
import { log } from '../utils/logger';

export default defineCommand({
  meta: {
    name: 'update',
    description: 'Update installed aspect(s)',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Aspect name (optional, updates all if omitted)',
      required: false,
    },
  },
  run({ args }) {
    log.info(`update command: ${args.name || '(all)'}`);
    log.warn('Not yet implemented');
  },
});
```

---

## Phase 1.6: Main CLI Entry Point ✅

#### `src/cli.ts` ✅

**Purpose**: Main entry point with subcommand routing

```typescript
#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';

import install from './commands/install';
import list from './commands/list';
import search from './commands/search';
import info from './commands/info';
import remove from './commands/remove';
import update from './commands/update';

const main = defineCommand({
  meta: {
    name: 'aspects',
    version: '0.1.0',
    description: 'Package manager for AI personality aspects',
  },
  subCommands: {
    install,
    list,
    search,
    info,
    remove,
    update,
  },
});

runMain(main);
```

---

## Phase 1.7: Cleanup ✅

#### Delete `index.ts` ✅

The old placeholder file is no longer needed.

---

## Success Criteria

### Automated Verification ✅

```bash
# Install dependencies
bun install ✅

# Type checking passes
bun run typecheck ✅

# CLI runs and shows help
bun run dev --help ✅

# CLI shows version
bun run dev --version ✅

# Subcommands are accessible
bun run dev install test-aspect ✅
bun run dev list ✅
bun run dev search wizard ✅
bun run dev info test ✅
bun run dev remove test ✅
bun run dev update ✅

# Build succeeds
bun run build ✅

# Built CLI works
node dist/cli.js --help ✅
```

### Manual Verification

- [ ] Help output is clean and readable
- [ ] Version shows correctly (0.1.0)
- [ ] Each subcommand shows its own help with `--help`
- [ ] Error messages are clear for missing arguments

---

## Implementation Order

1. Update `package.json`
2. Run `bun install` to get dependencies
3. Create `src/lib/types.ts`
4. Create `src/utils/logger.ts`
5. Create all command stubs in `src/commands/`
6. Create `src/cli.ts`
7. Delete `index.ts`
8. Test with `bun run dev --help`
9. Build with `bun run build`
10. Test built version with `node dist/cli.js --help`

---

## Estimated Time

~45 minutes

---

## References

- High-level plan: `docs/plans/v1-implementation.md`
- citty docs: https://github.com/unjs/citty
- consola docs: https://github.com/unjs/consola
