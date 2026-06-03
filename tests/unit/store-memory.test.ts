import { describe, test, expect, beforeEach } from 'bun:test';
import { MemoryStore } from '../../src/store/memory';
import { blake3HashAspectCanonical } from '../../src/utils/hash';
import type { Aspect, GeneralAspect, PersonalityAspect } from '../../src/lib/types';

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

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  // 1. publish() creates new aspect
  test('publish() creates new aspect with correct blake3/size', async () => {
    const aspect = makePersonality();
    const result = await store.publish(aspect, 'testpub');

    expect(result.name).toBe('test-aspect');
    expect(result.version).toBe('1.0.0');
    expect(result.created).toBe(true);
    expect(result.blake3).toBe(blake3HashAspectCanonical(aspect));
    expect(result.size).toBeGreaterThan(0);
  });

  // 2. publish() adds version to existing aspect
  test('publish() adds version to existing aspect', async () => {
    const v1 = makePersonality({ version: '1.0.0' });
    const v2 = makePersonality({ version: '2.0.0' });

    await store.publish(v1, 'testpub');
    const result = await store.publish(v2, 'testpub');

    expect(result.created).toBe(false);
    expect(result.version).toBe('2.0.0');

    const detail = await store.getAspect('test-aspect');
    expect(detail).not.toBeNull();
    expect(Object.keys(detail!.versions)).toHaveLength(2);
    expect(detail!.latest).toBe('2.0.0');
  });

  // 3. publish() rejects duplicate version
  test('publish() rejects duplicate version', async () => {
    const aspect = makePersonality();
    await store.publish(aspect, 'testpub');
    await expect(store.publish(aspect, 'testpub')).rejects.toThrow(
      'Version 1.0.0 already exists for test-aspect'
    );
  });

  // 4. getAspect() returns null for unknown
  test('getAspect() returns null for unknown', async () => {
    const result = await store.getAspect('nonexistent');
    expect(result).toBeNull();
  });

  // 5. getAspect() returns all versions
  test('getAspect() returns all versions', async () => {
    await store.publish(makePersonality({ version: '1.0.0' }), 'pub');
    await store.publish(makePersonality({ version: '1.1.0' }), 'pub');
    await store.publish(makePersonality({ version: '2.0.0' }), 'pub');

    const detail = await store.getAspect('test-aspect');
    expect(detail).not.toBeNull();
    expect(Object.keys(detail!.versions).sort()).toEqual(['1.0.0', '1.1.0', '2.0.0']);
    expect(detail!.publisher).toBe('pub');
    expect(detail!.trust).toBe('community');
  });

  // 6. getVersion() returns specific version content
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

  // 7. getByHash() finds by blake3
  test('getByHash() finds by blake3', async () => {
    const aspect = makePersonality();
    const { blake3 } = await store.publish(aspect, 'pub');

    const found = await store.getByHash(blake3);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('test-aspect');

    const notFound = await store.getByHash('nonexistent-hash');
    expect(notFound).toBeNull();
  });

  // 8. search() with q matches name/displayName/tagline
  test('search() with q matches name/displayName/tagline', async () => {
    await store.publish(makePersonality({ name: 'alpha', displayName: 'Alpha Bot', tagline: 'First bot' }), 'pub');
    await store.publish(makePersonality({ name: 'beta', displayName: 'Beta Bot', tagline: 'Second bot' }), 'pub');

    const byName = await store.search({ q: 'alpha' });
    expect(byName.total).toBe(1);
    expect(byName.results[0]!.name).toBe('alpha');

    const byDisplay = await store.search({ q: 'Beta Bot' });
    expect(byDisplay.total).toBe(1);

    const byTagline = await store.search({ q: 'Second' });
    expect(byTagline.total).toBe(1);

    const noMatch = await store.search({ q: 'gamma' });
    expect(noMatch.total).toBe(0);
  });

  // 9. search() with category filter
  test('search() with category filter', async () => {
    await store.publish(makePersonality({ name: 'a', category: 'productivity' }), 'pub');
    await store.publish(makePersonality({ name: 'b', category: 'creative' }), 'pub');

    const result = await store.search({ category: 'creative' });
    expect(result.total).toBe(1);
    expect(result.results[0]!.name).toBe('b');
  });

  // 10. search() with implements filter
  test('search() with implements filter', async () => {
    await store.publish(makeGeneral({ name: 'gen1' }), 'pub');
    await store.publish(makePersonality({ name: 'legacy1' }), 'pub');

    const result = await store.search({ implements: 'builtin/personality@1.0.0' });
    expect(result.total).toBe(1);
    expect(result.results[0]!.name).toBe('gen1');
  });

  // 11. search() with pagination (limit/offset)
  test('search() with pagination (limit/offset)', async () => {
    for (let i = 0; i < 5; i++) {
      await store.publish(makePersonality({ name: `item-${i}` }), 'pub');
    }

    const page1 = await store.search({ limit: 2, offset: 0 });
    expect(page1.total).toBe(5);
    expect(page1.results).toHaveLength(2);

    const page2 = await store.search({ limit: 2, offset: 2 });
    expect(page2.total).toBe(5);
    expect(page2.results).toHaveLength(2);

    const page3 = await store.search({ limit: 2, offset: 4 });
    expect(page3.total).toBe(5);
    expect(page3.results).toHaveLength(1);
  });

  // 12. list() returns all aspects
  test('list() returns all aspects', async () => {
    await store.publish(makePersonality({ name: 'one' }), 'pub1');
    await store.publish(makePersonality({ name: 'two' }), 'pub2');

    const summaries = await store.list();
    expect(summaries).toHaveLength(2);
    const names = summaries.map(s => s.name).sort();
    expect(names).toEqual(['one', 'two']);
    expect(summaries[0]!.trust).toBe('community');
  });

  // 13. registerSchema() + resolveSchema() roundtrip
  test('registerSchema() + resolveSchema() roundtrip', async () => {
    const schema = { type: 'object', properties: { foo: { type: 'string' } } };
    await store.registerSchema({
      ref: 'custom/test@1.0.0',
      schema,
      publisher: 'testpub',
      createdAt: new Date().toISOString(),
    });

    const resolved = await store.resolveSchema('custom/test@1.0.0');
    expect(resolved).toEqual(schema);

    const notFound = await store.resolveSchema('nonexistent');
    expect(notFound).toBeNull();
  });

  // 14. listSchemas() includes built-in schemas
  test('listSchemas() includes built-in schemas', async () => {
    const schemas = await store.listSchemas();
    const refs = schemas.map(s => s.ref);
    expect(refs).toContain('builtin/personality@1.0.0');
    expect(refs).toContain('builtin/schema@1.0.0');
  });

  // 15. deleteVersion() removes version, returns true
  test('deleteVersion() removes version, returns true', async () => {
    await store.publish(makePersonality({ version: '1.0.0' }), 'pub');
    await store.publish(makePersonality({ version: '2.0.0' }), 'pub');

    const deleted = await store.deleteVersion('test-aspect', '1.0.0');
    expect(deleted).toBe(true);

    const detail = await store.getAspect('test-aspect');
    expect(detail).not.toBeNull();
    expect(Object.keys(detail!.versions)).toEqual(['2.0.0']);

    // Deleting last version removes the aspect
    const deleted2 = await store.deleteVersion('test-aspect', '2.0.0');
    expect(deleted2).toBe(true);
    const gone = await store.getAspect('test-aspect');
    expect(gone).toBeNull();
  });

  // 16. deleteVersion() returns false for unknown
  test('deleteVersion() returns false for unknown', async () => {
    expect(await store.deleteVersion('nonexistent', '1.0.0')).toBe(false);

    await store.publish(makePersonality(), 'pub');
    expect(await store.deleteVersion('test-aspect', '9.9.9')).toBe(false);
  });
});
