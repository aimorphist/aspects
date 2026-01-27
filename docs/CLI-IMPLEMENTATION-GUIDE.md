# CLI Implementation Guide

> A comprehensive guide for implementing the aspects CLI client that consumes the Registry API.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Local Storage Structure](#local-storage-structure)
4. [API Reference](#api-reference)
5. [Authentication Flow](#authentication-flow)
6. [Core Commands](#core-commands)
7. [Implementation Patterns](#implementation-patterns)
8. [HTTP Client Requirements](#http-client-requirements)
9. [Example Request/Response Flows](#example-requestresponse-flows)
10. [Error Handling](#error-handling)
11. [Publishing Workflow](#publishing-workflow)
12. [Testing Checklist](#testing-checklist)

---

## Overview

The **aspects CLI** is a command-line tool that allows developers to:

- **Install** aspects from the registry into their local `~/.aspects/` directory
- **Search** the registry for aspects by name, category, or keywords
- **Publish** new aspects to the registry
- **Manage authentication** via device authorization flow (PKCE)
- **List** installed aspects
- **View details** about published aspects

### NPM-style UX

The CLI mimics npm's familiar mental model:

```bash
aspects install alaric                  # Install latest version
aspects install alaric@1.0.0            # Install specific version
aspects search wizard                   # Search by keyword
aspects search --category roleplay      # Filter by category
aspects publish                         # Publish from aspect.json
aspects login                           # Authenticate (device flow)
aspects logout                          # Clear stored tokens
aspects list                            # Show installed aspects
aspects info alaric                     # Show aspect details
```

### Design Principles

1. **Registry-first** — All operations go through the API, not static files
2. **Privacy-preserving** — No user tracking, aggregate stats only
3. **Offline-capable** — Works with cached registry data
4. **Fast** — Caches registry locally, validates before publishing
5. **Clear errors** — User-friendly messages, helpful hints

---

## Architecture

### System Flow

```
┌─────────────────┐
│   aspects CLI   │
│  (user types)   │
└────────┬────────┘
         │
         ▼
┌──────────────────────────────────┐
│   Local State (~/.aspects/)       │
│   ├── config.json                │
│   ├── cache/registry.json         │
│   └── aspects/[name]@[ver]/       │
│       └── aspect.json             │
└────────┬─────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────┐
│   Registry API                                 │
│   (https://api.getaspects.com/v1)              │
│                                                │
│   GET  /registry                               │
│   GET  /aspects/:name                          │
│   GET  /aspects/:name/:version                 │
│   GET  /search?q=...&category=...              │
│   POST /aspects (with auth)                    │
│   POST /auth/device (device flow)              │
│   POST /auth/device/poll (polling)             │
│   GET  /stats                                  │
│   GET  /categories                             │
└────────┬─────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│   PostgreSQL Database    │
│   (registry data)        │
└──────────────────────────┘
```

### Command Flow Examples

**Install:**
```
aspects install alaric@1.0.0
  ↓
  Check ~/.aspects/cache/registry.json (or fetch /api/v1/registry)
  ↓
  Call GET /api/v1/aspects/alaric/1.0.0
  ↓
  Save to ~/.aspects/aspects/alaric@1.0.0/aspect.json
  ↓
  Update download count (server-side)
```

**Publish:**
```
aspects publish
  ↓
  Read local aspect.json
  ↓
  Validate locally (schema, size, naming)
  ↓
  Read token from ~/.aspects/config.json
  ↓
  POST /api/v1/aspects with Authorization header
  ↓
  Handle success or error response
```

**Search:**
```
aspects search wizard
  ↓
  Call GET /api/v1/search?q=wizard
  ↓
  Display formatted results
```

---

## Local Storage Structure

The CLI stores all state in `~/.aspects/` directory. This includes configuration, cached registry data, and installed aspects.

### Directory Tree

```
~/.aspects/
├── config.json                    # Configuration & auth tokens
├── cache/
│   └── registry.json              # Cached registry index (5 min TTL)
└── aspects/                       # Installed aspects
    ├── alaric@1.0.0/
    │   └── aspect.json
    ├── alaric@2.0.0/
    │   └── aspect.json
    └── helper@1.5.0/
        └── aspect.json
```

### config.json Structure

```json
{
  "version": 1,
  "registryUrl": "https://api.getaspects.com/v1",
  "lastUpdated": "2026-01-26T12:00:00Z",
  "auth": {
    "accessToken": "access_token_value",
    "refreshToken": "refresh_token_value",
    "expiresAt": "2026-02-26T12:00:00Z",
    "username": "username"
  }
}
```

### cache/registry.json Structure

```json
{
  "version": 1,
  "updated": "2026-01-26T12:00:00Z",
  "total": 42,
  "timestamp": "2026-01-26T12:05:30Z",
  "aspects": {
    "alaric": {
      "latest": "1.0.0",
      "versions": ["1.0.0", "0.9.0"],
      "metadata": {
        "displayName": "Alaric the Wizard",
        "tagline": "Quirky wizard, D&D expert",
        "category": "roleplay",
        "publisher": "morphist",
        "trust": "verified"
      }
    }
  }
}
```

### aspect.json Stored Format

Each installed aspect is stored with the full `aspect.json` content returned from the API:

```json
{
  "schemaVersion": 1,
  "name": "alaric",
  "publisher": "morphist",
  "version": "1.0.0",
  "displayName": "Alaric the Wizard",
  "tagline": "Quirky wizard, D&D expert",
  "category": "roleplay",
  "tags": ["dnd", "wizard", "fantasy"],
  "voiceHints": {
    "speed": "slow",
    "emotions": ["curiosity", "warmth"]
  },
  "prompt": "## You are Alaric the Wizard\n\nYou are..."
}
```

---

## API Reference

### Base URL

```
Production: https://api.getaspects.com/v1
Development: http://localhost:5173/api/v1
```

### Authentication

The Registry API supports two authentication modes:

**Web UI:** Session cookies (not used by CLI)

**CLI:** Bearer token (OAuth Device Authorization flow)

```
Authorization: Bearer <access_token>
```

---

### Endpoint: GET /registry

**Full Registry Index**

Returns the complete registry index with all aspects and their versions. This is the primary endpoint for discovering what's available. Highly cached (5 min TTL).

**Request:**

```bash
GET /api/v1/registry
```

**Response (200 OK):**

```json
{
  "version": 1,
  "updated": "2026-01-26T12:00:00Z",
  "total": 42,
  "aspects": {
    "alaric": {
      "latest": "1.0.0",
      "versions": ["1.0.0", "0.9.0"],
      "metadata": {
        "displayName": "Alaric the Wizard",
        "tagline": "Quirky wizard, D&D expert",
        "category": "roleplay",
        "publisher": "morphist",
        "trust": "verified"
      }
    },
    "helper": {
      "latest": "2.1.0",
      "versions": ["2.1.0", "2.0.0", "1.0.0"],
      "metadata": {
        "displayName": "Helper Assistant",
        "tagline": "Friendly assistant for daily tasks",
        "category": "assistant",
        "publisher": "acme",
        "trust": "community"
      }
    }
  }
}
```

**Cache:**
- TTL: 5 minutes
- Header: `Cache-Control: public, max-age=300, stale-while-revalidate=60`
- ETag support for 304 Not Modified

**CLI Usage:**

```bash
# Fetch fresh registry
aspects search

# Check for available updates
aspects update
```

---

### Endpoint: GET /aspects/:name

**Aspect Metadata (All Versions)**

Returns full metadata for a specific aspect package, including all published versions and download statistics.

**Request:**

```bash
GET /api/v1/aspects/alaric
```

**Response (200 OK):**

```json
{
  "name": "alaric",
  "publisher": "morphist",
  "latest": "1.0.0",
  "created": "2026-01-15T10:00:00Z",
  "modified": "2026-01-20T14:30:00Z",
  "trust": "verified",
  "stats": {
    "downloads": {
      "total": 1547,
      "weekly": 234
    }
  },
  "versions": {
    "1.0.0": {
      "published": "2026-01-20T14:30:00Z",
      "sha256": "abc123def456...",
      "size": 2048,
      "aspect": {
        "schemaVersion": 1,
        "name": "alaric",
        "publisher": "morphist",
        "version": "1.0.0",
        "displayName": "Alaric the Wizard",
        "tagline": "Quirky wizard, D&D expert",
        "category": "roleplay",
        "tags": ["dnd", "wizard", "fantasy"],
        "voiceHints": {
          "speed": "slow",
          "emotions": ["curiosity"]
        },
        "prompt": "## You are Alaric the Wizard..."
      }
    },
    "0.9.0": {
      "published": "2026-01-15T10:00:00Z",
      "sha256": "def456ghi789...",
      "size": 1920,
      "deprecated": "Use 1.0.0 instead",
      "aspect": { }
    }
  }
}
```

**Cache:**
- TTL: 1 hour
- Invalidated when new version published

**Error Responses:**

```json
{
  "ok": false,
  "error": "not_found",
  "message": "Aspect 'alaric' not found"
}
```

**CLI Usage:**

```bash
aspects info alaric          # Show all versions and stats
```

---

### Endpoint: GET /aspects/:name/:version

**Specific Version Content**

Fetch a specific version of an aspect with the complete aspect.json. This is the main endpoint for installing aspects. Supports "latest" as a version alias. Increments download count.

**Request:**

```bash
GET /api/v1/aspects/alaric/1.0.0
GET /api/v1/aspects/alaric/latest
```

**Response (200 OK):**

```json
{
  "name": "alaric",
  "version": "1.0.0",
  "content": {
    "schemaVersion": 1,
    "name": "alaric",
    "publisher": "morphist",
    "version": "1.0.0",
    "displayName": "Alaric the Wizard",
    "tagline": "Quirky wizard, D&D expert",
    "category": "roleplay",
    "tags": ["dnd", "wizard", "fantasy"],
    "voiceHints": {
      "speed": "slow",
      "emotions": ["curiosity", "warmth"]
    },
    "prompt": "## You are Alaric the Wizard\n\nYou are a mysterious..."
  },
  "sha256": "abc123def456...",
  "size": 2048,
  "publishedAt": "2026-01-20T14:30:00Z"
}
```

**Cache:**
- For specific versions: Forever (immutable)
- For "latest" alias: 1 hour
- Header: `Cache-Control: public, max-age=31536000, immutable` (for specific versions)

**Error Responses:**

```json
{
  "ok": false,
  "error": "not_found",
  "message": "Version alaric@1.0.0 not found"
}
```

**Side Effects:**
- Download count incremented (asynchronously, doesn't block response)

**CLI Usage:**

```bash
aspects install alaric              # Uses version=latest
aspects install alaric@1.0.0        # Uses specific version
```

---

### Endpoint: GET /search

**Full-Text Search**

Search across all aspects by name, displayName, and tagline. Supports filtering by category and trust level.

**Query Parameters:**

| Parameter | Type   | Default | Max    | Description                        |
|-----------|--------|---------|--------|------------------------------------|
| `q`       | string | (none)  | 100    | Search query                       |
| `category`| string | (none)  | -      | Filter by category                 |
| `trust`   | string | (none)  | -      | Filter by trust level              |
| `limit`   | int    | 20      | 100    | Max results per page               |
| `offset`  | int    | 0       | -      | Pagination offset                  |

**Valid Categories:**
- `assistant` — General helpful AI assistants
- `roleplay` — Characters, personas, storytelling
- `creative` — Writing, art, brainstorming
- `productivity` — Work, tasks, organization
- `education` — Learning, tutoring, explanations
- `gaming` — Games, campaigns, entertainment
- `spiritual` — Mindfulness, wisdom, guidance
- `pundit` — Commentary, analysis, opinions

**Valid Trust Levels:**
- `verified` — Verified by getaspects.com
- `community` — Community-contributed

**Request:**

```bash
GET /api/v1/search?q=wizard
GET /api/v1/search?q=wizard&category=roleplay
GET /api/v1/search?q=&category=gaming&trust=verified&limit=50
GET /api/v1/search?q=wizard&offset=20&limit=10
```

**Response (200 OK):**

```json
{
  "total": 5,
  "results": [
    {
      "name": "alaric",
      "displayName": "Alaric the Wizard",
      "tagline": "Quirky wizard, D&D expert",
      "category": "roleplay",
      "publisher": "morphist",
      "version": "1.0.0",
      "trust": "verified",
      "downloads": 1547
    },
    {
      "name": "gandalf",
      "displayName": "Gandalf the Grey",
      "tagline": "Wise wandering wizard",
      "category": "roleplay",
      "publisher": "tolkien",
      "version": "0.2.0",
      "trust": "community",
      "downloads": 342
    }
  ]
}
```

**Cache:**
- TTL: 60 seconds
- ETag support for 304 Not Modified

**Error Responses:**

```json
{
  "ok": false,
  "error": "validation_error",
  "message": "Invalid query parameters: limit must be between 1 and 100"
}
```

**CLI Usage:**

```bash
aspects search wizard                        # Search by keyword
aspects search wizard --category roleplay    # Filter by category
aspects search --category gaming --trust verified
```

---

### Endpoint: POST /aspects

**Publish New Aspect or Version**

Publish a new aspect or new version of an existing aspect. Requires authentication. Validates aspect.json schema, size limits, and ownership.

**Authentication:** Required (Bearer token)

**Request:**

```bash
POST /api/v1/aspects
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "aspect": {
    "schemaVersion": 1,
    "name": "my-wizard",
    "publisher": "username",
    "version": "1.0.0",
    "displayName": "My Wizard",
    "tagline": "A custom wizard aspect",
    "category": "roleplay",
    "tags": ["wizard", "magic"],
    "prompt": "## You are my wizard...",
    "voiceHints": {
      "speed": "normal"
    }
  }
}
```

**Response (201 Created):**

```json
{
  "ok": true,
  "name": "my-wizard",
  "version": "1.0.0",
  "url": "https://getaspects.com/aspects/my-wizard"
}
```

**Validation Rules:**

| Field           | Rule                                     |
|-----------------|------------------------------------------|
| `name`          | Lowercase, alphanumeric + hyphens, max 50 chars |
| `publisher`     | Must match authenticated user's username |
| `version`       | Valid semver (x.y.z), unique per aspect  |
| `displayName`   | Max 100 chars                            |
| `tagline`       | Max 200 chars                            |
| `category`      | Must be in official categories list      |
| `tags`          | Max 10 tags, each max 30 chars            |
| `prompt`        | Max 50,000 chars (50KB)                  |

**Size Limits:**
- Max aspect.json size: 50KB
- Exceeding limit returns 400 error

**Error Responses:**

```json
{
  "ok": false,
  "error": "version_exists",
  "message": "Version 1.0.0 already exists. Bump the version number."
}
```

```json
{
  "ok": false,
  "error": "name_taken",
  "message": "Aspect name 'my-wizard' is already owned by another publisher"
}
```

```json
{
  "ok": false,
  "error": "invalid_aspect",
  "message": "category: Invalid enum value. Expected 'assistant' | 'roleplay' | 'creative' | ..."
}
```

```json
{
  "ok": false,
  "error": "unauthorized",
  "message": "Missing or invalid authentication token"
}
```

```json
{
  "ok": false,
  "error": "forbidden",
  "message": "Publisher field 'other-user' does not match authenticated user 'my-user'"
}
```

**Error Codes:**

| Code            | HTTP | Description                        |
|-----------------|------|------------------------------------|
| `invalid_aspect`| 400  | Schema validation failed           |
| `version_exists`| 409  | Version already published          |
| `name_taken`    | 409  | Name owned by different publisher  |
| `unauthorized`  | 401  | Missing or invalid auth token      |
| `forbidden`     | 403  | Publisher mismatch or no ownership |
| `rate_limited`  | 429  | Too many publish requests          |

**Rate Limiting:**
- 10 publishes per hour per user

**CLI Usage:**

```bash
aspects publish                   # Read local aspect.json, publish
aspects publish --dry-run         # Validate without publishing
```

---

### Endpoint: DELETE /aspects/:name/:version

**Unpublish a Version**

Remove a version from the registry. Only allowed within 72 hours of publishing (npm-style grace period). Requires authentication and ownership.

**Authentication:** Required (Bearer token)

**Request:**

```bash
DELETE /api/v1/aspects/my-wizard/1.0.0
Authorization: Bearer <access_token>
```

**Response (200 OK):**

```json
{
  "ok": true,
  "message": "Version 1.0.0 unpublished"
}
```

**Error Responses:**

```json
{
  "ok": false,
  "error": "forbidden",
  "message": "Cannot unpublish versions older than 72 hours. This version was published 120 hours ago."
}
```

**CLI Usage:**

```bash
aspects unpublish my-wizard@1.0.0     # Remove within 72 hours
```

---

### Endpoint: GET /stats

**Aggregate Statistics**

Get registry-wide statistics including total aspects, downloads, and popular packages.

**Request:**

```bash
GET /api/v1/stats
```

**Response (200 OK):**

```json
{
  "total_aspects": 42,
  "total_downloads": 15470,
  "weekly_downloads": 2340,
  "top_aspects": [
    {
      "name": "default",
      "downloads": 8901
    },
    {
      "name": "alaric",
      "downloads": 1547
    }
  ],
  "by_category": {
    "roleplay": 12,
    "assistant": 8,
    "creative": 6,
    "productivity": 5,
    "education": 4,
    "gaming": 3,
    "spiritual": 2,
    "pundit": 2
  }
}
```

**Cache:**
- TTL: 5 minutes

---

### Endpoint: GET /categories

**Official Categories List**

Get the list of official aspect categories with descriptions.

**Request:**

```bash
GET /api/v1/categories
```

**Response (200 OK):**

```json
{
  "categories": [
    {
      "id": "assistant",
      "name": "Assistant",
      "description": "General helpful AI assistants"
    },
    {
      "id": "roleplay",
      "name": "Roleplay",
      "description": "Characters, personas, storytelling"
    },
    {
      "id": "creative",
      "name": "Creative",
      "description": "Writing, art, brainstorming"
    },
    {
      "id": "productivity",
      "name": "Productivity",
      "description": "Work, tasks, organization"
    },
    {
      "id": "education",
      "name": "Education",
      "description": "Learning, tutoring, explanations"
    },
    {
      "id": "gaming",
      "name": "Gaming",
      "description": "Games, campaigns, entertainment"
    },
    {
      "id": "spiritual",
      "name": "Spiritual",
      "description": "Mindfulness, wisdom, guidance"
    },
    {
      "id": "pundit",
      "name": "Pundit",
      "description": "Commentary, analysis, opinions"
    }
  ]
}
```

**Cache:**
- TTL: 24 hours

---

## Authentication Flow

### Device Authorization (PKCE)

The CLI uses OAuth Device Authorization flow with PKCE for secure authentication without opening browser windows or exposing secrets.

**Flow Diagram:**

```
┌──────────┐                    ┌──────────────────┐                ┌─────────────────┐
│ CLI      │                    │ Registry API     │                │ Identikey       │
│ (user)   │                    │ (getaspects.com) │                │ (auth server)   │
└─────┬────┘                    └────────┬─────────┘                └────────┬────────┘
      │                                  │                                    │
      │ 1. aspects login                 │                                    │
      │─────────────────────────────────▶│                                    │
      │                                  │                                    │
      │                                  │ 2. POST /api/v1/auth/device       │
      │                                  │──────────────────────────────────▶│
      │                                  │                                    │
      │  ◀─────────────────────────────────────────────────────────────────  │
      │  3. device_code, user_code,      │         4. Return codes            │
      │     verification_uri, code_       │◀──────────────────────────────────│
      │     verifier, expires_in=900,     │                                    │
      │     interval=5                    │                                    │
      │                                  │                                    │
      │ 5. Open browser to verification_uri
      │    (User enters user_code at that URL)
      │
      │    https://auth.identikey.io/device?user_code=ABC123
      │
      │ 6. Poll for token                │                                    │
      │────────────────────────────────▶│                                    │
      │    POST /api/v1/auth/device/poll │ 7. Poll Identikey with device_code│
      │    {                              │──────────────────────────────────▶│
      │      device_code,                 │                                    │
      │      code_verifier                │                                    │
      │    }                              │ 8. Still pending? Return pending  │
      │                                  │◀──────────────────────────────────│
      │                                  │                                    │
      │ ◀────── Response: pending ──────│                                    │
      │                                  │                                    │
      │ 9. Wait 5 seconds (interval),    │                                    │
      │    then poll again               │                                    │
      │────────────────────────────────▶│                                    │
      │                                  │                                    │
      │                                  │ 10. User authorized at Identikey  │
      │                                  │──────────────────────────────────▶│
      │                                  │                                    │
      │                                  │ 11. Return access_token           │
      │                                  │◀──────────────────────────────────│
      │                                  │                                    │
      │ ◀─── Response: access_token ────│                                    │
      │                                  │                                    │
      │ 12. Store in ~/.aspects/config.json
      │ 13. ✓ Logged in as @username
```

### Step-by-Step Implementation

#### Step 1: Initiate Device Authorization

```bash
POST /api/v1/auth/device
```

**Response:**

```json
{
  "ok": true,
  "device_code": "ABC123DEVICE456",
  "user_code": "ABC-123-DEF",
  "verification_uri": "https://auth.identikey.io/device",
  "verification_uri_complete": "https://auth.identikey.io/device?user_code=ABC-123-DEF",
  "code_verifier": "abcdef123456...",
  "expires_in": 900,
  "interval": 5
}
```

**Save for polling:**
- `device_code` — Use in poll requests
- `code_verifier` — PKCE code verifier, use in poll requests
- `expires_in` — Time until code expires (seconds)
- `interval` — Minimum seconds between polls

#### Step 2: Display Instructions & Open Browser

```bash
$ aspects login
Opening browser to https://auth.identikey.io/device?user_code=ABC-123-DEF
Enter code: ABC-123-DEF
Waiting for authorization...
```

The user visits the URL and enters the user code. The browser will ask for authentication if needed.

#### Step 3: Poll Until Authorized

Loop every `interval` seconds (default 5), calling:

```bash
POST /api/v1/auth/device/poll

{
  "device_code": "ABC123DEVICE456",
  "code_verifier": "abcdef123456..."
}
```

**Responses:**

**Still pending:**
```json
{
  "ok": false,
  "status": "pending"
}
```
→ Wait `interval` seconds, poll again

**Polling too fast:**
```json
{
  "ok": false,
  "status": "slow_down"
}
```
→ Double the `interval`, try again

**Code expired:**
```json
{
  "ok": false,
  "status": "expired"
}
```
→ Start over with new device code

**User denied:**
```json
{
  "ok": false,
  "status": "denied",
  "error": "User denied authorization"
}
```
→ Start over

**Success:**
```json
{
  "ok": true,
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```
→ Store tokens

#### Step 4: Store Tokens Locally

Save in `~/.aspects/config.json`:

```json
{
  "version": 1,
  "registryUrl": "https://api.getaspects.com/v1",
  "auth": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "expiresAt": "2026-02-26T12:00:00Z",
    "username": "username"
  }
}
```

#### Step 5: Use Token in Requests

Include token in all subsequent authenticated requests:

```bash
POST /api/v1/aspects
Authorization: Bearer eyJhbGc...
```

### Token Refresh (Future)

When `accessToken` expires:

1. Check `expiresAt` before authenticated requests
2. If expired, use `refreshToken` to get new token
3. Update `config.json` with new tokens and expiry

For MVP, can skip refresh and require users to login again.

### Logout

Clear stored tokens:

```bash
rm ~/.aspects/config.json
```

Or selective logout:

```json
{
  "version": 1,
  "registryUrl": "https://api.getaspects.com/v1"
}
```

---

## Core Commands

### aspects install

**Install an aspect from the registry**

```bash
aspects install alaric               # Install latest version
aspects install alaric@1.0.0         # Install specific version
aspects install alaric@latest        # Explicit latest
```

**Behavior:**

1. Validate aspect name/version format
2. Check if already installed locally
3. Fetch aspect metadata from registry
4. Download aspect.json to `~/.aspects/aspects/alaric@1.0.0/`
5. Verify SHA256 hash (optional, for security)
6. Display success message with download count

**Error Handling:**

- Aspect not found → "Aspect 'typo' not found. Did you mean 'alaric'?"
- Version not found → "Version 1.5.0 of 'alaric' not found. Latest is 1.0.0"
- Network error → "Failed to fetch aspect. Check your connection and try again"
- Already installed → "alaric@1.0.0 already installed. Use --force to overwrite"

**Output Example:**

```
$ aspects install alaric
Fetching alaric@latest...
✓ Downloaded alaric@1.0.0 (2.0 KB)
✓ Installed to ~/.aspects/aspects/alaric@1.0.0/
  Published: 2026-01-20T14:30:00Z
  Downloads: 1547
```

---

### aspects search

**Search the registry**

```bash
aspects search wizard                              # By keyword
aspects search wizard --category roleplay          # Filter by category
aspects search --category gaming --trust verified  # Multiple filters
aspects search --limit 50                          # Change page size
aspects search wizard --offset 20                  # Pagination
```

**Query Parameters:**

- `q` — Search term (name, displayName, tagline)
- `--category` — Filter by category
- `--trust` — Filter by trust level (verified, community)
- `--limit` — Max results (default 20, max 100)
- `--offset` — Pagination offset (default 0)

**Output Example:**

```
$ aspects search wizard
Found 5 aspects:

  alaric@1.0.0          Quirky wizard, D&D expert        [verified] 1.5k ↓
  gandalf@0.2.0         Wise wandering wizard            [community] 342 ↓
  merlin@1.1.0          Classic wizard archetype         [verified] 287 ↓
```

---

### aspects publish

**Publish a new aspect or version**

Reads `aspect.json` from current directory and publishes it to the registry.

```bash
aspects publish                  # Publish from ./aspect.json
aspects publish --dry-run        # Validate without publishing
```

**Prerequisites:**

- `aspect.json` in current directory with valid schema
- Logged in (`aspects login`)
- Publisher field matches authenticated username
- Version not already published

**Process:**

1. Read and parse `aspect.json`
2. Validate schema locally (all fields, types, sizes)
3. Check if publisher field matches logged-in user
4. Compute SHA256 hash and file size
5. Verify version doesn't already exist
6. POST to `/api/v1/aspects` with auth token
7. Handle response (success or error)

**Error Handling:**

```bash
$ aspects publish
Error: Not logged in. Run 'aspects login' first.

$ aspects publish
Error: aspect.json not found in current directory

$ aspects publish
Error: Invalid aspect.json: category must be one of [assistant, roleplay, ...]

$ aspects publish
Error: Version 1.0.0 already published. Bump version number.

$ aspects publish
Error: Publisher 'other-user' doesn't match your account. Update aspect.json.

$ aspects publish
Error: Aspect size 52000 bytes exceeds 50KB limit.
```

**Output Example:**

```
$ aspects publish
Validating aspect.json...
✓ Schema valid
✓ Size OK (2.1 KB / 50 KB)
✓ Publisher matches username

Publishing my-wizard@1.0.0 to registry...
✓ Published!

View at: https://getaspects.com/aspects/my-wizard
```

**--dry-run Flag:**

Validates without publishing:

```
$ aspects publish --dry-run
Validating aspect.json...
✓ Schema valid
✓ Size OK (2.1 KB / 50 KB)
✓ Publisher matches username
✓ Would publish successfully

(No changes made)
```

---

### aspects login

**Authenticate via device authorization flow**

Initiates OAuth device flow for CLI authentication.

```bash
aspects login
```

**Process:**

1. Request device code from API
2. Display verification URL and user code
3. Offer to open browser automatically
4. Poll API until user authorizes
5. Store access token locally
6. Display success with username

**Output Example:**

```
$ aspects login
Requesting authorization...

Please visit this URL and enter the code:
https://auth.identikey.io/device?user_code=ABC-123-DEF

Waiting for authorization...
(Press Ctrl+C to cancel)

✓ Authorized as @username
Access token stored in ~/.aspects/config.json
```

---

### aspects logout

**Clear stored authentication tokens**

```bash
aspects logout
```

**Output:**

```
$ aspects logout
✓ Logged out
Auth tokens removed from ~/.aspects/config.json
```

---

### aspects list

**List all installed aspects**

Shows locally installed aspects with versions.

```bash
aspects list
```

**Output Example:**

```
$ aspects list
Installed aspects:

  alaric@1.0.0     Alaric the Wizard              roleplay
  alaric@0.9.0     Alaric the Wizard (old)        roleplay
  helper@2.1.0     Helper Assistant               assistant
  default@1.0.0    Default Aspect                 assistant

Total: 4 aspects installed
```

---

### aspects info

**Show detailed information about an aspect**

Displays metadata and version history for a published aspect.

```bash
aspects info alaric
```

**Output Example:**

```
$ aspects info alaric
  Name: alaric
  Publisher: morphist
  Category: roleplay
  Trust: verified

Latest: 1.0.0
Published: 2026-01-20T14:30:00Z

Stats:
  Total downloads: 1,547
  Weekly downloads: 234

Versions:
  1.0.0  2026-01-20T14:30:00Z  Quirky wizard, D&D expert
  0.9.0  2026-01-15T10:00:00Z  Previous version (deprecated)
```

---

## Implementation Patterns

### HTTP Client Requirements

The CLI needs an HTTP client that supports:

- **Methods:** GET, POST, DELETE
- **Headers:** Custom headers (Authorization, Content-Type)
- **Request body:** JSON serialization
- **Response body:** JSON parsing
- **Status codes:** Proper HTTP error handling
- **Timeouts:** 30-second default timeout
- **Retries:** Optional exponential backoff for rate limits

**Recommended Libraries:**

| Language | Library           | Notes                                  |
|----------|-------------------|----------------------------------------|
| Node.js  | `node-fetch`, `undici` | Built-in (Node 18+)        |
| Python   | `requests`, `httpx`    | Synchronous or async                  |
| Go       | `net/http`, `resty`    | Standard library sufficient           |
| Rust     | `reqwest`, `ureq`      | Async or blocking                     |
| TypeScript | `axios`, `fetch`     | Node or Bun runtime                   |

### File I/O Patterns

**Create directories:**

```
~/.aspects/
~/.aspects/cache/
~/.aspects/aspects/[name]@[version]/
```

**Write JSON files:**

```javascript
const config = {
  version: 1,
  registryUrl: "https://api.getaspects.com/v1",
  auth: { ... }
};

fs.writeFileSync(
  path.join(os.homedir(), '.aspects', 'config.json'),
  JSON.stringify(config, null, 2)
);
```

**Read JSON files with fallback:**

```javascript
function loadConfig() {
  const configPath = path.join(os.homedir(), '.aspects', 'config.json');
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const content = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(content);
}
```

**Check file/directory existence:**

```javascript
const installedPath = path.join(
  os.homedir(),
  '.aspects',
  'aspects',
  `${name}@${version}`
);

if (fs.existsSync(installedPath)) {
  // Already installed
}
```

### JSON Parsing & Validation

Validate user-provided `aspect.json` before publishing:

```javascript
// Schema validation (pseudocode)
const schema = {
  type: 'object',
  required: ['schemaVersion', 'name', 'publisher', 'version', 'displayName', 'tagline', 'category', 'prompt'],
  properties: {
    schemaVersion: { type: 'number', const: 1 },
    name: { type: 'string', pattern: '^[a-z0-9-]+$', maxLength: 50 },
    publisher: { type: 'string', maxLength: 50 },
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    displayName: { type: 'string', maxLength: 100 },
    tagline: { type: 'string', maxLength: 200 },
    category: { type: 'string', enum: ['assistant', 'roleplay', ...] },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    prompt: { type: 'string', maxLength: 50000 },
    voiceHints: { type: 'object' }
  }
};

// Use Zod, Joi, or similar for runtime validation
```

### Error Handling Strategies

**API Errors:**

```javascript
async function fetchAspect(name, version) {
  try {
    const response = await fetch(`${registryUrl}/aspects/${name}/${version}`);

    if (!response.ok) {
      const error = await response.json();

      switch (response.status) {
        case 404:
          throw new Error(`Aspect ${name}@${version} not found`);
        case 429:
          throw new Error('Rate limited. Try again in a moment.');
        case 500:
          throw new Error('Registry unavailable. Try again later.');
        default:
          throw new Error(error.message || 'Unknown error');
      }
    }

    return await response.json();
  } catch (error) {
    if (error instanceof TypeError) {
      // Network error
      throw new Error('Network error. Check your connection.');
    }
    throw error;
  }
}
```

**Validation Errors:**

```javascript
function validateAspect(aspect) {
  const errors = [];

  if (!aspect.name || typeof aspect.name !== 'string') {
    errors.push('name: Required and must be string');
  }

  if (!aspect.name.match(/^[a-z0-9-]+$/)) {
    errors.push('name: Must contain only lowercase letters, numbers, and hyphens');
  }

  if ((JSON.stringify(aspect).length) > 51200) {
    errors.push(`Size: ${JSON.stringify(aspect).length} bytes exceeds 50KB limit`);
  }

  if (errors.length > 0) {
    throw new Error('Invalid aspect.json:\n' + errors.join('\n'));
  }
}
```

---

## Example Request/Response Flows

### Flow 1: Install Aspect

**Scenario:** User runs `aspects install alaric@1.0.0`

**Step 1: Fetch specific version**

```bash
curl -X GET "https://api.getaspects.com/v1/aspects/alaric/1.0.0" \
  -H "Accept: application/json"
```

**Response:**

```json
{
  "name": "alaric",
  "version": "1.0.0",
  "content": {
    "schemaVersion": 1,
    "name": "alaric",
    "publisher": "morphist",
    "version": "1.0.0",
    "displayName": "Alaric the Wizard",
    "tagline": "Quirky wizard, D&D expert",
    "category": "roleplay",
    "tags": ["dnd", "wizard", "fantasy"],
    "voiceHints": { "speed": "slow", "emotions": ["curiosity"] },
    "prompt": "## You are Alaric the Wizard\n..."
  },
  "sha256": "abc123def456...",
  "size": 2048,
  "publishedAt": "2026-01-20T14:30:00Z"
}
```

**Step 2: Store locally**

```bash
mkdir -p ~/.aspects/aspects/alaric@1.0.0
cat > ~/.aspects/aspects/alaric@1.0.0/aspect.json << 'EOF'
{
  "schemaVersion": 1,
  "name": "alaric",
  ...
}
EOF
```

**Step 3: Display success**

```
✓ Installed alaric@1.0.0
  Size: 2.0 KB
  Downloads: 1547
```

---

### Flow 2: Search and Install

**Scenario:** User runs `aspects search wizard`, sees results, installs one

**Step 1: Search**

```bash
curl -X GET "https://api.getaspects.com/v1/search?q=wizard&limit=10" \
  -H "Accept: application/json"
```

**Response:**

```json
{
  "total": 3,
  "results": [
    {
      "name": "alaric",
      "displayName": "Alaric the Wizard",
      "tagline": "Quirky wizard, D&D expert",
      "category": "roleplay",
      "publisher": "morphist",
      "version": "1.0.0",
      "trust": "verified",
      "downloads": 1547
    },
    {
      "name": "gandalf",
      "displayName": "Gandalf the Grey",
      "tagline": "Wise wandering wizard",
      "category": "roleplay",
      "publisher": "tolkien",
      "version": "0.2.0",
      "trust": "community",
      "downloads": 342
    }
  ]
}
```

**Display results:**

```
Found 2 aspects:

  alaric@1.0.0        Quirky wizard, D&D expert      [verified] 1.5k ↓
  gandalf@0.2.0       Wise wandering wizard          [community] 342 ↓
```

**Step 2: User selects alaric, install as above**

---

### Flow 3: Publish Aspect

**Scenario:** User runs `aspects publish` with local aspect.json

**Step 1: Load and validate local aspect.json**

```bash
cat > ./aspect.json << 'EOF'
{
  "schemaVersion": 1,
  "name": "my-wizard",
  "publisher": "myusername",
  "version": "1.0.0",
  "displayName": "My Wizard",
  "tagline": "A custom wizard aspect",
  "category": "roleplay",
  "tags": ["wizard", "magic"],
  "prompt": "## You are my wizard..."
}
EOF
```

**Step 2: User runs publish**

```bash
aspects publish
```

**CLI validates:**

```
Validating ./aspect.json...
✓ Schema valid
✓ Size OK (1.8 KB / 50 KB)
✓ Publisher matches logged-in user
```

**Step 3: POST to API with auth**

```bash
curl -X POST "https://api.getaspects.com/v1/aspects" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "aspect": {
      "schemaVersion": 1,
      "name": "my-wizard",
      "publisher": "myusername",
      "version": "1.0.0",
      ...
    }
  }'
```

**Response:**

```json
{
  "ok": true,
  "name": "my-wizard",
  "version": "1.0.0",
  "url": "https://getaspects.com/aspects/my-wizard"
}
```

**Display success:**

```
✓ Published my-wizard@1.0.0

View at: https://getaspects.com/aspects/my-wizard
```

---

### Flow 4: Device Authorization Login

**Scenario:** User runs `aspects login`

**Step 1: Request device code**

```bash
curl -X POST "https://api.getaspects.com/v1/auth/device" \
  -H "Content-Type: application/json"
```

**Response:**

```json
{
  "ok": true,
  "device_code": "ABC123DEVICE456",
  "user_code": "ABC-123-DEF",
  "verification_uri": "https://auth.identikey.io/device",
  "verification_uri_complete": "https://auth.identikey.io/device?user_code=ABC-123-DEF",
  "code_verifier": "abcdef123456...",
  "expires_in": 900,
  "interval": 5
}
```

**Display instructions:**

```
Please visit this URL and enter the code:
https://auth.identikey.io/device?user_code=ABC-123-DEF

Waiting for authorization...
(Press Ctrl+C to cancel)
```

**Step 2: Poll every 5 seconds**

```bash
curl -X POST "https://api.getaspects.com/v1/auth/device/poll" \
  -H "Content-Type: application/json" \
  -d '{
    "device_code": "ABC123DEVICE456",
    "code_verifier": "abcdef123456..."
  }'
```

**Response (pending):**

```json
{
  "ok": false,
  "status": "pending"
}
```

→ Wait 5 seconds, poll again

**Response (authorized):**

```json
{
  "ok": true,
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Step 3: Store tokens**

```json
{
  "version": 1,
  "registryUrl": "https://api.getaspects.com/v1",
  "auth": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "expiresAt": "2026-02-26T12:00:00Z",
    "username": "myusername"
  }
}
```

**Display success:**

```
✓ Authorized as @myusername
Access token stored in ~/.aspects/config.json
```

---

## Error Handling

### API Error Codes & Meanings

| Code              | HTTP | Meaning                           | Suggested CLI Message                |
|-------------------|------|-----------------------------------|--------------------------------------|
| `not_found`       | 404  | Aspect/version not found          | "Aspect not found. Try 'aspects search' to discover aspects" |
| `invalid_aspect`  | 400  | Schema validation failed          | "Invalid aspect.json: [field errors]" |
| `version_exists`  | 409  | Version already published         | "Version X.Y.Z already published. Bump your version number" |
| `name_taken`      | 409  | Name owned by different user      | "Aspect name taken. Choose a different name" |
| `unauthorized`    | 401  | Missing/invalid auth token        | "Not logged in. Run 'aspects login' first" |
| `forbidden`       | 403  | Auth mismatch or no ownership     | "Permission denied. Check your username/token" |
| `rate_limited`    | 429  | Too many requests                 | "Rate limited. Try again in a minute" |
| `invalid_version` | 400  | Bad semver format                 | "Invalid version format. Use semver (e.g., 1.0.0)" |

### Network Errors

| Situation | Example | Handler                                |
|-----------|---------|----------------------------------------|
| No network | Connection refused | "Network error. Check your connection" |
| DNS failure | ENOTFOUND | "Cannot reach registry. Check DNS" |
| Timeout | Request timeout | "Registry took too long. Try again" |
| Invalid URL | Bad URL format | "Invalid registry URL in config" |

### Validation Errors

**Invalid aspect.json:**

```
Invalid aspect.json:
  name: Must be lowercase alphanumeric with hyphens
  version: Must be valid semver (X.Y.Z)
  category: Must be one of: [assistant, roleplay, creative, ...]
```

**Size limits:**

```
Error: Aspect too large
  Current: 52,000 bytes
  Limit: 50,000 bytes (50 KB)
```

**Ownership mismatch:**

```
Error: Publisher mismatch
  Your account: @myusername
  aspect.json: publisher: "otheruser"

Update aspect.json or verify you're logged in with correct account
```

### Retry Strategy

**Transient failures (retry):**

- 429 Rate Limited → Wait 60 seconds, retry
- 503 Service Unavailable → Wait 5 seconds, retry up to 3 times
- Network timeout → Retry up to 2 times with exponential backoff
- Connection reset → Retry once

**Permanent failures (don't retry):**

- 404 Not Found
- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 409 Conflict

**Example with exponential backoff:**

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { ...options, timeout: 30000 });

      if (response.status === 429) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }

      if (response.status >= 500 && attempt < maxRetries) {
        const delay = 1000 * attempt;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = 1000 * attempt;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```

---

## Publishing Workflow

### Pre-Publishing Checklist

Before `aspects publish`, verify:

- [ ] Logged in: `aspects login` completed
- [ ] `aspect.json` exists in current directory
- [ ] Name is unique (not taken)
- [ ] Version is valid semver and new
- [ ] Publisher field matches username
- [ ] All required fields present and valid
- [ ] File size under 50KB
- [ ] Category is in official list
- [ ] No obvious issues in prompt

### Publish Process

**1. Load aspect.json**

```javascript
const aspectPath = path.join(process.cwd(), 'aspect.json');
const aspectContent = fs.readFileSync(aspectPath, 'utf-8');
const aspect = JSON.parse(aspectContent);
```

**2. Validate schema**

```javascript
const validation = aspectSchema.safeParse(aspect);
if (!validation.success) {
  console.error('Invalid aspect.json:');
  validation.error.issues.forEach(issue => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}
```

**3. Check authentication**

```javascript
const config = loadConfig();
if (!config?.auth?.accessToken) {
  console.error('Not logged in. Run "aspects login" first');
  process.exit(1);
}

// Verify publisher matches
if (aspect.publisher !== config.auth.username) {
  console.error(`Publisher mismatch: aspect.json has "${aspect.publisher}" but you are "@${config.auth.username}"`);
  process.exit(1);
}
```

**4. Check file size**

```javascript
const size = Buffer.byteLength(JSON.stringify(aspect));
if (size > 51200) {
  console.error(`Aspect too large: ${size} bytes (50KB limit)`);
  process.exit(1);
}
```

**5. POST to API**

```javascript
const response = await fetch(`${config.registryUrl}/aspects`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${config.auth.accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ aspect })
});

const result = await response.json();

if (!response.ok) {
  console.error(`Error: ${result.error}`);
  console.error(`Message: ${result.message}`);

  // Provide helpful hints
  if (result.error === 'version_exists') {
    console.error('\nTip: Bump the version in aspect.json and try again');
  }
  if (result.error === 'name_taken') {
    console.error('\nTip: Choose a different name in aspect.json');
  }

  process.exit(1);
}

console.log(`✓ Published ${result.name}@${result.version}`);
console.log(`View at: ${result.url}`);
```

### Handling Publish Errors

**version_exists:**
```
Error: Version 1.0.0 already exists

Fix: Bump the version in aspect.json
  Current:  "version": "1.0.0"
  Try:      "version": "1.0.1"
```

**name_taken:**
```
Error: Aspect name 'alaric' is already owned by another publisher

Fix: Choose a unique name in aspect.json
  Current:  "name": "alaric"
  Try:      "name": "alaric-custom"
```

**invalid_aspect:**
```
Error: Invalid aspect.json

Details:
  category: Invalid enum value. Expected one of:
    assistant, roleplay, creative, productivity,
    education, gaming, spiritual, pundit

Fix: Update category in aspect.json
```

**unauthorized:**
```
Error: Not authenticated

Fix: Run 'aspects login' to authenticate
```

---

## Testing Checklist

### Installation Tests

- [ ] Install latest version: `aspects install default`
- [ ] Install specific version: `aspects install default@1.0.0`
- [ ] Install with version alias: `aspects install default@latest`
- [ ] Handle not found: `aspects install nonexistent` → error
- [ ] Handle version not found: `aspects install default@9.9.9` → error
- [ ] Verify file stored in correct location
- [ ] Verify aspect.json content matches API response
- [ ] Handle network timeout gracefully
- [ ] Retry on transient failure (429, 503)

### Search Tests

- [ ] Search by keyword: `aspects search wizard`
- [ ] Search with no results: `aspects search xyzabc123`
- [ ] Filter by category: `aspects search --category roleplay`
- [ ] Filter by trust: `aspects search --trust verified`
- [ ] Pagination: `aspects search --offset 20 --limit 10`
- [ ] Combined filters: `aspects search assistant --category productivity --trust verified`
- [ ] Handle invalid category gracefully
- [ ] Handle network errors

### Publishing Tests

- [ ] Valid publish: Create aspect.json, run `aspects publish`
- [ ] Verify response contains correct name, version, URL
- [ ] Handle duplicate version: Try same version twice → error
- [ ] Handle invalid schema: Missing required fields → error with field names
- [ ] Handle oversized aspect: > 50KB → error with size
- [ ] Handle name conflict: Different publisher owns name → error
- [ ] Handle missing auth: Not logged in → error with helpful message
- [ ] Handle publisher mismatch: Token is @user1, aspect.json is @user2 → error
- [ ] --dry-run flag: Validate without publishing
- [ ] Create proper directory structure

### Authentication Tests

- [ ] Login flow initiates device code request
- [ ] Display user code and verification URL
- [ ] Poll successfully when user authorizes
- [ ] Handle pending status (continue polling)
- [ ] Handle expired device code
- [ ] Handle user denial
- [ ] Store tokens in config.json
- [ ] Logout clears tokens
- [ ] Use stored token in authenticated requests
- [ ] Handle invalid/expired token (401)

### Local Storage Tests

- [ ] Create ~/.aspects directory on first run
- [ ] Create cache/registry.json
- [ ] Create cache/registry.json with valid structure
- [ ] Store aspects in aspects/ directory with correct naming
- [ ] Handle concurrent installs (race conditions)
- [ ] Verify file permissions (readable)
- [ ] Handle disk full gracefully
- [ ] Clean up on failures (partial downloads)

### Error Handling Tests

- [ ] 404 Not Found → "Aspect not found"
- [ ] 400 Bad Request → Show validation errors
- [ ] 401 Unauthorized → "Not logged in"
- [ ] 403 Forbidden → "Permission denied"
- [ ] 409 Conflict → "Version exists" or "Name taken"
- [ ] 429 Rate Limited → "Rate limited, try again"
- [ ] 500+ Server Error → "Registry unavailable"
- [ ] Network timeout → "Connection timeout"
- [ ] DNS failure → "Cannot reach registry"
- [ ] Invalid JSON → "Invalid response from server"

### Integration Tests

- [ ] Install aspect, then search for it
- [ ] Publish aspect, then install it
- [ ] Login, publish, logout
- [ ] Multiple installs of different aspects
- [ ] Update config between operations
- [ ] Cache invalidation after publish

---

## Appendix: JSON Schema Reference

### Aspect.json Schema

Complete JSON Schema for aspect.json validation:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["schemaVersion", "name", "publisher", "version", "displayName", "tagline", "category", "prompt"],
  "properties": {
    "schemaVersion": {
      "type": "integer",
      "const": 1,
      "description": "Schema version (always 1)"
    },
    "name": {
      "type": "string",
      "pattern": "^[a-z0-9-]+$",
      "minLength": 1,
      "maxLength": 50,
      "description": "Package name (lowercase, alphanumeric, hyphens)"
    },
    "publisher": {
      "type": "string",
      "minLength": 1,
      "maxLength": 50,
      "description": "Publisher username"
    },
    "version": {
      "type": "string",
      "pattern": "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d?)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$",
      "description": "Semantic version (X.Y.Z)"
    },
    "displayName": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "description": "Human-readable name"
    },
    "tagline": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "description": "Short description"
    },
    "category": {
      "type": "string",
      "enum": ["assistant", "roleplay", "creative", "productivity", "education", "gaming", "spiritual", "pundit"],
      "description": "Category"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string",
        "maxLength": 30
      },
      "maxItems": 10,
      "description": "Optional tags"
    },
    "prompt": {
      "type": "string",
      "minLength": 1,
      "maxLength": 50000,
      "description": "Aspect prompt/system message"
    },
    "voiceHints": {
      "type": "object",
      "description": "Optional voice guidance",
      "properties": {
        "speed": {
          "type": "string",
          "enum": ["slow", "normal", "fast"]
        },
        "emotions": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  },
  "additionalProperties": false
}
```

---

## Summary

This guide provides everything needed to implement a CLI client for the aspects registry API. Key takeaways:

1. **API is complete** — All 10 endpoints are fully specified with examples
2. **Authentication is standardized** — Device authorization with PKCE is secure and CLI-friendly
3. **Local storage is simple** — Just JSON files in ~/.aspects/
4. **Error handling is predictable** — Consistent error codes and messages
5. **Testing is comprehensive** — Checklist covers all major flows

For questions or clarifications, refer to the `REGISTRY-API.md` and `ARCHITECTURE.md` documentation files.
