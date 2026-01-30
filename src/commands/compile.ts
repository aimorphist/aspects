import { readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { aspectSchema } from "../lib/schema";
import { ASPECTS_DIR } from "../utils/paths";

// Model family detection
type ModelFamily = "claude-modern" | "gpt-modern" | "claude-legacy" | "gpt-legacy" | "unknown";

function detectModelFamily(model: string): ModelFamily {
  const lower = model.toLowerCase();
  
  // Claude models
  if (lower.includes("claude")) {
    if (lower.includes("claude-4") || lower.includes("claude-3.5") || lower.includes("claude-3-5")) {
      return "claude-modern";
    }
    return "claude-legacy";
  }
  
  // GPT models
  if (lower.includes("gpt")) {
    if (lower.includes("gpt-4.1") || lower.includes("gpt-4o") || lower.includes("gpt-4-turbo")) {
      return "gpt-modern";
    }
    return "gpt-legacy";
  }
  
  // Default to modern formatting
  return "unknown";
}

function formatDirectivesForModel(
  directives: Array<{ id: string; rule: string; priority: string }>,
  family: ModelFamily,
  options?: { isReminder?: boolean }
): string {
  if (directives.length === 0) return "";

  const isModern = family === "claude-modern" || family === "gpt-modern" || family === "unknown";
  const isReminder = options?.isReminder ?? false;

  if (isModern) {
    // XML format for modern models
    const tagName = isReminder ? "critical-reminders" : "directives";
    const rules = directives
      .map((d) => `  <rule id="${d.id}" priority="${d.priority}">${d.rule}</rule>`)
      .join("\n");
    
    if (isReminder) {
      return `<!-- Universal Pattern: High-priority directives repeated here for cross-LLM compatibility.
     Claude weights prompt beginning; GPT weights prompt end. Repetition ensures emphasis on both. -->
<${tagName}>\n${rules}\n</${tagName}>\n`;
    }
    return `<${tagName}>\n${rules}\n</${tagName}>\n\n`;
  }
  
  // Markdown format for legacy models
  let output = "";
  
  if (isReminder) {
    output += "<!-- Note: Critical directives repeated below for cross-model compatibility -->\n";
    output += "## Critical Reminders\n\n";
  }

  const highPriority = directives.filter((d) => d.priority === "high");
  const otherPriority = directives.filter((d) => d.priority !== "high");

  for (const d of highPriority) {
    output += `**IMPORTANT**: ${d.rule}\n\n`;
  }

  if (!isReminder && otherPriority.length > 0) {
    for (const d of otherPriority) {
      output += `- ${d.rule}\n`;
    }
    output += "\n";
  }

  return output;
}

function formatInstructionsForModel(
  instructions: Array<{ id: string; rule: string }>,
  family: ModelFamily
): string {
  if (instructions.length === 0) return "";

  const isModern = family === "claude-modern" || family === "gpt-modern" || family === "unknown";

  if (isModern) {
    // XML format for modern models
    const rules = instructions
      .map((i) => `  <guideline id="${i.id}">${i.rule}</guideline>`)
      .join("\n");
    return `<instructions>\n${rules}\n</instructions>\n\n`;
  }
  
  // Markdown format for legacy models
  let output = "## Guidelines\n\n";
  for (const i of instructions) {
    output += `- ${i.rule}\n`;
  }
  output += "\n";

  return output;
}

export default defineCommand({
  meta: {
    name: "compile",
    description: "Compile an aspect's prompt for a specific model",
  },
  args: {
    name: {
      type: "positional",
      description: "Aspect name or path",
      required: true,
    },
    model: {
      type: "string",
      alias: "m",
      description: "Target model (e.g., claude-haiku-4-5, gpt-4o)",
      required: true,
    },
    mode: {
      type: "string",
      description: "Activate a mode",
    },
    output: {
      type: "string",
      alias: "o",
      description: "Write to file instead of stdout",
    },
    verbose: {
      type: "boolean",
      alias: "v",
      description: "Show which directives are active",
      default: false,
    },
  },
  async run({ args }) {
    // Find the aspect
    let aspectPath: string;
    let aspectContent: string;

    // Check if it's a path
    try {
      const stats = await stat(args.name);
      if (stats.isDirectory()) {
        aspectPath = join(args.name, "aspect.json");
      } else {
        aspectPath = args.name;
      }
      aspectContent = await readFile(aspectPath, "utf-8");
    } catch {
      // Try installed aspects
      try {
        aspectPath = join(ASPECTS_DIR, args.name, "aspect.json");
        aspectContent = await readFile(aspectPath, "utf-8");
      } catch {
        p.log.error(`Aspect not found: ${args.name}`);
        p.log.info("Try: aspects list");
        process.exit(1);
      }
    }

    // Parse and validate
    let data: unknown;
    try {
      data = JSON.parse(aspectContent);
    } catch {
      p.log.error("Invalid JSON in aspect file");
      process.exit(1);
    }

    const result = aspectSchema.safeParse(data);
    if (!result.success) {
      p.log.error("Invalid aspect schema");
      for (const issue of result.error.issues) {
        p.log.error(`  ${issue.path.join(".")}: ${issue.message}`);
      }
      process.exit(1);
    }

    const aspect = result.data;
    const model = args.model;
    const family = detectModelFamily(model);

    if (args.verbose) {
      p.log.info(`Compiling ${aspect.name} for ${model}...`);
      p.log.info("");
      p.log.info(`Model family: ${family}`);
    }

    // Collect directives and instructions from aspect
    const directives: Array<{ id: string; rule: string; priority: string }> = aspect.directives || [];
    const instructions: Array<{ id: string; rule: string }> = aspect.instructions || [];

    // Check for mode
    let modeInfo: { description: string; critical?: string } | null = null;
    if (args.mode && aspect.modes) {
      modeInfo = aspect.modes[args.mode] || null;
      if (!modeInfo) {
        p.log.error(`Mode not found: ${args.mode}`);
        p.log.info(`Available modes: ${Object.keys(aspect.modes).join(", ")}`);
        process.exit(1);
      }

      if (args.verbose) {
        p.log.info(`Active mode: ${args.mode}`);
        p.log.info(`  ${modeInfo.description}`);
      }
    }

    if (args.verbose && directives.length > 0) {
      p.log.info(`Active directives: ${directives.length}`);
      for (const d of directives) {
        p.log.info(`  ✓ ${d.id} [${d.priority}]`);
      }
      p.log.info("");
    }

    // Build compiled prompt with Universal Pattern:
    // - Directives at START (Claude weights beginning)
    // - Directives repeated at END (GPT weights end)
    let compiled = "";

    // Add directives section at START
    if (directives.length > 0) {
      compiled += formatDirectivesForModel(directives, family);
    }

    // Add instructions section
    if (instructions.length > 0) {
      compiled += formatInstructionsForModel(instructions, family);
    }

    // Add mode critical section if present
    if (modeInfo?.critical) {
      if (family === "claude-modern" || family === "gpt-modern" || family === "unknown") {
        compiled += `<mode name="${args.mode}">\n${modeInfo.critical}\n</mode>\n\n`;
      } else {
        compiled += `## Mode: ${args.mode}\n${modeInfo.critical}\n\n`;
      }
    }

    // Add main prompt
    compiled += aspect.prompt;

    // Universal Pattern: Repeat high-priority directives at END
    // This ensures emphasis on both Claude (beginning-weighted) and GPT (end-weighted)
    const highPriorityDirectives = directives.filter(d => d.priority === "high");
    if (highPriorityDirectives.length > 0) {
      compiled += "\n\n";
      compiled += formatDirectivesForModel(highPriorityDirectives, family, { isReminder: true });
    }

    // Add voice hints as comment for reference
    if (aspect.voiceHints && args.verbose) {
      p.log.info("");
      p.log.info("Voice hints:");
      if (aspect.voiceHints.speed) {
        p.log.info(`  Speed: ${aspect.voiceHints.speed}`);
      }
      if (aspect.voiceHints.emotions) {
        p.log.info(`  Emotions: ${aspect.voiceHints.emotions.join(", ")}`);
      }
      if (aspect.voiceHints.styleHints) {
        p.log.info(`  Style: ${aspect.voiceHints.styleHints}`);
      }
    }

    // Output
    if (args.output) {
      await writeFile(args.output, compiled);
      p.log.success(`Written to ${args.output}`);
    } else {
      if (args.verbose) {
        p.log.info("");
        p.log.info("--- Compiled Prompt ---");
        p.log.info("");
      }
      console.log(compiled);
    }
  },
});
