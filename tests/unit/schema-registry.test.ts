import { describe, test, expect } from 'bun:test';
import { SchemaRegistry, getSchemaRegistry } from '../../src/lib/schema-registry';
import type { GeneralAspect, PersonalityAspect } from '../../src/lib/types';

const BASE_FIELDS = {
  schemaVersion: 1,
  name: 'test-aspect',
  version: '1.0.0',
  displayName: 'Test Aspect',
  tagline: 'A test aspect for validation',
  category: 'assistant',
};

function makeGeneralAspect(impls: string[], data: unknown): GeneralAspect {
  return {
    ...BASE_FIELDS,
    implements: impls,
    data,
  };
}

describe('SchemaRegistry', () => {
  test('built-in schemas are loaded on construction', () => {
    const registry = new SchemaRegistry();
    expect(registry.has('builtin/personality@1.0.0')).toBe(true);
    expect(registry.has('builtin/schema@1.0.0')).toBe(true);
  });

  test('has() returns false for unknown refs', () => {
    const registry = new SchemaRegistry();
    expect(registry.has('nonexistent/foo@1.0.0')).toBe(false);
  });

  test('list() returns both built-in refs', () => {
    const registry = new SchemaRegistry();
    const refs = registry.list();
    expect(refs).toContain('builtin/personality@1.0.0');
    expect(refs).toContain('builtin/schema@1.0.0');
    expect(refs.length).toBe(2);
  });

  test('validateData() passes for valid personality data', () => {
    const registry = new SchemaRegistry();
    const aspect = makeGeneralAspect(['builtin/personality@1.0.0'], {
      prompt: 'You are a helpful assistant that speaks clearly and concisely.',
    });
    const result = registry.validateData(aspect);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('validateData() fails for personality data missing required prompt', () => {
    const registry = new SchemaRegistry();
    const aspect = makeGeneralAspect(['builtin/personality@1.0.0'], {});
    const result = registry.validateData(aspect);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('prompt'))).toBe(true);
  });

  test('validateData() passes for valid schema data', () => {
    const registry = new SchemaRegistry();
    const aspect = makeGeneralAspect(['builtin/schema@1.0.0'], {
      schema: {
        type: 'object',
        properties: { name: { type: 'string' } },
      },
    });
    const result = registry.validateData(aspect);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('validateData() fails for schema data missing required schema', () => {
    const registry = new SchemaRegistry();
    const aspect = makeGeneralAspect(['builtin/schema@1.0.0'], {});
    const result = registry.validateData(aspect);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('schema'))).toBe(true);
  });

  test('validateData() reports unknown schema ref as error', () => {
    const registry = new SchemaRegistry();
    const aspect = makeGeneralAspect(['nonexistent/foo@1.0.0'], { anything: true });
    const result = registry.validateData(aspect);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['Unknown schema: nonexistent/foo@1.0.0']);
  });

  test('validate() passes for legacy aspects (no-op)', () => {
    const registry = new SchemaRegistry();
    const legacy: PersonalityAspect = {
      ...BASE_FIELDS,
      prompt: 'You are a helpful assistant that speaks clearly.',
    };
    const result = registry.validate(legacy);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('register() allows adding custom schemas that then validate', () => {
    const registry = new SchemaRegistry();
    const customSchema = {
      type: 'object',
      required: ['greeting'],
      properties: {
        greeting: { type: 'string' },
      },
      additionalProperties: false,
    };
    registry.register('custom/greeter@1.0.0', customSchema);
    expect(registry.has('custom/greeter@1.0.0')).toBe(true);

    // Valid data
    const valid = makeGeneralAspect(['custom/greeter@1.0.0'], { greeting: 'hello' });
    expect(registry.validateData(valid).valid).toBe(true);

    // Invalid data — missing required field
    const invalid = makeGeneralAspect(['custom/greeter@1.0.0'], {});
    const result = registry.validateData(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('greeting'))).toBe(true);
  });

  test('getSchemaRegistry() returns a singleton', () => {
    const a = getSchemaRegistry();
    const b = getSchemaRegistry();
    expect(a).toBe(b);
  });
});
