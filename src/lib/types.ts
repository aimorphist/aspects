/**
 * Aspect package schema (parsed from aspect.yaml)
 */
export interface Aspect {
  schemaVersion: number;
  name: string;
  publisher?: string;
  version: string;
  displayName: string;
  tagline: string;
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
}

export interface InstalledAspect {
  version: string;
  source: 'registry' | 'github' | 'local';
  installedAt: string;
  sha256: string;
  path?: string;      // For local installs - absolute path to aspect dir
  githubRef?: string; // For github installs: tag/branch/commit used
}

/**
 * Parsed install specification
 */
export type InstallSpec =
  | { type: 'registry'; name: string; version?: string }
  | { type: 'github'; owner: string; repo: string; ref?: string }
  | { type: 'local'; path: string };

/** Registry index.json structure */
export interface RegistryIndex {
  version: number;
  updated: string;
  aspects: Record<string, RegistryAspect>;
}

export interface RegistryAspect {
  latest: string;
  versions: Record<string, RegistryVersion>;
  metadata: {
    displayName: string;
    tagline: string;
    publisher?: string;
    trust: 'verified' | 'community';
  };
}

export interface RegistryVersion {
  published: string;
  url: string;
  sha256?: string;
  size?: number;
}
