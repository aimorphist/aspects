import { readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { aspectSchema, type PersonalityAspectFromSchema } from "../lib/schema";
import { ASPECTS_DIR } from "../utils/paths";

export default defineCommand({
  meta: {
    name: "compile",
    description: `Emit an aspect's prompt as a single ready-to-use string.

Directives, instructions, and modes are baked into the prompt text by
\`aspects create\`, so compilation is now a straight read-and-emit.

Examples:
  aspects compile alaric
  aspects compile alaric -o prompt.txt
  aspects compile ./my-aspect --verbose`,
  },
  args: {
    name: {
      type: "positional",
      description: "Aspect name or path",
      required: true,
    },
    output: {
      type: "string",
      alias: "o",
      description: "Write to file instead of stdout",
    },
    verbose: {
      type: "boolean",
      alias: "v",
      description: "Show metadata before the compiled prompt",
      default: false,
    },
  },
  async run({ args }) {
    // Resolve the aspect file: explicit path > installed name.
    let aspectPath: string;
    let aspectContent: string;

    try {
      const stats = await stat(args.name);
      aspectPath = stats.isDirectory() ? join(args.name, "aspect.json") : args.name;
      aspectContent = await readFile(aspectPath, "utf-8");
    } catch {
      try {
        aspectPath = join(ASPECTS_DIR, args.name, "aspect.json");
        aspectContent = await readFile(aspectPath, "utf-8");
      } catch {
        p.log.error(`Aspect not found: ${args.name}`);
        p.log.info("Try: aspects list");
        process.exit(1);
      }
    }

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

    if ('kind' in aspect && aspect.kind === 'schema') {
      p.log.error(`Cannot compile schema-aspect "${aspect.name}" — schema aspects carry a JSON Schema body, not a prompt.`);
      p.log.info('Use `aspects info` to inspect a schema-aspect.');
      process.exit(1);
    }

    if ('implements' in aspect) {
      p.log.error(`Cannot compile general-aspect "${aspect.name}" — general aspects carry structured data, not a prompt.`);
      p.log.info('Use `aspects info` to inspect a general-aspect.');
      process.exit(1);
    }

    const personality = aspect as PersonalityAspectFromSchema;

    if (args.verbose) {
      p.log.info(`Compiling ${personality.name}@${personality.version}`);
      if (personality.voiceHints) {
        if (personality.voiceHints.speed) p.log.info(`  Speed: ${personality.voiceHints.speed}`);
        if (personality.voiceHints.emotions?.length) {
          p.log.info(`  Emotions: ${personality.voiceHints.emotions.join(", ")}`);
        }
        if (personality.voiceHints.styleHints) p.log.info(`  Style: ${personality.voiceHints.styleHints}`);
      }
    }

    const compiled = personality.prompt;

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
