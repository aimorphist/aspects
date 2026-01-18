# aspects

> Package manager for AI personality aspects — like npm for agent personas.

```bash
npx aspects install alaric
```

## What are Aspects?

Aspects are personality modules for AI agents. They define how an AI speaks, thinks, and behaves — from quirky wizards to helpful assistants to domain experts.

Each aspect is a simple YAML file containing:
- **Identity**: Name, tagline, character description
- **Voice hints**: Speaking speed, emotional tone, style guidance  
- **Modes**: Different behavioral modes (e.g., "campaign mode" for a D&D wizard)
- **Prompt**: The core personality prompt

## Installation

```bash
# Install globally
npm install -g aspects

# Or use directly with npx
npx aspects install alaric
```

## Commands

### `aspects install <spec>`

Install an aspect from the registry, GitHub, or local path.

```bash
# From registry
aspects install alaric
aspects install alaric@1.0.0

# From GitHub  
aspects install github:morphist/wizard-aspect
aspects install github:morphist/wizard-aspect@v1.0.0

# From local path
aspects install ./my-aspect
aspects install /path/to/aspect.yaml
```

### `aspects list`

Show all installed aspects.

```bash
aspects list
# 📦 Installed aspects
#   alaric@1.0.0 — Quirky wizard, D&D expert
#   default@1.0.0 — Helpful voice AI assistant
```

### `aspects info <name>`

Show details about an installed aspect.

```bash
aspects info alaric
# Alaric the Wizard (alaric@1.0.0)
#   Quirky wizard, D&D expert, can run campaigns
#
#   Publisher:  morphist
#   Author:     Duke Jones
#   License:    MIT
#
#   Voice
#     Speed:     slow
#     Emotions:  curiosity, warmth
#
#   Modes
#     campaign → Run a freeform or rules-based RPG campaign
```

### `aspects search [query]`

Search the aspect registry.

```bash
aspects search wizard
# 🔍 Aspects matching "wizard"
#   alaric@1.0.0 ✓
#     Quirky wizard, D&D expert, can run campaigns
```

### `aspects remove <name>`

Remove an installed aspect.

```bash
aspects remove alaric
# ✓ Removed alaric@1.0.0
```

### `aspects update [name]`

Update installed aspects to latest versions.

```bash
# Check for updates
aspects update --check

# Update all
aspects update

# Update specific aspect
aspects update alaric
```

### `aspects init`

Create a new aspect interactively.

```bash
aspects init
# ✨ Create a new aspect
# ? Aspect name (slug) › my-wizard
# ? Display name › My Wizard
# ? Tagline › A wise and quirky wizard
# ...
```

## Aspect Format

Aspects are defined in `aspect.yaml`:

```yaml
schemaVersion: 1
name: alaric
version: 1.0.0
displayName: Alaric the Wizard
tagline: Quirky wizard, D&D expert, can run campaigns
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

prompt: |
  ## Aspect: Alaric the Wizard
  **YOU ARE ALARIC.** Speak as Alaric at all times.
  
  ### Character
  - Quirky old wizard, very high-level D&D-style magic user
  - Deep knowledge of D&D rules, lore, mechanics
  - Kind but little tolerance for dimwits
  
  ### Rules
  - Brief by default
  - Stay in character
```

## Storage

Aspects are stored in `~/.aspects/`:

```
~/.aspects/
├── config.json          # Installed aspects registry
└── aspects/
    ├── alaric/
    │   └── aspect.yaml
    └── default/
        └── aspect.yaml
```

## For App Developers

Read installed aspects programmatically:

```typescript
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { homedir } from 'os';
import { join } from 'path';

const aspectPath = join(homedir(), '.aspects/aspects/alaric/aspect.yaml');
const aspect = parse(readFileSync(aspectPath, 'utf-8'));

console.log(aspect.prompt); // The personality prompt
console.log(aspect.voiceHints); // Voice configuration
```

## License

MIT © [Morphist](https://morphist.ai)
