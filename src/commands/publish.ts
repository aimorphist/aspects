import { readFile, writeFile, stat, mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { ASPECTS_DIR } from "../utils/paths";
import { aspectSchema, FIELD_LIMITS } from "../lib/schema";

const GITHUB_REPO = "aimorphist/aspects";
const REGISTRY_DIR = "registry/aspects";
const INDEX_PATH = "registry/index.json";
const ISSUE_TEMPLATE_URL = `https://github.com/${GITHUB_REPO}/issues/new?template=new-aspect.yml`;

type PublishMethod = "pr" | "issue" | "manual";

interface AspectInfo {
  path: string;
  name: string;
  displayName: string;
  tagline: string;
  version: string;
  category?: string;
  author?: string;
}

export default defineCommand({
  meta: {
    name: "publish",
    description: "Publish an aspect to the Morphist registry",
  },
  args: {
    path: {
      type: "positional",
      description: "Path to aspect directory or aspect.json (optional)",
      required: false,
    },
  },
  async run({ args }) {
    p.intro("📤 Publish an aspect to the Morphist registry");

    // Show publish options
    p.log.info("");
    p.log.info("Publishing options:");
    p.log.info("  1. GitHub PR — Automated fork, branch, and PR creation (requires gh CLI)");
    p.log.info("  2. Issue Template — Submit via GitHub issue form (no CLI needed)");
    p.log.info("  3. Manual — Get instructions for manual submission");
    p.log.info("");
    p.log.info(`💡 You can also submit directly at: ${ISSUE_TEMPLATE_URL}`);
    p.log.info("");

    const publishMethod = await p.select({
      message: "How would you like to publish?",
      options: [
        { value: "pr" as PublishMethod, label: "GitHub PR (automated)", hint: "Requires GitHub CLI" },
        { value: "issue" as PublishMethod, label: "Issue Template (web form)", hint: "Opens in browser" },
        { value: "manual" as PublishMethod, label: "Manual Instructions", hint: "Copy-paste steps" },
      ],
    });

    if (p.isCancel(publishMethod)) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    // Handle issue template option
    if (publishMethod === "issue") {
      await handleIssueTemplate(args.path);
      return;
    }

    // Handle manual instructions
    if (publishMethod === "manual") {
      await handleManualInstructions(args.path);
      return;
    }

    // Continue with PR flow - check for GitHub CLI
    const hasGhCli = checkGitHubCli();
    if (!hasGhCli) {
      p.log.error("GitHub CLI (gh) is required for automated PR publishing.");
      p.log.info("Install it from: https://cli.github.com/");
      p.log.info("Then run: gh auth login");
      p.log.info("");
      p.log.info("Alternatively, use the Issue Template option to submit without CLI.");
      process.exit(1);
    }

    // Check if authenticated
    const ghUser = getGitHubUsername();
    if (!ghUser) {
      p.log.error("Not authenticated with GitHub CLI.");
      p.log.info("Run: gh auth login");
      process.exit(1);
    }

    p.log.info(`Authenticated as: ${ghUser}`);

    let aspectInfo: AspectInfo;
    let aspectPath: string;

    if (args.path) {
      aspectPath = args.path;
    } else {
      // Scan for aspects and let user choose
      const spinner = p.spinner();
      spinner.start("Scanning for aspects...");

      const aspects = await findLocalAspects();
      spinner.stop("Found aspects");

      if (aspects.length === 0) {
        p.log.error("No aspects found.");
        p.log.info("Create one with: aspects create my-aspect");
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

    // Validate the aspect before publishing
    p.log.info("");
    const spinner2 = p.spinner();
    spinner2.start("Validating aspect...");
    const validation = await validateAspect(aspectPath);
    
    if (!validation.valid || !validation.aspect) {
      spinner2.stop("Validation failed");
      p.log.error("✗ Aspect validation failed:");
      for (const err of validation.errors || []) {
        p.log.error(`  • ${err}`);
      }
      p.log.info("");
      p.log.info("Fix these issues before publishing.");
      process.exit(1);
    }
    
    spinner2.stop("Validation passed ✓");
    aspectInfo = validation.aspect;

    // Show aspect details
    p.log.info("");
    p.log.info(`  Name:     ${aspectInfo.name}@${aspectInfo.version}`);
    p.log.info(`  Display:  ${aspectInfo.displayName}`);
    p.log.info(`  Tagline:  ${aspectInfo.tagline}`);
    if (aspectInfo.author) {
      p.log.info(`  Author:   ${aspectInfo.author}`);
    }
    p.log.info(`  Path:     ${aspectInfo.path}`);
    p.log.info("");

    // Confirm publish
    const confirmPublish = await p.confirm({
      message: "Publish this aspect to the Morphist registry?",
      initialValue: true,
    });

    if (p.isCancel(confirmPublish) || !confirmPublish) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    // Start publish process
    const spinner = p.spinner();

    // Step 1: Fork the repo if needed
    spinner.start("Checking for fork...");
    const hasFork = await ensureFork(ghUser);
    if (hasFork) {
      spinner.stop("Fork ready");
    } else {
      spinner.stop("Fork created");
    }

    // Step 2: Clone or update fork
    spinner.start("Preparing local copy...");
    const forkDir = await prepareLocalFork(ghUser);
    spinner.stop("Local copy ready");

    // Step 3: Create branch for this aspect
    const branchName = `add-${aspectInfo.name}`;
    spinner.start(`Creating branch: ${branchName}...`);
    await createBranch(forkDir, branchName);
    spinner.stop("Branch created");

    // Step 4: Copy aspect to registry
    spinner.start("Adding aspect to registry...");
    await copyAspectToRegistry(forkDir, aspectInfo);
    spinner.stop("Aspect added");

    // Step 5: Update index.json
    spinner.start("Updating registry index...");
    await updateRegistryIndex(forkDir, aspectInfo, ghUser);
    spinner.stop("Index updated");

    // Step 6: Commit and push
    spinner.start("Committing changes...");
    await commitAndPush(forkDir, aspectInfo.name, branchName);
    spinner.stop("Changes pushed");

    // Step 7: Create PR
    spinner.start("Creating pull request...");
    const prUrl = await createPullRequest(forkDir, aspectInfo, branchName);
    spinner.stop("Pull request created");

    // Success!
    p.log.success("");
    p.log.success("✓ Pull request created!");
    p.log.info("");
    p.log.info(`  PR:     ${prUrl}`);
    p.log.info(
      `  Aspect: https://github.com/${ghUser}/aspects/tree/${branchName}/${REGISTRY_DIR}/${aspectInfo.name}`
    );
    p.log.info("");
    p.log.info("Your aspect will be available after review and merge.");

    p.outro("Thanks for contributing! 🎉");
  },
});

function checkGitHubCli(): boolean {
  try {
    execSync("gh --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function getGitHubUsername(): string | null {
  try {
    const result = execSync("gh api user --jq .login", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

async function loadAspectFromPath(
  inputPath: string
): Promise<AspectInfo | null> {
  let aspectPath = inputPath;

  // If directory, look for aspect.json
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

async function ensureFork(ghUser: string): Promise<boolean> {
  // Check if fork exists
  try {
    execSync(`gh repo view ${ghUser}/aspects`, { stdio: "pipe" });
    return true; // Fork exists
  } catch {
    // Fork doesn't exist, create it
    execSync(`gh repo fork ${GITHUB_REPO} --clone=false`, { stdio: "pipe" });
    return false;
  }
}

async function prepareLocalFork(ghUser: string): Promise<string> {
  const forkDir = join(homedir(), ".aspects", ".publish-cache", "aspects");

  // Check if already cloned
  try {
    await stat(join(forkDir, ".git"));
    // Already cloned, update it
    execSync("git fetch origin", { cwd: forkDir, stdio: "pipe" });
    execSync("git checkout main", { cwd: forkDir, stdio: "pipe" });
    execSync("git pull origin main", { cwd: forkDir, stdio: "pipe" });
  } catch {
    // Not cloned, clone it
    await mkdir(dirname(forkDir), { recursive: true });
    execSync(`gh repo clone ${ghUser}/aspects ${forkDir}`, { stdio: "pipe" });

    // Add upstream remote
    try {
      execSync(
        `git remote add upstream https://github.com/${GITHUB_REPO}.git`,
        {
          cwd: forkDir,
          stdio: "pipe",
        }
      );
    } catch {
      // Remote might already exist
    }
  }

  // Sync with upstream
  try {
    execSync("git fetch upstream", { cwd: forkDir, stdio: "pipe" });
    execSync("git merge upstream/main --no-edit", {
      cwd: forkDir,
      stdio: "pipe",
    });
  } catch {
    // Might fail if no upstream changes, that's ok
  }

  return forkDir;
}

async function createBranch(
  forkDir: string,
  branchName: string
): Promise<void> {
  // Delete branch if it exists (from previous attempt)
  try {
    execSync(`git branch -D ${branchName}`, { cwd: forkDir, stdio: "pipe" });
  } catch {
    // Branch doesn't exist, that's fine
  }

  // Create new branch from main
  execSync(`git checkout -b ${branchName}`, { cwd: forkDir, stdio: "pipe" });
}

async function copyAspectToRegistry(
  forkDir: string,
  aspectInfo: AspectInfo
): Promise<void> {
  const targetDir = join(forkDir, REGISTRY_DIR, aspectInfo.name);
  await mkdir(targetDir, { recursive: true });

  // Copy aspect.json
  const sourceFile = join(aspectInfo.path, "aspect.json");
  const targetFile = join(targetDir, "aspect.json");

  const content = await readFile(sourceFile, "utf-8");
  await writeFile(targetFile, content);
}

async function updateRegistryIndex(
  forkDir: string,
  aspectInfo: AspectInfo,
  ghUser: string
): Promise<void> {
  const indexPath = join(forkDir, INDEX_PATH);
  const indexContent = await readFile(indexPath, "utf-8");
  const index = JSON.parse(indexContent);

  const now = new Date().toISOString();

  // Add or update aspect entry
  index.aspects[aspectInfo.name] = {
    latest: aspectInfo.version,
    versions: {
      [aspectInfo.version]: {
        published: now,
        url: `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${REGISTRY_DIR}/${aspectInfo.name}/aspect.json`,
      },
    },
    metadata: {
      displayName: aspectInfo.displayName,
      tagline: aspectInfo.tagline,
      category: aspectInfo.category || "assistant",
      publisher: ghUser,
      githubUrl: `https://github.com/${ghUser}/aspects/tree/main/${REGISTRY_DIR}/${aspectInfo.name}`,
      trust: "community",
    },
  };

  // Update timestamp
  index.updated = now;

  await writeFile(indexPath, JSON.stringify(index, null, 2) + "\n");
}

async function commitAndPush(
  forkDir: string,
  aspectName: string,
  branchName: string
): Promise<void> {
  execSync("git add .", { cwd: forkDir, stdio: "pipe" });
  execSync(`git commit -m "Add ${aspectName} aspect"`, {
    cwd: forkDir,
    stdio: "pipe",
  });
  execSync(`git push -u origin ${branchName} --force`, {
    cwd: forkDir,
    stdio: "pipe",
  });
}

async function createPullRequest(
  forkDir: string,
  aspectInfo: AspectInfo,
  branchName: string
): Promise<string> {
  const title = `Add ${aspectInfo.displayName} aspect`;
  const body = `## New Aspect: ${aspectInfo.displayName}

**Name:** \`${aspectInfo.name}\`
**Version:** ${aspectInfo.version}
**Tagline:** ${aspectInfo.tagline}
${aspectInfo.category ? `**Category:** ${aspectInfo.category}` : ""}
${aspectInfo.author ? `**Author:** ${aspectInfo.author}` : ""}

---

*Submitted via \`aspects publish\`*
`;

  const result = execSync(
    `gh pr create --repo ${GITHUB_REPO} --title "${title}" --body "${body.replace(/"/g, '\\"')}" --head ${branchName}`,
    {
      cwd: forkDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }
  );

  return result.trim();
}

async function validateAspect(aspectPath: string): Promise<{ valid: boolean; aspect?: AspectInfo; content?: string; errors?: string[] }> {
  let filePath = aspectPath;

  // If directory, look for aspect.json
  try {
    const stats = await stat(aspectPath);
    if (stats.isDirectory()) {
      filePath = join(aspectPath, "aspect.json");
    }
  } catch {
    return { valid: false, errors: [`Path not found: ${aspectPath}`] };
  }

  // Read file
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return { valid: false, errors: [`Cannot read file: ${filePath}`] };
  }

  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (err) {
    return { valid: false, errors: [`Invalid JSON: ${err instanceof Error ? err.message : "parse error"}`] };
  }

  // Validate against schema
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
      author: aspect.author,
    },
  };
}

async function handleIssueTemplate(inputPath?: string): Promise<void> {
  p.log.info("");
  p.log.info("📝 Issue Template Submission");
  p.log.info("");

  // If path provided, validate and show content
  if (inputPath) {
    const validation = await validateAspect(inputPath);
    if (validation.valid && validation.aspect) {
      p.log.success(`✓ Aspect validated: ${validation.aspect.displayName}`);
      p.log.info("");
      p.log.info("Your aspect.json content (copy this to the issue form):");
      p.log.info("─".repeat(50));
      console.log(validation.content);
      p.log.info("─".repeat(50));
      p.log.info("");
    } else if (validation.errors) {
      p.log.warn("⚠️  Validation issues found:");
      for (const err of validation.errors) {
        p.log.error(`  • ${err}`);
      }
      p.log.info("");
      p.log.info("Fix these issues before submitting.");
      p.log.info("");
    }
  }

  // Show field limits
  p.log.info("📏 Field Limits:");
  p.log.info(`  • name: ${FIELD_LIMITS.name} chars (lowercase, hyphens only)`);
  p.log.info(`  • displayName: ${FIELD_LIMITS.displayName} chars`);
  p.log.info(`  • tagline: ${FIELD_LIMITS.tagline} chars`);
  p.log.info(`  • prompt: ${FIELD_LIMITS.prompt} chars`);
  p.log.info(`  • tags: max ${FIELD_LIMITS.maxTags} tags, ${FIELD_LIMITS.tag} chars each`);
  p.log.info("");

  // Open browser
  const openBrowser = await p.confirm({
    message: "Open issue template in browser?",
    initialValue: true,
  });

  if (p.isCancel(openBrowser)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  if (openBrowser) {
    try {
      execSync(`open "${ISSUE_TEMPLATE_URL}"`, { stdio: "pipe" });
      p.log.success("Opened in browser!");
    } catch {
      // Try xdg-open for Linux
      try {
        execSync(`xdg-open "${ISSUE_TEMPLATE_URL}"`, { stdio: "pipe" });
        p.log.success("Opened in browser!");
      } catch {
        p.log.info(`Open this URL manually: ${ISSUE_TEMPLATE_URL}`);
      }
    }
  } else {
    p.log.info(`Submit at: ${ISSUE_TEMPLATE_URL}`);
  }

  p.outro("Thanks for contributing! 🎉");
}

async function handleManualInstructions(inputPath?: string): Promise<void> {
  p.log.info("");
  p.log.info("📋 Manual Submission Instructions");
  p.log.info("");

  // If path provided, validate
  if (inputPath) {
    const validation = await validateAspect(inputPath);
    if (validation.valid && validation.aspect) {
      p.log.success(`✓ Aspect validated: ${validation.aspect.displayName}`);
    } else if (validation.errors) {
      p.log.warn("⚠️  Validation issues found:");
      for (const err of validation.errors) {
        p.log.error(`  • ${err}`);
      }
      p.log.info("");
    }
  }

  p.log.info("Option 1: Submit via Issue Template (Easiest)");
  p.log.info("─".repeat(50));
  p.log.info(`  1. Go to: ${ISSUE_TEMPLATE_URL}`);
  p.log.info("  2. Fill out the form with your aspect details");
  p.log.info("  3. Paste your aspect.json content");
  p.log.info("  4. Submit the issue");
  p.log.info("  5. A maintainer will review and add your aspect");
  p.log.info("");

  p.log.info("Option 2: Fork & Pull Request");
  p.log.info("─".repeat(50));
  p.log.info(`  1. Fork https://github.com/${GITHUB_REPO}`);
  p.log.info("  2. Clone your fork locally");
  p.log.info("  3. Create a new branch: git checkout -b add-your-aspect");
  p.log.info("  4. Create directory: registry/aspects/your-aspect-name/");
  p.log.info("  5. Add your aspect.json file to that directory");
  p.log.info("  6. Update registry/index.json with your aspect metadata");
  p.log.info("  7. Commit and push your changes");
  p.log.info(`  8. Open a PR to ${GITHUB_REPO}`);
  p.log.info("");

  p.log.info("📏 Field Limits:");
  p.log.info(`  • name: ${FIELD_LIMITS.name} chars (lowercase, hyphens only)`);
  p.log.info(`  • displayName: ${FIELD_LIMITS.displayName} chars`);
  p.log.info(`  • tagline: ${FIELD_LIMITS.tagline} chars`);
  p.log.info(`  • prompt: ${FIELD_LIMITS.prompt} chars`);
  p.log.info(`  • tags: max ${FIELD_LIMITS.maxTags} tags, ${FIELD_LIMITS.tag} chars each`);
  p.log.info("");

  p.log.info("📚 Documentation:");
  p.log.info(`  • Schema: https://github.com/${GITHUB_REPO}/blob/main/docs/CLI.md#aspect-schema-v2`);
  p.log.info(`  • Examples: https://github.com/${GITHUB_REPO}/tree/main/registry/aspects`);
  p.log.info("");

  p.outro("Good luck with your submission! 🎉");
}
