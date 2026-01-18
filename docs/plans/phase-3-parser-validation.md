# Phase 3: Parser + Validation Implementation Plan

## Overview

Implement YAML parsing and Zod-based validation for `aspect.yaml` files. This enables the CLI to load, validate, and provide clear error messages for aspect packages.

## Current State

- `src/lib/types.ts` defines the `Aspect` interface
- `yaml` package already installed
- No parser or validation logic exists yet
- Commands like `install`, `info` are stubs awaiting parser

## Desired End State

- `src/lib/parser.ts` exports functions to parse and validate aspect YAML
- Zod schema mirrors the `Aspect` TypeScript interface
- Lenient mode: missing `schemaVersion`/`version` emit warnings, use defaults
- Clear, actionable error messages for invalid aspects
- Sample aspects in `registry/aspects/` for testing
- `aspects info <name>` can display installed aspect details

### Verification

```bash
bun run dev info alaric  # Shows parsed aspect details
bun run typecheck        # No type errors
```

## What We're NOT Doing

- Registry fetching (Phase 4)
- Install command implementation (Phase 4)
- Signature verification (Phase 8)
- JSON Schema file generation (Zod is the source of truth)

---

## Phase 3.1: Add Zod + Define Schema

### Overview

Add Zod dependency and create schema that mirrors the existing `Aspect` interface.

### Changes Required:

#### 1. Add Zod dependency

```bash
bun add zod
```

#### 2. Create `src/lib/schema.ts`

**File**: `src/lib/schema.ts`

```typescript
import { z } from 'zod';

/**
 * Zod schema for aspect.yaml validation.
 * Lenient: schemaVersion and version have defaults.
 */
export const aspectSchema = z.object({
  schemaVersion: z.number().default(1),
  name: z.string().min(1, 'name is required'),
  publisher: z.string().optional(),
  version: z.string().default('0.0.0'),
  displayName: z.string().min(1, 'displayName is required'),
  tagline: z.string().min(1, 'tagline is required'),
  icon: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),

  voiceHints: z.object({
    speed: z.enum(['slow', 'normal', 'fast']).optional(),
    emotions: z.array(z.string()).optional(),
    styleHints: z.string().optional(),
  }).optional(),

  modes: z.record(z.object({
    description: z.string(),
    autoNarration: z.boolean().optional(),
  })).optional(),

  resources: z.object({
    voice: z.object({
      recommended: z.object({
        provider: z.string(),
        voiceId: z.string(),
      }).optional(),
    }).optional(),
    model: z.object({
      recommended: z.object({
        provider: z.string(),
        modelId: z.string(),
      }).optional(),
    }).optional(),
    skills: z.array(z.string()).optional(),
  }).optional(),

  prompt: z.string().min(1, 'prompt is required'),
});

export type AspectFromSchema = z.infer<typeof aspectSchema>;
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes
- [x] Zod schema infers type compatible with `Aspect` interface

---

## Phase 3.2: Implement parser.ts

### Overview

Create parser with YAML parsing, Zod validation, and helpful error formatting.

### Changes Required:

#### 1. Create `src/lib/parser.ts`

**File**: `src/lib/parser.ts`

```typescript
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { ZodError } from 'zod';
import { aspectSchema } from './schema';
import type { Aspect } from './types';
import { log } from '../utils/logger';

export interface ParseResult {
  success: true;
  aspect: Aspect;
  warnings: string[];
} | {
  success: false;
  errors: string[];
}

/**
 * Parse and validate an aspect.yaml file.
 */
export async function parseAspectFile(filePath: string): Promise<ParseResult> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { success: false, errors: [`File not found: ${filePath}`] };
    }
    return { success: false, errors: [`Failed to read file: ${(err as Error).message}`] };
  }

  return parseAspectYaml(content);
}

/**
 * Parse and validate aspect YAML content.
 */
export function parseAspectYaml(content: string): ParseResult {
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    return { success: false, errors: [`Invalid YAML: ${(err as Error).message}`] };
  }

  if (typeof raw !== 'object' || raw === null) {
    return { success: false, errors: ['aspect.yaml must be a YAML object'] };
  }

  const warnings: string[] = [];
  const rawObj = raw as Record<string, unknown>;

  // Warn about missing recommended fields
  if (!('schemaVersion' in rawObj)) {
    warnings.push('Missing schemaVersion, defaulting to 1');
  }
  if (!('version' in rawObj)) {
    warnings.push('Missing version, defaulting to "0.0.0"');
  }

  const result = aspectSchema.safeParse(raw);

  if (!result.success) {
    return {
      success: false,
      errors: formatZodErrors(result.error),
    };
  }

  return {
    success: true,
    aspect: result.data as Aspect,
    warnings,
  };
}

/**
 * Format Zod errors into readable messages.
 */
function formatZodErrors(error: ZodError): string[] {
  return error.errors.map((e) => {
    const path = e.path.length > 0 ? e.path.join('.') : 'root';
    return `${path}: ${e.message}`;
  });
}
```

#### 2. Add `src/lib/aspect-loader.ts`

**File**: `src/lib/aspect-loader.ts`

```typescript
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
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes
- [x] Parser correctly handles valid YAML
- [x] Parser returns clear errors for invalid YAML

---

## Phase 3.3: Create Sample Aspects

### Overview

Create sample aspect files for testing the parser.

### Changes Required:

#### 1. Create `registry/aspects/default/aspect.yaml`

**File**: `registry/aspects/default/aspect.yaml`

```yaml
schemaVersion: 1
name: default
publisher: morphist
version: 1.0.0
displayName: Morphist Default
tagline: Helpful voice AI assistant
icon: bot
author: Morphist
license: MIT

voiceHints:
  speed: normal
  emotions:
    - friendly
    - helpful
  styleHints: Speak clearly and warmly.

prompt: |
  ## Aspect: Morphist Default
  You are a helpful AI assistant. Be concise, friendly, and accurate.
  
  ### Guidelines
  - Be brief by default
  - Ask clarifying questions when needed
  - Admit uncertainty when appropriate
```

#### 2. Create `registry/aspects/alaric/aspect.yaml`

**File**: `registry/aspects/alaric/aspect.yaml`

```yaml
schemaVersion: 1
name: alaric
publisher: morphist
version: 1.0.0
displayName: Alaric the Wizard
tagline: Quirky wizard, D&D expert, can run campaigns
icon: wand
author: Duke Jones
license: MIT

voiceHints:
  speed: slow
  emotions:
    - curiosity
    - warmth
  styleHints: Speak slowly and deliberately, with warmth and occasional wry humor.

modes:
  campaign:
    description: Run a freeform or rules-based RPG campaign
    autoNarration: true

resources:
  voice:
    recommended:
      provider: cartesia
      voiceId: 87748186-23bb-4158-a1eb-332911b0b708
  model:
    recommended:
      provider: openai
      modelId: gpt-4.1-mini

prompt: |
  ## Aspect: Alaric the Wizard
  **YOU ARE ALARIC.** Speak as Alaric at all times.

  **Tagline**: "I'm Alaric, a quirky old wizard in a tavern by the fire."

  ### Identity
  You ARE Alaric the Wizard. This is not optional roleplay.
  - **Welcome**: "I'm Alaric, a quirky old wizard by the fire. What brings you here?"
  - **"Who are you?"**: "I'm Alaric, a quirky old wizard."

  ### CRITICAL: No Narration
  **NEVER use italic action descriptions like *settles back in chair*.**
  Speak only in first person. No third-person narration.

  ### Character
  - Quirky old wizard, very high-level D&D-style magic user
  - Deep knowledge of D&D rules, lore, mechanics
  - Kind and believes in the goodness of all people
  - Little tolerance for dimwits
  - Speaks with wisdom of ages, arcane references, tavern humor

  ### Campaign Mode
  Commands: "Start a campaign" / "Let's play" / "Run a game"
  - Zero setup required - you handle everything
  - Pure narrative adventure, no dice/stats unless requested
  - Launch straight into action

  ### Rules
  - **Brief by default**: Keep responses short unless asked
  - **Narration**: OFF by default, user can toggle
```

#### 3. Create test file with invalid YAML

**File**: `registry/aspects/_test-invalid/aspect.yaml`

```yaml
# Missing required fields for testing error messages
schemaVersion: 1
name: incomplete
# missing displayName, tagline, prompt
```

### Success Criteria:

#### Automated Verification:
- [x] Sample aspects parse successfully
- [x] Invalid test aspect returns clear errors

---

## Phase 3.4: Wire Up Info Command

### Overview

Update `info` command to display parsed aspect details from installed aspects.

### Changes Required:

#### 1. Update `src/commands/info.ts`

**File**: `src/commands/info.ts`

```typescript
import { defineCommand } from 'citty';
import { log } from '../utils/logger';
import { loadInstalledAspect } from '../lib/aspect-loader';
import { getInstalledAspect } from '../lib/config';

export default defineCommand({
  meta: {
    name: 'info',
    description: 'Show details about an installed aspect',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Aspect name',
      required: true,
    },
  },
  async run({ args }) {
    const installed = await getInstalledAspect(args.name);
    if (!installed) {
      log.error(`Aspect "${args.name}" is not installed`);
      process.exit(1);
    }

    const aspect = await loadInstalledAspect(args.name);
    if (!aspect) {
      log.error(`Failed to load aspect "${args.name}" - aspect.yaml may be corrupted`);
      process.exit(1);
    }

    console.log();
    console.log(`${aspect.displayName} (${aspect.name}@${aspect.version})`);
    console.log();
    console.log(`  ${aspect.tagline}`);
    console.log();
    
    if (aspect.publisher) {
      console.log(`  Publisher:  ${aspect.publisher}`);
    }
    if (aspect.author) {
      console.log(`  Author:     ${aspect.author}`);
    }
    if (aspect.license) {
      console.log(`  License:    ${aspect.license}`);
    }
    
    if (aspect.voiceHints) {
      console.log();
      console.log('  Voice hints:');
      if (aspect.voiceHints.speed) {
        console.log(`    Speed: ${aspect.voiceHints.speed}`);
      }
      if (aspect.voiceHints.emotions?.length) {
        console.log(`    Emotions: ${aspect.voiceHints.emotions.join(', ')}`);
      }
      if (aspect.voiceHints.styleHints) {
        console.log(`    Style: ${aspect.voiceHints.styleHints}`);
      }
    }

    if (aspect.modes && Object.keys(aspect.modes).length > 0) {
      console.log();
      console.log('  Modes:');
      for (const [modeName, mode] of Object.entries(aspect.modes)) {
        console.log(`    ${modeName} - ${mode.description}`);
      }
    }

    console.log();
  },
});
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes
- [x] `bun run dev info alaric` shows aspect details (after manual install)

#### Manual Verification:
- [x] Manually copy `registry/aspects/alaric/` to `~/.aspects/aspects/alaric/`
- [x] Run `bun run dev info alaric` and verify output matches expected format
- [x] Run `bun run dev info nonexistent` and verify error message

---

## Testing Strategy

### Unit Tests (Future):
- Parser handles valid YAML correctly
- Parser returns clear errors for missing required fields
- Parser warns but accepts missing schemaVersion/version
- Zod schema matches TypeScript interface

### Manual Testing:
1. Copy sample aspect to `~/.aspects/aspects/alaric/`
2. Run `bun run dev info alaric`
3. Verify all fields display correctly
4. Test with malformed aspect.yaml to verify error messages

---

## Implementation Order

1. `bun add zod`
2. Create `src/lib/schema.ts`
3. Create `src/lib/parser.ts`
4. Create `src/lib/aspect-loader.ts`
5. Create `registry/aspects/default/aspect.yaml`
6. Create `registry/aspects/alaric/aspect.yaml`
7. Update `src/commands/info.ts`
8. Manual test with sample aspects

---

## References

- Phase 2 plan: `docs/plans/phase-2-local-storage.md`
- V1 implementation plan: `docs/plans/v1-implementation.md`
- Existing types: `src/lib/types.ts`
