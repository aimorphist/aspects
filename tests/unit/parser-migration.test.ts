import { describe, test, expect } from 'bun:test';
import { parseAspectJson, migrateToGeneral } from '../../src/lib/parser';
import { isGeneralAspect, isLegacyAspect } from '../../src/lib/types';

const PERSONALITY_ASPECT = {
  schemaVersion: 1,
  name: 'test-personality',
  version: '1.0.0',
  displayName: 'Test Personality',
  tagline: 'A test personality aspect',
  category: 'assistant',
  publisher: 'test',
  prompt: 'You are a helpful test assistant.',
  voiceHints: { speed: 'normal' as const, emotions: ['calm'] },
};

const SCHEMA_ASPECT = {
  schemaVersion: 1,
  kind: 'schema' as const,
  name: 'test-archiform',
  version: '0.1.0',
  displayName: 'Test Archiform',
  tagline: 'A test schema aspect',
  category: 'archiform',
  publisher: 'test',
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { nodes: { type: 'object' } },
  },
};

const GENERAL_ASPECT = {
  schemaVersion: 1,
  name: 'test-general',
  version: '1.0.0',
  displayName: 'Test General',
  tagline: 'A general-purpose test aspect',
  category: 'assistant',
  publisher: 'test',
  implements: ['builtin/personality@1.0.0'],
  data: { prompt: 'You are a general test assistant.' },
};

describe('migrateToGeneral', () => {
  test('converts a personality aspect to general format', () => {
    const result = parseAspectJson(JSON.stringify(PERSONALITY_ASPECT));
    expect(result.success).toBe(true);
    if (!result.success) return;

    const migrated = migrateToGeneral(result.aspect);
    expect(isGeneralAspect(migrated)).toBe(true);
    expect(migrated.implements).toEqual(['builtin/personality@1.0.0']);
    expect((migrated.data as Record<string, unknown>).prompt).toBe(PERSONALITY_ASPECT.prompt);
    expect((migrated.data as Record<string, unknown>).voiceHints).toEqual(PERSONALITY_ASPECT.voiceHints);
    // Envelope fields preserved
    expect(migrated.name).toBe('test-personality');
    expect(migrated.displayName).toBe('Test Personality');
  });

  test('converts a schema aspect to general format', () => {
    const result = parseAspectJson(JSON.stringify(SCHEMA_ASPECT));
    expect(result.success).toBe(true);
    if (!result.success) return;

    const migrated = migrateToGeneral(result.aspect);
    expect(isGeneralAspect(migrated)).toBe(true);
    expect(migrated.implements).toEqual(['builtin/schema@1.0.0']);
    expect((migrated.data as Record<string, unknown>).schema).toEqual(SCHEMA_ASPECT.schema);
    expect(migrated.name).toBe('test-archiform');
  });

  test('is a no-op on a GeneralAspect', () => {
    const result = parseAspectJson(JSON.stringify(GENERAL_ASPECT));
    expect(result.success).toBe(true);
    if (!result.success) return;

    const migrated = migrateToGeneral(result.aspect);
    expect(JSON.stringify(migrated)).toBe(JSON.stringify(result.aspect));
  });
});

describe('ParseResult.isLegacy', () => {
  test('legacy personality aspects set isLegacy=true', () => {
    const result = parseAspectJson(JSON.stringify(PERSONALITY_ASPECT));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.isLegacy).toBe(true);
  });

  test('legacy schema aspects set isLegacy=true', () => {
    const result = parseAspectJson(JSON.stringify(SCHEMA_ASPECT));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.isLegacy).toBe(true);
  });

  test('new-format aspects with implements set isLegacy=false', () => {
    const result = parseAspectJson(JSON.stringify(GENERAL_ASPECT));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.isLegacy).toBe(false);
  });
});

describe('legacy aspects still parse as legacy (not auto-converted)', () => {
  test('personality aspect parses without implements field', () => {
    const result = parseAspectJson(JSON.stringify(PERSONALITY_ASPECT));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(isLegacyAspect(result.aspect)).toBe(true);
    expect((result.aspect as any).implements).toBeUndefined();
    expect((result.aspect as any).prompt).toBe(PERSONALITY_ASPECT.prompt);
  });

  test('schema aspect parses without implements field', () => {
    const result = parseAspectJson(JSON.stringify(SCHEMA_ASPECT));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(isLegacyAspect(result.aspect)).toBe(true);
    expect((result.aspect as any).implements).toBeUndefined();
    expect((result.aspect as any).kind).toBe('schema');
  });
});
