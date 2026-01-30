# Aspects CLI Roadmap

> Planned features for the Aspects CLI.

## Command Status

| Command | Aliases | Status | Description |
|---------|---------|--------|-------------|
| `create` | `c`, `new`, `n` | ✅ Implemented | Create new aspect interactively |
| `add` | `install`, `a`, `i` | ✅ Implemented | Install aspects |
| `list` | - | ✅ Implemented | List installed aspects |
| `search` | - | ✅ Implemented | Search registry |
| `info` | - | ✅ Implemented | Show aspect details |
| `remove` | - | ✅ Implemented | Uninstall aspect |
| `update` | - | ✅ Implemented | Update aspects |
| `validate` | - | ✅ Implemented | Validate aspect.json |
| `compile` | - | ✅ Implemented | Generate prompt for model |
| `publish` | - | ✅ Implemented | Submit to registry |
| `find` | - | 🔜 Planned | Advanced search with operators |
| `edit` | - | 🔜 Planned | Edit existing aspects/sets |
| `set` | - | 🔜 Planned | Manage aspect sets |
| `generate` | - | 🔜 Planned | AI-powered aspect creation |

---

## Planned: `find`

Advanced search with field-specific filters and boolean operators.

```bash
# Default: search by name
aspects find wizard

# Field-specific
aspects find --name wizard        # -n (default)
aspects find --tag roleplay       # -t
aspects find --category gaming    # -c
aspects find --publisher morphist # -p

# All common fields
aspects find --all wizard         # -a

# Deep search (includes modes, directives, prompt)
aspects find --all wizard --deep

# Boolean operators
aspects find -n wizard -t fantasy             # AND (default)
aspects find -n wizard --or -t mentor         # OR
aspects find -n wizard --not -t evil          # NOT
aspects find -c roleplay -t fantasy --not -t dark

# Scope
aspects find wizard --local       # Only installed
aspects find wizard --registry    # Only registry (default: both)
```

**Example:**

```bash
# Find wizards but exclude dark/evil ones
aspects find -n wizard --not -t evil --not -t dark
# Returns: alaric, gandalf, my-wizard

# Find morally complex wizards
aspects find -n wizard -t corrupted
# Returns: saruman
```

| Flag | Short | Description |
|------|-------|-------------|
| `--name` | `-n` | Search names only (default) |
| `--tag` | `-t` | Search tags |
| `--category` | `-c` | Search categories |
| `--publisher` | `-p` | Search publishers |
| `--all` | `-a` | Search all common fields |
| `--deep` | - | Include modes, directives, prompt |
| `--or` | `-o` | OR operator (default is AND) |
| `--not` | - | NOT operator (applies to next flag) |
| `--local` | - | Only search installed aspects |
| `--registry` | - | Only search registry |

---

## Planned: `edit`

Edit an existing aspect or set with prepopulated values.

```bash
aspects edit                      # List and select
aspects edit my-wizard            # Edit specific aspect
aspects set edit my-favorites     # Edit a set
```

**Features:**
- Lists all local aspects/sets if no name provided
- Shows current values as defaults (press Enter to keep)
- Only updates changed fields
- Validates after editing
- Shows diff of changes

---

## Planned: `set`

Manage aspect sets - named collections of aspects.

### `set create`

```bash
# With aspects
aspects set create my-favorites alaric gandalf sherlock

# Wizard mode (no aspects provided)
aspects set create my-favorites
```

### `set list`

```bash
aspects set list
```

### `set add` / `set remove`

```bash
aspects set add my-favorites code-reviewer
aspects set remove my-favorites sherlock
```

### `set install`

Install all aspects in a set.

```bash
aspects set install my-favorites
```

### Set Schema

Location: `~/.aspects/sets/<name>/set.json`

```json
{
  "schemaVersion": 1,
  "name": "my-favorites",
  "displayName": "My Favorites",
  "description": "My go-to aspects",
  "aspects": ["alaric", "gandalf", "sherlock"]
}
```

---

## Planned: `generate`

AI-powered aspect creation from natural language.

```bash
aspects generate "a sarcastic pirate who gives coding advice"
```

| Flag | Description |
|------|-------------|
| `--model` | AI model to use |
| `--no-review` | Save directly without wizard review |
| `--category` | Pre-specify category |

---

## Create Wizard Enhancement

The `create` wizard will detect existing sets and offer to add new aspects:

```
✓ Created my-wizard/aspect.json

📦 Found 2 local sets:
  1. my-favorites (3 aspects)
  2. productivity-pack (5 aspects)
  3. Don't add to a set

? Add this aspect to a set? › my-favorites
```

---

## Storage Structure

```
~/.aspects/
├── config.json
├── aspects/<name>/aspect.json
└── sets/<name>/set.json
```
