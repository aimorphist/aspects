import { test, expect } from 'bun:test';
import {
  aspectSchema,
  isGeneralAspect,
  SchemaRegistry,
  BUILTIN_SCHEMAS,
  parseAspectJson,
  blake3HashAspect,
  MemoryStore,
} from '../../src/index';

test('core exports are accessible', () => {
  expect(aspectSchema).toBeDefined();
  expect(isGeneralAspect).toBeFunction();
  expect(SchemaRegistry).toBeFunction();
  expect(BUILTIN_SCHEMAS).toBeDefined();
  expect(parseAspectJson).toBeFunction();
  expect(blake3HashAspect).toBeFunction();
  expect(MemoryStore).toBeFunction();
});

test('MemoryStore is constructable from library export', () => {
  const store = new MemoryStore();
  expect(store).toBeDefined();
});
