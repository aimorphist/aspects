import { writeFile, readFile, stat, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import {
  OFFICIAL_CATEGORIES,
  FIELD_LIMITS,
  type OfficialCategory,
} from "../lib/schema";
import { listAllSets, loadSet, saveSet } from "./set";

const REGISTRY_DIR = "registry/aspects";
const INDEX_PATH = "registry/index.json";
const GITHUB_REPO = "aimorphist/aspects";

// Types for directives and instructions
interface Directive {
  id: string;
  rule: string;
  priority: "high" | "medium" | "low";
}

interface Instruction {
  id: string;
  rule: string;
}

// Generate a slug ID from rule text
function generateIdFromRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

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
    name: "create",
    description: `Create a new aspect interactively.

The generator guides you through:
  1. Name & identity (slug, display name, tagline)
  2. Category selection (assistant, roleplay, creative, etc.)
  3. Tags for discovery
  4. Voice hints (speed, emotions)
  5. Directives & Instructions

Directives vs Instructions:
  Directives   Strict MUST-follow rules with priority (high/medium/low)
               Emphasized across all LLM models via XML, bold, repetition
  Instructions Softer guidance and preferences, not strictly enforced

Examples:
  aspects create                  Create in current directory
  aspects create my-aspect        Create in ./my-aspect/
  aspects create ~/aspects/new    Create at specific path

If run inside the aspects registry repo, automatically offers to:
  - Add to registry/index.json
  - Commit and push changes`,
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

    // Helper to check if aspect exists at a given name
    const aspectExistsAt = async (name: string): Promise<string | null> => {
      let checkPath: string;
      if (inRegistry) {
        checkPath = join(repoRoot, REGISTRY_DIR, name, "aspect.json");
      } else if (args.path) {
        checkPath = join(args.path, "aspect.json");
      } else {
        checkPath = join(cwd, "aspect.json");
      }
      try {
        await stat(checkPath);
        return checkPath;
      } catch {
        return null;
      }
    };

    // Get the aspect name with conflict resolution
    let aspectName: string | undefined;

    while (!aspectName) {
      const nameInput = await p.text({
        message: "Aspect name (slug)",
        placeholder: "my-aspect",
        validate: (value) => {
          if (!value) return "Name is required";
          if (!/^[a-z0-9-]+$/.test(value)) {
            return "Name must be lowercase letters, numbers, and hyphens only";
          }
        },
      });

      if (p.isCancel(nameInput)) {
        p.cancel("Cancelled");
        process.exit(0);
      }

      const existingPath = await aspectExistsAt(nameInput as string);

      if (existingPath) {
        p.log.warn(`An aspect already exists at ${existingPath}`);

        const action = await p.select({
          message: "What would you like to do?",
          options: [
            { value: "rename", label: "Choose a different name" },
            { value: "overwrite", label: "Overwrite the existing aspect" },
            { value: "cancel", label: "Cancel" },
          ],
        });

        if (p.isCancel(action) || action === "cancel") {
          p.cancel("Cancelled");
          process.exit(0);
        }

        if (action === "overwrite") {
          aspectName = nameInput as string;
        }
        // If "rename", loop continues to ask for name again
      } else {
        aspectName = nameInput as string;
      }
    }

    const answers = await p.group(
      {
        displayName: () =>
          p.text({
            message: "Display name",
            placeholder: "My Aspect",
            validate: (value) => {
              if (!value) return "Display name is required";
            },
          }),

        tagline: () =>
          p.text({
            message: "Tagline (one-liner description)",
            placeholder: "A helpful assistant with a unique personality",
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
              { value: "slow", label: "Slow - deliberate, thoughtful" },
              { value: "fast", label: "Fast - energetic, excited" },
            ],
            initialValue: "normal",
          }),

        promptStyle: () =>
          p.select({
            message: "Prompt template",
            options: [
              { value: "character", label: "Character - roleplay a persona" },
              { value: "assistant", label: "Assistant - helpful AI style" },
              { value: "blank", label: "Blank - start from scratch" },
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

    // Directives & Instructions step
    p.log.message(`
📋 Directives & Instructions

Directives are MUST-follow rules - they get special emphasis
across all LLM models (bold, XML tags, repetition).
  Example: "Never break character under any circumstances"

Instructions are general guidance - softer preferences for
how the AI should behave.
  Example: "Prefer shorter responses when possible"

Keep it light! A few well-crafted rules beat many vague ones.
`);

    const directives: Directive[] = [];
    const instructions: Instruction[] = [];
    let addingRules = true;

    while (addingRules) {
      const totalCount = directives.length + instructions.length;
      const hasAny = totalCount > 0;

      // Show current count if any exist
      if (hasAny) {
        p.log.info(
          `Current: ${directives.length} directive${directives.length !== 1 ? "s" : ""}, ${instructions.length} instruction${instructions.length !== 1 ? "s" : ""}`,
        );
      }

      // Check if approaching limit
      if (
        totalCount >=
        FIELD_LIMITS.maxDirectives + FIELD_LIMITS.maxInstructions - 5
      ) {
        p.log.warn("You've added quite a few! Consider consolidating.");
      }

      const action = await p.select({
        message: "What would you like to add?",
        options: [
          {
            value: "directive",
            label: "Add a directive (strict rule)",
            hint: "MUST-follow, emphasized across models",
          },
          {
            value: "instruction",
            label: "Add an instruction (general guidance)",
            hint: "Softer preference",
          },
          {
            value: "done",
            label: hasAny
              ? "Done - finish creating aspect"
              : "Skip - finish without adding any",
          },
        ],
      });

      if (p.isCancel(action) || action === "done") {
        addingRules = false;
        continue;
      }

      if (action === "directive") {
        if (directives.length >= FIELD_LIMITS.maxDirectives) {
          p.log.warn(
            `Maximum ${FIELD_LIMITS.maxDirectives} directives reached.`,
          );
          continue;
        }

        const ruleText = await p.text({
          message: "Enter the directive rule:",
          placeholder: "Never break character under any circumstances",
          validate: (value) => {
            if (!value) return "Rule text is required";
            if (value.length > FIELD_LIMITS.directiveRule) {
              return `Rule must be ${FIELD_LIMITS.directiveRule} characters or less`;
            }
          },
        });

        if (p.isCancel(ruleText)) continue;

        const priority = await p.select({
          message: "Priority level:",
          options: [
            {
              value: "high",
              label: "High",
              hint: "Critical, always emphasized",
            },
            {
              value: "medium",
              label: "Medium",
              hint: "Important but flexible",
            },
            { value: "low", label: "Low", hint: "Nice-to-have preference" },
          ],
          initialValue: "high",
        });

        if (p.isCancel(priority)) continue;

        directives.push({
          id: generateIdFromRule(ruleText as string),
          rule: ruleText as string,
          priority: priority as "high" | "medium" | "low",
        });

        p.log.success(`Added directive #${directives.length}`);
      } else if (action === "instruction") {
        if (instructions.length >= FIELD_LIMITS.maxInstructions) {
          p.log.warn(
            `Maximum ${FIELD_LIMITS.maxInstructions} instructions reached.`,
          );
          continue;
        }

        const ruleText = await p.text({
          message: "Enter the instruction:",
          placeholder: "Prefer shorter responses when possible",
          validate: (value) => {
            if (!value) return "Instruction text is required";
            if (value.length > FIELD_LIMITS.instructionRule) {
              return `Instruction must be ${FIELD_LIMITS.instructionRule} characters or less`;
            }
          },
        });

        if (p.isCancel(ruleText)) continue;

        instructions.push({
          id: generateIdFromRule(ruleText as string),
          rule: ruleText as string,
        });

        p.log.success(`Added instruction #${instructions.length}`);
      }
    }

    // Build the aspect object
    const aspect: Record<string, unknown> = {
      schemaVersion: 1,
      name: aspectName,
      publisher: "anon-user",
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

    // Add directives and instructions if any were created
    if (directives.length > 0) {
      aspect.directives = directives;
    }

    if (instructions.length > 0) {
      aspect.instructions = instructions;
    }

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
      outputDir = join(repoRoot, REGISTRY_DIR, aspectName);
      outputPath = join(outputDir, "aspect.json");
    } else if (args.path) {
      outputDir = args.path;
      outputPath = join(outputDir, "aspect.json");
    } else {
      outputDir = cwd;
      outputPath = join(cwd, "aspect.json");
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
            aspectName,
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
          execSync(`git commit -m "Add ${aspectName} aspect"`, {
            cwd: repoRoot,
            stdio: "pipe",
          });
          p.log.success(`Committed: "Add ${aspectName} aspect"`);

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
              p.log.warn("Push failed - you may need to set up your remote");
            }
          }
        } catch {
          p.log.warn("Git commit failed - you may need to commit manually");
        }
      }
    } else {
      // Not in registry, show manual instructions
      p.log.info("\nTo submit to the registry:");
      p.log.info("1. Fork https://github.com/" + GITHUB_REPO);
      p.log.info("2. Clone your fork and run this command inside it");
      p.log.info("3. Or visit https://aspects.sh/create");
    }

    // Check for local sets and offer to add
    const sets = await listAllSets();
    if (sets.length > 0) {
      console.log();
      const addToSet = await p.select({
        message: "Add this aspect to a set?",
        options: [
          ...sets.map((s) => ({
            value: s.name,
            label: `${s.displayName} (${s.aspects.length} aspects)`,
          })),
          { value: "__none__", label: "Don't add to a set" },
        ],
      });

      if (!p.isCancel(addToSet) && addToSet !== "__none__") {
        const set = await loadSet(addToSet as string);
        if (set && !set.aspects.includes(aspectName)) {
          set.aspects.push(aspectName);
          await saveSet(set);
          p.log.success(`Added to set: ${set.displayName}`);
        }
      }
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
