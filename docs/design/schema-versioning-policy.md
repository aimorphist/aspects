# Schema Versioning Policy

**Status:** Decided
**Date:** 2026-06-03
**Decider:** Dorje + analysis

---

## Problem Statement

When an aspect declares `implements: ["builtin/personality@1.0.0"]`, that string is used to look up the validation schema. If the personality schema later receives a new version (`1.1.0`), what happens to existing aspects that still reference `1.0.0`?

This is a protocol-level decision because it affects:

- How the registry stores and resolves schema refs
- Whether content-addressed (blake3) refs and named refs behave differently
- How much complexity validators and clients need to carry

---

## Current State

`src/schemas/index.ts` stores builtin schemas as a plain `Record<string, unknown>` keyed by the exact ref string:

```ts
export const BUILTIN_SCHEMAS: Record<string, unknown> = {
  'builtin/personality@1.0.0': personalityV1,
  'builtin/schema@1.0.0': schemaV1,
};
```

Schema lookup is a direct property access. There is no resolution layer — exact match or miss.

`src/lib/resolver.ts` parses install spec strings into typed `InstallSpec` objects. It already distinguishes:

- `blake3:<hash>` — content-addressed, immutable
- `publisher/name@version` — named registry ref

No semver comparison or compatibility resolution exists anywhere in the codebase.

The builtin schemas use `additionalProperties: false`. This is important: a "non-breaking" schema update that adds optional fields would *not* validate existing aspects unless those aspects are re-validated against the new schema. The schema itself is a closed object.

---

## Options Analysis

### Option A: Exact match only

`implements: ["builtin/personality@1.0.0"]` validates against `1.0.0` only. Any other version string is a lookup miss (error or unvalidated).

**Pros:**
- Trivial to implement — current implementation is already this
- Deterministic: given a ref string, there is exactly one schema or an error
- Content-addressed friendly: a named ref at an exact version behaves like a hash ref
- No ambiguity about what "compatible" means
- Easy to reason about in audit trails

**Cons:**
- Schema authors must re-publish or re-declare implements refs when schemas get minor updates
- With 6 aspects and 2 schemas this is not a real cost

### Option B: Semver-compatible resolution (minor/patch)

`1.0.0` matches `1.0.x` and `1.x.0`. A lookup finds the highest compatible registered version.

**Pros:**
- Aspects survive non-breaking schema updates without republishing
- Familiar from npm/cargo

**Cons:**
- "Non-breaking" is in the eye of the schema author; `additionalProperties: false` means adding a field is a breaking change regardless of the semver claim
- Requires a semver resolution pass on every validation — more code, more edge cases
- Breaks content-addressing: the same ref string can resolve to different schemas at different times
- Registry must store a sorted index of all schema versions, not just a flat map
- Harder to cache, harder to audit

### Option C: Schema declares compatibility

Each schema version carries `compatibleWith: ["1.0.0", "0.9.0"]`. A validator checks whether the declared version appears in the new schema's compatibility list.

**Pros:**
- Schema author has explicit control
- Can express non-linear compatibility (backports, etc.)

**Cons:**
- Requires schema metadata beyond JSON Schema — new field convention to define and enforce
- Still breaks content-addressing (same hash must be stable; adding `compatibleWith` changes the hash)
- More moving parts than Option A or B; none of the benefit is needed at current scale

### Option D: Hybrid — exact for content-addressed, semver for named refs

- `blake3:<hash>` always resolves to exactly that schema document (immutable by definition)
- `builtin/personality@1.0.0` resolves to the latest semver-compatible version
- `builtin/personality@=1.0.0` (with `=` prefix) pins to an exact version

**Pros:**
- Best of both worlds: hash refs are always precise, named refs are ergonomic
- `=` prefix for pinning is explicit and readable
- The parser in `resolver.ts` already has the structural separation needed (hash type vs registry type)

**Cons:**
- Two resolution modes means two code paths to implement, test, and explain
- `@=1.0.0` syntax is new territory — not from npm, cargo, or pip; requires doc
- All the `additionalProperties: false` concerns from Option B still apply
- Premature at current scale; the complexity cost is paid before the benefit is needed

### Option E: Versions are aliases, not ranges

A registry operator can add an alias so that `builtin/personality@1` or `builtin/personality@latest` resolves to a specific pinned version. Individual aspect refs are always exact. Alias management is an operator concern, not a protocol concern.

This is essentially Option A plus a thin indirection layer outside the spec. It is worth noting as the natural evolution path if named convenience refs become useful.

---

## Recommendation: Option A for Phase 1

**Decision: exact match only.**

Rationale:

1. **The current implementation is already Option A.** The flat map in `BUILTIN_SCHEMAS` and direct property lookup provide this for free. Any other option requires new code.

2. **`additionalProperties: false` neutralises Option B's main benefit.** The personality and schema builtins both close their objects. Adding a field to the schema *is* a breaking change. Semver-compatible resolution would give the illusion of safety it cannot actually provide without schema authors also relaxing `additionalProperties`.

3. **Content-addressing requires exact refs.** The blake3 path is already in the resolver. Exact named refs behave the same way, which keeps the mental model uniform.

4. **Scale does not justify complexity.** At 6 aspects and 2 schemas the cost of republishing an aspect ref is one line change. The cost of implementing, documenting, and debugging a semver resolver is much higher.

5. **Option D is the right next step when needed.** The resolver already separates hash refs from registry refs. Adding semver resolution only to the registry type, with `=` for pinning, is a clean addition. That can be done in a future phase when there are enough aspects and schema versions to justify it.

**For Phase 1, the rule is:**

> A schema ref in `implements` must match the stored schema key exactly. `builtin/personality@1.0.0` is different from `builtin/personality@1.1.0`. When a schema is updated, aspects that want to validate against the new version update their `implements` declaration.

---

## Impact on Implementation

| Area | Impact |
|------|--------|
| `src/schemas/index.ts` | No change. Flat map keyed by exact ref string. |
| `src/lib/resolver.ts` | No change. `parseInstallSpec` already handles both hash and registry types correctly. |
| Validator | Lookup schema by exact ref string. If missing, return a structured error (not silent pass). |
| Registry | Store schemas under their full `publisher/name@x.y.z` key. No version index needed. |
| CLI / docs | Document that `implements` refs are exact. Show example of updating a ref when the schema version changes. |

### When Option D becomes worth adding

Add Option D when:

- There are 3+ schema versions in active use across 20+ aspects, AND
- Schema authors are demonstrably using semver discipline (additive-only minors, no `additionalProperties` changes between minor versions)

At that point the addition is: in `parseInstallSpec`, detect `=` prefix on version strings and set a `pinned: true` flag; in the registry lookup, route non-pinned registry refs through a semver resolver, pinned refs and hash refs through the existing exact lookup.
