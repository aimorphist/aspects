# Plan: Migrate CLI to Registry REST API

> Migrate the aspects CLI from static GitHub-based registry to the REST API backend at localhost:5173/api/v1, implementing all commands including full device auth flow.

## ✅ STATUS: COMPLETE (2026-01-29)

All 12 work items implemented. All 10 success criteria verified. 59/59 tests passing.

**Additional features implemented via Blake3 plan:**
- `share` command (anonymous hash publishing)
- `unpublish` command (originally deferred, now complete)
- Hash-based install (`hash:` prefix)

---

## Decisions

- **All commands at once** - no phased rollout
- **Replace GitHub PR publish** entirely with REST API publish
- **Rename aspect.yaml to aspect.json** throughout the codebase
- **Implement full device auth** (login/logout with device authorization flow)
- **Skip unpublish** - defer to later phase
- **Base URL:** `http://localhost:5173/api/v1` (dev), configurable for production

---

## Work Items

### 1. Update types and config for auth + API responses

**Files:** `src/lib/types.ts`, `src/lib/config.ts`

**Changes:**
- Add `auth` field to `AspectsConfig`: `{ accessToken, refreshToken, expiresAt, username }`
- Add API response types: `ApiError`, `ApiSearchResult`, `ApiAspectDetail`, `ApiVersionContent`, `ApiPublishResponse`, `ApiDeviceCode`, `ApiDevicePoll`
- Add `registryUrl` to config settings (default: `http://localhost:5173/api/v1`)
- Add config helpers: `getAuthToken()`, `setAuthTokens()`, `clearAuth()`, `isLoggedIn()`
- Update `InstalledAspect` - no structural change needed, but ensure `source: 'registry'` path works with the new API

### 2. Create REST API client module

**New file:** `src/lib/api-client.ts`

**Functions to implement:**
- `createApiClient(baseUrl?: string)` - factory that reads config for base URL
- `getRegistry()` - `GET /registry` (full index, cached 5 min)
- `getAspect(name: string)` - `GET /aspects/:name` (all versions + stats)
- `getAspectVersion(name: string, version: string)` - `GET /aspects/:name/:version` (specific content)
- `searchAspects(params: { q?, category?, trust?, limit?, offset? })` - `GET /search`
- `publishAspect(aspect: Aspect, token: string)` - `POST /aspects` (auth required)
- `getStats()` - `GET /stats`
- `getCategories()` - `GET /categories`
- `initiateDeviceAuth()` - `POST /auth/device`
- `pollDeviceAuth(deviceCode: string, codeVerifier: string)` - `POST /auth/device/poll`

**Cross-cutting concerns:**
- Use `ofetch` (already a dependency) for HTTP requests
- 30-second default timeout
- Retry with exponential backoff for 429/503 (max 3 retries)
- Structured error handling - parse API error responses into typed errors
- Auth header injection for authenticated endpoints
- In-memory cache with TTL for registry index (5 min) and categories (24 hr)

### 3. Update registry module to use API client

**File:** `src/lib/registry.ts`

**Changes:**
- Replace `fetchRegistryIndex()` internals to call `apiClient.getRegistry()` instead of fetching raw GitHub URL
- Replace `getRegistryAspect()` to call `apiClient.getAspect(name)` - direct lookup instead of downloading full index
- Replace `fetchAspectYaml()` with `fetchAspectContent()` that calls `apiClient.getAspectVersion(name, version)` and returns the `content` field
- Keep `clearRegistryCache()` but expand it to clear API client caches too
- Add new exports: `searchRegistry()`, `getRegistryStats()`, `getCategories()`
- **Fallback:** If API is unreachable, fall back to the old GitHub raw URL fetch (graceful degradation)

### 4. Update installer for API-based installs

**File:** `src/lib/installer.ts`

**Changes:**
- Update `installFromRegistry()` to use new registry module functions:
  - Call `getRegistryAspect(name)` which now hits the API
  - Get version content via `fetchAspectContent(name, version)` instead of `fetchAspectYaml(url)`
  - Version resolution happens via API: pass `"latest"` as version to let API resolve
- Rename all `aspect.yaml` references to `aspect.json` in file writes
- Update `loadAspectFromPath()` to look for `aspect.json` (with `aspect.yaml` fallback for backwards compat)
- Update SHA256 verification to compare against API-provided hash
- GitHub and local install paths remain unchanged (they don't use the registry API)

### 5. Rename aspect.yaml to aspect.json throughout

**Files:** All files referencing `aspect.yaml`

**Changes:**
- `src/lib/installer.ts` - file write paths
- `src/lib/aspect-loader.ts` - file read paths
- `src/lib/parser.ts` - file references
- `src/commands/publish.ts` - file scanning
- `src/commands/info.ts` - if it reads files directly
- `src/commands/create.ts` - file output
- `src/commands/validate.ts` - file references
- `src/utils/paths.ts` - if it defines filename constants
- Add backwards compatibility: when loading, check for `aspect.json` first, fall back to `aspect.yaml`
- Existing installed aspects with `aspect.yaml` files continue to work

### 6. Implement login command (device auth flow)

**New file:** `src/commands/login.ts`

**Flow:**
1. Check if already logged in - if so, display current user and ask to re-login
2. Call `apiClient.initiateDeviceAuth()` to get device_code, user_code, verification_uri
3. Display: verification URL with user code
4. Attempt to open browser via `open` (macOS) / `xdg-open` (Linux) / `start` (Windows)
5. Poll `apiClient.pollDeviceAuth()` every `interval` seconds (default 5)
6. Handle poll responses:
   - `pending` - continue polling, show spinner
   - `slow_down` - double interval, continue
   - `expired` - error, suggest re-running login
   - `denied` - error message
   - `success` - store tokens in config
7. On success: call `setAuthTokens()` to save to `~/.aspects/config.json`
8. Display: "Authorized as @username"

**CLI signature:** `aspects login` (no args)

### 7. Implement logout command

**New file:** `src/commands/logout.ts`

**Flow:**
1. Check if logged in - if not, say "Not logged in"
2. Call `clearAuth()` to remove tokens from config
3. Display: "Logged out. Auth tokens removed."

**CLI signature:** `aspects logout` (no args)

### 8. Update search command for server-side search

**File:** `src/commands/search.ts`

**Changes:**
- Replace `fetchRegistryIndex()` + client-side filtering with `apiClient.searchAspects()`
- Add CLI options: `--category`, `--trust`, `--limit`, `--offset`
- Update output formatting to match Implementation Guide format:
  ```
  alaric@1.0.0          Quirky wizard, D&D expert        [verified] 1.5k downloads
  ```
- Handle pagination: show "Showing X-Y of Z results" when applicable
- Handle empty results gracefully
- **Fallback:** If API unreachable, fall back to client-side search of cached/fetched index

### 9. Rewrite publish command for REST API

**File:** `src/commands/publish.ts`

**Changes - full rewrite, remove GitHub PR workflow entirely:**
- Replace the 687-line GitHub PR workflow with a clean API publish:
  1. Scan for local `aspect.json` (current dir, subdirs, `~/.aspects/aspects/`)
  2. Validate against Zod schema locally (keep existing validation logic)
  3. Check auth - require login, verify publisher matches username
  4. Check file size (50KB limit)
  5. `POST /aspects` with auth header via `apiClient.publishAspect()`
  6. Handle success/error responses with helpful messages per Implementation Guide
- Add `--dry-run` flag: validate locally without publishing
- Add `--path` arg: path to aspect directory or file (keep existing)
- Remove: `checkGitHubCli()`, `getGitHubUsername()`, `ensureFork()`, `prepareLocalFork()`, `createBranch()`, `copyAspectToRegistry()`, `updateRegistryIndex()`, `commitAndPush()`, `createPullRequest()`, `handleIssueTemplate()`, `handleManualInstructions()`
- Remove: `~/.aspects/.publish-cache/` directory usage
- Keep: `loadAspectFromPath()`, `findLocalAspects()`, `validateAspect()`

### 10. Update info command for remote lookup

**File:** `src/commands/info.ts`

**Changes:**
- If aspect is installed locally, show local info (current behavior)
- If NOT installed locally, query `apiClient.getAspect(name)` to show remote info
- Display additional fields from API: download stats, all versions, trust level
- Match Implementation Guide output format:
  ```
  Name: alaric
  Publisher: morphist
  Category: roleplay
  Trust: verified
  Latest: 1.0.0
  Stats: 1,547 total / 234 weekly downloads
  Versions: 1.0.0, 0.9.0
  ```

### 11. Register new commands in CLI entry point

**File:** `src/cli.ts`

**Changes:**
- Import and register `login` command
- Import and register `logout` command
- Add `whoami` alias for checking auth status (optional, could be part of login with no args)

### 12. Update add command - wire up force flag

**File:** `src/commands/add.ts`

**Changes:**
- Pass `--force` flag through to `installAspect()` (currently defined but not used)
- Update `installer.ts` to accept and respect `force` option for re-installs
- Update file references from `aspect.yaml` to `aspect.json`

---

## Execution Order

The items have dependencies, so they should be executed in this order:

```
Phase A (Foundation):
  1. Update types and config          ← everything depends on this
  2. Create API client module          ← registry/commands depend on this

Phase B (Core Migration):
  3. Update registry module            ← installer/commands depend on this
  4. Update installer                  ← add command depends on this
  5. Rename aspect.yaml → aspect.json  ← cross-cutting, do after core modules

Phase C (Commands):
  6. Implement login command           ← publish depends on this
  7. Implement logout command          ← standalone
  8. Update search command             ← standalone
  9. Update publish command            ← depends on auth
  10. Update info command              ← standalone
  11. Register commands in cli.ts      ← after all commands exist
  12. Wire up force flag in add        ← standalone
```

Phases B and C items within each phase can be parallelized where noted as "standalone".

---

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/api-client.ts` | REST API client with all endpoint methods |
| `src/commands/login.ts` | Device authorization login command |
| `src/commands/logout.ts` | Logout command (clear tokens) |

## Files Modified

| File | Change Scope |
|------|-------------|
| `src/lib/types.ts` | Add auth types, API response types |
| `src/lib/config.ts` | Add auth helpers, registryUrl setting |
| `src/lib/registry.ts` | Major rewrite - use API client |
| `src/lib/installer.ts` | Use new registry functions, rename yaml→json |
| `src/lib/aspect-loader.ts` | Rename yaml→json with fallback |
| `src/lib/parser.ts` | Rename yaml→json references |
| `src/commands/search.ts` | Server-side search + filters |
| `src/commands/publish.ts` | Full rewrite - replace GitHub PR with API publish |
| `src/commands/info.ts` | Add remote lookup |
| `src/commands/add.ts` | Wire up force flag, rename yaml→json |
| `src/commands/create.ts` | Rename yaml→json in output |
| `src/commands/validate.ts` | Rename yaml→json references |
| `src/cli.ts` | Register login/logout commands |
| `src/utils/paths.ts` | Update filename constants if any |

## Files Unchanged

| File | Reason |
|------|--------|
| `src/commands/list.ts` | Purely local, no registry interaction |
| `src/commands/remove.ts` | Purely local |
| `src/commands/update.ts` | May benefit from API later, skip for now |
| `src/commands/compile.ts` | No registry interaction |
| `src/commands/bundle.ts` | No registry interaction |
| `src/commands/set.ts` | No registry interaction |
| `src/utils/colors.ts` | No change needed |
| `src/utils/hash.ts` | No change needed |
| `src/utils/logger.ts` | No change needed |

---

## Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| API server not running during dev | Fallback to GitHub static registry for read operations |
| Auth server (Identikey) not ready | Login flow will work when server is ready; test with mock responses |
| Breaking existing installs (yaml→json rename) | Backwards-compat: check for both filenames when loading |
| Publish regression (removing GitHub PR) | GitHub PR was for static registry; database-backed API replaces it entirely |
| API response format mismatch | Validate against typed interfaces; fail gracefully with clear errors |

---

## Success Criteria

- [x] `aspects install alaric` fetches from REST API at localhost:5173
- [x] `aspects search wizard` performs server-side search with category/trust filters
- [x] `aspects login` completes device authorization flow
- [x] `aspects logout` clears stored tokens
- [x] `aspects publish` sends aspect to API with auth token
- [x] `aspects publish --dry-run` validates without publishing
- [x] `aspects info alaric` shows remote details when not installed locally
- [x] All existing locally-installed aspects (with aspect.yaml) continue to load
- [x] New installs create aspect.json files
- [x] Network failures fall back gracefully with helpful error messages
