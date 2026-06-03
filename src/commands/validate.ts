import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { aspectSchema, OFFICIAL_CATEGORIES, type PersonalityAspectFromSchema, type SchemaAspectFromSchema } from "../lib/schema";
import { findInstalledAspect } from "../lib/config";
import { findProjectRoot, getAspectPath } from "../utils/paths";
import { c } from "../utils/colors";
import { isGeneralAspect } from "../lib/types";
import { getSchemaRegistry } from "../lib/schema-registry";

export default defineCommand({
  meta: {
    name: "validate",
    description: `Validate an aspect.json file against the schema.

Checks:
  - Required fields (name, displayName, tagline, category, prompt)
  - Field length limits
  - Category is valid
  - Directive/instruction structure
  - Mode references valid directives

Examples:
  aspects validate                 Validate in current directory
  aspects validate ./my-aspect     Validate specific path
  aspects validate --strict        Stricter checks
  aspects validate --security      Scan for prompt injection patterns

Security scan flags patterns like:
  - "ignore previous instructions"
  - Requests for passwords or financial info
  - Known jailbreak attempts`,
  },
  args: {
    path: {
      type: "positional",
      description: "Path to aspect directory or aspect.json",
      required: false,
    },
    strict: {
      type: "boolean",
      description: "Enable stricter validation checks",
      default: false,
    },
    security: {
      type: "boolean",
      description: "Scan for suspicious patterns",
      default: false,
    },
  },
  async run({ args }) {
    p.intro("🔍 Validate aspect");

    // Determine path
    let aspectPath = args.path || process.cwd();

    // If directory, look for aspect.json
    try {
      const stats = await stat(aspectPath);
      if (stats.isDirectory()) {
        aspectPath = join(aspectPath, "aspect.json");
      }
    } catch {
      // Not a valid path - maybe it's an installed aspect name?
      if (args.path) {
        const projectRoot = await findProjectRoot() || undefined;
        const installed = await findInstalledAspect(args.path, projectRoot);
        
        if (installed.length > 0) {
          const match = installed.find(i => i.scope === 'project') || installed[0]!;
          aspectPath = join(getAspectPath(args.path, match.scope, projectRoot), 'aspect.json');
          p.log.info(`Found installed: ${c.aspect(args.path)} ${c.dim(`[${match.scope}]`)}`);
        } else {
          p.log.error(`Path not found: ${aspectPath}`);
          process.exit(1);
        }
      } else {
        p.log.error(`Path not found: ${aspectPath}`);
        process.exit(1);
      }
    }

    // Read the file
    let content: string;
    try {
      content = await readFile(aspectPath, "utf-8");
    } catch {
      p.log.error(`Cannot read file: ${aspectPath}`);
      process.exit(1);
    }

    // Parse JSON
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch (err) {
      p.log.error("Invalid JSON");
      if (err instanceof Error) {
        p.log.error(err.message);
      }
      process.exit(1);
    }

    // Validate against schema
    const result = aspectSchema.safeParse(data);

    if (!result.success) {
      p.log.error("✗ Invalid aspect.json");
      p.log.info("");

      for (const issue of result.error.issues) {
        const path = issue.path.join(".");
        p.log.error(`  • ${path ? `${path}: ` : ""}${issue.message}`);
      }

      process.exit(1);
    }

    const aspect = result.data;
    const isGeneral = 'implements' in aspect;
    const isSchema = !isGeneral && 'kind' in aspect && aspect.kind === 'schema';
    const kindLabel = isGeneral ? 'general' : (isSchema ? 'schema' : 'personality');

    // Basic validation passed
    const checks: Array<{ label: string; passed: boolean; message?: string }> =
      [
        { label: "Required fields present", passed: true },
        { label: "Schema version valid", passed: aspect.schemaVersion === 1 },
        { label: `Kind: ${kindLabel}`, passed: true },
        {
          // Schema already enforces format (alphanumeric + hyphens, 2-20 chars).
          // Custom categories are allowed; OFFICIAL_CATEGORIES is just a hint.
          label: (OFFICIAL_CATEGORIES as readonly string[]).includes(aspect.category)
            ? "Category (official)"
            : `Category (custom: "${aspect.category}")`,
          passed: true,
        },
      ];

    if (isGeneral) {
      checks.push({ label: "Implements declared", passed: true });
      const generalAspect = aspect as any;
      for (const ref of generalAspect.implements) {
        checks.push({ label: `Implements: ${ref}`, passed: true });
      }
      // Validate data against declared schemas
      const registry = getSchemaRegistry();
      const schemaResult = registry.validate(generalAspect);
      checks.push({
        label: "Data validates against declared schemas",
        passed: schemaResult.valid,
        message: schemaResult.valid ? undefined : schemaResult.errors.join('; '),
      });
    } else if (!isSchema) {
      const personality = aspect as PersonalityAspectFromSchema;
      checks.push({ label: "Prompt not empty", passed: personality.prompt.length > 0 });
    } else {
      // Schema body well-formedness was already checked by Zod via ajv.
      checks.push({ label: "Schema body is valid JSON Schema", passed: true });
    }

    // Strict mode checks
    if (args.strict) {
      // Check name format
      const validName = /^[a-z0-9-]+$/.test(aspect.name);
      checks.push({
        label: "Name format (lowercase, hyphens)",
        passed: validName,
        message: validName ? undefined : `Got: "${aspect.name}"`,
      });

      // Check version format
      const validVersion = /^\d+\.\d+\.\d+/.test(aspect.version);
      checks.push({
        label: "Semver version format",
        passed: validVersion,
        message: validVersion ? undefined : `Got: "${aspect.version}"`,
      });

      if (isGeneral) {
        // General aspects: no strict personality/schema checks yet
      } else if (!isSchema) {
        const personality = aspect as PersonalityAspectFromSchema;
        const promptLength = personality.prompt.length;
        const promptOk = promptLength >= 100;
        checks.push({
          label: "Prompt length (min 100 chars)",
          passed: promptOk,
          message: promptOk ? undefined : `Got: ${promptLength} chars`,
        });
        checks.push({
          label: "Voice hints present",
          passed: !!personality.voiceHints,
        });
      } else {
        const schema = aspect as SchemaAspectFromSchema;
        const body = schema.schema as Record<string, unknown>;
        const has$id = typeof body.$id === 'string';
        const hasTitle = typeof body.title === 'string';
        checks.push({ label: "Schema has $id", passed: has$id });
        checks.push({ label: "Schema has title", passed: hasTitle });
      }
    }

    // Security scan (personality only — schema/general bodies have no prompt text)
    if (args.security && !isSchema && !isGeneral) {
      const personality = aspect as PersonalityAspectFromSchema;
      const suspiciousPatterns = [
        { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, name: "Ignore previous instructions" },
        { pattern: /you\s+are\s+now\s+DAN/i, name: "DAN jailbreak" },
        { pattern: /forget\s+(everything|all|your)\s+(you|instructions)/i, name: "Forget instructions" },
        { pattern: /password|api[_\s]?key|secret[_\s]?key|credentials/i, name: "Credential request" },
        { pattern: /credit\s*card|ssn|social\s*security/i, name: "Sensitive data request" },
        { pattern: /\[system\]|\[admin\]|\[root\]/i, name: "System role injection" },
      ];

      for (const { pattern, name } of suspiciousPatterns) {
        const found = pattern.test(personality.prompt);
        checks.push({
          label: `No "${name}" pattern`,
          passed: !found,
          message: found ? "⚠️  Suspicious pattern detected" : undefined,
        });
      }
    }

    // Display results
    p.log.success(`✓ Valid aspect.json (schema v${aspect.schemaVersion})`);
    p.log.info(`  Name:     ${aspect.name}`);
    p.log.info(`  Version:  ${aspect.version}`);
    p.log.info("");

    const allPassed = checks.every((c) => c.passed);

    p.log.info("Checks:");
    for (const check of checks) {
      const icon = check.passed ? "✓" : "✗";
      const msg = check.message ? ` - ${check.message}` : "";
      if (check.passed) {
        p.log.success(`  ${icon} ${check.label}${msg}`);
      } else {
        p.log.error(`  ${icon} ${check.label}${msg}`);
      }
    }

    if (!allPassed) {
      p.log.info("");
      p.log.warn("Some checks failed. Review the issues above.");
      process.exit(1);
    }

    p.outro("Validation complete ✓");
  },
});
