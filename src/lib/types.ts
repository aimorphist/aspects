/**
 * Aspect package schema (parsed from aspect.json)
 */
export interface Aspect {
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

  voiceHints?: {
    speed?: 'slow' | 'normal' | 'fast';
    emotions?: string[];
    styleHints?: string;
  };

  modes?: Record<string, {
    description: string;
    autoNarration?: boolean;
  }>;

  resources?: {
    voice?: {
      recommended?: {
        provider: string;
        voiceId: string;
      };
    };
    model?: {
      recommended?: {
        provider: string;
        modelId: string;
      };
    };
    skills?: string[];
  };

  prompt: string;
}

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

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  username: string;
}

export interface InstalledAspect {
  version: string;
  source: 'registry' | 'github' | 'local';
  installedAt: string;
  blake3: string;
  path?: string;      // For local installs - absolute path to aspect dir
  githubRef?: string; // For github installs: tag/branch/commit used
}

/**
 * Parsed install specification
 */
export type InstallSpec =
  | { type: 'registry'; name: string; version?: string }
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
