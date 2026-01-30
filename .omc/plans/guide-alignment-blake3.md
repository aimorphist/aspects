# Plan: Align CLI with Client Implementation Guide

> Migrate from SHA-256 to Blake3, add hash-based install (`aspects add hash:<blake3hash>`), add `share` and `unpublish` commands. Aligns the CLI client with `docs/client-implementation-guide.md`.

---

## Decisions

- **Migrate SHA-256 → Blake3** using `hash-wasm` npm package (pure WASM, Bun-compatible, actively maintained)
- **Keep `sha256()` as deprecated helper** for backward compat with existing installs
- **Hash format: base64** (44 chars for 32-byte blake3 digest) - matches guide examples
- **`hash:` install spec** - new prefix for content-addressed installs
- **Server endpoint required** - `GET /api/v1/aspects/by-hash/:hash` (out of scope, client fails gracefully)
- **Unpublish** - implement client-side, server's `DELETE` endpoint assumed to exist per guide
- **Lazy config migration** - existing installs with only `sha256` are re-verified on next use (blake3 computed and saved); no bulk migration needed
- **Server fallback** - if API response lacks `blake3` field, compute hash locally from content

---

## Work Items

### 1. Install hash-wasm dependency

```bash
bun install hash-wasm
```

### 2. Smoke test blake3 under Bun

Verify `hash-wasm` works in Bun before proceeding:

```bash
bun -e "import { blake3 } from 'hash-wasm'; blake3('test').then(h => console.log('blake3:', h))"
```

If this fails, fall back to `@webbuf/blake3` or investigate.

### 3. Rewrite hash utility

**File:** `src/utils/hash.ts`

**Changes:**
- Add `blake3Hash(content: string): Promise<string>` using `hash-wasm`, returns **base64** (matching guide format)
- Keep `sha256(content: string): string` as deprecated backward-compat helper

### 4. Update type definitions (hash fields only)

**File:** `src/lib/types.ts`

**Changes:**
- `InstalledAspect` (line 83): rename `sha256` → `blake3`, add optional `sha256?` for compat
- `RegistryVersion` (line 132): rename `sha256?` → `blake3?`, add optional `sha256?` for compat
- `ApiAspectDetail.versions` (line 173): rename `sha256` → `blake3`
- `ApiVersionContent` (line 184): rename `sha256` → `blake3`
- Add `ApiUnpublishResponse` interface: `{ ok: true; message: string }`

> **Note:** Do NOT add `{ type: 'hash'; hash: string }` to `InstallSpec` yet - that must be added atomically with the installer switch case (step 10) to avoid build breakage.

### 5. Update installer to use blake3

**File:** `src/lib/installer.ts`

**Changes:**
- Import `blake3Hash` instead of `sha256` (keep `sha256` import for compat checks)
- Update all 6 hash sites to use `blake3Hash()`:
  - Line 113: `versionData.blake3 || await blake3Hash(content)` (API install - with fallback if server lacks blake3)
  - Line 206: `await blake3Hash(content)` (legacy registry)
  - Line 271: `existing.blake3 === await blake3Hash(content)` (GitHub cache check)
  - Line 284: `await blake3Hash(content)` (GitHub install)
  - Line 341: `await blake3Hash(content)` (local install)
  - Line 346: `existing.blake3 === hash` (local cache check - uses variable from line 341)
- Update all 4 property writes from `sha256: hash` to `blake3: hash` (lines 118, 211, 289, 356)
- Add backward-compat cache-hit detection: check `existing.blake3` first, fall back to `existing.sha256`
- On cache miss due to missing blake3 (lazy migration): re-compute blake3, save to config

> **Note:** `installFromHash()` and `case 'hash'` are added in step 10 after the resolver and API client are ready.

### 6. Update registry facade

**File:** `src/lib/registry.ts`

**Changes:**
- Update `apiDetailToRegistryAspect` field mapping (line 122): `sha256` → `blake3`
- Update inline type annotation (line 116): `sha256?: string` → `blake3?: string`
- Add `fetchAspectByHash(hash: string)` wrapper around `api.getAspectByHash()`

### 7. Add API client methods

**File:** `src/lib/api-client.ts`

**Changes:**
- Add `getAspectByHash(hash: string): Promise<ApiVersionContent>` → `GET /aspects/by-hash/:hash` (no auth)
- Add `unpublishAspect(name: string, version: string): Promise<ApiUnpublishResponse>` → `DELETE /aspects/:name/:version` (auth required)

### 8. Update resolver for hash prefix

**File:** `src/lib/resolver.ts`

**Changes:**
- Add `hash:` prefix check before `github:` check
- Parse `hash:<blake3base64>` into `{ type: 'hash', hash: string }`
- Validate minimum hash length (16 chars)

### 9. Confirm publish command needs no changes

**File:** `src/commands/publish.ts`

**Review only** - confirm the publish command does not compute or send hashes client-side. Server is expected to compute blake3 on its end. If publish does send a hash, update it.

### 10. Add hash-based install (atomic: types + installer + resolver)

These three changes must land together to avoid build breakage (the `installAspect()` switch is exhaustive):

**File:** `src/lib/types.ts`
- Add `{ type: 'hash'; hash: string }` to `InstallSpec` union

**File:** `src/lib/installer.ts`
- Add new `installFromHash()` function for `hash:` spec type (calls `api.getAspectByHash()`)
- Wire `case 'hash'` into `installAspect()` switch

**File:** `src/lib/resolver.ts`
- (Already done in step 8 - this is the wiring step)

### 11. Create share command

**New file:** `src/commands/share.ts`

**Behavior:**
- Takes aspect name as positional arg
- Looks up installed aspect, reads its blake3 hash (from config or computes from file)
- Outputs hash and the install command: `aspects add hash:<hash>`
- Works entirely client-side, no auth needed

### 12. Create unpublish command

**New file:** `src/commands/unpublish.ts`

**Behavior:**
- Takes `name@version` as positional arg
- Requires auth (checks `isLoggedIn()`)
- Shows confirmation prompt before proceeding
- Calls `DELETE /aspects/:name/:version`
- Handles error codes: `forbidden` (72-hour window), `not_found`, `unauthorized`

### 13. Register new commands in CLI

**File:** `src/cli.ts`

**Changes:**
- Import and register `share` command
- Import and register `unpublish` command

### 14. Update tests

**Modified files:**
- `tests/unit/api-client.test.ts` - Update mock data `sha256` → `blake3`, add `getAspectByHash` and `unpublishAspect` tests
- `tests/unit/registry.test.ts` - Update mock data `sha256` → `blake3`
- `tests/unit/resolver.test.ts` - Add `hash:` spec parsing tests

**New file:** `tests/unit/hash.test.ts` - Tests for `blake3Hash()` and legacy `sha256()`

**Also check:**
- `tests/integration/install-live.test.ts` - Will now write `blake3` instead of `sha256`; verify assertions still hold
- `tests/integration/api-live.test.ts` - If live server returns `blake3`, type assertions should match

### 15. Update documentation

**File:** `docs/client-implementation-guide.md`
- Add `GET /aspects/by-hash/:hash` endpoint section
- Add `hash:` install spec to operations section
- Add `share` command description

**File:** `docs/plans/v1-implementation.md`
- Check off Phase 11 items: blake3 hashing, hash-based install, share, unpublish

---

## Backward Compatibility

- `InstalledAspect` keeps optional `sha256?` - existing `~/.aspects/config.json` files parse correctly
- `RegistryVersion` keeps optional `sha256?` - static GitHub fallback registry still works
- Cache-hit detection checks `blake3` first, falls back to `sha256` comparison
- **Lazy migration:** Old installs lacking `blake3` will re-compute the hash on next use (install, update, or share) and save it to config. No re-download needed - content is already on disk.
- New installs write `blake3` only (no `sha256`)
- Server API fallback: if `versionData.blake3` is missing (server not yet migrated), compute blake3 locally from downloaded content

## Server-Side Notes (out of scope for this PR)

- New endpoint needed: `GET /api/v1/aspects/by-hash/:hash` → returns `ApiVersionContent`
- API responses should return `blake3` field (migration for existing data)
- `DELETE /api/v1/aspects/:name/:version` should exist per the guide
- Static fallback registry (`registry/index.json` on GitHub) still uses `sha256?` - no change needed now, but should eventually add `blake3?` fields

---

## Verification

1. `hash-wasm` smoke test passes under Bun (step 2)
2. `bun test` - all existing + new tests pass (50+ existing, ~10 new)
3. `bun run src/cli.ts add alaric` - basic install still works with blake3
4. `bun run src/cli.ts share alaric` - outputs blake3 hash (base64) + install command
5. `hash:` resolver parsing verified in unit tests
6. Backward compat: config with only `sha256` fields doesn't break on read - lazy migration computes blake3 on next use
7. Confirm `publish` command needs no changes (step 9)
