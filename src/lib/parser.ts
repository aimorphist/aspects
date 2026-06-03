import { readFile } from 'node:fs/promises';
import { ZodError } from 'zod';
import { aspectSchema } from './schema';
import { isLegacyAspect, type Aspect, type GeneralAspect, type LegacyAspect } from './types';

export type ParseResult =
  | {
      success: true;
      aspect: Aspect;
      warnings: string[];
      /** true if the parsed aspect is in legacy format (PersonalityAspect | SchemaAspect) */
      isLegacy: boolean;
    }
  | {
      success: false;
      errors: string[];
    };

/**
 * Parse and validate an aspect.json file.
 */
export async function parseAspectFile(filePath: string): Promise<ParseResult> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { success: false, errors: [`File not found: ${filePath}`] };
    }
    return { success: false, errors: [`Failed to read file: ${(err as Error).message}`] };
  }

  return parseAspectJson(content);
}

/**
 * Parse and validate aspect JSON content.
 */
export function parseAspectJson(content: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (err) {
    return { success: false, errors: [`Invalid JSON: ${(err as Error).message}`] };
  }

  if (typeof raw !== 'object' || raw === null) {
    return { success: false, errors: ['aspect.json must be a JSON object'] };
  }

  const warnings: string[] = [];
  const rawObj = raw as Record<string, unknown>;

  // Default missing recommended fields
  if (!('schemaVersion' in rawObj)) {
    warnings.push('Missing schemaVersion, defaulting to 1');
    rawObj.schemaVersion = 1;
  }
  if (!('version' in rawObj)) {
    warnings.push('Missing version, defaulting to "0.0.0"');
  }
  // `kind` defaults to "personality" for back-compat with aspects authored
  // before the discriminator existed. Silent — no warning — because every
  // pre-existing personality aspect would otherwise get noisy.
  // Note: this default lives in the schema's preprocess step too; we don't
  // mutate rawObj here so the on-disk canonical hash is preserved.

  const result = aspectSchema.safeParse(rawObj);

  if (!result.success) {
    return {
      success: false,
      errors: formatZodErrors(result.error),
    };
  }

  const aspect = result.data as Aspect;
  return {
    success: true,
    aspect,
    warnings,
    isLegacy: isLegacyAspect(aspect),
  };
}

/**
 * Convert a legacy aspect to the general format.
 * This is a LOSSY transformation for hashing purposes —
 * the GeneralAspect will produce a different blake3 hash.
 * Use only for in-memory processing, not for hash computation.
 */
export function migrateToGeneral(aspect: Aspect): GeneralAspect {
  if (!isLegacyAspect(aspect)) return aspect as GeneralAspect;

  const {
    schemaVersion, name, publisher, version, displayName,
    tagline, category, tags, icon, author, license, ...rest
  } = aspect;

  const envelope: Record<string, unknown> = {
    schemaVersion, name, publisher, version, displayName,
    tagline, category, tags, icon, author, license,
  };
  // Strip undefined values from envelope
  for (const key of Object.keys(envelope)) {
    if (envelope[key] === undefined) delete envelope[key];
  }

  if ('kind' in rest && rest.kind === 'schema') {
    const { kind, schema, ...extra } = rest as LegacyAspect & { kind: 'schema'; schema: Record<string, unknown> };
    return {
      ...envelope,
      implements: ['builtin/schema@1.0.0'],
      data: { schema, ...extra },
    } as GeneralAspect;
  }

  // Personality aspect
  const { kind, prompt, voiceHints, extendsSchema, modes, directives, instructions, ...extra } = rest as any;
  const data: Record<string, unknown> = { prompt };
  if (voiceHints) data.voiceHints = voiceHints;
  if (extendsSchema) data.extendsSchema = extendsSchema;
  if (modes) data.modes = modes;
  if (directives) data.directives = directives;
  if (instructions) data.instructions = instructions;
  Object.assign(data, extra);

  return {
    ...envelope,
    implements: ['builtin/personality@1.0.0'],
    data,
  } as GeneralAspect;
}

/**
 * Format Zod errors into readable messages.
 */
function formatZodErrors(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
    return `${path}: ${issue.message}`;
  });
}
