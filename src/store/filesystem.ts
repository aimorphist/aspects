import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { isGeneralAspect, type Aspect, type AspectSummary } from '../lib/types';
import { blake3HashAspectCanonical, canonicalizeAspect } from '../utils/hash';
import { BUILTIN_SCHEMAS } from '../schemas/index';
import type {
  AspectStore,
  AspectDetail,
  PublishResult,
  SearchParams,
  SearchResult,
  StoredSchema,
} from './types';

/**
 * Filesystem-backed AspectStore.
 *
 * Directory layout:
 *   {root}/{name}/aspect.json          – latest version
 *   {root}/{name}/versions/{ver}.json  – specific version
 *   {root}/_schemas/builtin/{ref}.json – builtin schema overrides
 *   {root}/_schemas/custom/{publisher}/{name}@{ver}.json
 */
export class FilesystemStore implements AspectStore {
  private root: string;

  constructor(root: string) {
    this.root = root;
  }

  // ── Aspects ──────────────────────────────────────────────

  async publish(aspect: Aspect, publisher: string): Promise<PublishResult> {
    const { name, version } = aspect;
    const blake3 = blake3HashAspectCanonical(aspect);
    const size = new TextEncoder().encode(canonicalizeAspect(aspect)).byteLength;
    const now = new Date().toISOString();

    const aspectDir = join(this.root, name);
    const versionsDir = join(aspectDir, 'versions');
    const versionFile = join(versionsDir, `${version}.json`);
    const latestFile = join(aspectDir, 'aspect.json');

    // Check for duplicate version
    if (await this.fileExists(versionFile)) {
      throw new Error(`Version ${version} already exists for ${name}`);
    }

    await mkdir(versionsDir, { recursive: true });

    // Determine if this is a new aspect or a new version
    const isNew = !(await this.fileExists(latestFile));

    // Build metadata envelope stored alongside the aspect content
    const versionMeta = {
      ...aspect,
      _meta: { publisher, blake3, size, published: now },
    };

    // Write version file
    await Bun.write(versionFile, JSON.stringify(versionMeta, null, 2));

    // Write / overwrite latest
    const latestMeta = {
      ...aspect,
      _meta: {
        publisher,
        trust: 'community',
        created: isNew ? now : (await this.readLatestMeta(latestFile))?.created ?? now,
        modified: now,
        latest: version,
        blake3,
        size,
        published: now,
      },
    };
    await Bun.write(latestFile, JSON.stringify(latestMeta, null, 2));

    return { name, version, blake3, size, created: isNew };
  }

  async getAspect(name: string): Promise<AspectDetail | null> {
    const latestFile = join(this.root, name, 'aspect.json');
    const latestData = await this.readJson(latestFile);
    if (!latestData) return null;

    const meta = latestData._meta ?? {};
    const versionsDir = join(this.root, name, 'versions');
    const versions: AspectDetail['versions'] = {};

    const versionFiles = await this.listDir(versionsDir);
    for (const file of versionFiles) {
      if (!file.endsWith('.json')) continue;
      const ver = file.replace(/\.json$/, '');
      const vData = await this.readJson(join(versionsDir, file));
      if (!vData) continue;
      const vMeta = vData._meta ?? {};
      const { _meta, ...content } = vData;
      versions[ver] = {
        published: vMeta.published ?? '',
        blake3: vMeta.blake3 ?? '',
        size: vMeta.size ?? 0,
        content: content as Aspect,
      };
    }

    const { _meta, ...latestContent } = latestData;
    return {
      name,
      publisher: meta.publisher ?? '',
      latest: meta.latest ?? '',
      created: meta.created ?? '',
      modified: meta.modified ?? '',
      trust: meta.trust ?? 'community',
      versions,
    };
  }

  async getVersion(name: string, version: string): Promise<Aspect | null> {
    if (version === 'latest') {
      const data = await this.readJson(join(this.root, name, 'aspect.json'));
      if (!data) return null;
      const { _meta, ...content } = data;
      return content as Aspect;
    }

    const data = await this.readJson(join(this.root, name, 'versions', `${version}.json`));
    if (!data) return null;
    const { _meta, ...content } = data;
    return content as Aspect;
  }

  async getByHash(hash: string): Promise<Aspect | null> {
    const dirs = await this.listAspectDirs();
    for (const name of dirs) {
      const versionsDir = join(this.root, name, 'versions');
      const files = await this.listDir(versionsDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const data = await this.readJson(join(versionsDir, file));
        if (!data) continue;
        if (data._meta?.blake3 === hash) {
          const { _meta, ...content } = data;
          return content as Aspect;
        }
      }
    }
    return null;
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const { q, category, trust, implements: impl, limit = 20, offset = 0 } = params;
    const qLower = q?.toLowerCase();

    const matches: SearchResult['results'] = [];
    const dirs = await this.listAspectDirs();

    for (const name of dirs) {
      const data = await this.readJson(join(this.root, name, 'aspect.json'));
      if (!data) continue;

      const meta = data._meta ?? {};
      const { _meta, ...aspectData } = data;
      const aspect = aspectData as Aspect;

      if (category && aspect.category !== category) continue;
      if (trust && meta.trust !== trust) continue;

      if (impl) {
        if (!isGeneralAspect(aspect) || !aspect.implements.includes(impl)) continue;
      }

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
        publisher: meta.publisher ?? '',
        version: meta.latest ?? aspect.version,
        trust: meta.trust ?? 'community',
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
    const dirs = await this.listAspectDirs();

    for (const name of dirs) {
      const data = await this.readJson(join(this.root, name, 'aspect.json'));
      if (!data) continue;

      const meta = data._meta ?? {};
      const { _meta, ...aspectData } = data;
      const aspect = aspectData as Aspect;

      summaries.push({
        name: aspect.name,
        version: meta.latest ?? aspect.version,
        displayName: aspect.displayName,
        tagline: aspect.tagline,
        publisher: meta.publisher,
        trust: (meta.trust ?? 'community') as 'verified' | 'community' | 'local',
        implements: isGeneralAspect(aspect) ? aspect.implements : undefined,
      });
    }

    return summaries;
  }

  async deleteVersion(name: string, version: string): Promise<boolean> {
    const versionFile = join(this.root, name, 'versions', `${version}.json`);
    if (!(await this.fileExists(versionFile))) return false;

    await rm(versionFile);

    const versionsDir = join(this.root, name, 'versions');
    const remaining = (await this.listDir(versionsDir)).filter(f => f.endsWith('.json'));

    if (remaining.length === 0) {
      // Remove entire aspect directory
      await rm(join(this.root, name), { recursive: true });
    } else {
      // Check if we deleted the latest — need to update aspect.json
      const latestFile = join(this.root, name, 'aspect.json');
      const latestData = await this.readJson(latestFile);
      if (latestData?._meta?.latest === version) {
        // Pick the last remaining version (alphabetically, which works for semver)
        const newLatestVer = remaining.map(f => f.replace(/\.json$/, '')).sort().pop()!;
        const newLatestData = await this.readJson(join(versionsDir, `${newLatestVer}.json`));
        if (newLatestData) {
          const vMeta = newLatestData._meta ?? {};
          const { _meta: _vm, ...newContent } = newLatestData;
          const updatedLatest = {
            ...newContent,
            _meta: {
              ...latestData._meta,
              latest: newLatestVer,
              modified: new Date().toISOString(),
              blake3: vMeta.blake3,
              size: vMeta.size,
              published: vMeta.published,
            },
          };
          await Bun.write(latestFile, JSON.stringify(updatedLatest, null, 2));
        }
      }
    }

    return true;
  }

  // ── Schemas ──────────────────────────────────────────────

  async registerSchema(schema: StoredSchema): Promise<void> {
    // Parse ref to determine path: "custom/publisher/name@ver" or "builtin/name@ver"
    const parts = schema.ref.split('/');
    let filePath: string;

    if (parts[0] === 'builtin') {
      filePath = join(this.root, '_schemas', 'builtin', `${parts.slice(1).join('/')}.json`);
    } else if (parts[0] === 'custom' && parts.length >= 3) {
      // custom/publisher/name@ver
      filePath = join(this.root, '_schemas', 'custom', parts[1]!, `${parts.slice(2).join('/')}.json`);
    } else {
      // Fallback: treat the full ref as a custom path under publisher
      const publisher = schema.publisher ?? '_unknown';
      filePath = join(this.root, '_schemas', 'custom', publisher, `${schema.ref.replace(/\//g, '_')}.json`);
    }

    await mkdir(join(filePath, '..'), { recursive: true });
    await Bun.write(filePath, JSON.stringify({
      ref: schema.ref,
      schema: schema.schema,
      publisher: schema.publisher,
      createdAt: schema.createdAt,
    }, null, 2));
  }

  async resolveSchema(ref: string): Promise<unknown | null> {
    // Check built-in schemas first
    if (ref in BUILTIN_SCHEMAS) {
      return BUILTIN_SCHEMAS[ref]!;
    }

    // Check filesystem
    const stored = await this.findSchemaFile(ref);
    if (stored) return stored.schema;

    return null;
  }

  async listSchemas(): Promise<StoredSchema[]> {
    const schemas: StoredSchema[] = [];

    // Add built-in schemas
    for (const [ref, schema] of Object.entries(BUILTIN_SCHEMAS)) {
      schemas.push({
        ref,
        schema,
        publisher: 'builtin',
        createdAt: new Date().toISOString(),
      });
    }

    // Scan filesystem schemas
    const schemasDir = join(this.root, '_schemas');
    await this.walkSchemas(schemasDir, schemas);

    return schemas;
  }

  // ── Helpers ──────────────────────────────────────────────

  private async fileExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  private async readJson(path: string): Promise<Record<string, any> | null> {
    try {
      const file = Bun.file(path);
      const text = await file.text();
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private async listDir(path: string): Promise<string[]> {
    try {
      return await readdir(path);
    } catch {
      return [];
    }
  }

  /** List aspect directories (skip _schemas and other underscore-prefixed dirs) */
  private async listAspectDirs(): Promise<string[]> {
    const entries = await this.listDir(this.root);
    return entries.filter(e => !e.startsWith('_') && !e.startsWith('.'));
  }

  private async readLatestMeta(latestFile: string): Promise<Record<string, any> | null> {
    const data = await this.readJson(latestFile);
    return data?._meta ?? null;
  }

  private async findSchemaFile(ref: string): Promise<StoredSchema | null> {
    const parts = ref.split('/');
    let candidates: string[] = [];

    if (parts[0] === 'builtin') {
      candidates.push(join(this.root, '_schemas', 'builtin', `${parts.slice(1).join('/')}.json`));
    } else if (parts[0] === 'custom' && parts.length >= 3) {
      candidates.push(join(this.root, '_schemas', 'custom', parts[1]!, `${parts.slice(2).join('/')}.json`));
    }
    // Also try direct ref as fallback
    candidates.push(join(this.root, '_schemas', 'custom', `${ref.replace(/\//g, '_')}.json`));

    for (const candidate of candidates) {
      const data = await this.readJson(candidate);
      if (data) {
        return {
          ref: data.ref ?? ref,
          schema: data.schema,
          publisher: data.publisher,
          createdAt: data.createdAt ?? '',
        };
      }
    }

    return null;
  }

  private async walkSchemas(dir: string, schemas: StoredSchema[]): Promise<void> {
    const entries = await this.listDir(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const s = await stat(fullPath);
        if (s.isDirectory()) {
          await this.walkSchemas(fullPath, schemas);
        } else if (entry.endsWith('.json')) {
          const data = await this.readJson(fullPath);
          if (data?.ref) {
            schemas.push({
              ref: data.ref,
              schema: data.schema,
              publisher: data.publisher,
              createdAt: data.createdAt ?? '',
            });
          }
        }
      } catch {
        // Skip unreadable entries
      }
    }
  }
}
