# Aspects Implementation Plan

Phased rollout for community aspects - from MVP to full platform.

---

## MVP: "GitHub is the Registry"

**Goal:** Anyone can create and share aspects. Morphist users can browse and use them. Ship fast, hype hard.

**Timeline:** 1-2 weeks

**Key insight:** Morphist is a mobile app. There's no local filesystem sync. The phone fetches aspects directly from GitHub.

### How It Works (0 Cuils)

```
CREATOR                          REGISTRY                         MORPHIST APP
───────                          ────────                         ────────────
1. Makes aspect.yaml      PR     2. GitHub Action validates       4. Fetches index.json
   in their GitHub repo   ───►      and auto-merges if valid      5. Shows aspect list
                                 3. index.json updated            6. User picks one
                                                                  7. Fetches that aspect.yaml
                                                                  8. Uses in prompts
```

---

### MVP Phase 1: GitHub Action for Auto-Validation

Create a GitHub Action that validates and auto-merges community aspect PRs.

**File:** `.github/workflows/validate-aspect.yml`

```yaml
name: Validate Aspect PR

on:
  pull_request:
    paths: ["registry/**"]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Validate aspect schema
        run: bun run validate-pr

      - name: Security scan
        run: bun run security-scan

      - name: Auto-merge if valid
        if: success()
        uses: peter-evans/enable-pull-request-automerge@v3
        with:
          merge-method: squash
```

**Validation script:** `scripts/validate-pr.ts`

- Check aspect.yaml against schema
- Verify required fields
- Check URL is accessible

**Security scan:** `scripts/security-scan.ts`

- Flag "ignore previous instructions" patterns
- Flag password/financial requests
- Flag jailbreak attempts

**Estimated effort:** ~150 lines, 3-4 hours

---

### MVP Phase 2: Two-Tier Trust System

**Tier 1: Community (auto-merged)**

- PR passes schema validation
- PR passes security scan
- Auto-merged with `trust: "community"`

**Tier 2: Verified (manual review)**

- Creator requests verification (label or issue)
- Morphist team reviews
- Upgraded to `trust: "verified"`

**Registry format:**

```json
{
  "aspects": {
    "alaric": {
      "trust": "verified",
      "latest": "1.0.0",
      "url": "https://raw.githubusercontent.com/..."
    },
    "community-wizard": {
      "trust": "community",
      "latest": "1.0.0",
      "url": "https://raw.githubusercontent.com/..."
    }
  }
}
```

**Estimated effort:** Already covered by Phase 1 automation

---

### MVP Phase 3: Morphist Fetches from Registry

Add registry fetching to Morphist app.

**Files to create:**

```
morphist/
├── lib/
│   └── aspects/
│       ├── registry.ts    # Fetch index.json and aspects
│       └── types.ts       # Registry types
├── stores/
│   └── aspectStore.ts     # Update to include remote aspects
```

**Functions:**

```typescript
// lib/aspects/registry.ts

const REGISTRY_URL =
  "https://raw.githubusercontent.com/aimorphist/aspects/main/registry/index.json";

export async function fetchRegistry(): Promise<RegistryIndex> {
  const response = await fetch(REGISTRY_URL);
  return response.json();
}

export async function fetchAspect(url: string): Promise<Aspect> {
  const response = await fetch(url);
  const yaml = await response.text();
  return parseYaml(yaml);
}

export async function getAvailableAspects(): Promise<Aspect[]> {
  const registry = await fetchRegistry();
  const aspects = await Promise.all(
    Object.values(registry.aspects).map((a) => fetchAspect(a.url)),
  );
  return aspects;
}
```

**UI changes:**

- Aspect picker shows all available aspects (bundled + registry)
- Trust badge: for verified, for community
- Cache fetched aspects locally for offline use

**Estimated effort:** ~200 lines, 4-5 hours

---

### MVP Phase 4: Discovery & Announcement

**Update README with:**

- How to create an aspect
- How to submit to registry
- Trust tier explanation

**Create CONTRIBUTING.md:**

- Step-by-step PR guide
- Schema requirements
- Security guidelines

**Announcement:**

- [ ] Tweet thread explaining aspects
- [ ] "Submit your aspect" call to action
- [ ] Example community aspects

**Estimated effort:** 2-3 hours

---

## MVP Summary

| Phase | Task                                  | Effort                |
| ----- | ------------------------------------- | --------------------- |
| 1     | GitHub Action (validate + auto-merge) | 4 hours               |
| 2     | Two-tier trust system                 | (included in Phase 1) |
| 3     | Morphist registry fetching            | 5 hours               |
| 4     | Docs + announcement                   | 3 hours               |

**Total MVP: ~12 hours of work**

**What users can do after MVP:**

- Create aspect.yaml in their GitHub repo
- Submit PR to registry (auto-merged if valid)
- Aspect appears in Morphist with trust badge
- Other users can select and use it

---

## Advanced Phase: Full Platform

**Goal:** Proper registry, search, trust verification, analytics.

**Timeline:** 4-8 weeks (after MVP proves demand)

### Advanced Phase 1: Registry API

Replace static GitHub JSON with a real API.

**Backend:**

- Cloudflare Workers or Vercel Edge Functions
- D1/Turso for aspect metadata
- R2/S3 for aspect.yaml storage

**Endpoints:**

```
GET  /v1/aspects              # List all
GET  /v1/aspects/:name        # Get one
GET  /v1/aspects/search?q=    # Search
POST /v1/aspects              # Publish (authenticated)
```

**Benefits:**

- Real-time search
- Download counts
- Version history
- Faster than GitHub raw

---

### Advanced Phase 2: Trust & Verification

**Trust levels:**

- `verified` - Manually reviewed by Morphist team
- `community` - Auto-validated, in registry
- `unverified` - Direct GitHub, warning shown

**Verification process:**

1. User submits aspect via `aspects publish --registry`
2. Auto-validation runs (schema, security scan)
3. If passes, marked `community`
4. Manual review for `verified` status

**Security scanning:**

- Check for prompt injection patterns
- Flag suspicious instructions
- Require human review for flagged aspects

---

### Advanced Phase 3: User Accounts & Analytics

**Features:**

- Publisher profiles
- Download counts per aspect
- Star/favorite aspects
- Comments/reviews

**Auth:**

- GitHub OAuth (simplest)
- Link to publisher's GitHub profile

**Analytics:**

- Which aspects are popular
- Which apps use aspects
- Conversion from install to active use

---

### Advanced Phase 4: Morphist Deep Integration

**In-app aspect browser:**

- Search and install aspects from within Morphist
- Preview aspect before installing
- One-tap install

**Aspect recommendations:**

- "Users who like Alaric also like..."
- Featured aspects
- New & trending

**Aspect creation in-app:**

- Create aspects from conversation history
- "Save this personality as an aspect"
- Publish directly to registry

---

## Advanced Summary

| Phase            | Effort  | Output                          |
| ---------------- | ------- | ------------------------------- |
| Registry API     | 2 weeks | Real search, faster installs    |
| Trust system     | 1 week  | Verification, security scanning |
| User accounts    | 2 weeks | Profiles, analytics, stars      |
| Morphist browser | 2 weeks | In-app discovery and install    |

**Total Advanced: 6-8 weeks**

---

## Decision Points

### Before MVP

- [ ] Confirm schema v1 is good enough (or need v2 with directives?)
- [ ] Decide on locked directives for Morphist
- [ ] Test `aspects install github:` flow works

### Before Advanced

- [ ] Validate MVP adoption (are people creating aspects?)
- [ ] Decide on hosting (Cloudflare vs Vercel vs self-hosted)
- [ ] Design trust verification process

---

## Success Metrics

### MVP Success

- 10+ community aspects created
- 3+ apps using aspects package
- 100+ CLI installs

### Advanced Success

- 100+ aspects in registry
- 1000+ monthly installs
- Active community contributions

---

## Next Steps

1. **Now:** Review this plan, adjust as needed
2. **This week:** Implement MVP Phase 1 (NPM exports)
3. **Next week:** MVP Phase 2 (Morphist integration) + Phase 3 (announce)
4. **After launch:** Gather feedback, decide on Advanced phases
