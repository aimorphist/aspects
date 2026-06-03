// --- Core types ---
export type {
  Aspect,
  GeneralAspect,
  PersonalityAspect,
  SchemaAspect,
  LegacyAspect,
  AspectKind,
  AspectSummary,
  InstalledAspect,
} from './lib/types';

export {
  isGeneralAspect,
  isLegacyAspect,
  isPersonalityAspect,
} from './lib/types';

// --- Validation schemas ---
export {
  aspectSchema,
  personalityAspectSchema,
  schemaAspectSchema,
  generalAspectSchema,
  OFFICIAL_CATEGORIES,
  FIELD_LIMITS,
} from './lib/schema';

// --- Schema registry ---
export {
  SchemaRegistry,
  getSchemaRegistry,
} from './lib/schema-registry';

export type { ValidationResult } from './lib/schema-registry';

// --- Built-in schemas ---
export { BUILTIN_SCHEMAS } from './schemas/index';

// --- Parser ---
export {
  parseAspectFile,
  parseAspectJson,
  migrateToGeneral,
} from './lib/parser';

export type { ParseResult } from './lib/parser';

// --- Canonical hashing ---
export {
  blake3HashDCBOR,
  encodeDCBOR,
  decodeDCBOR,
} from './lib/canonical';

export {
  blake3HashAspect,
  blake3HashAspectCanonical,
  canonicalizeAspect,
} from './utils/hash';

// --- Envelope (Gordian Envelope integration) ---
export {
  wrapAspect,
  unwrapAspect,
  envelopeDigest,
  elideFields,
  verifyElision,
} from './lib/envelope';

// --- Store ---
export type {
  AspectStore,
  PublishResult,
  SearchParams,
  SearchResult,
  AspectDetail,
  StoredSchema,
} from './store/types';

export { MemoryStore } from './store/memory';
