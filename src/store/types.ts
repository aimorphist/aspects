import type { Aspect, AspectSummary } from '../lib/types';

export interface PublishResult {
  name: string;
  version: string;
  blake3: string;
  size: number;
  created: boolean; // true if new aspect, false if new version of existing
}

export interface SearchParams {
  q?: string;
  category?: string;
  trust?: string;
  implements?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  total: number;
  results: Array<{
    name: string;
    displayName: string;
    tagline: string;
    category: string;
    publisher: string;
    version: string;
    trust: string;
    downloads: number;
    implements?: string[];
  }>;
}

export interface AspectDetail {
  name: string;
  publisher: string;
  latest: string;
  created: string;
  modified: string;
  trust: string;
  versions: Record<string, {
    published: string;
    blake3: string;
    size: number;
    content: Aspect;
  }>;
}

export interface StoredSchema {
  ref: string;         // e.g. "builtin/personality@1.0.0"
  schema: unknown;     // The JSON Schema document
  publisher?: string;
  createdAt: string;
}

/**
 * AspectStore -- the storage abstraction for an aspects registry.
 *
 * Implementations:
 * - MemoryStore: in-memory, for tests
 * - FilesystemStore: reads/writes aspect.json files on disk
 * - PostgresStore: Drizzle + Postgres (used by aspects-webapp)
 */
export interface AspectStore {
  // --- Aspects ---

  /** Publish an aspect (creates or adds version) */
  publish(aspect: Aspect, publisher: string): Promise<PublishResult>;

  /** Get aspect detail with all versions */
  getAspect(name: string): Promise<AspectDetail | null>;

  /** Get a specific version's content */
  getVersion(name: string, version: string): Promise<Aspect | null>;

  /** Get aspect by blake3 hash */
  getByHash(hash: string): Promise<Aspect | null>;

  /** Search aspects */
  search(params: SearchParams): Promise<SearchResult>;

  /** List all aspects (for registry index) */
  list(): Promise<AspectSummary[]>;

  /** Delete a version */
  deleteVersion(name: string, version: string): Promise<boolean>;

  // --- Schemas ---

  /** Register a schema definition */
  registerSchema(schema: StoredSchema): Promise<void>;

  /** Resolve a schema by ref */
  resolveSchema(ref: string): Promise<unknown | null>;

  /** List all registered schemas */
  listSchemas(): Promise<StoredSchema[]>;
}
