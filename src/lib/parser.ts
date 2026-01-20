import { readFile } from 'node:fs/promises';
import { ZodError } from 'zod';
import { aspectSchema } from './schema';
import type { Aspect } from './types';

export type ParseResult =
  | {
      success: true;
      aspect: Aspect;
      warnings: string[];
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

  // Warn about missing recommended fields
  if (!('schemaVersion' in rawObj)) {
    warnings.push('Missing schemaVersion, defaulting to 1');
  }
  if (!('version' in rawObj)) {
    warnings.push('Missing version, defaulting to "0.0.0"');
  }

  const result = aspectSchema.safeParse(raw);

  if (!result.success) {
    return {
      success: false,
      errors: formatZodErrors(result.error),
    };
  }

  return {
    success: true,
    aspect: result.data as Aspect,
    warnings,
  };
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
