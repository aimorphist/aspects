#!/usr/bin/env bun
/**
 * Scans aspect prompts for potential prompt injection patterns.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import {
  header,
  fileHeader,
  result,
  warn,
  detail,
  successSummary,
  failSummary,
  warnSummary,
  icons,
  colors,
  Spinner,
  blank,
} from "./lib/output";

const ASPECTS_DIR = "registry/aspects";

// Directories starting with _ are test fixtures, skip them
const isTestFixture = (path: string) => path.includes("/_");

interface ScanResult {
  file: string;
  flags: { pattern: string; match: string; severity: "warning" | "critical" }[];
}

// Patterns that suggest prompt injection attempts
const SUSPICIOUS_PATTERNS: {
  pattern: RegExp;
  description: string;
  severity: "warning" | "critical";
}[] = [
  // Direct instruction override attempts
  {
    pattern:
      /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|guidelines?)/i,
    description: "Attempts to override previous instructions",
    severity: "critical",
  },
  {
    pattern: /disregard\s+(all\s+)?(previous|prior|above)/i,
    description: "Attempts to disregard previous content",
    severity: "critical",
  },
  {
    pattern: /forget\s+(everything|all|what)\s+(you|i)\s+(told|said|know)/i,
    description: "Attempts to reset context",
    severity: "critical",
  },

  // Jailbreak patterns
  {
    pattern: /you\s+are\s+now\s+(DAN|evil|unrestricted|unfiltered)/i,
    description: "Known jailbreak pattern (DAN, etc.)",
    severity: "critical",
  },
  {
    pattern: /developer\s+mode\s+(enabled|activated|on)/i,
    description: "Fake developer mode activation",
    severity: "critical",
  },
  {
    pattern:
      /pretend\s+(you\s+)?(have\s+)?no\s+(restrictions?|limits?|rules?)/i,
    description: "Attempts to remove restrictions",
    severity: "critical",
  },

  // Data exfiltration attempts
  {
    pattern:
      /(ask|request|get|obtain)\s+(for\s+)?(user'?s?\s+)?(password|credit\s*card|ssn|social\s*security)/i,
    description: "Requests sensitive user data",
    severity: "critical",
  },
  {
    pattern:
      /(send|transmit|post|upload)\s+(to|data\s+to)\s+(https?:\/\/|external|remote)/i,
    description: "Attempts to send data externally",
    severity: "warning",
  },

  // System prompt extraction
  {
    pattern:
      /(reveal|show|display|print|output)\s+(your\s+)?(system\s+)?(prompt|instructions?|rules?)/i,
    description: "Attempts to extract system prompt",
    severity: "warning",
  },
  {
    pattern: /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?)/i,
    description: "Asks about system prompt",
    severity: "warning",
  },

  // Role confusion
  {
    pattern:
      /you\s+are\s+not\s+(an?\s+)?(AI|assistant|chatbot|language\s+model)/i,
    description: "Denies AI identity",
    severity: "warning",
  },
  {
    pattern:
      /act\s+as\s+if\s+you\s+(have\s+)?no\s+(ethical|moral)\s+(guidelines?|restrictions?)/i,
    description: "Attempts to bypass ethics",
    severity: "critical",
  },

  // Harmful content
  {
    pattern:
      /(how\s+to\s+)?(make|create|build)\s+(a\s+)?(bomb|weapon|explosive|poison)/i,
    description: "Requests harmful instructions",
    severity: "critical",
  },
  {
    pattern: /(instructions?\s+for|how\s+to)\s+(hack|break\s+into|exploit)/i,
    description: "Requests hacking instructions",
    severity: "warning",
  },
];

function getChangedFiles(): string[] {
  try {
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

  // Fallback: scan all aspects (for local testing or when on main)
  console.log("⚠️  No PR changes detected, scanning all aspects");
  const output = execSync(`find ${ASPECTS_DIR} -name "aspect.yaml"`, {
    encoding: "utf-8",
  });
  return output.trim().split("\n").filter(Boolean);
}

function scanPrompt(prompt: string): ScanResult["flags"] {
  const flags: ScanResult["flags"] = [];

  for (const { pattern, description, severity } of SUSPICIOUS_PATTERNS) {
    const match = prompt.match(pattern);
    if (match) {
      flags.push({
        pattern: description,
        match: match[0],
        severity,
      });
    }
  }

  return flags;
}

function scanAspectFile(filePath: string): ScanResult | null {
  if (!existsSync(filePath)) {
    return null;
  }

  const content = readFileSync(filePath, "utf-8");

  let parsed: { prompt?: string };
  try {
    parsed = parseYaml(content) as { prompt?: string };
  } catch {
    return null;
  }

  if (!parsed.prompt) {
    return null;
  }

  const flags = scanPrompt(parsed.prompt);

  if (flags.length === 0) {
    return null;
  }

  return { file: filePath, flags };
}

async function main() {
  header("SECURITY SCAN", "orange");

  const spinner = new Spinner("Scanning for threats...").start();

  const changedFiles = getChangedFiles();
  const aspectFiles = changedFiles.filter(
    (f) =>
      f.startsWith(ASPECTS_DIR) &&
      f.endsWith("aspect.yaml") &&
      !isTestFixture(f),
  );

  if (aspectFiles.length === 0) {
    spinner.succeed("No aspect.yaml files to scan");
    blank();
    process.exit(0);
  }

  spinner.stop();

  let clean = 0;
  let warningCount = 0;
  let criticalCount = 0;

  for (const file of aspectFiles) {
    // Extract aspect name from path
    const match = file.match(/registry\/aspects\/([^/]+)\/aspect\.yaml/);
    const aspectName = match ? match[1] : file;
    fileHeader(aspectName!);

    const scanResult = scanAspectFile(file);

    if (scanResult && scanResult.flags.length > 0) {
      for (const flag of scanResult.flags) {
        if (flag.severity === "critical") {
          console.log(`    ${icons.fail} ${colors.red(flag.pattern)}`);
          criticalCount++;
        } else {
          console.log(`    ${icons.warn} ${colors.orange(flag.pattern)}`);
          warningCount++;
        }
        detail(`"${flag.match}"`);
      }
    } else {
      result(true, "Clean");
      clean++;
    }
  }

  if (criticalCount > 0) {
    failSummary(
      "BLOCKED",
      `${criticalCount} critical issues require manual review`,
    );
  } else if (warningCount > 0) {
    warnSummary(
      "Warnings detected",
      `${warningCount} warnings, ${clean} clean`,
    );
  } else {
    successSummary("All clear", `(${clean} aspects scanned)`);
  }

  process.exit(criticalCount > 0 ? 1 : 0);
}

main();
