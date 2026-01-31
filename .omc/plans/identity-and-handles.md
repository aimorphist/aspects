# Implementation Plan: Identity and Handles for CLI

> Update the Aspects CLI to support registry-claimed handles per the Identity and Namespaces design doc.

## Summary

This plan adds account and handle management to the CLI, replacing the current JWT-username-based identity with registry-claimed handles. Users will claim handles on first login, and all publishing will be validated against handle permissions.

## Scope

**In Scope:**
- New `aspects handle` command group (claim, list, default, check)
- New `aspects whoami` command
- Updated `login` flow with handle claiming
- Updated `publish` validation using handle permissions
- Updated auth config format to store handle info
- New API client methods for account/handle endpoints

**Out of Scope:**
- Handle member management (web-only per design doc)
- Handle transfers (web-only)
- Org/team invitation flows (web-only)

## Dependencies

- **Webapp API**: Account and handle endpoints must be implemented
  - `GET /api/v1/account` - Get current user's account info
  - `POST /api/v1/handles` - Claim a handle
  - `GET /api/v1/handles/:name/available` - Check availability
  - `PUT /api/v1/account/default-handle` - Set default handle
  - Updated `POST /auth/device/poll` - Return account info with `needs_handle` flag

---

## Implementation Tasks

### Phase 1: Types and Config Updates

#### 1.1 Update AuthTokens type
**File:** `src/lib/types.ts`

Add handle information to the auth config:

```typescript
interface HandleInfo {
  name: string;
  role: 'owner' | 'admin' | 'member';
  default: boolean;
}

interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  // Remove: username: string;
  accountId: string;           // UUID from registry
  handles: HandleInfo[];       // All handles user has access to
  defaultHandle: string;       // The handle to use for publishing
}
```

#### 1.2 Update config helpers
**File:** `src/lib/config.ts`

Add new helper functions:
- `getDefaultHandle(): Promise<string | null>` - Get default handle for publishing
- `setDefaultHandle(handle: string): Promise<void>` - Update default handle
- `getHandles(): Promise<HandleInfo[]>` - Get all handles
- `updateHandles(handles: HandleInfo[]): Promise<void>` - Update handle list from API

---

### Phase 2: API Client Updates

#### 2.1 Add account endpoint types
**File:** `src/lib/api-client.ts`

```typescript
interface ApiAccount {
  id: string;
  handles: Array<{
    name: string;
    role: 'owner' | 'admin' | 'member';
    default: boolean;
  }>;
  owned_handle_count: number;
  max_owned_handles: number;
  created_at: string;
}

interface ApiHandleClaimResponse {
  name: string;
  display_name?: string;
  created_at: string;
}

interface ApiHandleAvailability {
  name: string;
  available: boolean;
  reason?: string;  // If unavailable: "taken", "reserved", "invalid"
}
```

#### 2.2 Add account/handle API methods
**File:** `src/lib/api-client.ts`

```typescript
// Get current user's account (requires auth)
export async function getAccount(): Promise<ApiAccount>

// Claim a new handle (requires auth)
export async function claimHandle(name: string, displayName?: string): Promise<ApiHandleClaimResponse>

// Check handle availability (public)
export async function checkHandleAvailability(name: string): Promise<ApiHandleAvailability>

// Set default handle (requires auth)
export async function setDefaultHandle(handle: string): Promise<void>
```

#### 2.3 Update device poll response
**File:** `src/lib/api-client.ts`

Update `ApiDevicePoll` interface to include account info:
```typescript
interface ApiDevicePoll {
  ok: boolean;
  status?: 'pending' | 'slow_down' | 'expired' | 'denied';
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  account?: {
    id: string;
    handles: HandleInfo[];
    needs_handle: boolean;
  };
}
```

---

### Phase 3: Handle Commands

#### 3.1 Create handle command module
**File:** `src/commands/handle.ts` (NEW)

Implement subcommand structure following the `config.ts` pattern:

**Subcommands:**

1. **`claim <name>`** - Claim a new handle
   - Validate format locally first (lowercase, alphanumeric, hyphens, 2-39 chars)
   - Call `claimHandle()` API
   - Update local config with new handle
   - Handle errors: 400 (invalid), 403 (limit), 409 (taken), 429 (rate limit)

2. **`list`** - List user's handles
   - Fetch from `getAccount()` API to get fresh data
   - Display with roles and default indicator
   - Show owned count vs max (e.g., "2/5 owned handles")

3. **`default <name>`** - Set default publishing handle
   - Verify handle exists in user's list
   - Call `setDefaultHandle()` API
   - Update local config

4. **`check <name>`** - Check handle availability
   - Call `checkHandleAvailability()` API
   - Display result with reason if unavailable

#### 3.2 Register handle command
**File:** `src/cli.ts`

Add to COMMANDS array:
```typescript
{ name: 'handle', cmd: handleCommand, desc: 'Manage your handles', aliases: ['h'] }
```

---

### Phase 4: Whoami Command

#### 4.1 Create whoami command
**File:** `src/commands/whoami.ts` (NEW)

Display current identity:
- Default handle prominently
- List all handles with roles
- Account creation date
- Handle limits (owned count / max)

Example output:
```
@duke (default)

Handles:
  @duke      owner   (default)
  @morphist  admin

Account: 2/5 owned handles
```

#### 4.2 Register whoami command
**File:** `src/cli.ts`

Add to COMMANDS array:
```typescript
{ name: 'whoami', cmd: whoamiCommand, desc: 'Show current identity' }
```

---

### Phase 5: Login Flow Updates

#### 5.1 Update login command
**File:** `src/commands/login.ts`

After successful OAuth:

1. Check if `poll.account.needs_handle` is true
2. If needs handle:
   - Extract `preferred_username` from JWT as suggestion
   - Prompt user: "Claim your handle: [suggestion] "
   - Allow user to accept or enter different name
   - Call `claimHandle()` with chosen name
   - Handle validation errors, allow retry
3. Store updated auth config with:
   - `accountId` from response
   - `handles` array from response
   - `defaultHandle` (first handle or claimed one)

#### 5.2 Update token storage
**File:** `src/commands/login.ts`

Replace `extractUsernameFromToken()` with account-based storage:
```typescript
await setAuthTokens({
  accessToken: result.access_token,
  refreshToken: result.refresh_token,
  expiresAt: calculateExpiry(result.expires_in),
  accountId: result.account.id,
  handles: result.account.handles,
  defaultHandle: result.account.handles.find(h => h.default)?.name
                 ?? result.account.handles[0]?.name,
});
```

---

### Phase 6: Publish Validation Updates

#### 6.1 Update publisher validation
**File:** `src/commands/publish.ts`

Replace username-based validation with handle-based:

1. Get user's handles from config
2. If `aspect.publisher` is set:
   - Check if user has any role on that handle
   - If not, error with list of available handles
3. If `aspect.publisher` is not set:
   - Use default handle from config
   - Auto-populate in aspect before publish

Update error messages:
```
Error: You don't have permission to publish under @morphist

Your handles:
  @duke (default)
  @teamfoo

Either:
  1. Change "publisher" in aspect.json to one of your handles
  2. Get added as a member to @morphist (via web UI)
  3. Use "aspects share" for anonymous publishing
```

---

### Phase 7: Logout Updates

#### 7.1 Update logout command
**File:** `src/commands/logout.ts`

No changes needed - `clearAuth()` already removes entire auth object.

---

## File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/types.ts` | Modify | Add HandleInfo, update AuthTokens |
| `src/lib/config.ts` | Modify | Add handle helper functions |
| `src/lib/api-client.ts` | Modify | Add account/handle API methods |
| `src/commands/handle.ts` | New | Handle subcommands |
| `src/commands/whoami.ts` | New | Identity display command |
| `src/commands/login.ts` | Modify | Add handle claiming flow |
| `src/commands/publish.ts` | Modify | Handle-based validation |
| `src/cli.ts` | Modify | Register new commands |

---

## Testing Plan

### Unit Tests
- Handle format validation (lowercase, length, hyphens)
- Config read/write with new handle fields
- Default handle selection logic

### Integration Tests
- Full login flow with handle claiming
- Publish with valid/invalid handle permissions
- Handle claim rate limiting
- Handle availability checking

### Manual Testing Checklist
- [ ] Fresh login prompts for handle
- [ ] Login with existing account shows handles
- [ ] `handle claim` works and updates config
- [ ] `handle list` shows accurate data
- [ ] `handle default` updates default
- [ ] `handle check` shows availability
- [ ] `whoami` displays identity correctly
- [ ] `publish` uses default handle when publisher not set
- [ ] `publish` rejects unauthorized handles
- [ ] Error messages are helpful and actionable

---

## Migration Notes

### Breaking Change
This is a clean break - existing auth configs will be invalidated. Users will need to:
1. Run `aspects login` again
2. Claim a handle (suggested from their OAuth username)
3. Existing published aspects will be grandfathered to whoever claims that publisher handle first

### Grandfather Process
The API should handle this:
- When a user claims a handle that matches an existing `publisher` in the registry
- Link existing aspects to the new handle owner
- This happens server-side, not in CLI

---

## Open Questions

1. **Refresh token flow**: Should we refresh account/handle info when refreshing tokens?
2. **Offline mode**: How do we handle publishing when we can't verify handles? (Current: require online)
3. **Handle display**: Should we show `@handle` or just `handle` in CLI output?

---

## Success Criteria

1. Users can claim and manage handles via CLI
2. Publishing validates against handle permissions server-side
3. Clean migration path for existing users
4. Error messages guide users to resolution
5. `whoami` provides clear identity information
