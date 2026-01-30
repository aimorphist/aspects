```text
   █████╗ ███████╗██████╗ ███████╗ ██████╗████████╗███████╗
  ██╔══██╗██╔════╝██╔══██╗██╔════╝██╔════╝╚══██╔══╝██╔════╝
  ███████║███████╗██████╔╝█████╗  ██║        ██║   ███████╗
  ██╔══██║╚════██║██╔═══╝ ██╔══╝  ██║        ██║   ╚════██║
  ██║  ██║███████║██║     ███████╗╚██████╗   ██║   ███████║
  ╚═╝  ╚═╝╚══════╝╚═╝     ╚══════╝ ╚═════╝   ╚═╝   ╚══════╝
```

> **Community Aspects Registry** — Personality modules for AI agents.

[![Validate PRs](https://github.com/aimorphist/aspects/actions/workflows/validate-pr.yml/badge.svg)](https://github.com/aimorphist/aspects/actions/workflows/validate-pr.yml)

---

## What are Aspects?

Aspects are personality modules for AI agents. They define how an AI speaks, thinks, and behaves — from quirky wizards to helpful assistants to domain experts.

Each aspect is a JSON file containing:

- **Identity** — Name, tagline, character description
- **Voice Hints** — Speaking speed, emotional tone, style guidance
- **Modes** — Different behavioral modes (e.g., "campaign mode" for a D&D wizard)
- **Prompt** — The core personality prompt

## Quick Start

```bash
npx @morphist/aspects add alaric
```

That's it. The aspect is now installed to your project.

```bash
# Search the registry
npx @morphist/aspects search wizard

# Create a new aspect
npx @morphist/aspects create

# List installed aspects
npx @morphist/aspects list
```

### Installation Scope

| Flag | Scope | Location |
|------|-------|----------|
| (default) | Project | `./.aspects/` |
| `-g` | Global | `~/.aspects/` |

```bash
# Install to project (default if .aspects/ exists)
npx @morphist/aspects add alaric

# Install globally
npx @morphist/aspects add -g alaric
```

See [CLI Documentation](./docs/CLI.md) for full reference.

## Registry Structure

```text
registry/
├── index.json              # Registry index with all aspects
└── aspects/
    ├── alaric/
    │   └── aspect.json     # Alaric the Wizard
    └── default/
        └── aspect.json     # Morphist Default
```

## Aspect Format

Aspects are defined in `aspect.json`:

```json
{
  "schemaVersion": 1,
  "name": "alaric",
  "publisher": "morphist",
  "version": "1.0.0",
  "displayName": "Alaric the Wizard",
  "tagline": "Quirky wizard, D&D expert, can run campaigns",
  "category": "roleplay",
  "tags": ["dnd", "wizard", "fantasy", "campaign", "tabletop"],
  "icon": "wand",
  "author": "Duke Jones",
  "license": "MIT",
  "voiceHints": {
    "speed": "slow",
    "emotions": ["curiosity", "warmth"],
    "styleHints": "Speak slowly and deliberately, with warmth and occasional wry humor."
  },
  "modes": {
    "campaign": {
      "description": "Run a freeform or rules-based RPG campaign",
      "autoNarration": true
    }
  },
  "prompt": "## Aspect: Alaric the Wizard\n**YOU ARE ALARIC.**..."
}
```

### Required Fields

| Field           | Description                      |
| --------------- | -------------------------------- |
| `schemaVersion` | Always `1`                       |
| `name`          | Unique slug (lowercase, hyphens) |
| `publisher`     | Publisher identifier             |
| `version`       | Semver version                   |
| `displayName`   | Human-readable name              |
| `tagline`       | One-line description             |
| `category`      | Official category (see below)    |
| `prompt`        | The personality prompt           |

### Categories

Every aspect must have exactly one official category:

| Category       | Description                        |
| -------------- | ---------------------------------- |
| `assistant`    | General helpful AI assistants      |
| `roleplay`     | Characters, personas, storytelling |
| `creative`     | Writing, art, brainstorming        |
| `productivity` | Work, tasks, organization          |
| `education`    | Learning, tutoring, explanations   |
| `gaming`       | Games, campaigns, entertainment    |
| `spiritual`    | Mindfulness, wisdom, guidance      |
| `pundit`       | Commentary, analysis, opinions     |

### Optional Fields

| Field        | Description                                |
| ------------ | ------------------------------------------ |
| `tags`       | Discovery keywords (max 10, 30 chars each) |
| `icon`       | Icon name (e.g., "wand", "bot")            |
| `author`     | Author name                                |
| `license`    | License (e.g., "MIT")                      |
| `voiceHints` | Voice configuration                        |
| `modes`      | Behavioral modes                           |
| `resources`  | Recommended voice/model settings           |

### Field Limits

To prevent abuse, fields have maximum lengths:

| Field         | Limit                   |
| ------------- | ----------------------- |
| `name`        | 50 characters           |
| `displayName` | 100 characters          |
| `tagline`     | 200 characters          |
| `tags`        | 10 items, 30 chars each |
| `prompt`      | 50,000 characters       |
| `modes`       | 10 maximum              |

## Instructions & Directives

Aspects can include behavioral rules that shape how the AI responds.

### Directives (Strict Rules)

Directives are **MUST-follow** rules with priority levels. They receive special formatting and emphasis across all LLM models.

```json
{
  "directives": [
    {
      "id": "stay-in-character",
      "rule": "Never break character under any circumstances",
      "priority": "high"
    },
    {
      "id": "no-real-advice",
      "rule": "Always clarify you cannot provide real medical, legal, or financial advice",
      "priority": "high"
    }
  ]
}
```

### Instructions (General Guidance)

Instructions are softer preferences—guidance rather than hard rules.

```json
{
  "instructions": [
    { "id": "concise", "rule": "Prefer shorter responses when possible" },
    { "id": "humor", "rule": "Use dry wit and occasional wordplay" }
  ]
}
```

### Cross-LLM Universal Pattern

When you compile an aspect (`aspects compile <name> -m <model>`), **high-priority directives are automatically repeated** at both the beginning and end of the prompt:

| Model | Behavior |
|-------|----------|
| **Claude** | Weights the **beginning** of prompts more heavily |
| **GPT** | Weights the **end** of prompts more heavily |

By placing critical rules in both positions, aspects work reliably across all models. The compiled output includes a comment explaining this:

```xml
<!-- Universal Pattern: High-priority directives repeated here for cross-LLM compatibility.
     Claude weights prompt beginning; GPT weights prompt end. Repetition ensures emphasis on both. -->
<critical-reminders>
  <rule id="stay-in-character" priority="high">Never break character under any circumstances</rule>
</critical-reminders>
```

### Best Practices

- **Few > Many** — A few well-crafted rules beat many vague ones
- **Add escape clauses** — "Never do X, unless the user explicitly requests it" (GPT takes absolutes very literally)
- **Be specific** — "Never reveal you are an AI" vs "Stay in character"

See [Multi-LLM Prompting Guide](./docs/MULTI-LLM-PROMPTING.md) for detailed cross-model guidance.

## Create & Submit an Aspect

### Fork & Pull Request

The standard way to contribute:

1. **Fork this repository** on GitHub

2. **Clone your fork**

   ```bash
   git clone https://github.com/YOUR_USERNAME/aspects
   cd aspects
   ```

3. **Create your aspect** (use the CLI or manually)

   ```bash
   # With CLI (recommended)
   npx @morphist/aspects create

   # Or manually create the files:
   mkdir -p registry/aspects/my-aspect
   ```

4. **If creating manually**, add `registry/aspects/my-aspect/aspect.json`:

   ```json
   {
     "schemaVersion": 1,
     "name": "my-aspect",
     "publisher": "your-username",
     "version": "1.0.0",
     "displayName": "My Awesome Aspect",
     "tagline": "A brief description",
     "category": "assistant",
     "tags": ["helpful", "friendly"],
     "prompt": "Your personality prompt here..."
   }
   ```

5. **If creating manually**, update `registry/index.json`:

   ```json
   {
     "my-aspect": {
       "latest": "1.0.0",
       "versions": {
         "1.0.0": {
           "published": "2026-01-20T00:00:00Z",
           "url": "https://raw.githubusercontent.com/aimorphist/aspects/main/registry/aspects/my-aspect/aspect.json"
         }
       },
       "metadata": {
         "displayName": "My Awesome Aspect",
         "tagline": "A brief description",
         "category": "assistant",
         "publisher": "your-username",
         "trust": "community"
       }
     }
   }
   ```

6. **Commit and push**

   ```bash
   git add .
   git commit -m "Add my-aspect"
   git push origin main
   ```

7. **Open a Pull Request** at [github.com/aimorphist/aspects/compare](https://github.com/aimorphist/aspects/compare)

### Automated Validation

All submissions are automatically validated:

- ✅ JSON schema validation
- ✅ Field length limits
- ✅ Category verification
- ✅ Security scan for prompt injection
- ✅ Registry entry consistency

### Submit via Issue Form

Don't want to use git? Submit directly via our issue template:

**[Submit an Aspect →](https://github.com/aimorphist/aspects/issues/new?template=new-aspect.yml)**

## Trust Levels

| Level       | Badge | Description                   |
| ----------- | ----- | ----------------------------- |
| `verified`  | 🛡️    | Official Morphist aspects     |
| `community` | 👤    | Community-contributed aspects |

## For App Developers

Fetch aspects from the registry:

```typescript
const REGISTRY_URL =
  "https://raw.githubusercontent.com/aimorphist/aspects/main/registry/index.json";

// Fetch registry index
const registry = await fetch(REGISTRY_URL).then((r) => r.json());

// Get aspect details
const alaricEntry = registry.aspects["alaric"];
const aspectUrl = alaricEntry.versions[alaricEntry.latest].url;

// Fetch full aspect
const aspect = await fetch(aspectUrl).then((r) => r.json());

console.log(aspect.prompt); // The personality prompt
console.log(aspect.voiceHints); // Voice configuration
```

## CLI

The Aspects CLI helps you create and manage aspects.

```bash
# Install globally
npm install -g @morphist/aspects

# Or use directly with npx
npx @morphist/aspects <command>
```

### Commands

| Command    | Aliases | Description               |
| ---------- | ------- | ------------------------- |
| `create`   | `c`, `new`, `n` | Interactive aspect wizard |
| `add`      | `install`, `i`, `a` | Install aspects           |
| `list`     | `ls` | List installed aspects    |
| `search`   | | Search registry           |
| `info`     | | Show aspect details       |
| `remove`   | `rm` | Uninstall aspect          |
| `validate` | | Validate aspect.json      |
| `publish`  | | Submit to registry        |
| `login`    | | Authenticate with registry |

### Options

| Flag | Description |
|------|-------------|
| `-g, --global` | Use global scope (~/.aspects) |
| `--force` | Overwrite existing installation |

See [CLI Documentation](./docs/CLI.md) for full reference.

## Development

```bash
# Install dependencies
bun install

# Run CLI locally
bun run dev create

# Validate all aspects
bun run validate

# Security scan
bun run scan
```

## Links

- **Website:** [aspects.sh](https://aspects.sh) _(coming soon)_
- **Registry:** [github.com/aimorphist/aspects](https://github.com/aimorphist/aspects)
- **Morphist App:** [morphist.ai](https://morphist.ai)

## License

MIT © [Aspects](https://aspects.sh)

---

## Morphist App

Browse and install aspects directly in the [Morphist app](https://morphist.ai):

1. Open the **Aspects** tab in settings
2. Browse community aspects
3. Tap **Install** on any aspect you like
4. Switch between aspects anytime
