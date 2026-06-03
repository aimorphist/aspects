import personalityV1 from './builtin/personality.v1.json';
import schemaV1 from './builtin/schema.v1.json';

export const BUILTIN_SCHEMAS: Record<string, unknown> = {
  'builtin/personality@1.0.0': personalityV1,
  'builtin/schema@1.0.0': schemaV1,
};

export { personalityV1, schemaV1 };
