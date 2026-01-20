import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { c, icons } from "../utils/colors";
import { getSetsDir, ensureSetsDir } from "../utils/paths";
import { readConfig } from "../lib/config";
import { installAspect } from "../lib/installer";
import { parseInstallSpec } from "../lib/resolver";
import { fetchRegistryIndex } from "../lib/registry";

interface AspectSet {
  schemaVersion: number;
  name: string;
  displayName: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  aspects: string[];
}

async function loadSet(name: string): Promise<AspectSet | null> {
  try {
    const setPath = join(getSetsDir(), name, "set.json");
    const content = await readFile(setPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function saveSet(set: AspectSet): Promise<void> {
  await ensureSetsDir();
  const setDir = join(getSetsDir(), set.name);
  await mkdir(setDir, { recursive: true });
  set.updatedAt = new Date().toISOString();
  await writeFile(join(setDir, "set.json"), JSON.stringify(set, null, 2) + "\n");
}

async function listAllSets(): Promise<AspectSet[]> {
  try {
    await ensureSetsDir();
    const setsDir = getSetsDir();
    const entries = await readdir(setsDir, { withFileTypes: true });
    const sets: AspectSet[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const set = await loadSet(entry.name);
        if (set) sets.push(set);
      }
    }

    return sets;
  } catch {
    return [];
  }
}

// Subcommand: set create
const createCommand = defineCommand({
  meta: {
    name: "create",
    description: "Create a new aspect set",
  },
  args: {
    name: {
      type: "positional",
      description: "Set name (slug)",
      required: true,
    },
    aspects: {
      type: "positional",
      description: "Aspects to include (optional, launches wizard if omitted)",
      required: false,
    },
  },
  async run({ args }) {
    const setName = args.name as string;
    const aspectArgs = args.aspects
      ? Array.isArray(args.aspects)
        ? args.aspects
        : [args.aspects]
      : [];

    // Check if set already exists
    const existing = await loadSet(setName);
    if (existing) {
      console.log();
      console.log(`${icons.error} Set "${setName}" already exists.`);
      console.log(`  Use ${c.cmd("aspects set add")} to add aspects to it.`);
      console.log();
      return;
    }

    let displayName = setName;
    let description = "";
    let aspectsToAdd: string[] = [...aspectArgs];

    // If no aspects provided, run wizard
    if (aspectsToAdd.length === 0) {
      p.intro(`${icons.package} Create a new set`);

      const nameResult = await p.text({
        message: "Display name",
        placeholder: setName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        defaultValue: setName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      });
      if (p.isCancel(nameResult)) {
        p.cancel("Cancelled");
        return;
      }
      displayName = nameResult as string;

      const descResult = await p.text({
        message: "Description (optional)",
        placeholder: "A collection of my favorite aspects",
      });
      if (p.isCancel(descResult)) {
        p.cancel("Cancelled");
        return;
      }
      description = (descResult as string) || "";

      // Get installed aspects for selection
      const config = await readConfig();
      const installedAspects = Object.keys(config.installed);

      if (installedAspects.length > 0) {
        const selected = await p.multiselect({
          message: "Select aspects to include",
          options: installedAspects.map((name) => ({
            value: name,
            label: name,
          })),
          required: false,
        });

        if (p.isCancel(selected)) {
          p.cancel("Cancelled");
          return;
        }

        aspectsToAdd = selected as string[];
      } else {
        p.log.info("No installed aspects found. You can add aspects later.");
      }
    }

    // Create the set
    const newSet: AspectSet = {
      schemaVersion: 1,
      name: setName,
      displayName,
      description: description || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      aspects: aspectsToAdd,
    };

    await saveSet(newSet);

    console.log();
    console.log(`${icons.success} Created set: ${c.bold(displayName)}`);
    console.log(`  ${c.muted(`${aspectsToAdd.length} aspect${aspectsToAdd.length === 1 ? "" : "s"}`)}`);
    console.log(`  ${c.muted(`Location: ~/.aspects/sets/${setName}/set.json`)}`);
    console.log();
  },
});

// Subcommand: set list
const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List all local sets",
  },
  async run() {
    const sets = await listAllSets();

    console.log();
    if (sets.length === 0) {
      console.log(`${icons.info} No sets found.`);
      console.log(`  Create one with: ${c.cmd("aspects set create my-favorites")}`);
      console.log();
      return;
    }

    console.log(`${icons.package} Local sets (${sets.length})`);
    console.log();

    for (const set of sets) {
      console.log(`  ${c.bold(set.displayName)} ${c.muted(`(${set.name})`)}`);
      if (set.description) {
        console.log(`    ${c.italic(set.description)}`);
      }
      console.log(`    ${c.muted(`${set.aspects.length} aspect${set.aspects.length === 1 ? "" : "s"}: ${set.aspects.join(", ") || "(empty)"}`)}`);
    }
    console.log();
  },
});

// Subcommand: set add
const addCommand = defineCommand({
  meta: {
    name: "add",
    description: "Add aspect(s) to a set",
  },
  args: {
    set: {
      type: "positional",
      description: "Set name",
      required: true,
    },
    aspects: {
      type: "positional",
      description: "Aspect name(s) to add",
      required: true,
    },
  },
  async run({ args }) {
    const setName = args.set as string;
    const aspectsToAdd = Array.isArray(args.aspects) ? args.aspects : [args.aspects];

    const set = await loadSet(setName);
    if (!set) {
      console.log();
      console.log(`${icons.error} Set "${setName}" not found.`);
      console.log(`  Create it with: ${c.cmd(`aspects set create ${setName}`)}`);
      console.log();
      return;
    }

    let added = 0;
    for (const aspect of aspectsToAdd) {
      if (!set.aspects.includes(aspect)) {
        set.aspects.push(aspect);
        added++;
      }
    }

    await saveSet(set);

    console.log();
    if (added > 0) {
      console.log(`${icons.success} Added ${added} aspect${added === 1 ? "" : "s"} to ${c.bold(set.displayName)}`);
    } else {
      console.log(`${icons.info} All aspects already in set.`);
    }
    console.log(`  ${c.muted(`Total: ${set.aspects.length} aspect${set.aspects.length === 1 ? "" : "s"}`)}`);
    console.log();
  },
});

// Subcommand: set remove
const removeCommand = defineCommand({
  meta: {
    name: "remove",
    description: "Remove aspect(s) from a set",
  },
  args: {
    set: {
      type: "positional",
      description: "Set name",
      required: true,
    },
    aspects: {
      type: "positional",
      description: "Aspect name(s) to remove",
      required: true,
    },
  },
  async run({ args }) {
    const setName = args.set as string;
    const aspectsToRemove = Array.isArray(args.aspects) ? args.aspects : [args.aspects];

    const set = await loadSet(setName);
    if (!set) {
      console.log();
      console.log(`${icons.error} Set "${setName}" not found.`);
      console.log();
      return;
    }

    const before = set.aspects.length;
    set.aspects = set.aspects.filter((a) => !aspectsToRemove.includes(a));
    const removed = before - set.aspects.length;

    await saveSet(set);

    console.log();
    if (removed > 0) {
      console.log(`${icons.success} Removed ${removed} aspect${removed === 1 ? "" : "s"} from ${c.bold(set.displayName)}`);
    } else {
      console.log(`${icons.info} No matching aspects found in set.`);
    }
    console.log(`  ${c.muted(`Remaining: ${set.aspects.length} aspect${set.aspects.length === 1 ? "" : "s"}`)}`);
    console.log();
  },
});

// Subcommand: set install
const installCommand = defineCommand({
  meta: {
    name: "install",
    description: "Install all aspects in a set",
  },
  args: {
    set: {
      type: "positional",
      description: "Set name",
      required: true,
    },
  },
  async run({ args }) {
    const setName = args.set as string;

    const set = await loadSet(setName);
    if (!set) {
      console.log();
      console.log(`${icons.error} Set "${setName}" not found.`);
      console.log();
      return;
    }

    if (set.aspects.length === 0) {
      console.log();
      console.log(`${icons.info} Set "${set.displayName}" is empty.`);
      console.log();
      return;
    }

    console.log();
    console.log(`${icons.package} Installing set: ${c.bold(set.displayName)} (${set.aspects.length} aspects)`);
    console.log();

    let installed = 0;
    let alreadyInstalled = 0;
    let failed = 0;

    for (const aspectName of set.aspects) {
      try {
        const spec = parseInstallSpec(aspectName);
        const result = await installAspect(spec);

        if (result.success) {
          if (result.alreadyInstalled) {
            console.log(`  ${icons.info} ${c.muted(aspectName)} (already installed)`);
            alreadyInstalled++;
          } else {
            console.log(`  ${icons.success} ${aspectName}`);
            installed++;
          }
        } else {
          console.log(`  ${icons.error} ${c.error(aspectName)}: ${result.error}`);
          failed++;
        }
      } catch (err) {
        console.log(`  ${icons.error} ${c.error(aspectName)}: ${(err as Error).message}`);
        failed++;
      }
    }

    console.log();
    console.log(c.muted(`${installed} installed, ${alreadyInstalled} already installed, ${failed} failed`));
    console.log();
  },
});

// Subcommand: set publish
const publishCommand = defineCommand({
  meta: {
    name: "publish",
    description: "Publish a set to the registry (requires qualified names)",
  },
  args: {
    set: {
      type: "positional",
      description: "Set name",
      required: true,
    },
  },
  async run({ args }) {
    const setName = args.set as string;

    p.intro(`${icons.package} Publish set`);

    const set = await loadSet(setName);
    if (!set) {
      p.outro(`${icons.error} Set "${setName}" not found.`);
      return;
    }

    if (set.aspects.length === 0) {
      p.outro(`${icons.error} Set "${set.displayName}" is empty.`);
      return;
    }

    console.log();
    console.log(`  ${c.bold(set.displayName)}`);
    console.log(`  ${c.dim(set.description || "No description")}`);
    console.log();

    // Check and resolve aspect names to qualified format
    const index = await fetchRegistryIndex();

    const qualifiedAspects: string[] = [];
    const issues: string[] = [];

    for (const aspectName of set.aspects) {
      // Already qualified?
      if (aspectName.includes("/")) {
        qualifiedAspects.push(aspectName);
        console.log(`  ${icons.success} ${aspectName}`);
        continue;
      }

      // Find in registry
      const matches: string[] = [];
      for (const [name, entry] of Object.entries(index.aspects)) {
        if (name === aspectName) {
          const publisher = entry.metadata.publisher || "unknown";
          matches.push(`${publisher}/${name}`);
        }
      }

      if (matches.length === 0) {
        issues.push(`"${aspectName}" not found in registry`);
        console.log(`  ${icons.error} ${aspectName} - not found in registry`);
      } else if (matches.length === 1 && matches[0]) {
        qualifiedAspects.push(matches[0]);
        console.log(`  ${icons.success} ${aspectName} ${icons.arrow} ${matches[0]}`);
      } else {
        // Multiple matches - prompt user
        console.log(`  ${icons.warn} ${aspectName} - found ${matches.length} matches:`);
        const choice = await p.select({
          message: `Which "${aspectName}"?`,
          options: matches.map((m, i) => ({ value: m, label: m })),
        });

        if (p.isCancel(choice)) {
          p.outro("Cancelled");
          return;
        }

        qualifiedAspects.push(choice as string);
        console.log(`    ${icons.arrow} Selected: ${choice}`);
      }
    }

    if (issues.length > 0) {
      console.log();
      console.log(`${icons.error} Cannot publish: ${issues.length} aspect(s) not found in registry.`);
      console.log(`  ${c.dim("All aspects must be in the registry before publishing a set.")}`);
      p.outro("Fix issues and try again");
      return;
    }

    console.log();
    console.log(`${icons.success} Set ready for publishing with qualified names:`);
    for (const qa of qualifiedAspects) {
      console.log(`  ${c.dim("-")} ${qa}`);
    }

    console.log();
    const confirm = await p.confirm({
      message: "Create PR to registry?",
    });

    if (p.isCancel(confirm) || !confirm) {
      p.outro("Cancelled");
      return;
    }

    // For now, just show instructions
    console.log();
    console.log(`${c.dim("To submit your set to the registry:")}`);
    console.log(`  1. Fork https://github.com/aimorphist/aspects`);
    console.log(`  2. Add your set to registry/index.json under "sets"`);
    console.log(`  3. Create a PR`);
    console.log();
    console.log(`${c.dim("Set JSON to add:")}`);
    console.log();

    const setJson = {
      displayName: set.displayName,
      description: set.description || "",
      aspects: qualifiedAspects,
      publisher: "your-username",
      trust: "community",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log(JSON.stringify({ [`your-username/${set.name}`]: setJson }, null, 2));
    console.log();

    p.outro("Copy the JSON above and add it to the registry");
  },
});

// Main set command with subcommands
export default defineCommand({
  meta: {
    name: "set",
    description: "Manage aspect sets (collections)",
  },
  subCommands: {
    create: createCommand,
    list: listCommand,
    add: addCommand,
    remove: removeCommand,
    install: installCommand,
    publish: publishCommand,
  },
});

// Export for create wizard integration
export { listAllSets, loadSet, saveSet, type AspectSet };
