# Aspects CLI v1 Implementation Plan

> CLI tool for installing and managing AI agent personality aspects.
> `npx aspects add alaric` → morphist.ai personality ready to use.

## Overview

**What**: A package manager for AI personalities ("aspects") - like npm for agent personas.

**Why**: Let anyone publish and consume aspects without programmer-level knowledge. Mobile apps can specify aspect + version; CLI makes it universal.

**Model**: Inspired by Vercel's `add-skill` for agent skills, adapted for personality modules.

---

## Decisions Made

| Decision       | Choice                                                      | Rationale                                                                                                  |
| -------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Package format | `aspect.json` (JSON, Zod-validated)                         | Structured data, native to JS/TS tooling, validated at parse time                                          |
| Naming         | `pkg-name` or `@publisher/pkg-name`                         | npm-style, simple by default, scoped when needed                                                           |
| CLI name       | `aspects`                                                   | Clean, memorable, `npx aspects`                                                                            |
| Storage        | `~/.aspects/`                                               | App-agnostic, system-level                                                                                 |
| Registry       | REST API at `aspects.sh/api/v1` with static GitHub fallback | API-first for search/publish; fallback for resilience                                                      |
| Versioning     | Semver, lock to specific version                            | KISS - no complex resolution                                                                               |
| Schema version | `schemaVersion: 1` in JSON                                  | Future-proofing without complexity                                                                         |
| Auth           | OAuth2 device flow                                          | No password storage, browser-based, mobile-friendly                                                        |
| Validation     | Zod schemas with field limits                               | Runtime validation, clear error messages, 50KB max prompt                                                  |
| Categories     | 9 official categories                                       | Curated taxonomy: assistant, roleplay, creative, productivity, education, gaming, spiritual, pundit, guide |

---

## Package Format: `aspect.json`

```json
{
  "schemaVersion": 1,
  "name": "alaric",
  "publisher": "morphist",
  "version": "1.0.0",
  "displayName": "Alaric the Wizard",
  "tagline": "Quirky wizard, D&D expert",
  "category": "roleplay",
  "tags": ["wizard", "dnd", "fantasy"],
  "icon": "wizard",
  "author": "Duke Jones",
  "license": "MIT",

  "voiceHints": {
    "speed": "normal",
    "emotions": ["mystical", "playful"],
    "styleHints": "Speak in riddles"
  },

  "modes": {
    "campaign": {
      "description": "Epic storytelling mode",
      "autoNarration": true
    }
  },

  "resources": {
    "voice": {
      "recommended": {
        "provider": "cartesia",
        "voiceId": "87748186-23bb-4158-a1eb-332911b0b708"
      }
    },
    "model": {
      "recommended": {
        "provider": "openai",
        "modelId": "gpt-4.1-mini"
      }
    },
    "skills": ["morphist/dnd-rules@^1"]
  },

  "directives": [
    {
      "id": "no-narration",
      "rule": "NEVER use italic action descriptions like *does something*.",
      "priority": "critical"
    }
  ],

  "instructions": [
    {
      "id": "brief-default",
      "rule": "Keep responses short unless asked for more detail."
    }
  ],

  "prompt": "## Aspect: Alaric the Wizard\n**YOU ARE Alaric the Wizard.** Speak as this character at all times.\n..."
}
```

### Field Limits

| Field          | Limit       |
| -------------- | ----------- |
| `name`         | slug format |
| `displayName`  | 100 chars   |
| `tagline`      | 200 chars   |
| `publisher`    | 50 chars    |
| `prompt`       | 50KB        |
| `tags`         | 10 max      |
| `directives`   | 25 max      |
| `instructions` | 25 max      |

---

## Directory Structure

### This Repo (CLI + Static Fallback Registry)

```
aspects/
├── src/
│   ├── cli.ts              # main entry point
│   ├── commands/
│   │   ├── add.ts          # install from registry/github/local
│   │   ├── create.ts       # interactive aspect creation wizard
│   │   ├── list.ts         # show installed aspects
│   │   ├── search.ts       # search registry
│   │   ├── info.ts         # show aspect details
│   │   ├── remove.ts       # uninstall
│   │   ├── update.ts       # update installed
│   │   ├── publish.ts      # publish to registry (auth required)
│   │   ├── login.ts        # device auth flow
│   │   ├── logout.ts       # clear auth tokens
│   │   ├── edit.ts         # edit aspect metadata
│   │   ├── validate.ts     # validate aspect.json schema
│   │   ├── compile.ts      # build/compile aspects
│   │   ├── bundle.ts       # bundle aspects
│   │   ├── set.ts          # manage aspect sets
│   │   └── find.ts         # find aspects
│   ├── lib/
│   │   ├── api-client.ts   # REST API client (aspects.sh)
│   │   ├── config.ts       # ~/.aspects/config.json management
│   │   ├── installer.ts    # download, validate, store
│   │   ├── parser.ts       # JSON parsing + validation
│   │   ├── registry.ts     # registry with API + static fallback
│   │   ├── resolver.ts     # parse install specs
│   │   ├── schema.ts       # Zod validation schemas
│   │   └── types.ts        # TypeScript interfaces
│   └── utils/
│       ├── paths.ts        # ~/.aspects/ helpers
│       └── logger.ts       # pretty console output
├── registry/               # static fallback registry
│   ├── index.json
│   └── aspects/
│       ├── default/
│       │   └── aspect.json
│       └── alaric/
│           └── aspect.json
├── tests/
│   ├── unit/               # unit tests (mocked)
│   └── integration/        # live API tests
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
├── config.json             # installed aspects, settings, auth tokens
└── aspects/
    ├── alaric/
    │   └── aspect.json
    └── @morphist/
        └── wizard/
            └── aspect.json
```

---

## CLI Commands

### `aspects add <spec>` (alias: `get`)

```bash
# From registry (default)
aspects add alaric
aspects add alaric@1.0.0
aspects add @morphist/alaric

# From GitHub
aspects add github:user/repo
aspects add github:user/repo@v1.0.0

# From local
aspects add ./my-aspect
aspects add /path/to/aspect.json
```

**Behavior**:

1. Resolve spec → source + version
2. Fetch aspect.json
3. Validate schema (Zod)
4. Store to `~/.aspects/aspects/<name>/`
5. Update `~/.aspects/config.json`
6. Print success + aspect info

### `aspects create` (alias: `new`, `init`)

Interactive wizard for creating new aspects. Prompts for name, display name, tagline, category, and generates a valid `aspect.json` scaffold.

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

Supports filters: `--category`, `--trust`, `--limit`, `--offset`

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

### `aspects publish`

Publishes an aspect to the registry. Requires `aspects login` first. Validates schema and enforces 50KB size limit.

### `aspects login` / `aspects logout`

Device authorization flow: opens browser, user enters code, CLI polls for token. Tokens stored in `~/.aspects/config.json`.

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

### `aspects validate [path]`

Validates an `aspect.json` file against the Zod schema without installing.

### `aspects edit`, `aspects compile`, `aspects bundle`, `aspects set`, `aspects find`

Additional management commands for editing metadata, building aspects, bundling, managing aspect sets, and finding aspects.

---

## Registry Architecture

### REST API (Primary)

Base URL: `https://aspects.sh/api/v1`

| Endpoint                                     | Method | Purpose                                       |
| -------------------------------------------- | ------ | --------------------------------------------- |
| `/registry`                                  | GET    | Full registry index (cached 5 min)            |
| `/aspects/:name`                             | GET    | Aspect metadata with all versions             |
| `/aspects/:name/:version`                    | GET    | Specific version content (`latest` supported) |
| `/search?q=&category=&trust=&limit=&offset=` | GET    | Full-text search with filters                 |
| `/aspects`                                   | POST   | Publish aspect (auth required)                |
| `/auth/device`                               | POST   | Initiate device authorization                 |
| `/auth/device/poll`                          | POST   | Poll for authorization result                 |
| `/stats`                                     | GET    | Aggregate statistics                          |
| `/categories`                                | GET    | Official categories list                      |

### Static Fallback

When the API is unavailable, the CLI falls back to the static GitHub-hosted registry at:
`https://raw.githubusercontent.com/aimorphist/aspects/main/registry/index.json`

### Error Handling

- 3 retries with exponential backoff for 5xx and 429 errors
- No retry on 4xx (except 429)
- 30-second timeout per request
- Structured error responses: `{ error: string, message: string }`

---

## Implementation Phases

### Phase 1: Core CLI Scaffold ✅

**Goal**: `npx aspects` runs and shows help

- [x] Set up package.json with bin entry
- [x] Install deps: `citty`, `consola`, `ofetch`
- [x] Create CLI entry point with command routing
- [x] Implement `--help` and `--version`

### Phase 2: Local Storage ✅

**Goal**: Can read/write to `~/.aspects/`

- [x] Implement paths.ts (get config dir, ensure exists)
- [x] Implement config.ts (read/write config.json)
- [x] Create default config on first run
- [x] Wire up `list` command to show installed aspects

### Phase 3: Parser + Validation ✅

**Goal**: Can parse and validate aspect.json

- [x] Define Zod schema for aspect.json (src/lib/schema.ts)
- [x] Implement parser.ts with JSON parsing (YAML legacy support)
- [x] Add validation with clear error messages and field limits
- [x] Create sample aspects for testing (registry/aspects/)

### Phase 4: Install Command ✅

**Goal**: `aspects add alaric` works

- [x] Implement resolver.ts (parse install specs)
- [x] Implement registry.ts (fetch from registry)
- [x] Implement installer.ts (download, validate, store)
- [x] Wire up add command
- [x] Add blake3 verification

### Phase 5: Core Commands ✅

**Goal**: Full CLI functionality

- [x] `aspects list` - show installed
- [x] `aspects info <name>` - show details
- [x] `aspects remove <name>` - uninstall
- [x] `aspects search [query]` - search registry with filters
- [x] `aspects update [name]` - update installed
- [x] `aspects validate` - schema validation
- [x] `aspects create` - interactive wizard

### Phase 6: Registry Bootstrap ✅

**Goal**: Publish initial aspects

- [x] Create registry/index.json
- [x] Add `default` aspect
- [x] Add `alaric` aspect
- [x] Host via GitHub raw URLs as static fallback

### Phase 7: GitHub Source Support ✅

**Goal**: `aspects add github:user/repo`

- [x] Parse github: specs
- [x] Fetch from GitHub releases or raw
- [x] Handle @ref for specific versions/commits

### Phase 8: REST API Registry ✅

**Goal**: Real API backend for registry

- [x] REST API at `aspects.sh/api/v1`
- [x] API client with retry logic and caching (src/lib/api-client.ts)
- [x] Search endpoint with full-text query, category, trust filters
- [x] Version content endpoint with `latest` alias
- [x] Stats and categories endpoints
- [x] Fallback to static GitHub registry when API unavailable

### Phase 9: Auth & Publishing ✅

**Goal**: Community can publish aspects

- [x] Device authorization flow (OAuth2-style)
- [x] `aspects login` / `aspects logout` commands
- [x] Token storage in config.json with expiry checking
- [x] `aspects publish` with validation and 50KB size limit
- [x] Publisher field enforcement (must match authenticated user)

### Phase 10: Polish ✅

**Goal**: Production-ready

- [x] Pretty output with colors/spinners (picocolors)
- [x] Helpful error messages
- [x] README with examples
- [x] Publish to npm (ready to publish)
- [x] Unit and integration test suites

### Phase 11: Trust & Content Addressing ✅

**Goal**: Verify aspect integrity and enable content-addressed sharing

- [x] Implement blake3 hashing (hash-wasm, base64 output)
- [x] Migrate all hash fields from SHA-256 to Blake3
- [x] Add hash-based install (`aspects add hash:<blake3>`)
- [x] Add `share` command (outputs blake3 hash + install command)
- [x] Add `unpublish` command (DELETE /aspects/:name/:version)
- [x] Add API client methods: `getAspectByHash`, `unpublishAspect`
- [ ] Add signature field to registry metadata
- [ ] Verify signatures on install (optional)
- [ ] Display trust level in info/list

### Deferred

- [ ] Shell completions
- [ ] Aspect inheritance / extending other aspects
- [ ] Prompt variants (e.g., per language)

---

## Dependencies

```json
{
  "dependencies": {
    "@clack/prompts": "^0.11.0",
    "citty": "^0.1.6",
    "consola": "^3.2.3",
    "ofetch": "^1.3.4",
    "picocolors": "^1.1.1",
    "zod": "^4.3.5"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/node": "^22",
    "typescript": "^5"
  }
}
```

**Why these**:

- `@clack/prompts` - beautiful interactive CLI prompts (create wizard)
- `citty` - unjs CLI framework, cleaner than commander
- `consola` - pretty logging with levels
- `ofetch` - modern fetch wrapper with retries
- `picocolors` - terminal colors (tiny, fast)
- `zod` - runtime schema validation with clear errors

---

## Open Questions

1. ~~**API Registry**: When to upgrade from static JSON to real API?~~ → **Done.** REST API at `aspects.sh/api/v1` with static fallback.
2. ~~**Publishing**: How do community members publish aspects?~~ → **Done.** Device auth + `aspects publish`. Needs refinement: moderation, namespacing, rate limits.
3. **Mobile sync**: How does mobile app discover/download aspects? API is ready; need client integration.
4. **Bundled defaults**: Ship some aspects with Morphist app?
5. **Aspect inheritance**: Can aspects extend other aspects?
6. **Prompt variants**: Multiple prompts per aspect (e.g., per language)?

---

## Success Criteria

- [x] `npx aspects add alaric` works on fresh machine
- [x] Installed aspect readable from any app via `~/.aspects/`
- [x] Clear error messages for invalid aspects
- [x] Registry discoverable via `aspects search`
- [x] Auth flow for publishing
- [x] Unit and integration tests passing
- [ ] Trust levels displayed for transparency
- [ ] Mobile app integration
