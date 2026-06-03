import { describe, test, expect } from 'bun:test';
import { parseAspectJson } from '../../src/lib/parser';
import { isLegacyAspect } from '../../src/lib/types';
import type { PersonalityAspect, SchemaAspect } from '../../src/lib/types';

const VALID_PERSONALITY = {
  schemaVersion: 1,
  name: 'pers-aspect',
  version: '1.0.0',
  displayName: 'Personality Test',
  tagline: 'A test personality aspect',
  category: 'assistant',
  prompt: 'You are a helpful assistant.',
};

const VALID_SCHEMA_BODY = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://aspects.sh/morphist/example-archiform@0.1.0',
  title: 'Example',
  type: 'object',
  properties: {
    nodes: { type: 'object' },
    edges: { type: 'object' },
  },
};

const VALID_SCHEMA_ASPECT = {
  schemaVersion: 1,
  kind: 'schema',
  name: 'example-archiform',
  publisher: 'morphist',
  version: '0.1.0',
  displayName: 'Example Archiform',
  tagline: 'A small illustrative archiform for tests',
  category: 'archiform',
  schema: VALID_SCHEMA_BODY,
};

describe('aspect kind back-compat', () => {
  test('personality aspect without kind parses unchanged (kind stays absent for hash compat)', () => {
    const result = parseAspectJson(JSON.stringify(VALID_PERSONALITY));
    expect(result.success).toBe(true);
    if (result.success) {
      // kind is left absent so the canonicalized form matches old hashes.
      expect(isLegacyAspect(result.aspect) && result.aspect.kind).toBeUndefined();
      // But it is still treated as a personality aspect — the prompt field is present.
      expect((result.aspect as { prompt?: string }).prompt).toBe('You are a helpful assistant.');
    }
  });

  test('explicit kind="personality" parses', () => {
    const result = parseAspectJson(JSON.stringify({ ...VALID_PERSONALITY, kind: 'personality' }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(isLegacyAspect(result.aspect) && result.aspect.kind).toBe('personality');
    }
  });

  test('extendsSchema pointer (publisher/name@version) round-trips', () => {
    const aspect = { ...VALID_PERSONALITY, extendsSchema: 'morphist/example-archiform@0.1.0' };
    const result = parseAspectJson(JSON.stringify(aspect));
    expect(result.success).toBe(true);
    if (result.success && isLegacyAspect(result.aspect) && result.aspect.kind !== 'schema') {
      expect(result.aspect.extendsSchema).toBe('morphist/example-archiform@0.1.0');
    }
  });

  test('extendsSchema pointer (blake3:hash) accepted', () => {
    const aspect = { ...VALID_PERSONALITY, extendsSchema: 'blake3:abc123XYZ' };
    const result = parseAspectJson(JSON.stringify(aspect));
    expect(result.success).toBe(true);
  });

  test('rejects malformed extendsSchema', () => {
    const aspect = { ...VALID_PERSONALITY, extendsSchema: 'not a valid ref' };
    const result = parseAspectJson(JSON.stringify(aspect));
    expect(result.success).toBe(false);
  });
});

describe('schema-aspect kind', () => {
  test('parses a valid schema-aspect', () => {
    const result = parseAspectJson(JSON.stringify(VALID_SCHEMA_ASPECT));
    expect(result.success).toBe(true);
    if (result.success && isLegacyAspect(result.aspect) && result.aspect.kind === 'schema') {
      expect(result.aspect.schema.$id).toBe('https://aspects.sh/morphist/example-archiform@0.1.0');
      expect((result.aspect.schema as { title: string }).title).toBe('Example');
    }
  });

  test('rejects schema-aspect missing schema body', () => {
    const { schema, ...rest } = VALID_SCHEMA_ASPECT;
    const result = parseAspectJson(JSON.stringify(rest));
    expect(result.success).toBe(false);
  });

  test('rejects schema body that is not a JSON object', () => {
    const result = parseAspectJson(
      JSON.stringify({ ...VALID_SCHEMA_ASPECT, schema: 'not an object' }),
    );
    expect(result.success).toBe(false);
  });

  test('rejects structurally invalid JSON Schema (bogus type)', () => {
    const result = parseAspectJson(
      JSON.stringify({
        ...VALID_SCHEMA_ASPECT,
        schema: { type: 'notAValidType' },
      }),
    );
    expect(result.success).toBe(false);
  });

  test('rejects oversize schema body', () => {
    const huge = 'x'.repeat(250_000);
    const result = parseAspectJson(
      JSON.stringify({
        ...VALID_SCHEMA_ASPECT,
        schema: { type: 'object', description: huge },
      }),
    );
    expect(result.success).toBe(false);
  });

  test('schema-aspect does not require prompt', () => {
    // Sanity: confirms the discriminator routes to the schema branch
    // without falling back to personality validation.
    const result = parseAspectJson(JSON.stringify(VALID_SCHEMA_ASPECT));
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.aspect as { prompt?: string }).prompt).toBeUndefined();
    }
  });
});
