# Phase 7: GitHub Source Support Implementation Plan

## Overview

Enable `aspects install github:user/repo` to install aspects directly from GitHub repositories.

## Current State

- Resolver parses `github:owner/repo@ref` → `{ type: 'github', owner, repo, ref }` (`src/lib/resolver.ts:17-30`)
- Installer returns "not yet supported" for GitHub specs (`src/lib/installer.ts:33`)
- `InstallResult.source` is `'registry' | 'local'` — needs `'github'`
- `InstalledAspect` has no field to track the git ref used

## Desired End State

```bash
# Install from GitHub (default branch: main)
aspects install github:morphist/alaric-aspect

# Install specific tag/branch/commit
aspects install github:morphist/alaric-aspect@v1.0.0
aspects install github:morphist/alaric-aspect@develop
aspects install github:morphist/alaric-aspect@abc1234

# Shows in list
aspects list
#   alaric@1.0.0 (github)
```

### Verification

```bash
bun run dev install github:aimorphist/aspects@main  # Install from this repo's registry
bun run dev list                                     # Shows installed
bun run dev info alaric                              # Shows details
bun run typecheck                                    # No errors
```

## What We're NOT Doing

- Private repository support (requires auth tokens)
- GitHub API usage (raw URLs only)
- Automatic default branch detection (hardcoded to `main`)
- GitHub releases/assets (just raw aspect.yaml)

---

## Phase 7.1: Update Types

### Overview

Add `github` to InstallResult source, add `githubRef` to InstalledAspect.

### Changes Required:

#### 1. Update `src/lib/types.ts`

Add `githubRef` field and update source type:

```typescript
export interface InstalledAspect {
  version: string;
  source: 'registry' | 'github' | 'local';
  installedAt: string;
  sha256: string;
  path?: string;      // For local installs
  githubRef?: string; // For github installs: tag/branch/commit used
}
```

#### 2. Update `src/lib/installer.ts`

Update `InstallResult` type:

```typescript
export type InstallResult =
  | {
      success: true;
      aspect: Aspect;
      source: 'registry' | 'github' | 'local';
      alreadyInstalled?: boolean;
    }
  | {
      success: false;
      error: string;
    };
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes

---

## Phase 7.2: Implement GitHub Install

### Overview

Add `installFromGitHub()` function to installer.ts.

### Changes Required:

#### 1. Update `src/lib/installer.ts`

Add the GitHub install function:

```typescript
const DEFAULT_GITHUB_REF = 'main';

/**
 * Install from a GitHub repository.
 * Fetches aspect.yaml from raw.githubusercontent.com
 */
async function installFromGitHub(
  owner: string, 
  repo: string, 
  ref?: string
): Promise<InstallResult> {
  const targetRef = ref ?? DEFAULT_GITHUB_REF;
  
  // Build raw GitHub URL
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${targetRef}/aspect.yaml`;
  
  // Fetch aspect.yaml
  log.start(`Fetching from github:${owner}/${repo}@${targetRef}...`);
  let yamlContent: string;
  try {
    yamlContent = await ofetch(url, { responseType: 'text' });
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('404')) {
      return { 
        success: false, 
        error: `No aspect.yaml found at github:${owner}/${repo}@${targetRef}. Make sure the repo exists and has an aspect.yaml in the root.` 
      };
    }
    return { success: false, error: `Failed to fetch from GitHub: ${message}` };
  }

  // Parse and validate
  const parseResult = parseAspectYaml(yamlContent);
  if (!parseResult.success) {
    return { success: false, error: `Invalid aspect.yaml: ${parseResult.errors.join(', ')}` };
  }

  if (parseResult.warnings.length > 0) {
    parseResult.warnings.forEach(w => log.warn(w));
  }

  const aspect = parseResult.aspect;

  // Check if already installed at same ref
  const existing = await getInstalledAspect(aspect.name);
  if (existing && existing.source === 'github' && existing.githubRef === targetRef) {
    const existingAspect = await loadAspectFromPath(getAspectPath(aspect.name));
    if (existingAspect && existing.sha256 === sha256(yamlContent)) {
      return { success: true, aspect: existingAspect, source: 'github', alreadyInstalled: true };
    }
  }

  // Store to ~/.aspects/aspects/<name>/
  await ensureAspectsDir();
  const aspectDir = getAspectPath(aspect.name);
  await mkdir(aspectDir, { recursive: true });
  await writeFile(join(aspectDir, 'aspect.yaml'), yamlContent);

  // Update config
  const hash = sha256(yamlContent);
  await addInstalledAspect(aspect.name, {
    version: aspect.version,
    source: 'github',
    installedAt: new Date().toISOString(),
    sha256: hash,
    githubRef: targetRef,
  });

  return { success: true, aspect, source: 'github' };
}
```

#### 2. Update the `installAspect` switch

```typescript
export async function installAspect(spec: InstallSpec): Promise<InstallResult> {
  switch (spec.type) {
    case 'registry':
      return installFromRegistry(spec.name, spec.version);
    case 'local':
      return installFromLocal(spec.path);
    case 'github':
      return installFromGitHub(spec.owner, spec.repo, spec.ref);
  }
}
```

#### 3. Add `ofetch` import at top of file

```typescript
import { ofetch } from 'ofetch';
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes
- [x] `bun run dev install github:aimorphist/aspects@main` works (fetches from this repo)

---

## Phase 7.3: Update Commands for GitHub Source

### Overview

Update list, info, and update commands to handle GitHub source properly.

### Changes Required:

#### 1. Update `src/commands/list.ts`

Show `(github)` for GitHub installs:

```typescript
for (const aspect of installed) {
  const sourceLabel = aspect.source === 'local' ? ' (local)' 
    : aspect.source === 'github' ? ' (github)' 
    : '';
  console.log(`  ${aspect.name}@${aspect.version}${sourceLabel}`);
}
```

#### 2. Update `src/commands/update.ts`

Skip GitHub installs for now (or check for updates if same ref):

```typescript
if (aspect.source === 'github') {
  console.log(`  ${aspect.name}: github install, run 'aspects install github:...' to update`);
  continue;
}
```

#### 3. Update `src/commands/remove.ts`

Handle GitHub source same as registry (delete files):

```typescript
// Delete files if registry or github install (local installs just unregister)
if (installed.source === 'registry' || installed.source === 'github') {
  const aspectDir = getAspectPath(args.name);
  try {
    await rm(aspectDir, { recursive: true });
  } catch {
    // Directory might not exist, that's fine
  }
}
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes
- [x] `bun run dev list` shows `(github)` for GitHub installs
- [x] `bun run dev remove <name>` works for GitHub installs

#### Manual Verification:
- [ ] Install from GitHub repo works
- [ ] Reinstalling same ref shows "already installed"
- [ ] Installing non-existent repo shows clear error
- [ ] Installing repo without aspect.yaml shows clear error

---

## Testing Strategy

### Test with this repo:

The `registry/aspects/` directory in this repo can be used for testing:

```bash
# This should work once repo is on GitHub
bun run dev install github:aimorphist/aspects@main

# Will fail - no aspect.yaml in root
bun run dev install github:aimorphist/aspects

# To test properly, could create a test repo with aspect.yaml in root
```

### Test scenarios:

1. Valid repo with aspect.yaml in root
2. Valid repo without aspect.yaml (404 error)
3. Non-existent repo (404 error)
4. Invalid ref/tag (404 error)
5. Reinstall same ref (already installed)
6. Install different ref of same aspect (updates)

---

## Implementation Order

1. Update `InstalledAspect` type with `githubRef` field
2. Add `installFromGitHub()` to installer.ts
3. Wire up in `installAspect()` switch
4. Update `list.ts` to show `(github)`
5. Update `remove.ts` to handle GitHub source
6. Update `update.ts` to skip GitHub installs
7. Test with real GitHub repo

---

## Future Enhancements (Out of Scope)

- Private repo support via `GITHUB_TOKEN` env var
- GitHub API for default branch detection
- GitHub releases as version source
- Subpath support (`github:user/repo/path/to/aspect`)

---

## References

- V1 plan: `docs/plans/v1-implementation.md`
- Phase 4 plan: `docs/plans/phase-4-install-command.md`
- Resolver: `src/lib/resolver.ts`
- Installer: `src/lib/installer.ts`
