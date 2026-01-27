import { describe, test, expect } from 'bun:test';
import { parseAspectJson } from '../../src/lib/parser';

const VALID_ASPECT = {
  schemaVersion: 1,
  name: 'test-aspect',
  version: '1.0.0',
  displayName: 'Test Aspect',
  tagline: 'A test aspect for unit testing',
  category: 'assistant',
  prompt: 'You are a test assistant.',
};

describe('parseAspectJson', () => {
  test('parses valid aspect JSON', () => {
    const result = parseAspectJson(JSON.stringify(VALID_ASPECT));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.aspect.name).toBe('test-aspect');
      expect(result.aspect.version).toBe('1.0.0');
      expect(result.aspect.displayName).toBe('Test Aspect');
    }
  });

  test('warns about missing schemaVersion', () => {
    const { schemaVersion, ...rest } = VALID_ASPECT;
    const result = parseAspectJson(JSON.stringify(rest));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.warnings).toContain('Missing schemaVersion, defaulting to 1');
    }
  });

  test('warns about missing version', () => {
    const { version, ...rest } = VALID_ASPECT;
    const result = parseAspectJson(JSON.stringify(rest));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.warnings).toContain('Missing version, defaulting to "0.0.0"');
    }
  });

  test('fails on invalid JSON', () => {
    const result = parseAspectJson('not valid json');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]).toMatch(/Invalid JSON/);
    }
  });

  test('fails on non-object JSON', () => {
    const result = parseAspectJson('"just a string"');
    expect(result.success).toBe(false);
  });

  test('fails when required fields are missing', () => {
    const result = parseAspectJson(JSON.stringify({ name: 'x' }));
    expect(result.success).toBe(false);
  });

  test('fails on name exceeding 50 chars', () => {
    const result = parseAspectJson(JSON.stringify({
      ...VALID_ASPECT,
      name: 'a'.repeat(51),
    }));
    expect(result.success).toBe(false);
  });

  test('accepts all valid categories', () => {
    const categories = [
      'assistant', 'roleplay', 'creative', 'productivity',
      'education', 'gaming', 'spiritual', 'pundit', 'guide',
    ];
    for (const category of categories) {
      const result = parseAspectJson(JSON.stringify({ ...VALID_ASPECT, category }));
      expect(result.success).toBe(true);
    }
  });

  test('parses aspect with optional fields', () => {
    const full = {
      ...VALID_ASPECT,
      author: 'Test Author',
      publisher: 'test-publisher',
      tags: ['test', 'unit'],
      license: 'MIT',
    };
    const result = parseAspectJson(JSON.stringify(full));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.aspect.author).toBe('Test Author');
      expect(result.aspect.tags).toEqual(['test', 'unit']);
    }
  });
});
