import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { c, icons } from "../utils/colors";
import { getAspectPath } from "../utils/paths";
import { readConfig } from "../lib/config";
import { parseAspectFile } from "../lib/parser";
import type { Aspect } from "../lib/types";

const CATEGORIES = [
  "assistant",
  "roleplay",
  "creative",
  "productivity",
  "education",
  "gaming",
  "spiritual",
  "pundit",
  "guide",
];

async function listLocalAspects(): Promise<Array<{ name: string; path: string; aspect: Aspect }>> {
  const config = await readConfig();
  const results: Array<{ name: string; path: string; aspect: Aspect }> = [];

  for (const [name, info] of Object.entries(config.installed)) {
    const aspectPath = (info as { path?: string }).path || getAspectPath(name);
    const parseResult = await parseAspectFile(join(aspectPath, "aspect.json"));
    if (parseResult.success) {
      results.push({ name, path: aspectPath, aspect: parseResult.aspect });
    }
  }

  return results;
}

export default defineCommand({
  meta: {
    name: "edit",
    description: "Edit an existing aspect with prepopulated values",
  },
  args: {
    name: {
      type: "positional",
      description: "Aspect name to edit (lists all if omitted)",
      required: false,
    },
  },
  async run({ args }) {
    const aspects = await listLocalAspects();

    if (aspects.length === 0) {
      console.log();
      console.log(`${icons.info} No local aspects found.`);
      console.log(`  Create one with: ${c.cmd("aspects create my-aspect")}`);
      console.log();
      return;
    }

    let selectedAspect: { name: string; path: string; aspect: Aspect };

    if (args.name) {
      const found = aspects.find((a) => a.name === args.name);
      if (!found) {
        console.log();
        console.log(`${icons.error} Aspect "${args.name}" not found.`);
        console.log();
        console.log("Available aspects:");
        for (const a of aspects) {
          console.log(`  ${c.aspect(a.name)}`);
        }
        console.log();
        return;
      }
      selectedAspect = found;
    } else {
      p.intro(`${icons.sparkle} Edit an aspect`);

      const selected = await p.select({
        message: "Select aspect to edit",
        options: aspects.map((a) => ({
          value: a.name,
          label: `${a.aspect.displayName} (${a.name}@${a.aspect.version})`,
          hint: a.aspect.tagline,
        })),
      });

      if (p.isCancel(selected)) {
        p.cancel("Cancelled");
        return;
      }

      selectedAspect = aspects.find((a) => a.name === selected)!;
    }

    const aspect = selectedAspect.aspect;

    p.log.info(`Editing ${c.bold(aspect.displayName)} (${aspect.name})`);
    p.log.info(c.muted("Press Enter to keep current value, or type new value"));
    console.log();

    // Edit fields with current values as defaults
    const displayName = await p.text({
      message: "Display name",
      placeholder: aspect.displayName,
      defaultValue: aspect.displayName,
    });
    if (p.isCancel(displayName)) {
      p.cancel("Cancelled");
      return;
    }

    const tagline = await p.text({
      message: "Tagline",
      placeholder: aspect.tagline,
      defaultValue: aspect.tagline,
    });
    if (p.isCancel(tagline)) {
      p.cancel("Cancelled");
      return;
    }

    const category = await p.select({
      message: "Category",
      options: CATEGORIES.map((cat) => ({
        value: cat,
        label: cat,
        hint: cat === aspect.category ? "(current)" : undefined,
      })),
      initialValue: aspect.category || "assistant",
    });
    if (p.isCancel(category)) {
      p.cancel("Cancelled");
      return;
    }

    const tagsStr = await p.text({
      message: "Tags (comma-separated)",
      placeholder: aspect.tags?.join(", ") || "",
      defaultValue: aspect.tags?.join(", ") || "",
    });
    if (p.isCancel(tagsStr)) {
      p.cancel("Cancelled");
      return;
    }

    const author = await p.text({
      message: "Author",
      placeholder: aspect.author || "",
      defaultValue: aspect.author || "",
    });
    if (p.isCancel(author)) {
      p.cancel("Cancelled");
      return;
    }

    const version = await p.text({
      message: "Version",
      placeholder: aspect.version,
      defaultValue: aspect.version,
    });
    if (p.isCancel(version)) {
      p.cancel("Cancelled");
      return;
    }

    // Build updated aspect
    const updatedAspect: Aspect = {
      ...aspect,
      displayName: displayName as string,
      tagline: tagline as string,
      category: category as string,
      tags: (tagsStr as string)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      author: (author as string) || undefined,
      version: version as string,
    };

    // Show changes
    const changes: string[] = [];
    if (updatedAspect.displayName !== aspect.displayName) changes.push("displayName");
    if (updatedAspect.tagline !== aspect.tagline) changes.push("tagline");
    if (updatedAspect.category !== aspect.category) changes.push("category");
    if (JSON.stringify(updatedAspect.tags) !== JSON.stringify(aspect.tags)) changes.push("tags");
    if (updatedAspect.author !== aspect.author) changes.push("author");
    if (updatedAspect.version !== aspect.version) changes.push("version");

    if (changes.length === 0) {
      p.log.info("No changes made.");
      p.outro("Done");
      return;
    }

    // Confirm save
    const confirm = await p.confirm({
      message: `Save changes? (${changes.join(", ")})`,
      initialValue: true,
    });

    if (p.isCancel(confirm) || !confirm) {
      p.cancel("Cancelled");
      return;
    }

    // Save updated aspect
    const aspectPath = join(selectedAspect.path, "aspect.json");
    const content = await readFile(aspectPath, "utf-8");
    
    // Simple YAML update - replace values in existing file
    let updatedContent = content;
    if (changes.includes("displayName")) {
      updatedContent = updatedContent.replace(
        /displayName:.*$/m,
        `displayName: "${updatedAspect.displayName}"`
      );
    }
    if (changes.includes("tagline")) {
      updatedContent = updatedContent.replace(
        /tagline:.*$/m,
        `tagline: "${updatedAspect.tagline}"`
      );
    }
    if (changes.includes("category")) {
      updatedContent = updatedContent.replace(
        /category:.*$/m,
        `category: ${updatedAspect.category}`
      );
    }
    if (changes.includes("version")) {
      updatedContent = updatedContent.replace(
        /version:.*$/m,
        `version: "${updatedAspect.version}"`
      );
    }
    if (changes.includes("author")) {
      if (content.includes("author:")) {
        updatedContent = updatedContent.replace(
          /author:.*$/m,
          `author: "${updatedAspect.author}"`
        );
      }
    }
    if (changes.includes("tags")) {
      const tagsYaml = updatedAspect.tags?.length
        ? `tags:\n${updatedAspect.tags.map((t) => `  - ${t}`).join("\n")}`
        : "tags: []";
      if (content.includes("tags:")) {
        // Replace existing tags block
        updatedContent = updatedContent.replace(
          /tags:[\s\S]*?(?=\n\w|\n$|$)/m,
          tagsYaml + "\n"
        );
      }
    }

    await writeFile(aspectPath, updatedContent);

    console.log();
    console.log(`${icons.success} Updated ${c.bold(selectedAspect.name)}/aspect.json`);
    console.log(`  ${c.muted(`Changed: ${changes.join(", ")}`)}`);
    console.log();
  },
});
