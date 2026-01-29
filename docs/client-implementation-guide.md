# Registry API Client Implementation Guide

> A comprehensive guide for implementing any client (CLI, web, mobile, or third-party integration) that consumes the Registry API.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [API Reference](#api-reference)
4. [Authentication Flow](#authentication-flow)
5. [Core Operations](#core-operations)
6. [Implementation Patterns](#implementation-patterns)
7. [HTTP Client Requirements](#http-client-requirements)
8. [Example Request/Response Flows](#example-requestresponse-flows)
9. [Error Handling](#error-handling)
10. [Publishing Workflow](#publishing-workflow)
11. [Client Integration Tests](#client-integration-tests)

---

## Overview

Any client consuming the Registry API can perform these core operations:

- **Fetch** aspects from the registry by name, version, or content hash
- **Search** the registry for aspects by keyword, category, or trust level
- **Share** installed aspects via content-addressed blake3 hashes
- **Publish** new aspects to the registry (requires authentication)
- **Manage authentication** via device authorization flow (PKCE)
- **Retrieve statistics** about registry contents and downloads
- **Browse categories** and discover available aspects

### Supported Client Types

This guide applies to:

- **CLI tools** — Command-line interfaces for fetching and publishing
- **Web frontends** — Dashboards for browsing, searching, and managing aspects
- **Mobile apps** — Native applications that consume aspects
- **Third-party integrations** — Any service that integrates with the registry

Each client type may implement these operations differently based on its platform, but all use the same underlying Registry API.

### Design Principles

1. **Registry-first** — All operations go through the API, not static files
2. **Privacy-preserving** — No user tracking, aggregate stats only
3. **Offline-capable** — Clients can cache registry data locally
4. **Authentication flexible** — Device flow for CLI, sessions for web, bearer tokens for integrations
5. **Stateless** — API is stateless; client handles local state management
6. **NPM-style UX** — Familiar mental model for developers

---

## Architecture

### System Flow

```
┌──────────────────────────┐
│   Client                 │
│ (CLI, Web, Mobile, etc.) │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────────┐
│   Client Local State         │
│   (Optional: cache data)     │
│   ├── tokens                 │
│   ├── cached registry        │
│   └── local storage          │
└────────────┬─────────────────┘
             │
             ▼
┌────────────────────────────────────────────────┐
│   Registry API                                 │
│   (https://api.aspects.sh/v1)              │
│                                                │
│   GET  /registry                               │
│   GET  /aspects/:name                          │
│   GET  /aspects/:name/:version                 │
│   GET  /search?q=...&category=...              │
│   POST /aspects (with auth)                    │
│   POST /auth/device (device flow)              │
│   POST /auth/device/poll (polling)             │
│   GET  /aspects/by-hash/:hash                  │
│   DELETE /aspects/:name/:version (with auth)   │
│   GET  /stats                                  │
│   GET  /categories                             │
└────────────┬─────────────────────────────────────┘
             │
             ▼
┌──────────────────────────┐
│   PostgreSQL Database    │
│   (registry data)        │
└──────────────────────────┘
```

### Typical Client Workflow

**Fetch an aspect:**

```
Client calls GET /api/v1/aspects/:name/:version
  ↓
  API returns full aspect.json content
  ↓
  Client stores/uses aspect data (implementation-specific)
  ↓
  Server increments download count
```

**Search for aspects:**

```
Client calls GET /api/v1/search?q=...&category=...
  ↓
  API returns paginated results with metadata
  ↓
  Client displays results to user
```

**Publish an aspect:**

```
Client loads aspect.json
  ↓
  Client validates locally (schema, size, naming)
  ↓
  Client obtains auth token (via device flow or other method)
  ↓
  Client POSTs to /api/v1/aspects with Authorization header
  ↓
  Server validates and returns success or error
```

---

## API Reference

### Base URL

```
Production: https://api.aspects.sh/v1
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
      "blake3": "BnCcPamGtUD6jG34vVrQgkDNjfhBG1uZeMdJh75tgWk8",
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
      "blake3": "7DQrvGR3TQh5hN45vVsQgkDNjfhBG1uZeMdJh75tgWk9",
      "size": 1920,
      "deprecated": "Use 1.0.0 instead",
      "aspect": {}
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
  "blake3": "BnCcPamGtUD6jG34vVrQgkDNjfhBG1uZeMdJh75tgWk8",
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

---

### Endpoint: GET /search

**Full-Text Search**

Search across all aspects by name, displayName, and tagline. Supports filtering by category and trust level.

**Query Parameters:**

| Parameter  | Type   | Default | Max | Description           |
| ---------- | ------ | ------- | --- | --------------------- |
| `q`        | string | (none)  | 100 | Search query          |
| `category` | string | (none)  | -   | Filter by category    |
| `trust`    | string | (none)  | -   | Filter by trust level |
| `limit`    | int    | 20      | 100 | Max results per page  |
| `offset`   | int    | 0       | -   | Pagination offset     |

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

- `verified` — Verified by aspects.sh
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
  "url": "https://aspects.sh/aspects/my-wizard"
}
```

**Validation Rules:**

| Field         | Rule                                            |
| ------------- | ----------------------------------------------- |
| `name`        | Lowercase, alphanumeric + hyphens, max 50 chars |
| `publisher`   | Must match authenticated user's username        |
| `version`     | Valid semver (x.y.z), unique per aspect         |
| `displayName` | Max 100 chars                                   |
| `tagline`     | Max 200 chars                                   |
| `category`    | Must be in official categories list             |
| `tags`        | Max 10 tags, each max 30 chars                  |
| `prompt`      | Max 50,000 chars (50KB)                         |

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

| Code             | HTTP | Description                        |
| ---------------- | ---- | ---------------------------------- |
| `invalid_aspect` | 400  | Schema validation failed           |
| `version_exists` | 409  | Version already published          |
| `name_taken`     | 409  | Name owned by different publisher  |
| `unauthorized`   | 401  | Missing or invalid auth token      |
| `forbidden`      | 403  | Publisher mismatch or no ownership |
| `rate_limited`   | 429  | Too many publish requests          |

**Rate Limiting:**

- 10 publishes per hour per user

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

### Endpoint: GET /aspects/by-hash/:hash

**Fetch Aspect by Content Hash**

Retrieve an aspect by its blake3 content hash. This enables content-addressed installs via `aspects add hash:<blake3base64>`. No authentication required.

**Request:**

```bash
GET /api/v1/aspects/by-hash/BnCcPamGtUD6jG34vVrQgkDNjfhBG1uZeMdJh75tgWk8
```

**Response (200 OK):**

```json
{
  "name": "alaric",
  "version": "1.0.0",
  "content": { ... },
  "blake3": "BnCcPamGtUD6jG34vVrQgkDNjfhBG1uZeMdJh75tgWk8",
  "size": 2048,
  "publishedAt": "2026-01-20T14:30:00Z"
}
```

**Error Responses:**

```json
{
  "ok": false,
  "error": "not_found",
  "message": "No aspect found for hash 'BnCcPam...'"
}
```

**CLI Usage:**

```bash
aspects add hash:BnCcPamGtUD6jG34vVrQgkDNjfhBG1uZeMdJh75tgWk8
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
- Header: `Cache-Control: public, max-age=86400`

---

## Authentication Flow

### Authentication Options by Client Type

The Registry API supports multiple authentication methods depending on your client type:

| Client Type             | Auth Method                 | Use Case                                     |
| ----------------------- | --------------------------- | -------------------------------------------- |
| Web Frontend            | Session cookies             | Browser-based dashboards, user sessions      |
| CLI Tool                | Device Authorization (PKCE) | Command-line tools, headless environments    |
| Mobile App              | Bearer tokens (OAuth)       | Native mobile apps, third-party integrations |
| Third-party Integration | API keys or Bearer tokens   | Server-to-server communication               |

This guide focuses on **Device Authorization** since it's most common for CLI clients and is self-contained. Web clients typically use standard OAuth session flows managed by the web framework.

### Device Authorization (PKCE)

The Device Authorization flow with PKCE provides secure authentication for CLI clients without opening browser windows or requiring secret management on the client.

**Flow Diagram:**

```
┌──────────┐                    ┌──────────────────┐                ┌─────────────────┐
│ Client   │                    │ Registry API     │                │ Identikey       │
│ (CLI)    │                    │ (aspects.sh) │                │ (auth server)   │
└─────┬────┘                    └────────┬─────────┘                └────────┬────────┘
      │                                  │                                    │
      │ 1. Initiate login                │                                    │
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
      │ 5. Direct user to verification_uri
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
      │ 9. Wait interval seconds,        │                                    │
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
      │ 12. Store token securely
      │ 13. ✓ Authenticated as @username
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

#### Step 2: Direct User to Verification URL

Display the verification URL and user code to the user. For CLI clients, this typically means:

1. Print the verification URL to the console
2. Optionally, attempt to open the URL automatically if supported
3. Display the user code prominently (they'll need to enter it at the URL)

**Example output:**

```
Please visit this URL and enter the code:
https://auth.identikey.io/device?user_code=ABC-123-DEF

Waiting for authorization...
```

The user visits the URL and enters the user code. If using a browser, they may need to authenticate if not already logged in.

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

#### Step 4: Store Tokens

Store the tokens securely for future use. Where and how you store them is client-specific:

**CLI Example** (in `~/.aspects/config.json`):

```json
{
  "version": 1,
  "registryUrl": "https://api.aspects.sh/v1",
  "auth": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "expiresAt": "2026-02-26T12:00:00Z",
    "username": "username"
  }
}
```

**Web Client** (in browser session storage or cookies):

- Server typically manages session state
- No explicit token storage needed on client

**Mobile App** (in secure local storage):

- Store in platform-specific secure storage (Keychain on iOS, Keystore on Android)
- Include token refresh logic

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

Clear stored tokens when user logs out. Implementation is client-specific:

**CLI:** Remove or clear the auth section from config file
**Web:** Clear session cookies
**Mobile:** Remove token from secure storage

---

## Core Operations

Every client needs to implement the following core operations:

### 1. Fetch an Aspect

Retrieve a specific aspect version from the registry.

**Operation:**

- Call `GET /api/v1/aspects/:name/:version` or `GET /api/v1/aspects/:name/latest`
- Parse the returned aspect.json content
- Store or use the aspect data (implementation varies by client)

**Common use cases:**

- CLI: Download and store locally
- Web: Display details in browser
- Mobile: Cache locally, inject into app
- Third-party: Send to external service

**Error handling:**

- 404 → Aspect or version not found
- Network error → Retry with backoff

---

### 2. Search the Registry

Find aspects using keywords, categories, and filters.

**Operation:**

- Call `GET /api/v1/search?q=...&category=...&limit=...&offset=...`
- Parse paginated results
- Display or process results

**Common filters:**

- `q` — Search term
- `category` — Aspect category
- `trust` — Trust level (verified, community)
- `limit` / `offset` — Pagination

**Error handling:**

- 400 → Invalid parameters
- Network error → Show cached results or error message

---

### 3. Publish an Aspect

Publish a new aspect or new version to the registry.

**Operation:**

1. Load aspect.json from local source
2. Validate schema, size, and naming rules
3. Obtain authentication token
4. POST to `/api/v1/aspects` with Authorization header
5. Handle response (success or error)

**Validation checklist:**

- All required fields present
- Schema conforms to spec
- File size < 50KB
- Publisher field matches authenticated user
- Version uses valid semver
- Name uses only allowed characters
- Category is in official list

**Error handling:**

- 400 → Schema/validation error (show specific field errors)
- 401 → Not authenticated (direct to login)
- 409 → Conflict (version exists or name taken)
- 429 → Rate limited (retry later)

---

### 4. Authenticate

Obtain authentication credentials for publishing and other protected operations.

**Operation** (Device Authorization flow):

1. POST to `/api/v1/auth/device` to request device code
2. Display verification URL and user code to user
3. Poll `/api/v1/auth/device/poll` until authorized
4. Store returned access token
5. Use Bearer token in subsequent requests

**Variations by client type:**

- CLI: Device flow as described above
- Web: Use standard OAuth session flow
- Mobile: Device flow or native OAuth integration
- Third-party: API key or bearer token exchange

**Token usage:**

- Include in `Authorization: Bearer <token>` header for authenticated requests
- Refresh when expired (optional, can require re-login)
- Clear on logout

---

### 5. Get Statistics

Retrieve registry-wide statistics.

**Operation:**

- Call `GET /api/v1/stats`
- Parse response for total aspects, downloads, popular packages
- Display or use in dashboards

**Use cases:**

- Web dashboard: Show registry health
- CLI: Display discovery stats
- Analytics: Track usage patterns

---

### 6. Browse Categories

List available aspect categories.

**Operation:**

- Call `GET /api/v1/categories`
- Cache locally (24-hour TTL)
- Use in search filters or category selection

**Use cases:**

- Web: Category dropdown menus
- CLI: Suggest categories during publish
- Mobile: Category browsing UI

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

| Language   | Library                | Notes                       |
| ---------- | ---------------------- | --------------------------- |
| Node.js    | `node-fetch`, `undici` | Built-in (Node 18+)         |
| Python     | `requests`, `httpx`    | Synchronous or async        |
| Go         | `net/http`, `resty`    | Standard library sufficient |
| Rust       | `reqwest`, `ureq`      | Async or blocking           |
| TypeScript | `axios`, `fetch`       | Node or Bun runtime         |

### Local State Management

Most clients need to store some local state (tokens, cache, etc.). Where and what you store is client-specific:

**CLI clients** might store:

- Authentication tokens
- Cached registry data
- User preferences/config

**Web clients** typically store:

- Session cookies (server-managed)
- Client-side cache (optional)
- User preferences (localStorage)

**Mobile apps** typically store:

- Auth tokens (in secure storage)
- Downloaded aspects
- User preferences

**Example: CLI local config storage**

```javascript
function saveConfig(config) {
  const configPath = path.join(os.homedir(), ".aspects", "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function loadConfig() {
  const configPath = path.join(os.homedir(), ".aspects", "config.json");
  if (!fs.existsSync(configPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
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
          throw new Error("Rate limited. Try again in a moment.");
        case 500:
          throw new Error("Registry unavailable. Try again later.");
        default:
          throw new Error(error.message || "Unknown error");
      }
    }

    return await response.json();
  } catch (error) {
    if (error instanceof TypeError) {
      // Network error
      throw new Error("Network error. Check your connection.");
    }
    throw error;
  }
}
```

**Validation Errors:**

```javascript
function validateAspect(aspect) {
  const errors = [];

  if (!aspect.name || typeof aspect.name !== "string") {
    errors.push("name: Required and must be string");
  }

  if (!aspect.name.match(/^[a-z0-9-]+$/)) {
    errors.push(
      "name: Must contain only lowercase letters, numbers, and hyphens",
    );
  }

  if (JSON.stringify(aspect).length > 51200) {
    errors.push(
      `Size: ${JSON.stringify(aspect).length} bytes exceeds 50KB limit`,
    );
  }

  if (errors.length > 0) {
    throw new Error("Invalid aspect.json:\n" + errors.join("\n"));
  }
}
```

---

## Example Request/Response Flows

### Flow 1: Fetch an Aspect

**Scenario:** Client needs to retrieve a specific aspect version

**Step 1: Call the API**

```bash
curl -X GET "https://api.aspects.sh/v1/aspects/alaric/1.0.0" \
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
  "blake3": "BnCcPamGtUD6jG34vVrQgkDNjfhBG1uZeMdJh75tgWk8",
  "size": 2048,
  "publishedAt": "2026-01-20T14:30:00Z"
}
```

**Step 2: Handle the response**

The API returns the complete aspect content. The client now processes it based on its type:

- **CLI:** Save to local directory
- **Web:** Display in browser
- **Mobile:** Store in app-specific location
- **Third-party:** Send to external service

**Example: CLI storage**

```javascript
// Save to ~/.aspects/aspects/alaric@1.0.0/aspect.json
const config = loadConfig();
const aspectPath = path.join(
  os.homedir(),
  ".aspects",
  "aspects",
  `${name}@${version}`,
);
fs.mkdirSync(aspectPath, { recursive: true });
fs.writeFileSync(
  path.join(aspectPath, "aspect.json"),
  JSON.stringify(aspectData, null, 2),
);
```

---

### Flow 2: Search and Fetch

**Scenario:** Client searches for aspects and displays results

**Step 1: Search**

```bash
curl -X GET "https://api.aspects.sh/v1/search?q=wizard&limit=10" \
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

**Step 2: Process and display results**

Parse the results and display them to the user (format depends on client type):

**CLI output:**

```
Found 2 aspects:

  alaric@1.0.0        Quirky wizard, D&D expert      [verified] 1.5k ↓
  gandalf@0.2.0       Wise wandering wizard          [community] 342 ↓
```

**Web:** Display in list, grid, or card layout
**Mobile:** Show in scrollable list with filters

Once user selects an aspect, fetch it using Flow 1 (Fetch an Aspect)

---

### Flow 3: Publish Aspect

**Scenario:** Client publishes a new aspect or version

**Step 1: Load and validate aspect data**

Load aspect.json from your source (local file, form input, etc.) and validate it against the schema before sending to the API.

```javascript
// Validate aspect.json
const schema = buildAspectSchema(); // Define based on spec
const validation = schema.safeParse(aspectData);
if (!validation.success) {
  // Show validation errors
  console.error("Invalid aspect:", validation.error.issues);
  return;
}
```

**Step 2: Obtain authentication**

Ensure the user is authenticated (device flow or session-based):

```javascript
const token = getStoredToken(); // Retrieve from storage
if (!token) {
  // Redirect to auth flow
  initiateDeviceFlow();
  return;
}
```

**Step 3: POST to API with auth**

```bash
curl -X POST "https://api.aspects.sh/v1/aspects" \
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
  "url": "https://aspects.sh/aspects/my-wizard"
}
```

**Step 4: Handle response**

Check the response status and handle success or error:

```javascript
if (response.ok) {
  const result = await response.json();
  console.log(`✓ Published ${result.name}@${result.version}`);
  console.log(`View at: ${result.url}`);
} else {
  const error = await response.json();
  // Show user-friendly error message
  console.error(`Error: ${error.message}`);
}
```

---

### Flow 4: Device Authorization Authentication

**Scenario:** Client needs to authenticate user via device flow

**Step 1: Request device code**

```bash
curl -X POST "https://api.aspects.sh/v1/auth/device" \
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

**Step 2: Display instructions to user**

Show the verification URL and user code. For CLI, this means printing to console. For web, you might show in a modal. For mobile, direct to system browser.

```
Please visit this URL and enter the code:
https://auth.identikey.io/device?user_code=ABC-123-DEF

Waiting for authorization...
```

**Step 3: Poll until authorized**

```bash
curl -X POST "https://api.aspects.sh/v1/auth/device/poll" \
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

**Step 4: Store tokens**

Once you receive the access token, store it securely:

```javascript
const tokens = {
  accessToken: response.access_token,
  refreshToken: response.refresh_token,
  expiresAt: new Date(Date.now() + response.expires_in * 1000),
  username: response.username,
};
saveTokens(tokens); // Implementation-specific storage
```

**Step 5: Confirm to user**

Display success message and indicate they can now use authenticated operations.

---

## Error Handling

### API Error Codes & Meanings

| Code              | HTTP | Meaning                       | Suggested CLI Message                                        |
| ----------------- | ---- | ----------------------------- | ------------------------------------------------------------ |
| `not_found`       | 404  | Aspect/version not found      | "Aspect not found. Try 'aspects search' to discover aspects" |
| `invalid_aspect`  | 400  | Schema validation failed      | "Invalid aspect.json: [field errors]"                        |
| `version_exists`  | 409  | Version already published     | "Version X.Y.Z already published. Bump your version number"  |
| `name_taken`      | 409  | Name owned by different user  | "Aspect name taken. Choose a different name"                 |
| `unauthorized`    | 401  | Missing/invalid auth token    | "Not logged in. Run 'aspects login' first"                   |
| `forbidden`       | 403  | Auth mismatch or no ownership | "Permission denied. Check your username/token"               |
| `rate_limited`    | 429  | Too many requests             | "Rate limited. Try again in a minute"                        |
| `invalid_version` | 400  | Bad semver format             | "Invalid version format. Use semver (e.g., 1.0.0)"           |

### Network Errors

| Situation   | Example            | Handler                                |
| ----------- | ------------------ | -------------------------------------- |
| No network  | Connection refused | "Network error. Check your connection" |
| DNS failure | ENOTFOUND          | "Cannot reach registry. Check DNS"     |
| Timeout     | Request timeout    | "Registry took too long. Try again"    |
| Invalid URL | Bad URL format     | "Invalid registry URL in config"       |

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
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }

      if (response.status >= 500 && attempt < maxRetries) {
        const delay = 1000 * attempt;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = 1000 * attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
```

---

## Publishing Workflow

### Pre-Publishing Checklist

Before attempting to publish, validate:

- [ ] User is authenticated with valid token
- [ ] Aspect data loaded from source (file, form, etc.)
- [ ] All required fields present and valid
- [ ] Schema passes validation
- [ ] Name follows naming rules (lowercase, alphanumeric + hyphens)
- [ ] Version is valid semver (X.Y.Z format)
- [ ] Publisher field matches authenticated user
- [ ] Category is in official list
- [ ] File size under 50KB
- [ ] No formatting or encoding issues

### Publish Process

**1. Load aspect data**

Load aspect data from your source (file, form, API, etc.):

```javascript
const aspect = loadAspectData(); // Implementation-specific
```

**2. Validate schema**

```javascript
const validation = aspectSchema.safeParse(aspect);
if (!validation.success) {
  showErrors("Invalid aspect:", validation.error.issues);
  return;
}
```

**3. Check authentication**

```javascript
const token = getStoredToken();
if (!token) {
  redirectToAuth();
  return;
}

// Verify publisher matches
if (aspect.publisher !== getUsername()) {
  showError("Publisher field does not match your account");
  return;
}
```

**4. Check file size**

```javascript
const size = Buffer.byteLength(JSON.stringify(aspect));
if (size > 51200) {
  showError(`Aspect too large: ${size} bytes (50KB limit)`);
  return;
}
```

**5. POST to API**

```javascript
const response = await fetch(`${registryUrl}/aspects`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ aspect }),
});

const result = await response.json();

if (!response.ok) {
  handlePublishError(result.error, result.message);
  return;
}

showSuccess(`Published ${result.name}@${result.version}`);
```

### Handling Publish Errors

**version_exists (409):**

- Message: "Version X.Y.Z already published"
- Action: User must increment version number and try again
- Example: Change "1.0.0" to "1.0.1"

**name_taken (409):**

- Message: "Aspect name is owned by another publisher"
- Action: User must choose a unique name
- Example: Change "my-aspect" to "my-aspect-v2"

**invalid_aspect (400):**

- Message: Lists specific validation errors
- Action: Fix indicated fields (category, size, naming, etc.)
- Example: Category must be one of [assistant, roleplay, ...]

**unauthorized (401):**

- Message: "Missing or invalid authentication token"
- Action: User must authenticate via device flow
- Example: Redirect to login/authentication flow

**forbidden (403):**

- Message: "Publisher field does not match your account"
- Action: User must either:
  - Update publisher field to match their account
  - Or use a different account
- Example: Your account is @alice, but aspect.json has publisher: "bob"

**rate_limited (429):**

- Message: "Too many publish requests"
- Action: User should wait before trying again (limit: 10/hour)
- Retry-After header may be included

---

## Client Integration Tests

### Core Operation Tests

**Fetch Aspect Tests:**

- [ ] Fetch latest version: GET /aspects/:name/latest
- [ ] Fetch specific version: GET /aspects/:name/1.0.0
- [ ] Handle not found (404): Non-existent aspect
- [ ] Handle not found (404): Non-existent version
- [ ] Verify full aspect.json content in response
- [ ] Handle network timeout gracefully
- [ ] Retry on transient failures (429, 503)
- [ ] Verify Blake3 hash if validation implemented

**Search Tests:**

- [ ] Search by keyword: GET /search?q=wizard
- [ ] Search with no results
- [ ] Filter by category: GET /search?category=roleplay
- [ ] Filter by trust: GET /search?trust=verified
- [ ] Pagination: offset and limit parameters
- [ ] Combined filters (q + category + trust)
- [ ] Handle invalid parameters (400)
- [ ] Handle network errors
- [ ] Verify result sorting/ordering

**Publish Tests:**

- [ ] Valid publish: POST /aspects with valid aspect
- [ ] Verify response includes name, version, URL
- [ ] Handle duplicate version (409)
- [ ] Handle invalid schema (400): Missing required fields
- [ ] Handle invalid schema (400): Bad field values
- [ ] Handle oversized aspect (400): > 50KB
- [ ] Handle name conflict (409): Different publisher owns name
- [ ] Handle missing auth (401)
- [ ] Handle publisher mismatch (403)
- [ ] Handle rate limiting (429)

**Authentication Tests:**

- [ ] Device flow: POST /auth/device returns device code
- [ ] Device flow: Display user code and verification URL
- [ ] Device flow: Poll /auth/device/poll successfully
- [ ] Device flow: Handle pending status (continue polling)
- [ ] Device flow: Handle slow_down status (adjust interval)
- [ ] Device flow: Handle expired device code
- [ ] Device flow: Handle user denial
- [ ] Device flow: Store tokens securely
- [ ] Device flow: Use token in Authorization header
- [ ] Device flow: Handle invalid/expired token (401)
- [ ] Logout: Clear stored tokens

**Statistics & Browse Tests:**

- [ ] GET /stats returns aggregate data
- [ ] GET /categories returns full category list
- [ ] Verify cache headers are respected
- [ ] Handle network errors gracefully

### Platform-Specific Tests

**CLI Clients:**

- [ ] Command-line argument parsing
- [ ] Configuration file read/write
- [ ] Local state directory creation and cleanup
- [ ] Error messages are user-friendly
- [ ] Exit codes follow standard conventions

**Web Clients:**

- [ ] Session cookie handling
- [ ] CSRF protection
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Keyboard navigation and accessibility
- [ ] Progressive enhancement (graceful degradation)

**Mobile Clients:**

- [ ] Secure token storage
- [ ] Background sync/refresh
- [ ] Offline mode (cache local data)
- [ ] Deep linking support
- [ ] Platform-specific UI patterns

### Error Handling Tests

- [ ] 400 Bad Request → Show validation errors with field names
- [ ] 401 Unauthorized → Redirect to authentication
- [ ] 403 Forbidden → Show permission denied message
- [ ] 404 Not Found → Show "not found" with suggestions
- [ ] 409 Conflict → Show specific conflict reason
- [ ] 429 Rate Limited → Show retry guidance
- [ ] 500+ Server Error → Show "registry unavailable"
- [ ] Network timeout → Show connection error
- [ ] DNS failure → Show "cannot reach registry"
- [ ] Invalid JSON response → Show "invalid response from server"
- [ ] Connection reset → Retry with backoff

### Integration Scenarios

- [ ] Search → Fetch → Use aspect (end-to-end)
- [ ] Authenticate → Publish → Verify in search
- [ ] Multiple rapid requests (verify no race conditions)
- [ ] Cache invalidation after publish
- [ ] Token refresh when expired
- [ ] Graceful degradation on network failure

---

## Appendix: JSON Schema Reference

### Aspect.json Schema

Complete JSON Schema for aspect.json validation:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": [
    "schemaVersion",
    "name",
    "publisher",
    "version",
    "displayName",
    "tagline",
    "category",
    "prompt"
  ],
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
      "enum": [
        "assistant",
        "roleplay",
        "creative",
        "productivity",
        "education",
        "gaming",
        "spiritual",
        "pundit"
      ],
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

This guide provides everything needed to implement ANY client (CLI, web, mobile, or third-party) for the aspects registry API. Key takeaways:

1. **API is complete** — All endpoints are fully specified with examples
2. **Authentication is flexible** — Device flow for CLI, sessions for web, bearer tokens for third-party
3. **Core operations are universal** — Fetch, search, publish, authenticate, browse
4. **Error handling is predictable** — Consistent error codes and messages
5. **Implementation is client-specific** — Same API, different client implementations

### Quick Implementation Checklist

- [ ] Implement HTTP client for API requests
- [ ] Implement schema validation for aspect.json
- [ ] Implement authentication flow (device or session-based)
- [ ] Implement secure token storage
- [ ] Implement core operations (fetch, search, publish, auth)
- [ ] Implement comprehensive error handling
- [ ] Implement caching strategy (if applicable)
- [ ] Test against all error scenarios
- [ ] Test end-to-end workflows
- [ ] Deploy and monitor

For questions or additional context, refer to the `REGISTRY-API.md` documentation which contains the full API specification.
