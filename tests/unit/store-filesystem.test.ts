import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FilesystemStore } from '../../src/store/filesystem';
import { blake3HashAspectCanonical } from '../../src/utils/hash';
import type { GeneralAspect, PersonalityAspect } from '../../src/lib/types';

function makePersonality(overrides: Partial<PersonalityAspect> = {}): PersonalityAspect {
  return {
    schemaVersion: 1,
    name: 'test-aspect',
    version: '1.0.0',
    displayName: 'Test Aspect',
    tagline: 'A test aspect',
    category: 'test',
    prompt: 'You are a test assistant.',
    ...overrides,
  };
}

function makeGeneral(overrides: Partial<GeneralAspect> = {}): GeneralAspect {
  return {
    schemaVersion: 1,
    name: 'general-test',
    version: '1.0.0',
    displayName: 'General Test',
    tagline: 'A general test aspect',
    category: 'test',
    implements: ['builtin/personality@1.0.0'],
    data: { prompt: 'You are general.' },
    ...overrides,
  };
}

describe('FilesystemStore', () => {
  let store: FilesystemStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fs-store-'));
    store = new FilesystemStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // 1. publish() creates directory structure
  test('publish() creates directory structure with aspect.json and versions/', async () => {
    const aspect = makePersonality();
    const result = await store.publish(aspect, 'testpub');

    expect(result.name).toBe('test-aspect');
    expect(result.version).toBe('1.0.0');
    expect(result.created).toBe(true);
    expect(result.blake3).toBe(blake3HashAspectCanonical(aspect));
    expect(result.size).toBeGreaterThan(0);

    // Verify files exist on disk
    const latestFile = Bun.file(join(tmpDir, 'test-aspect', 'aspect.json'));
    expect(await latestFile.exists()).toBe(true);
    const versionFile = Bun.file(join(tmpDir, 'test-aspect', 'versions', '1.0.0.json'));
    expect(await versionFile.exists()).toBe(true);

    // Verify pretty-printed JSON
    const latestText = await latestFile.text();
    expect(latestText).toContain('\n'); // pretty-printed
  });

  // 2. publish() second version
  test('publish() second version adds to versions/ and updates aspect.json', async () => {
    const v1 = makePersonality({ version: '1.0.0' });
    const v2 = makePersonality({ version: '1.0.1' });

    await store.publish(v1, 'testpub');
    const result = await store.publish(v2, 'testpub');

    expect(result.created).toBe(false);
    expect(result.version).toBe('1.0.1');

    // Both version files exist
    expect(await Bun.file(join(tmpDir, 'test-aspect', 'versions', '1.0.0.json')).exists()).toBe(true);
    expect(await Bun.file(join(tmpDir, 'test-aspect', 'versions', '1.0.1.json')).exists()).toBe(true);

    // aspect.json points to latest
    const detail = await store.getAspect('test-aspect');
    expect(detail).not.toBeNull();
    expect(Object.keys(detail!.versions)).toHaveLength(2);
    expect(detail!.latest).toBe('1.0.1');
  });

  // 3. getAspect() returns null for nonexistent
  test('getAspect() returns null for nonexistent', async () => {
    const result = await store.getAspect('nonexistent');
    expect(result).toBeNull();
  });

  // 4. getAspect() returns detail with all versions
  test('getAspect() returns detail with all versions', async () => {
    await store.publish(makePersonality({ version: '1.0.0' }), 'pub');
    await store.publish(makePersonality({ version: '1.1.0' }), 'pub');
    await store.publish(makePersonality({ version: '2.0.0' }), 'pub');

    const detail = await store.getAspect('test-aspect');
    expect(detail).not.toBeNull();
    expect(Object.keys(detail!.versions).sort()).toEqual(['1.0.0', '1.1.0', '2.0.0']);
    expect(detail!.publisher).toBe('pub');
    expect(detail!.trust).toBe('community');
  });

  // 5. getVersion() returns specific version
  test('getVersion() returns specific version content', async () => {
    const v1 = makePersonality({ version: '1.0.0', prompt: 'v1 prompt' });
    const v2 = makePersonality({ version: '2.0.0', prompt: 'v2 prompt' });
    await store.publish(v1, 'pub');
    await store.publish(v2, 'pub');

    const result = await store.getVersion('test-aspect', '1.0.0');
    expect(result).not.toBeNull();
    expect((result as PersonalityAspect).prompt).toBe('v1 prompt');

    const missing = await store.getVersion('test-aspect', '3.0.0');
    expect(missing).toBeNull();
  });

  // 6. getVersion("latest") returns latest content
  test('getVersion("latest") returns latest content', async () => {
    await store.publish(makePersonality({ version: '1.0.0', prompt: 'v1' }), 'pub');
    await store.publish(makePersonality({ version: '2.0.0', prompt: 'v2' }), 'pub');

    const result = await store.getVersion('test-aspect', 'latest');
    expect(result).not.toBeNull();
    expect((result as PersonalityAspect).prompt).toBe('v2');
  });

  // 7. getByHash() finds published aspect
  test('getByHash() finds published aspect', async () => {
    const aspect = makePersonality();
    const { blake3 } = await store.publish(aspect, 'pub');

    const found = await store.getByHash(blake3);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('test-aspect');

    const notFound = await store.getByHash('nonexistent-hash');
    expect(notFound).toBeNull();
  });

  // 8. search() with q filter matches
  test('search() with q filter matches name/displayName/tagline', async () => {
    await store.publish(makePersonality({ name: 'alpha', displayName: 'Alpha Bot', tagline: 'First bot' }), 'pub');
    await store.publish(makePersonality({ name: 'beta', displayName: 'Beta Bot', tagline: 'Second bot' }), 'pub');

    const byName = await store.search({ q: 'alpha' });
    expect(byName.total).toBe(1);
    expect(byName.results[0]!.name).toBe('alpha');

    const byDisplay = await store.search({ q: 'Beta Bot' });
    expect(byDisplay.total).toBe(1);

    const noMatch = await store.search({ q: 'gamma' });
    expect(noMatch.total).toBe(0);
  });

  // 9. search() with implements filter
  test('search() with implements filter', async () => {
    await store.publish(makeGeneral({ name: 'gen1' }), 'pub');
    await store.publish(makePersonality({ name: 'legacy1' }), 'pub');

    const result = await store.search({ implements: 'builtin/personality@1.0.0' });
    expect(result.total).toBe(1);
    expect(result.results[0]!.name).toBe('gen1');
  });

  // 10. list() returns all published aspects
  test('list() returns all published aspects', async () => {
    await store.publish(makePersonality({ name: 'one' }), 'pub1');
    await store.publish(makePersonality({ name: 'two' }), 'pub2');

    const summaries = await store.list();
    expect(summaries).toHaveLength(2);
    const names = summaries.map(s => s.name).sort();
    expect(names).toEqual(['one', 'two']);
    expect(summaries[0]!.trust).toBe('community');
  });

  // 11. registerSchema() + resolveSchema() roundtrip
  test('registerSchema() + resolveSchema() roundtrip', async () => {
    const schema = { type: 'object', properties: { foo: { type: 'string' } } };
    await store.registerSchema({
      ref: 'custom/testpub/myschema@1.0.0',
      schema,
      publisher: 'testpub',
      createdAt: new Date().toISOString(),
    });

    const resolved = await store.resolveSchema('custom/testpub/myschema@1.0.0');
    expect(resolved).toEqual(schema);

    const notFound = await store.resolveSchema('nonexistent');
    expect(notFound).toBeNull();
  });

  // 12. resolveSchema() returns built-in schemas
  test('resolveSchema() returns built-in schemas', async () => {
    const personality = await store.resolveSchema('builtin/personality@1.0.0');
    expect(personality).not.toBeNull();
    expect(personality).toHaveProperty('type');

    const schema = await store.resolveSchema('builtin/schema@1.0.0');
    expect(schema).not.toBeNull();
  });

  // 13. deleteVersion() removes file and updates latest
  test('deleteVersion() removes file and updates latest', async () => {
    await store.publish(makePersonality({ version: '1.0.0' }), 'pub');
    await store.publish(makePersonality({ version: '2.0.0' }), 'pub');

    // Delete the latest version
    const deleted = await store.deleteVersion('test-aspect', '2.0.0');
    expect(deleted).toBe(true);

    // Version file removed
    expect(await Bun.file(join(tmpDir, 'test-aspect', 'versions', '2.0.0.json')).exists()).toBe(false);

    // aspect.json updated to point to remaining version
    const detail = await store.getAspect('test-aspect');
    expect(detail).not.toBeNull();
    expect(Object.keys(detail!.versions)).toEqual(['1.0.0']);
    expect(detail!.latest).toBe('1.0.0');

    // Delete last version removes the aspect dir
    const deleted2 = await store.deleteVersion('test-aspect', '1.0.0');
    expect(deleted2).toBe(true);
    const gone = await store.getAspect('test-aspect');
    expect(gone).toBeNull();
  });

  // deleteVersion() returns false for unknown
  test('deleteVersion() returns false for unknown', async () => {
    expect(await store.deleteVersion('nonexistent', '1.0.0')).toBe(false);

    await store.publish(makePersonality(), 'pub');
    expect(await store.deleteVersion('test-aspect', '9.9.9')).toBe(false);
  });

  // publish() rejects duplicate version
  test('publish() rejects duplicate version', async () => {
    const aspect = makePersonality();
    await store.publish(aspect, 'testpub');
    await expect(store.publish(aspect, 'testpub')).rejects.toThrow(
      'Version 1.0.0 already exists for test-aspect'
    );
  });

  // listSchemas() includes built-in schemas
  test('listSchemas() includes built-in schemas', async () => {
    const schemas = await store.listSchemas();
    const refs = schemas.map(s => s.ref);
    expect(refs).toContain('builtin/personality@1.0.0');
    expect(refs).toContain('builtin/schema@1.0.0');
  });
});
