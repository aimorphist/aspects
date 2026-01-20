import { writeFile, readFile, stat, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { OFFICIAL_CATEGORIES, type OfficialCategory } from "../lib/schema";

const REGISTRY_DIR = "registry/aspects";
const INDEX_PATH = "registry/index.json";
const GITHUB_REPO = "aimorphist/aspects";

// Category labels for display
const CATEGORY_OPTIONS: Array<{
  value: OfficialCategory;
  label: string;
  hint: string;
}> = [
  { value: "assistant", label: "Assistant", hint: "General helpful AI" },
  {
    value: "roleplay",
    label: "Roleplay",
    hint: "Characters, personas, storytelling",
  },
  { value: "creative", label: "Creative", hint: "Writing, art, brainstorming" },
  {
    value: "productivity",
    label: "Productivity",
    hint: "Work, tasks, organization",
  },
  {
    value: "education",
    label: "Education",
    hint: "Learning, tutoring, explanations",
  },
  { value: "gaming", label: "Gaming", hint: "Games, campaigns, entertainment" },
  {
    value: "spiritual",
    label: "Spiritual",
    hint: "Mindfulness, wisdom, guidance",
  },
  { value: "pundit", label: "Pundit", hint: "Commentary, analysis, opinions" },
];

export default defineCommand({
  meta: {
    name: "init",
    description: "Create a new aspect interactively",
  },
  args: {
    path: {
      type: "positional",
      description: "Directory to create aspect in (default: current directory)",
      required: false,
    },
  },
  async run({ args }) {
    p.intro("✨ Create a new aspect");

    // Detect if we're in the aspects repo
    const cwd = process.cwd();
    let inRegistry = false;
    let repoRoot = cwd;

    try {
      await stat(join(cwd, INDEX_PATH));
      inRegistry = true;
    } catch {
      // Not in registry root, check parent dirs
      try {
        const gitRoot = execSync("git rev-parse --show-toplevel", {
          encoding: "utf-8",
        }).trim();
        await stat(join(gitRoot, INDEX_PATH));
        inRegistry = true;
        repoRoot = gitRoot;
      } catch {
        // Not in a git repo with registry
      }
    }

    if (inRegistry) {
      p.log.info(`Detected aspects registry at ${repoRoot}`);
    }

    const answers = await p.group(
      {
        name: () =>
          p.text({
            message: "Aspect name (slug)",
            placeholder: "my-wizard",
            validate: (value) => {
              if (!value) return "Name is required";
              if (!/^[a-z0-9-]+$/.test(value)) {
                return "Name must be lowercase letters, numbers, and hyphens only";
              }
            },
          }),

        displayName: () =>
          p.text({
            message: "Display name",
            placeholder: "My Wizard",
            validate: (value) => {
              if (!value) return "Display name is required";
            },
          }),

        tagline: () =>
          p.text({
            message: "Tagline (one-liner description)",
            placeholder: "A wise and quirky wizard who loves riddles",
            validate: (value) => {
              if (!value) return "Tagline is required";
              if (value.length > 200)
                return "Tagline must be 200 characters or less";
            },
          }),

        category: () =>
          p.select({
            message: "Category",
            options: CATEGORY_OPTIONS,
            initialValue: "assistant" as OfficialCategory,
          }),

        tags: () =>
          p.text({
            message: "Tags (comma-separated, for discovery)",
            placeholder: "helpful, friendly, concise",
            validate: (value) => {
              if (value) {
                const tags = value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean);
                if (tags.length > 10) return "Maximum 10 tags allowed";
                if (tags.some((t) => t.length > 30))
                  return "Each tag must be 30 characters or less";
              }
            },
          }),

        author: () =>
          p.text({
            message: "Author (optional)",
            placeholder: "Your Name",
          }),

        license: () =>
          p.text({
            message: "License",
            placeholder: "MIT",
            initialValue: "MIT",
          }),

        speed: () =>
          p.select({
            message: "Voice speed",
            options: [
              { value: "normal", label: "Normal" },
              { value: "slow", label: "Slow — deliberate, thoughtful" },
              { value: "fast", label: "Fast — energetic, excited" },
            ],
            initialValue: "normal",
          }),

        promptStyle: () =>
          p.select({
            message: "Prompt template",
            options: [
              { value: "character", label: "Character — roleplay a persona" },
              { value: "assistant", label: "Assistant — helpful AI style" },
              { value: "blank", label: "Blank — start from scratch" },
            ],
            initialValue: "character",
          }),
      },
      {
        onCancel: () => {
          p.cancel("Cancelled");
          process.exit(0);
        },
      },
    );

    // Parse tags
    const tagsInput = answers.tags as string | undefined;
    const tags = tagsInput
      ? tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;

    // Build the aspect object
    const aspect: Record<string, unknown> = {
      schemaVersion: 1,
      name: answers.name,
      publisher: answers.author || "community",
      version: "1.0.0",
      displayName: answers.displayName,
      tagline: answers.tagline,
      category: answers.category,
    };

    if (tags && tags.length > 0) {
      aspect.tags = tags;
    }

    if (answers.author) {
      aspect.author = answers.author;
    }

    if (answers.license) {
      aspect.license = answers.license;
    }

    aspect.voiceHints = {
      speed: answers.speed,
      emotions: ["friendly"],
      styleHints: "Speak naturally and warmly.",
    };

    // Generate prompt based on style
    aspect.prompt = generatePrompt(
      answers.promptStyle as string,
      answers.displayName as string,
      answers.tagline as string,
    );

    // Determine output path
    let outputDir: string;
    let outputPath: string;

    if (inRegistry) {
      // Create in registry/aspects/{name}/
      outputDir = join(repoRoot, REGISTRY_DIR, answers.name as string);
      outputPath = join(outputDir, "aspect.json");
    } else if (args.path) {
      outputDir = args.path;
      outputPath = join(outputDir, "aspect.json");
    } else {
      outputDir = cwd;
      outputPath = join(cwd, "aspect.json");
    }

    // Check if aspect already exists
    try {
      await stat(outputPath);
      p.log.error(`aspect.json already exists at ${outputPath}`);
      process.exit(1);
    } catch {
      // Good, doesn't exist
    }

    // Create directory if needed
    await mkdir(outputDir, { recursive: true });

    // Write the aspect.json file
    const jsonContent = JSON.stringify(aspect, null, 2);
    await writeFile(outputPath, jsonContent);
    p.log.success(`Created ${outputPath}`);

    // If in registry, offer to update index.json
    if (inRegistry) {
      const updateIndex = await p.confirm({
        message: "Add to registry index.json?",
        initialValue: true,
      });

      if (updateIndex) {
        try {
          await addToRegistryIndex(
            repoRoot,
            answers.name as string,
            answers.displayName as string,
            answers.tagline as string,
            answers.category as string,
            (answers.author as string) || "community",
          );
          p.log.success("Updated registry/index.json");
        } catch (err) {
          p.log.error(`Failed to update index.json: ${err}`);
        }
      }

      // Offer git operations
      const gitCommit = await p.confirm({
        message: "Commit changes?",
        initialValue: true,
      });

      if (gitCommit) {
        try {
          execSync(`git add .`, { cwd: repoRoot, stdio: "pipe" });
          execSync(`git commit -m "Add ${answers.name} aspect"`, {
            cwd: repoRoot,
            stdio: "pipe",
          });
          p.log.success(`Committed: "Add ${answers.name} aspect"`);

          const gitPush = await p.confirm({
            message: "Push to origin?",
            initialValue: true,
          });

          if (gitPush) {
            try {
              execSync(`git push`, { cwd: repoRoot, stdio: "pipe" });
              p.log.success("Pushed to origin");
              p.log.info(
                `\nNext: Open a PR at https://github.com/${GITHUB_REPO}/compare`,
              );
            } catch {
              p.log.warn("Push failed — you may need to set up your remote");
            }
          }
        } catch {
          p.log.warn("Git commit failed — you may need to commit manually");
        }
      }
    } else {
      // Not in registry, show manual instructions
      p.log.info("\nTo submit to the registry:");
      p.log.info("1. Fork https://github.com/" + GITHUB_REPO);
      p.log.info("2. Clone your fork and run this command inside it");
      p.log.info("3. Or visit https://getaspects.com/create");
    }

    p.outro("Happy aspecting! 🧙");
  },
});

async function addToRegistryIndex(
  repoRoot: string,
  name: string,
  displayName: string,
  tagline: string,
  category: string,
  publisher: string,
): Promise<void> {
  const indexPath = join(repoRoot, INDEX_PATH);
  const indexContent = await readFile(indexPath, "utf-8");
  const index = JSON.parse(indexContent);

  // Add new aspect entry
  const now = new Date().toISOString();
  index.aspects[name] = {
    latest: "1.0.0",
    versions: {
      "1.0.0": {
        published: now,
        url: `https://raw.githubusercontent.com/${GITHUB_REPO}/main/registry/aspects/${name}/aspect.json`,
      },
    },
    metadata: {
      displayName,
      tagline,
      category,
      publisher,
      trust: "community",
    },
  };

  // Update the "updated" timestamp
  index.updated = now;

  // Write back
  await writeFile(indexPath, JSON.stringify(index, null, 2) + "\n");
}

function generatePrompt(
  style: string,
  displayName: string,
  tagline: string,
): string {
  switch (style) {
    case "character":
      return `## Aspect: ${displayName}
**YOU ARE ${displayName.toUpperCase()}.** Speak as this character at all times.

**Tagline**: "${tagline}"

### Identity
You ARE ${displayName}. Embody this character fully from the first message.
- **Welcome**: Introduce yourself naturally
- **"Who are you?"**: Describe yourself in character

### Character
- [Add personality traits here]
- [Add knowledge areas]
- [Add quirks or mannerisms]

### Rules
- **Brief by default**: Keep responses short unless asked for more
- **Stay in character**: Never break character unless explicitly asked
`;

    case "assistant":
      return `## Aspect: ${displayName}
You are ${displayName}, ${tagline.toLowerCase()}.

### Guidelines
- Be helpful, concise, and accurate
- Ask clarifying questions when needed
- Admit uncertainty when appropriate

### Personality
- [Add personality traits here]
- [Add areas of expertise]
`;

    case "blank":
    default:
      return `## Aspect: ${displayName}

${tagline}

[Write your prompt here]
`;
  }
}
