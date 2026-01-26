# Aspects CLI v1 Implementation Plan

> CLI tool for installing and managing AI agent personality aspects.
> `npx aspects install alaric` → morphist.ai personality ready to use.

## Overview

**What**: A package manager for AI personalities ("aspects") — like npm for agent personas.

**Why**: Let anyone publish and consume aspects without programmer-level knowledge. Mobile apps can specify aspect + version; CLI makes it universal.

**Model**: Inspired by Vercel's `add-skill` for agent skills, adapted for personality modules.

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package format | `aspect.yaml` (pure YAML) | Structured data, trivial parsing, mobile-friendly |
| Naming | `pkg-name` or `@publisher/pkg-name` | npm-style, simple by default, scoped when needed |
| CLI name | `aspects` | Clean, memorable, `npx aspects` |
| Storage | `~/.aspects/` | App-agnostic, system-level |
| Registry MVP | Static JSON + tarballs in this repo | Minimal effort, upgrade to API later |
| Versioning | Semver, lock to specific version | KISS — no complex resolution |
| Schema version | `schemaVersion: 1` in yaml | Future-proofing without complexity |
| Trust/signatures | Base58 ed25519 sig of blake3 hash | Identikey-compatible, in registry metadata |

---

## Package Format: `aspect.yaml`

```yaml
schemaVersion: 1
name: alaric                          # required, unique identifier
publisher: morphist                   # optional, for scoped: @morphist/alaric
version: 1.0.0                        # required, semver
displayName: Alaric the Wizard        # required, human-readable
tagline: Quirky wizard, D&D expert    # required, one-liner for UI
icon: wizard                          # optional, icon name or URL
author: Duke Jones                    # optional
license: MIT                          # optional

voiceHints:                           # optional
  speed: normal                       # slow | normal | fast
  emotions: [mystical, playful]       # provider-specific tags
  styleHints: Speak in riddles        # freeform guidance

modes:                                # optional
  campaign:
    description: Epic storytelling mode
    autoNarration: true

resources:                            # optional, for future bundling
  voice:
    recommended:
      provider: cartesia
      voiceId: 87748186-23bb-4158-a1eb-332911b0b708
  model:
    recommended:
      provider: openai
      modelId: gpt-4.1-mini
  skills:
    - morphist/dnd-rules@^1

prompt: |
  ## Aspect: Alaric the Wizard
  **YOU ARE Alaric the Wizard.** Speak as this character at all times.
  
  **Tagline**: "Quirky wizard, D&D expert"
  
  ### Identity
  - **Welcome**: "Ah, a seeker of wisdom approaches!"
  - **"Who are you?"**: Introduce as Alaric, ancient wizard
  
  ### CRITICAL: No Narration
  **NEVER use italic action descriptions like *does something*.**
  
  ### Character
  - Speaks in riddles and arcane references
  - Delights in wordplay
  - References obscure magical lore
  
  ### Rules
  - **Brief by default**: Keep responses short unless asked
  - **Narration**: OFF by default, user can toggle
```

---

## Directory Structure

### This Repo (CLI + Registry)

```
aspects/
├── src/
│   ├── cli.ts              # main entry point
│   ├── commands/
│   │   ├── install.ts
│   │   ├── list.ts
│   │   ├── search.ts
│   │   ├── info.ts
│   │   ├── remove.ts
│   │   └── update.ts
│   ├── lib/
│   │   ├── config.ts       # ~/.aspects/config.json management
│   │   ├── installer.ts    # download, validate, store
│   │   ├── parser.ts       # YAML parsing + validation
│   │   ├── registry.ts     # fetch from registry
│   │   ├── resolver.ts     # parse install specs
│   │   └── types.ts        # TypeScript interfaces
│   └── utils/
│       ├── paths.ts        # ~/.aspects/ helpers
│       ├── hash.ts         # blake3 hashing
│       └── logger.ts       # pretty console output
├── registry/
│   ├── index.json          # registry manifest
│   └── aspects/
│       ├── default/
│       │   └── aspect.yaml
│       └── alaric/
│           └── aspect.yaml
├── docs/
│   └── plans/
│       └── v1-implementation.md
├── package.json
├── tsconfig.json
└── README.md
```

### User Installation (`~/.aspects/`)

```
~/.aspects/
├── config.json             # installed aspects, settings
└── aspects/
    ├── alaric/
    │   └── aspect.yaml
    └── @morphist/
        └── wizard/
            └── aspect.yaml
```

---

## CLI Commands

### `aspects install <spec>`

```bash
# From registry (default)
aspects install alaric
aspects install alaric@1.0.0
aspects install @morphist/alaric

# From GitHub
aspects install github:user/repo
aspects install github:user/repo@v1.0.0

# From local
aspects install ./my-aspect
aspects install /path/to/aspect.yaml
```

**Behavior**:
1. Resolve spec → source + version
2. Fetch aspect.yaml (+ assets)
3. Validate schema
4. Store to `~/.aspects/aspects/<name>/`
5. Update `~/.aspects/config.json`
6. Print success + aspect info

### `aspects list`

```bash
$ aspects list
Installed aspects:
  alaric@1.0.0          Quirky wizard, D&D expert
  @morphist/default     Helpful AI assistant
```

### `aspects search [query]`

```bash
$ aspects search wizard
Registry aspects matching "wizard":
  alaric@1.0.0          Quirky wizard, D&D expert       [verified]
  gandalf@0.2.0         Wise wandering wizard           [community]
```

### `aspects info <name>`

```bash
$ aspects info alaric
alaric@1.0.0

  Quirky wizard, D&D expert

  Publisher:  morphist
  Author:     Duke Jones
  License:    MIT
  Trust:      verified ✓

  Voice hints:
    Speed: normal
    Emotions: mystical, playful

  Modes:
    campaign - Epic storytelling mode
```

### `aspects remove <name>`

```bash
$ aspects remove alaric
Removed alaric@1.0.0
```

### `aspects update [name]`

```bash
$ aspects update alaric
alaric: 1.0.0 → 1.1.0
Updated successfully.

$ aspects update
Checking all installed aspects...
  alaric: 1.0.0 → 1.1.0  [update available]
  @morphist/default: up to date
```

---

## Registry Format

### `registry/index.json`

```json
{
  "version": 1,
  "updated": "2026-01-17T12:00:00Z",
  "aspects": {
    "alaric": {
      "latest": "1.0.0",
      "versions": {
        "1.0.0": {
          "published": "2026-01-15T10:00:00Z",
          "sha256": "abc123...",
          "size": 2048,
          "url": "https://raw.githubusercontent.com/morphist/aspects/main/registry/aspects/alaric/aspect.yaml"
        }
      },
      "metadata": {
        "displayName": "Alaric the Wizard",
        "tagline": "Quirky wizard, D&D expert",
        "publisher": "morphist",
        "trust": "verified",
        "signature": "base58-encoded-ed25519-sig..."
      }
    },
    "default": {
      "latest": "1.0.0",
      "versions": {
        "1.0.0": {
          "published": "2026-01-15T10:00:00Z",
          "sha256": "def456...",
          "size": 1024,
          "url": "..."
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

---

## TypeScript Interfaces

```typescript
// Aspect package (parsed from aspect.yaml)
interface Aspect {
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

// Registry entry (for search/list without full prompt)
interface AspectSummary {
  name: string;
  version: string;
  displayName: string;
  tagline: string;
  publisher?: string;
  trust: 'verified' | 'community' | 'local';
  signature?: string;
}

// Local config (~/.aspects/config.json)
interface AspectsConfig {
  version: 1;
  installed: Record<string, {
    version: string;
    source: 'registry' | 'github' | 'local';
    installedAt: string;
    sha256: string;
  }>;
  settings?: {
    registryUrl?: string;
  };
}

// Install spec parsing
type InstallSpec = 
  | { type: 'registry'; name: string; version?: string }
  | { type: 'github'; owner: string; repo: string; ref?: string }
  | { type: 'local'; path: string };
```

---

## Implementation Phases

### Phase 1: Core CLI Scaffold ✅
**Goal**: `npx aspects` runs and shows help

- [x] Set up package.json with bin entry
- [x] Install deps: `citty`, `consola`, `yaml`, `ofetch`
- [x] Create CLI entry point with command routing
- [x] Implement `--help` and `--version`

### Phase 2: Local Storage ✅
**Goal**: Can read/write to `~/.aspects/`

- [x] Implement paths.ts (get config dir, ensure exists)
- [x] Implement config.ts (read/write config.json)
- [x] Create default config on first run
- [x] Wire up `list` command to show installed aspects

### Phase 3: Parser + Validation ✅
**Goal**: Can parse and validate aspect.yaml

- [x] Define Zod schema for aspect.yaml (src/lib/schema.ts)
- [x] Implement parser.ts with YAML parsing
- [x] Add validation with clear error messages
- [x] Create sample aspects for testing (registry/aspects/)

### Phase 4: Install Command ✅
**Goal**: `aspects install alaric` works

- [x] Implement resolver.ts (parse install specs)
- [x] Implement registry.ts (fetch index.json, aspect files)
- [x] Implement installer.ts (download, validate, store)
- [x] Wire up install command
- [x] Add sha256 verification

### Phase 5: Other Commands ✅
**Goal**: Full CLI functionality

- [x] `aspects list` — show installed
- [x] `aspects info <name>` — show details
- [x] `aspects remove <name>` — uninstall
- [x] `aspects search [query]` — search registry
- [x] `aspects update [name]` — update installed

### Phase 6: Registry Bootstrap ✅
**Goal**: Publish initial aspects

- [x] Create registry/index.json
- [x] Add `default` aspect
- [x] Add `alaric` aspect
- [x] Host via GitHub raw URLs initially

### Phase 7: GitHub Source Support ✅
**Goal**: `aspects install github:user/repo`

- [x] Parse github: specs
- [x] Fetch from GitHub releases or raw
- [x] Handle @ref for specific versions/commits

### Phase 8: Trust & Signatures
**Goal**: Verify aspect integrity

- [ ] Implement blake3 hashing
- [ ] Add signature field to registry metadata
- [ ] Verify signatures on install (optional)
- [ ] Display trust level in info/list

### Phase 9: Polish ✅
**Goal**: Production-ready

- [x] Pretty output with colors/spinners (picocolors)
- [x] Helpful error messages
- [ ] Shell completions (deferred)
- [x] README with examples
- [x] Publish to npm (ready to publish)

---

## Dependencies

```json
{
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

**Why these**:
- `citty` — unjs CLI framework, cleaner than commander
- `consola` — pretty logging with levels
- `ofetch` — modern fetch wrapper with retries
- `yaml` — YAML parsing

---

## Open Questions (Deferred)

1. **API Registry**: When to upgrade from static JSON to real API?
2. **Publishing**: How do community members publish aspects?
3. **Mobile sync**: How does mobile app discover/download aspects?
4. **Bundled defaults**: Ship some aspects with Morphist app?
5. **Aspect inheritance**: Can aspects extend other aspects?
6. **Prompt variants**: Multiple prompts per aspect (e.g., per language)?

---

## Success Criteria

- [x] `npx aspects install alaric` works on fresh machine
- [x] Installed aspect readable from any app via `~/.aspects/`
- [x] Clear error messages for invalid aspects
- [ ] Registry discoverable via `aspects search`
- [ ] Trust levels displayed for transparency
