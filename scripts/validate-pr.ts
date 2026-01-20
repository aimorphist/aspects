#!/usr/bin/env bun
/**
 * Validates aspect PRs for the registry.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { aspectSchema } from "../src/lib/schema";
import {
  header,
  fileHeader,
  result,
  detail,
  successSummary,
  failSummary,
  icons,
  colors,
  Spinner,
  blank,
} from "./lib/output";

interface RegistryEntry {
  latest: string;
  versions: Record<string, { published: string; url: string }>;
  metadata: {
    displayName: string;
    tagline: string;
    publisher: string;
    trust: "verified" | "community";
  };
}

interface RegistryIndex {
  version: number;
  updated: string;
  aspects: Record<string, RegistryEntry>;
}

const REGISTRY_PATH = "registry/index.json";
const ASPECTS_DIR = "registry/aspects";

// Directories starting with _ are test fixtures, skip them
const isTestFixture = (path: string) => path.includes("/_");

function getChangedFiles(): string[] {
  try {
    // Get files changed in this PR compared to main
    const output = execSync("git diff --name-only origin/main...HEAD", {
      encoding: "utf-8",
    });
    const files = output.trim().split("\n").filter(Boolean);
    if (files.length > 0) {
      return files;
    }
  } catch {
    // Git diff failed, fall through to scan all
  }

  // Fallback: get all aspect.json files (for local testing or when on main)
  console.log("⚠️  No PR changes detected, validating all aspects");
  const output = execSync(`find ${ASPECTS_DIR} -name "aspect.json"`, {
    encoding: "utf-8",
  });
  return output.trim().split("\n").filter(Boolean);
}

function validateAspectJson(filePath: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!existsSync(filePath)) {
    errors.push(`File not found: ${filePath}`);
    return { valid: false, errors };
  }

  const content = readFileSync(filePath, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    errors.push(
      `Invalid JSON: ${e instanceof Error ? e.message : "Unknown error"}`,
    );
    return { valid: false, errors };
  }

  const result = aspectSchema.safeParse(parsed);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

function validateRegistryEntry(
  aspectName: string,
  registry: RegistryIndex,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const entry = registry.aspects[aspectName];
  if (!entry) {
    errors.push(`No entry in index.json for aspect: ${aspectName}`);
    return { valid: false, errors };
  }

  if (!entry.latest) {
    errors.push(`Missing 'latest' version for ${aspectName}`);
  }

  if (!entry.versions || Object.keys(entry.versions).length === 0) {
    errors.push(`No versions defined for ${aspectName}`);
  }

  if (!entry.metadata?.displayName) {
    errors.push(`Missing metadata.displayName for ${aspectName}`);
  }

  if (!entry.metadata?.tagline) {
    errors.push(`Missing metadata.tagline for ${aspectName}`);
  }

  // Check URL format
  const latestVersion = entry.versions?.[entry.latest];
  if (latestVersion?.url) {
    const expectedUrlPattern = new RegExp(
      `^https://raw\\.githubusercontent\\.com/.+/registry/aspects/${aspectName}/aspect\\.json$`,
    );
    if (!expectedUrlPattern.test(latestVersion.url)) {
      errors.push(`URL format invalid for ${aspectName}: ${latestVersion.url}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

async function main() {
  header("ASPECTS VALIDATION", "cyan");

  const spinner = new Spinner("Finding aspects...").start();

  const changedFiles = getChangedFiles();
  const aspectFiles = changedFiles.filter(
    (f) =>
      f.startsWith(ASPECTS_DIR) &&
      f.endsWith("aspect.json") &&
      !isTestFixture(f),
  );

  if (aspectFiles.length === 0) {
    spinner.succeed("No aspect.json files to validate");
    blank();
    process.exit(0);
  }

  spinner.stop();

  // Load registry
  let registry: RegistryIndex;
  try {
    registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
  } catch {
    console.log(
      `  ${icons.fail} ${colors.red("Failed to read registry/index.json")}`,
    );
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  for (const file of aspectFiles) {
    // Extract aspect name from path: registry/aspects/{name}/aspect.json
    const match = file.match(/registry\/aspects\/([^/]+)\/aspect\.json/);
    if (!match) {
      fileHeader(file);
      result(false, "Invalid path format");
      failed++;
      continue;
    }
    const aspectName = match[1]!;
    fileHeader(aspectName);

    let fileHasErrors = false;

    // Validate aspect.json
    const jsonResult = validateAspectJson(file);
    if (!jsonResult.valid) {
      result(false, "Schema");
      for (const err of jsonResult.errors) {
        detail(err);
      }
      fileHasErrors = true;
    } else {
      result(true, "Schema");
    }

    // Validate registry entry
    const registryResult = validateRegistryEntry(aspectName, registry!);
    if (!registryResult.valid) {
      result(false, "Registry entry");
      for (const err of registryResult.errors) {
        detail(err);
      }
      fileHasErrors = true;
    } else {
      result(true, "Registry entry");
    }

    if (fileHasErrors) {
      failed++;
    } else {
      passed++;
    }
  }

  if (failed > 0) {
    failSummary(`${failed} failed`, `${passed} passed`);
  } else {
    successSummary("All validations passed", `(${passed} aspects)`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
