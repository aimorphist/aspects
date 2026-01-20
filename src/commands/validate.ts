import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { aspectSchema, OFFICIAL_CATEGORIES } from "../lib/schema";

export default defineCommand({
  meta: {
    name: "validate",
    description: "Validate an aspect.json file against the schema",
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
      p.log.error(`Path not found: ${aspectPath}`);
      process.exit(1);
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

    // Basic validation passed
    const checks: Array<{ label: string; passed: boolean; message?: string }> =
      [
        { label: "Required fields present", passed: true },
        { label: "Schema version valid", passed: aspect.schemaVersion === 1 },
        {
          label: "Category valid",
          passed: OFFICIAL_CATEGORIES.includes(aspect.category),
        },
        { label: "Prompt not empty", passed: aspect.prompt.length > 0 },
      ];

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

      // Check prompt length
      const promptLength = aspect.prompt.length;
      const promptOk = promptLength >= 100;
      checks.push({
        label: "Prompt length (min 100 chars)",
        passed: promptOk,
        message: promptOk ? undefined : `Got: ${promptLength} chars`,
      });

      // Check for voice hints
      checks.push({
        label: "Voice hints present",
        passed: !!aspect.voiceHints,
      });
    }

    // Security scan
    if (args.security) {
      const suspiciousPatterns = [
        { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, name: "Ignore previous instructions" },
        { pattern: /you\s+are\s+now\s+DAN/i, name: "DAN jailbreak" },
        { pattern: /forget\s+(everything|all|your)\s+(you|instructions)/i, name: "Forget instructions" },
        { pattern: /password|api[_\s]?key|secret[_\s]?key|credentials/i, name: "Credential request" },
        { pattern: /credit\s*card|ssn|social\s*security/i, name: "Sensitive data request" },
        { pattern: /\[system\]|\[admin\]|\[root\]/i, name: "System role injection" },
      ];

      for (const { pattern, name } of suspiciousPatterns) {
        const found = pattern.test(aspect.prompt);
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
      const msg = check.message ? ` — ${check.message}` : "";
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
