# aspects.sh — Product Specification

> The open registry for AI personality aspects. Born from Morphist.

---

## Overview

**aspects.sh** is the web home for the Aspects registry — a place to discover, create, and share AI personality modules.

### Mission

Make it dead simple for anyone to create and share AI personalities, with zero friction submission and privacy-respecting analytics.

---

## Four Submission Flows

### Flow 1: Web App (aspects.sh)

**Audience:** Everyone — lowest friction

```
User visits aspects.sh/create
  → Fills out form (or uses AI assistant)
  → Clicks "Submit for Review"
  → Backend creates GitHub PR automatically
  → User gets email when merged
```

**Features:**

- Visual form with live preview
- "Generate with AI" button — describe your aspect in plain English
- GitHub OAuth for attribution (optional)
- No git knowledge required

---

### Flow 2: GitHub Issue Form

**Audience:** GitHub users — browser-based, no git

```
User visits github.com/aimorphist/aspects/issues/new
  → Selects "Submit New Aspect" template
  → Fills structured form
  → GitHub Action bot validates and creates PR
  → User gets notified on merge
```

**Implementation:**

- `.github/ISSUE_TEMPLATE/new-aspect.yml` — structured form
- `.github/workflows/issue-to-pr.yml` — bot that creates PR from issue

---

### Flow 3: CLI via npm

**Audience:** Developers — power users

```bash
npx @aspect/cli create     # Interactive wizard
npx @aspect/cli submit     # Auto-creates GitHub PR via API
```

**Features:**

- Full wizard with all fields
- Validates locally before submit
- Uses GitHub token for PR creation
- Works offline for creation, online for submit

---

### Flow 4: Traditional Fork & PR

**Audience:** Git power users

```bash
# Fork repo on GitHub
git clone https://github.com/YOUR_USERNAME/aspects
cd aspects
npx @aspect/cli create     # Creates files in correct location
git add . && git commit -m "Add my-aspect"
git push origin main
# Open PR on GitHub
```

**The CLI helps even in this flow** by:

- Creating files in `registry/aspects/{name}/`
- Auto-updating `registry/index.json`
- Validating before commit

---

## Install Tracking (Privacy-Preserving)

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Morphist App   │────▶│  aspects.sh  │────▶│   GitHub    │
│  (or any app)   │     │   /api/registry  │     │   (source)  │
└─────────────────┘     └──────────────────┘     └─────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │   Database   │
                        │  (counters)  │
                        └──────────────┘
```

### How It Works

1. **Apps fetch registry from aspects.sh** (not raw GitHub)

   ```
   GET https://aspects.sh/api/registry
   GET https://aspects.sh/api/aspects/alaric
   ```

2. **Server proxies to GitHub** and increments counters

   ```typescript
   // Pseudocode
   app.get("/api/aspects/:id", async (req, res) => {
     const { id } = req.params;

     // Increment counter (no user data)
     await db.query("UPDATE aspects SET fetches = fetches + 1 WHERE id = $1", [
       id,
     ]);

     // Proxy to GitHub
     const aspect = await fetch(
       `https://raw.githubusercontent.com/.../aspects/${id}/aspect.json`,
     );
     return res.json(await aspect.json());
   });
   ```

3. **Counters are exposed via API**
   ```
   GET https://aspects.sh/api/stats
   {
     "alaric": { "fetches": 1547, "installs": 892 },
     "default": { "fetches": 12340, "installs": 8901 }
   }
   ```

### What We Track (Privacy-Safe)

| Metric           | How                       | Privacy                       |
| ---------------- | ------------------------- | ----------------------------- |
| Registry fetches | Count API requests        | No user ID                    |
| Aspect fetches   | Count per-aspect requests | No user ID                    |
| Installs         | Optional ping from app    | No user ID, opt-out available |

### What We DON'T Track

- User identities
- Device IDs
- IP addresses (not stored)
- Usage patterns
- Any PII

---

## aspects.sh Pages

### Homepage (`/`)

- Hero: "AI Personalities for Everyone"
- Featured aspects carousel
- Category grid
- "Create Your Own" CTA
- Install counts displayed

### Browse (`/browse`)

- Search bar
- Category filters
- Verified/Community toggle
- Sort by: Popular, New, Name
- Aspect cards with install counts

### Aspect Detail (`/aspects/:id`)

- Full aspect info
- Install button (copies code or deep links to Morphist)
- "Fork this aspect" button
- Author attribution
- Install count
- Version history

### Create (`/create`)

- Step-by-step wizard
- Live preview panel
- "Generate with AI" option
- Submit for review button

### Docs (`/docs`)

- Getting started
- Schema reference
- CLI documentation
- API reference
- Contributing guide

### Stats (`/stats`)

- Leaderboard
- Total installs
- Category breakdown
- Growth charts (aggregate, not per-user)

---

## Tech Stack Recommendation

| Layer    | Technology              | Why                   |
| -------- | ----------------------- | --------------------- |
| Frontend | Next.js + Tailwind      | Fast, SEO, familiar   |
| Backend  | Next.js API routes      | Simple, serverless    |
| Database | Planetscale or Supabase | Counters, submissions |
| Auth     | GitHub OAuth            | For attribution only  |
| Hosting  | Vercel                  | Easy, fast, free tier |
| Registry | GitHub raw              | Source of truth       |

---

## API Endpoints

### Public (No Auth)

```
GET  /api/registry              # Full registry index
GET  /api/aspects/:id           # Single aspect (increments counter)
GET  /api/stats                 # Install/fetch counts
GET  /api/categories            # List categories
```

### Authenticated (GitHub OAuth)

```
POST /api/submit                # Submit new aspect (creates PR)
GET  /api/my-aspects            # User's submitted aspects
```

---

## GitHub Integration

### Issue Template (`.github/ISSUE_TEMPLATE/new-aspect.yml`)

```yaml
name: Submit New Aspect
description: Submit a new aspect to the registry
body:
  - type: input
    id: name
    attributes:
      label: Aspect Name (slug)
      placeholder: my-wizard
    validations:
      required: true
  - type: input
    id: displayName
    attributes:
      label: Display Name
      placeholder: My Wizard
    validations:
      required: true
  - type: dropdown
    id: category
    attributes:
      label: Category
      options:
        - assistant
        - roleplay
        - creative
        - productivity
        - education
        - gaming
        - spiritual
        - pundit
    validations:
      required: true
  - type: input
    id: tagline
    attributes:
      label: Tagline
      placeholder: A wise and quirky wizard
    validations:
      required: true
  - type: input
    id: tags
    attributes:
      label: Tags (comma-separated)
      placeholder: wizard, fantasy, helpful
  - type: textarea
    id: prompt
    attributes:
      label: Prompt
      description: The personality prompt for your aspect
    validations:
      required: true
```

### Bot Workflow (`.github/workflows/issue-to-pr.yml`)

Triggered when issue with "new-aspect" label is created:

1. Parse issue body
2. Validate against schema
3. Create aspect.json file
4. Update index.json
5. Create PR
6. Comment on issue with PR link
7. Close issue

---

## Viral Features

| Feature                  | Viral Mechanic             |
| ------------------------ | -------------------------- |
| Install counters         | Social proof, gamification |
| "Created by" attribution | Pride, sharing             |
| Featured aspects         | Aspiration                 |
| "Fork this aspect"       | Remix culture              |
| Share cards              | Social previews            |
| Leaderboard              | Competition                |
| "New this week"          | FOMO, return visits        |

---

## Launch Checklist

### Phase 1: Foundation

- [ ] Deploy aspects.sh (basic landing)
- [ ] Set up registry proxy with counters
- [ ] Create GitHub Issue template
- [ ] Publish CLI to npm
- [ ] Update Morphist to fetch from aspects.sh

### Phase 2: Web App

- [ ] Build browse page
- [ ] Build aspect detail page
- [ ] Build create wizard
- [ ] Add GitHub OAuth
- [ ] Add AI-assisted creation

### Phase 3: Growth

- [ ] Add leaderboard
- [ ] Add creator profiles
- [ ] Add "fork aspect" feature
- [ ] Add social share cards
- [ ] Launch on Product Hunt

---

## Open Questions

1. **Domain:** aspects.sh confirmed?
2. **Branding:** Separate from Morphist or "by Morphist"?
3. **Moderation:** Manual review or automated only?
4. **Monetization:** Free forever? Sponsored aspects?
5. **Other apps:** How do other apps integrate? SDK?

---

_Last updated: January 2026_
