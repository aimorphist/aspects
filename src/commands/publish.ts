import { readFile, stat, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { ASPECTS_DIR } from "../utils/paths";
import { aspectSchema } from "../lib/schema";
import { publishAspect, ApiClientError } from "../lib/api-client";
import { getAuth, isLoggedIn } from "../lib/config";
import { c, icons } from "../utils/colors";

const MAX_ASPECT_SIZE = 51200; // 50KB

interface AspectInfo {
  path: string;
  name: string;
  displayName: string;
  tagline: string;
  version: string;
  category?: string;
  publisher?: string;
  author?: string;
}

export default defineCommand({
  meta: {
    name: "publish",
    description: "Publish an aspect to the registry",
  },
  args: {
    path: {
      type: "positional",
      description: "Path to aspect directory or aspect.json (optional)",
      required: false,
    },
    "dry-run": {
      type: "boolean",
      description: "Validate without publishing",
    },
  },
  async run({ args }) {
    const dryRun = args["dry-run"] as boolean | undefined;

    p.intro(`${icons.package} ${dryRun ? 'Validate' : 'Publish'} an aspect`);

    // Check auth (unless dry-run)
    if (!dryRun) {
      const loggedIn = await isLoggedIn();
      if (!loggedIn) {
        p.log.error('Login required to publish with a name.');
        console.log();
        p.log.info(`Run ${c.highlight('aspects login')} to create an account and claim aspect names.`);
        console.log();
        p.log.info(`Or use ${c.highlight('aspects share')} to publish anonymously via hash (no account needed).`);
        process.exit(1);
      }
    }

    let aspectPath: string;

    if (args.path) {
      aspectPath = args.path as string;
    } else {
      // Scan for aspects and let user choose
      const spinner = p.spinner();
      spinner.start("Scanning for aspects...");

      const aspects = await findLocalAspects();
      spinner.stop("Found aspects");

      if (aspects.length === 0) {
        p.log.error("No aspects found.");
        p.log.info('Create one with: aspects create my-aspect');
        process.exit(1);
      }

      if (aspects.length === 1) {
        aspectPath = aspects[0]!.path;
        p.log.info(`Found: ${aspects[0]!.displayName} (${aspects[0]!.name})`);
      } else {
        const selected = await p.select({
          message: "Select aspect to publish",
          options: aspects.map((a) => ({
            value: a.path,
            label: `${a.displayName} (${a.name}@${a.version})`,
            hint: a.path,
          })),
        });

        if (p.isCancel(selected)) {
          p.cancel("Cancelled");
          process.exit(0);
        }

        aspectPath = selected as string;
      }
    }

    // Validate the aspect
    p.log.info("");
    const spinner2 = p.spinner();
    spinner2.start("Validating aspect...");
    const validation = await validateAspect(aspectPath);

    if (!validation.valid || !validation.aspect || !validation.content) {
      spinner2.stop("Validation failed");
      p.log.error("Invalid aspect.json:");
      for (const err of validation.errors || []) {
        p.log.error(`  ${icons.bullet} ${err}`);
      }
      p.log.info("");
      p.log.info("Fix these issues before publishing.");
      process.exit(1);
    }

    // Check size
    const sizeBytes = Buffer.byteLength(validation.content);
    if (sizeBytes > MAX_ASPECT_SIZE) {
      spinner2.stop("Validation failed");
      p.log.error(`Aspect too large: ${sizeBytes} bytes (${MAX_ASPECT_SIZE} byte limit)`);
      process.exit(1);
    }

    // Check publisher matches auth (unless dry-run)
    if (!dryRun) {
      const auth = await getAuth();
      if (validation.aspect.publisher && auth && validation.aspect.publisher !== auth.username) {
        spinner2.stop("Validation failed");
        p.log.error(
          `Publisher mismatch: aspect.json has "${validation.aspect.publisher}" but you are "@${auth.username}"`
        );
        p.log.info("Update the publisher field in aspect.json or log in with the correct account.");
        process.exit(1);
      }
    }

    spinner2.stop("Validation passed");

    // Show details
    console.log();
    console.log(`  ${c.label("Schema")}    valid`);
    console.log(`  ${c.label("Size")}      ${(sizeBytes / 1024).toFixed(1)} KB / ${(MAX_ASPECT_SIZE / 1024).toFixed(0)} KB`);
    if (!dryRun) {
      console.log(`  ${c.label("Publisher")} ${validation.aspect.publisher || 'not set'}`);
    }
    console.log();
    console.log(`  ${c.bold(validation.aspect.displayName)} ${c.muted(`(${validation.aspect.name}@${validation.aspect.version})`)}`);
    console.log(`  ${c.italic(validation.aspect.tagline)}`);
    console.log();

    if (dryRun) {
      p.log.success("Would publish successfully");
      p.outro("(No changes made)");
      return;
    }

    // Confirm publish
    const confirmPublish = await p.confirm({
      message: "Publish this aspect to the registry?",
      initialValue: true,
    });

    if (p.isCancel(confirmPublish) || !confirmPublish) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    // Publish via API
    const spinner3 = p.spinner();
    spinner3.start(`Publishing ${validation.aspect.name}@${validation.aspect.version}...`);

    try {
      const parsed = JSON.parse(validation.content);
      const result = await publishAspect(parsed);
      spinner3.stop("Published");

      console.log();
      console.log(`${icons.success} Published ${c.bold(`${result.name}@${result.version}`)}`);
      console.log();
      console.log(`  ${c.label("View at")} ${result.url}`);
      console.log();
    } catch (err) {
      spinner3.stop("Publish failed");

      if (err instanceof ApiClientError) {
        p.log.error(err.message);

        // Helpful hints per error code
        if (err.errorCode === 'version_exists') {
          p.log.info("");
          p.log.info("Tip: Bump the version in aspect.json and try again");
        } else if (err.errorCode === 'name_taken') {
          p.log.info("");
          p.log.info("Tip: Choose a different name in aspect.json");
        } else if (err.errorCode === 'unauthorized') {
          p.log.info("");
          p.log.info('Run "aspects login" to authenticate');
        }
      } else {
        p.log.error(`Publish failed: ${(err as Error).message}`);
      }

      process.exit(1);
    }
  },
});

// --- Helper functions (kept from original) ---

async function loadAspectFromPath(
  inputPath: string
): Promise<AspectInfo | null> {
  let aspectPath = inputPath;

  try {
    const stats = await stat(inputPath);
    if (stats.isDirectory()) {
      aspectPath = join(inputPath, "aspect.json");
    }
  } catch {
    return null;
  }

  try {
    const content = await readFile(aspectPath, "utf-8");
    const aspect = JSON.parse(content);

    return {
      path: dirname(aspectPath),
      name: aspect.name,
      displayName: aspect.displayName,
      tagline: aspect.tagline,
      version: aspect.version || "1.0.0",
      category: aspect.category,
      publisher: aspect.publisher,
      author: aspect.author,
    };
  } catch {
    return null;
  }
}

async function findLocalAspects(): Promise<AspectInfo[]> {
  const aspects: AspectInfo[] = [];

  // Check current directory
  const cwdAspect = await loadAspectFromPath(process.cwd());
  if (cwdAspect) {
    aspects.push(cwdAspect);
  }

  // Check subdirectories of current directory
  try {
    const entries = await readdir(process.cwd(), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const subAspect = await loadAspectFromPath(
          join(process.cwd(), entry.name)
        );
        if (subAspect && !aspects.find((a) => a.path === subAspect.path)) {
          aspects.push(subAspect);
        }
      }
    }
  } catch {
    // Ignore errors
  }

  // Check ~/.aspects/aspects/
  try {
    const entries = await readdir(ASPECTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const installedAspect = await loadAspectFromPath(
          join(ASPECTS_DIR, entry.name)
        );
        if (
          installedAspect &&
          !aspects.find((a) => a.path === installedAspect.path)
        ) {
          aspects.push(installedAspect);
        }
      }
    }
  } catch {
    // ~/.aspects/aspects/ might not exist
  }

  return aspects;
}

async function validateAspect(
  aspectPath: string
): Promise<{
  valid: boolean;
  aspect?: AspectInfo;
  content?: string;
  errors?: string[];
}> {
  let filePath = aspectPath;

  try {
    const stats = await stat(aspectPath);
    if (stats.isDirectory()) {
      filePath = join(aspectPath, "aspect.json");
    }
  } catch {
    return { valid: false, errors: [`Path not found: ${aspectPath}`] };
  }

  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return { valid: false, errors: [`Cannot read file: ${filePath}`] };
  }

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (err) {
    return {
      valid: false,
      errors: [
        `Invalid JSON: ${err instanceof Error ? err.message : "parse error"}`,
      ],
    };
  }

  const result = aspectSchema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return `${path ? `${path}: ` : ""}${issue.message}`;
    });
    return { valid: false, errors };
  }

  const aspect = result.data;
  return {
    valid: true,
    content,
    aspect: {
      path: dirname(filePath),
      name: aspect.name,
      displayName: aspect.displayName,
      tagline: aspect.tagline,
      version: aspect.version || "1.0.0",
      category: aspect.category,
      publisher: aspect.publisher,
      author: aspect.author,
    },
  };
}
