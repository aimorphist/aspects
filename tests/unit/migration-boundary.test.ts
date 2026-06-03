/**
 * Migration boundary tests.
 *
 * These tests lock in current behavior so that the upcoming migration from
 * implicit personality kind to an explicit `implements` field can be verified
 * to not silently alter hashes or break parsing of existing live aspects.
 *
 * Golden hashes were captured from live fixtures on 2026-06-03 and MUST NOT
 * change after migration.
 */
import { describe, test, expect } from 'bun:test';
import { parseAspectJson } from '../../src/lib/parser';
import { blake3HashAspect, canonicalizeAspect, blake3Hash } from '../../src/utils/hash';
import { isLegacyAspect } from '../../src/lib/types';

// ---------------------------------------------------------------------------
// Fixtures — content of the live-aspects fixture files
// ---------------------------------------------------------------------------

const JOBU_TUPAKI = await Bun.file(
  new URL('../fixtures/live-aspects/jobu-tupaki-1.0.1.json', import.meta.url),
).text();

const MINIMAL = await Bun.file(
  new URL('../fixtures/live-aspects/minimal-1.0.0.json', import.meta.url),
).text();

const RILEY = await Bun.file(
  new URL('../fixtures/live-aspects/riley-1.0.0.json', import.meta.url),
).text();

// ---------------------------------------------------------------------------
// Golden hashes — captured from parsed aspects, sorted keys, blake3/base58.
// These values MUST remain unchanged through any migration.
// ---------------------------------------------------------------------------

const GOLDEN_HASHES: Record<string, string> = {
  'jobu-tupaki-1.0.1': '819eoLoywd8TNGbTPJqbeDqv9U8k8ECLqGHzQptcCEwL',
  'minimal-1.0.0':     'EEitwofJBpJvXLyUrTaq9Nx4fa6NpibaTidx8JRFKmX7',
  'riley-1.0.0':       '3eqaUqrQ61W8dw7Hoj7AoZ9reGafaPuAk3DRQxi3y2nT',
};

// ---------------------------------------------------------------------------
// 1. Hash stability
// ---------------------------------------------------------------------------

describe('hash stability', () => {
  const fixtures: Array<[string, string]> = [
    ['jobu-tupaki-1.0.1', JOBU_TUPAKI],
    ['minimal-1.0.0',     MINIMAL],
    ['riley-1.0.0',       RILEY],
  ];

  for (const [fixtureName, content] of fixtures) {
    test(`${fixtureName} hash matches golden value`, () => {
      const result = parseAspectJson(content);
      expect(result.success).toBe(true);
      if (!result.success) return;
      const hash = blake3HashAspect(result.aspect);
      expect(hash).toBe(GOLDEN_HASHES[fixtureName]!);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Legacy format detection — no `implements`, has `prompt`
// ---------------------------------------------------------------------------

describe('legacy format detection', () => {
  test('aspect without implements and with prompt is detected as legacy personality', () => {
    const result = parseAspectJson(JOBU_TUPAKI);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const aspect = result.aspect as unknown as Record<string, unknown>;
    // Legacy personality: has prompt, no implements field
    expect(typeof aspect.prompt).toBe('string');
    expect(aspect.implements).toBeUndefined();
  });

  test('all live fixtures are detected as legacy personality format', () => {
    for (const content of [JOBU_TUPAKI, MINIMAL, RILEY]) {
      const result = parseAspectJson(content);
      expect(result.success).toBe(true);
      if (!result.success) return;
      const aspect = result.aspect as unknown as Record<string, unknown>;
      expect(typeof aspect.prompt).toBe('string');
      expect(aspect.implements).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Legacy format with explicit kind field
// ---------------------------------------------------------------------------

describe('legacy format with explicit kind', () => {
  const BASE_PERSONALITY = {
    schemaVersion: 1,
    name: 'explicit-kind-test',
    version: '1.0.0',
    displayName: 'Explicit Kind Test',
    tagline: 'Testing explicit kind field behavior',
    category: 'assistant',
    publisher: 'test',
    prompt: 'You are a test assistant for verifying kind field handling.',
  };

  const BASE_SCHEMA = {
    schemaVersion: 1,
    kind: 'schema' as const,
    name: 'test-archiform',
    version: '0.1.0',
    displayName: 'Test Archiform',
    tagline: 'A test schema aspect for kind detection',
    category: 'archiform',
    publisher: 'test',
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { nodes: { type: 'object' } },
    },
  };

  test('kind="personality" is parsed and detected correctly', () => {
    const result = parseAspectJson(
      JSON.stringify({ ...BASE_PERSONALITY, kind: 'personality' }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(isLegacyAspect(result.aspect) && result.aspect.kind).toBe('personality');
    expect((result.aspect as unknown as Record<string, unknown>).prompt).toBeDefined();
  });

  test('kind="schema" is parsed and detected correctly', () => {
    const result = parseAspectJson(JSON.stringify(BASE_SCHEMA));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(isLegacyAspect(result.aspect) && result.aspect.kind).toBe('schema');
    expect((result.aspect as unknown as Record<string, unknown>).schema).toBeDefined();
    expect((result.aspect as unknown as Record<string, unknown>).prompt).toBeUndefined();
  });

  test('absent kind is treated as implicit personality (kind stays undefined)', () => {
    const result = parseAspectJson(JSON.stringify(BASE_PERSONALITY));
    expect(result.success).toBe(true);
    if (!result.success) return;
    // kind absent from input stays absent in parsed output — hash compat
    expect(isLegacyAspect(result.aspect) && result.aspect.kind).toBeUndefined();
    expect((result.aspect as unknown as Record<string, unknown>).prompt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4. New format detection (future: implements + data)
// ---------------------------------------------------------------------------

describe('new format detection (future implements field)', () => {
  test.todo(
    'aspect with implements=["builtin/personality@1.0.0"] and data={} is detected as new format',
    () => {},
  );

  test.todo(
    'new format aspects with implements field round-trip without altering hash',
    () => {},
  );
});

// ---------------------------------------------------------------------------
// 5. Round-trip invariant
// ---------------------------------------------------------------------------

describe('round-trip invariant', () => {
  const fixtures: Array<[string, string]> = [
    ['jobu-tupaki-1.0.1', JOBU_TUPAKI],
    ['minimal-1.0.0',     MINIMAL],
    ['riley-1.0.0',       RILEY],
  ];

  for (const [fixtureName, content] of fixtures) {
    test(`${fixtureName}: parsed aspect hash matches raw file canonical hash`, () => {
      const result = parseAspectJson(content);
      expect(result.success).toBe(true);
      if (!result.success) return;

      // Hash of the parsed+serialized aspect
      const parsedHash = blake3HashAspect(result.aspect);

      // Hash of the raw JSON file content canonicalized (sorted keys)
      const rawCanonicalHash = blake3Hash(canonicalizeAspect(JSON.parse(content)));

      expect(parsedHash).toBe(rawCanonicalHash);
    });
  }
});
