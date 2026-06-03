import { isGeneralAspect, type Aspect, type AspectSummary } from '../lib/types';
import { blake3HashAspectCanonical } from '../utils/hash';
import { canonicalizeAspect } from '../utils/hash';
import { BUILTIN_SCHEMAS } from '../schemas/index';
import type {
  AspectStore,
  AspectDetail,
  PublishResult,
  SearchParams,
  SearchResult,
  StoredSchema,
} from './types';

interface StoredVersion {
  aspect: Aspect;
  blake3: string;
  size: number;
  published: string;
}

interface StoredAspect {
  name: string;
  publisher: string;
  trust: string;
  created: string;
  modified: string;
  latest: string;
  versions: Map<string, StoredVersion>;
}

/**
 * In-memory AspectStore implementation, primarily for tests.
 */
export class MemoryStore implements AspectStore {
  private aspects = new Map<string, StoredAspect>();
  private schemas = new Map<string, StoredSchema>();

  constructor() {
    // Load built-in schemas
    for (const [ref, schema] of Object.entries(BUILTIN_SCHEMAS)) {
      this.schemas.set(ref, {
        ref,
        schema,
        publisher: 'builtin',
        createdAt: new Date().toISOString(),
      });
    }
  }

  async publish(aspect: Aspect, publisher: string): Promise<PublishResult> {
    const { name, version } = aspect;
    const blake3 = blake3HashAspectCanonical(aspect);
    const size = new TextEncoder().encode(canonicalizeAspect(aspect)).byteLength;
    const now = new Date().toISOString();

    const existing = this.aspects.get(name);

    if (existing) {
      if (existing.versions.has(version)) {
        throw new Error(`Version ${version} already exists for ${name}`);
      }
      existing.versions.set(version, { aspect, blake3, size, published: now });
      existing.latest = version;
      existing.modified = now;
      return { name, version, blake3, size, created: false };
    }

    const stored: StoredAspect = {
      name,
      publisher,
      trust: 'community',
      created: now,
      modified: now,
      latest: version,
      versions: new Map([[version, { aspect, blake3, size, published: now }]]),
    };
    this.aspects.set(name, stored);
    return { name, version, blake3, size, created: true };
  }

  async getAspect(name: string): Promise<AspectDetail | null> {
    const stored = this.aspects.get(name);
    if (!stored) return null;

    const versions: AspectDetail['versions'] = {};
    for (const [ver, sv] of stored.versions) {
      versions[ver] = {
        published: sv.published,
        blake3: sv.blake3,
        size: sv.size,
        content: sv.aspect,
      };
    }

    return {
      name: stored.name,
      publisher: stored.publisher,
      latest: stored.latest,
      created: stored.created,
      modified: stored.modified,
      trust: stored.trust,
      versions,
    };
  }

  async getVersion(name: string, version: string): Promise<Aspect | null> {
    const stored = this.aspects.get(name);
    if (!stored) return null;
    const sv = stored.versions.get(version);
    return sv?.aspect ?? null;
  }

  async getByHash(hash: string): Promise<Aspect | null> {
    for (const stored of this.aspects.values()) {
      for (const sv of stored.versions.values()) {
        if (sv.blake3 === hash) return sv.aspect;
      }
    }
    return null;
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const { q, category, trust, implements: impl, limit = 20, offset = 0 } = params;
    const qLower = q?.toLowerCase();

    const matches: SearchResult['results'] = [];

    for (const stored of this.aspects.values()) {
      const latestVer = stored.versions.get(stored.latest);
      if (!latestVer) continue;
      const aspect = latestVer.aspect;

      // Filter by category
      if (category && aspect.category !== category) continue;

      // Filter by trust
      if (trust && stored.trust !== trust) continue;

      // Filter by implements
      if (impl) {
        if (!isGeneralAspect(aspect) || !aspect.implements.includes(impl)) continue;
      }

      // Filter by query string
      if (qLower) {
        const searchable = [
          aspect.name,
          aspect.displayName,
          aspect.tagline,
        ].map(s => s.toLowerCase());
        if (!searchable.some(s => s.includes(qLower))) continue;
      }

      matches.push({
        name: aspect.name,
        displayName: aspect.displayName,
        tagline: aspect.tagline,
        category: aspect.category ?? '',
        publisher: stored.publisher,
        version: stored.latest,
        trust: stored.trust,
        downloads: 0,
        implements: isGeneralAspect(aspect) ? aspect.implements : undefined,
      });
    }

    return {
      total: matches.length,
      results: matches.slice(offset, offset + limit),
    };
  }

  async list(): Promise<AspectSummary[]> {
    const summaries: AspectSummary[] = [];
    for (const stored of this.aspects.values()) {
      const latestVer = stored.versions.get(stored.latest);
      if (!latestVer) continue;
      const aspect = latestVer.aspect;
      summaries.push({
        name: aspect.name,
        version: stored.latest,
        displayName: aspect.displayName,
        tagline: aspect.tagline,
        publisher: stored.publisher,
        trust: stored.trust as 'verified' | 'community' | 'local',
        implements: isGeneralAspect(aspect) ? aspect.implements : undefined,
      });
    }
    return summaries;
  }

  async deleteVersion(name: string, version: string): Promise<boolean> {
    const stored = this.aspects.get(name);
    if (!stored) return false;
    if (!stored.versions.has(version)) return false;

    stored.versions.delete(version);

    // If no versions left, remove the aspect entirely
    if (stored.versions.size === 0) {
      this.aspects.delete(name);
    } else if (stored.latest === version) {
      // Update latest to most recent remaining version
      const remaining = Array.from(stored.versions.keys());
      stored.latest = remaining[remaining.length - 1]!;
    }

    return true;
  }

  // --- Schemas ---

  async registerSchema(schema: StoredSchema): Promise<void> {
    this.schemas.set(schema.ref, schema);
  }

  async resolveSchema(ref: string): Promise<unknown | null> {
    const stored = this.schemas.get(ref);
    return stored?.schema ?? null;
  }

  async listSchemas(): Promise<StoredSchema[]> {
    return Array.from(this.schemas.values());
  }
}
