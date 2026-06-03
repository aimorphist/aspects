import { Ajv2020 } from "ajv/dist/2020.js";
import { BUILTIN_SCHEMAS } from "../schemas/index";
import type { Aspect, GeneralAspect } from "./types";
import { isGeneralAspect } from "./types";

export interface SchemaDefinition {
  id: string;           // e.g. "builtin/personality@1.0.0"
  schema: unknown;      // The JSON Schema document
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Schema registry — resolves schema refs and validates aspect data.
 *
 * Phase 1: only built-in schemas, resolved from bundled files.
 * Future: user-published schemas resolved via API with local cache.
 */
export class SchemaRegistry {
  private ajv: Ajv2020;
  private schemas: Map<string, unknown>;

  constructor() {
    this.ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
    this.schemas = new Map();

    // Load built-in schemas
    for (const [ref, schema] of Object.entries(BUILTIN_SCHEMAS)) {
      this.schemas.set(ref, schema);
    }
  }

  /** Check if a schema ref can be resolved */
  has(ref: string): boolean {
    return this.schemas.has(ref);
  }

  /** Get a schema definition by ref */
  get(ref: string): unknown | null {
    return this.schemas.get(ref) ?? null;
  }

  /** Register a user schema (for future use) */
  register(ref: string, schema: unknown): void {
    this.schemas.set(ref, schema);
  }

  /** List all known schema refs */
  list(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Validate a GeneralAspect's data against ALL its declared schemas.
   * Returns valid only if data passes all schema validations.
   */
  validateData(aspect: GeneralAspect): ValidationResult {
    const errors: string[] = [];

    for (const ref of aspect.implements) {
      const schema = this.schemas.get(ref);
      if (!schema) {
        errors.push(`Unknown schema: ${ref}`);
        continue;
      }

      try {
        const validate = this.ajv.compile(schema as object);
        const valid = validate(aspect.data);
        if (!valid && validate.errors) {
          for (const err of validate.errors) {
            errors.push(`[${ref}] ${err.instancePath || '/'}: ${err.message}`);
          }
        }
      } catch (e) {
        errors.push(`[${ref}] Schema compilation error: ${(e as Error).message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate any aspect. For GeneralAspects, validates data against schemas.
   * For legacy aspects, returns valid (they're validated by Zod already).
   */
  validate(aspect: Aspect): ValidationResult {
    if (!isGeneralAspect(aspect)) {
      return { valid: true, errors: [] };
    }
    return this.validateData(aspect);
  }
}

/** Singleton instance for convenience */
let _registry: SchemaRegistry | null = null;

export function getSchemaRegistry(): SchemaRegistry {
  if (!_registry) {
    _registry = new SchemaRegistry();
  }
  return _registry;
}
