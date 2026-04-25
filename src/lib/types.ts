/**
 * Aspect kinds. `personality` is the original prompt-bearing aspect; `schema`
 * carries a JSON Schema document (e.g. for DreamBall archiform definitions).
 * Aspects authored before this discriminator existed are treated as `personality`
 * at parse time without rewriting the file on disk.
 */
export type AspectKind = 'personality' | 'schema';

interface AspectBase {
  schemaVersion: number;
  name: string;
  publisher?: string;
  version: string;
  displayName: string;
  tagline: string;
  category?: string;
  tags?: string[];
  icon?: string;
  author?: string;
  license?: string;
}

export interface PersonalityAspect extends AspectBase {
  /**
   * Optional on personality aspects: absence is the back-compat default.
   * Absence and the explicit value `"personality"` are semantically identical.
   */
  kind?: 'personality';
  voiceHints?: {
    speed?: 'slow' | 'normal' | 'fast';
    emotions?: string[];
    styleHints?: string;
  };
  prompt: string;
  /**
   * Optional pointer declaring this personality is a manifestation of a
   * schema-aspect — `<publisher>/<name>@<semver>` or `blake3:<hash>`.
   */
  extendsSchema?: string;
  /**
   * Legacy/aux fields baked into the prompt by older create flows.
   * Kept as a typed escape hatch for older fixtures and the `compile` command;
   * the schema does not currently validate or write these.
   */
  modes?: Record<string, { description: string; critical?: string }>;
  directives?: Array<{ id: string; rule: string; priority: string }>;
  instructions?: Array<{ id: string; rule: string }>;
}

export interface SchemaAspect extends AspectBase {
  kind: 'schema';
  /** A JSON Schema document (typically draft 2020-12). Validity meta-checked at parse. */
  schema: Record<string, unknown>;
}

export type Aspect = PersonalityAspect | SchemaAspect;

/**
 * Aspect summary for registry listing (without full prompt)
 */
export interface AspectSummary {
  name: string;
  version: string;
  displayName: string;
  tagline: string;
  publisher?: string;
  trust: 'verified' | 'community' | 'local';
  signature?: string;
  kind?: AspectKind;
}

/**
 * Local configuration stored at ~/.aspects/config.json
 */
export interface AspectsConfig {
  version: 1;
  installed: Record<string, InstalledAspect>;
  settings: {
    registryUrl?: string;
  };
  auth?: AuthTokens;
}

/**
 * Handle information including role and default status
 */
export interface HandleInfo {
  name: string;
  role: 'owner' | 'admin' | 'member';
  default: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  accountId: string;           // UUID from registry
  handles: HandleInfo[];       // All handles user has access to
  defaultHandle: string;       // The handle to use for publishing
}

/**
 * Trust level indicates provenance and verification status.
 * - verified: Registry publisher with verified identity
 * - community: Registry publisher without verification
 * - github: From public GitHub repository
 * - local: Installed from local filesystem
 */
export type TrustLevel = 'verified' | 'community' | 'github' | 'local';

export interface InstalledAspect {
  version: string;
  installedAt: string;
  blake3: string;               // Canonical content hash at install time
  
  source: 'registry' | 'github' | 'local';
  trust: TrustLevel;
  
  // Registry-specific: publisher namespace (undefined = anonymous/hash-based)
  publisher?: string;
  
  // GitHub-specific: "owner/repo@ref"
  githubRef?: string;
  
  // Local-specific: absolute path to aspect directory
  localPath?: string;
  
  // Original specifier used to install (enables reinstall, display)
  // e.g. "alaric", "morphist/alaric", "blake3:abc...", "./path", "github:owner/repo"
  specifier: string;
}

/**
 * Parsed install specification
 */
export type InstallSpec =
  | { type: 'registry'; name: string; publisher?: string; version?: string }
  | { type: 'github'; owner: string; repo: string; ref?: string }
  | { type: 'local'; path: string }
  | { type: 'hash'; hash: string };

/** Registry index.json structure */
export interface RegistryIndex {
  version: number;
  updated: string;
  total?: number;
  aspects: Record<string, RegistryAspect>;
  sets?: Record<string, RegistrySet>;
}

/** Registry set entry (uses qualified names: publisher/name) */
export interface RegistrySet {
  displayName: string;
  description?: string;
  aspects: string[]; // Qualified names: ["morphist/alaric", "morphist/default"]
  publisher: string;
  trust: 'verified' | 'community';
  createdAt: string;
  updatedAt: string;
}

export interface RegistryAspect {
  latest: string;
  versions: Record<string, RegistryVersion>;
  metadata: {
    displayName: string;
    tagline: string;
    category?: string;
    tags?: string[];
    publisher?: string;
    trust: 'verified' | 'community';
    kind?: AspectKind;
  };
}

export interface RegistryVersion {
  published: string;
  url: string;
  blake3?: string;
  size?: number;
}

// --- API Response Types ---

export interface ApiError {
  ok: false;
  error: string;
  message: string;
}

export interface ApiSearchResult {
  total: number;
  results: Array<{
    name: string;
    displayName: string;
    tagline: string;
    category: string;
    publisher: string;
    version: string;
    trust: 'verified' | 'community';
    downloads: number;
  }>;
}

export interface ApiAspectDetail {
  name: string;
  publisher: string;
  latest: string;
  created: string;
  modified: string;
  trust: 'verified' | 'community';
  stats: {
    downloads: {
      total: number;
      weekly: number;
    };
  };
  versions: Record<string, {
    published: string;
    blake3: string;
    size: number;
    deprecated?: string;
    aspect: Aspect;
  }>;
}

export interface ApiVersionContent {
  name: string;
  version: string;
  content: Aspect;
  blake3: string;
  size: number;
  publishedAt: string;
}

export interface ApiPublishResponse {
  ok: true;
  name: string;
  version: string;
  url: string;
}

export interface ApiAnonymousPublishResponse {
  name: string;
  blake3: string;
  size: number;
  url: string;
  existing: boolean;
}

export interface ApiUnpublishResponse {
  ok: true;
  message: string;
}

export interface ApiDeviceCode {
  ok: true;
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  code_verifier: string;
  expires_in: number;
  interval: number;
}

export interface ApiDevicePoll {
  ok: boolean;
  status?: 'pending' | 'slow_down' | 'expired' | 'denied';
  error?: string;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  account?: {
    id: string;
    handles: HandleInfo[];
    needs_handle: boolean;
  };
}

export interface ApiStats {
  total_aspects: number;
  total_downloads: number;
  weekly_downloads: number;
  top_aspects: Array<{ name: string; downloads: number }>;
  by_category: Record<string, number>;
}

export interface ApiCategories {
  categories: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

// --- Account & Handle API Types ---

export interface ApiAccount {
  id: string;
  handles: HandleInfo[];
  owned_handle_count: number;
  max_owned_handles: number;
  created_at: string;
}

export interface ApiHandleClaimResponse {
  ok: true;
  name: string;
  display_name?: string;
  created_at: string;
}

export interface ApiHandleAvailability {
  name: string;
  available: boolean;
  reason?: string; // If unavailable: "taken", "reserved", "invalid"
}

export interface ApiHandleInfo {
  name: string;
  display_name?: string;
  verified: boolean;
  created_at: string;
  aspect_count: number;
}
