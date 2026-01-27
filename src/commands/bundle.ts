import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { c, icons } from "../utils/colors";
import { getAspectPath } from "../utils/paths";
import { readConfig } from "../lib/config";
import { fetchRegistryIndex, fetchAspectContent } from "../lib/registry";
import type { Aspect } from "../lib/types";
import { getSetsDir } from "../utils/paths";

interface BundleOutput {
  bundleVersion: number;
  createdAt: string;
  aspects: Aspect[];
}

interface FindFilter {
  field: string;
  value: string;
  operator: "and" | "or" | "not";
}

function parseQuery(query: string): FindFilter[] {
  const filters: FindFilter[] = [];
  const parts = query.split(/\s+/);
  let currentOperator: "and" | "or" | "not" = "and";

  for (const part of parts) {
    if (part === "--or") {
      currentOperator = "or";
      continue;
    }
    if (part === "--not") {
      currentOperator = "not";
      continue;
    }
    if (part === "--deep") {
      filters.push({ field: "deep", value: "true", operator: currentOperator });
      currentOperator = "and";
      continue;
    }

    // Check for field:value pattern
    const colonIndex = part.indexOf(":");
    if (colonIndex > 0) {
      const field = part.slice(0, colonIndex);
      const value = part.slice(colonIndex + 1);
      filters.push({ field, value, operator: currentOperator });
    } else {
      // Plain text search (name or deep)
      filters.push({ field: "name", value: part, operator: currentOperator });
    }
    currentOperator = "and";
  }

  return filters;
}

function matchesFilters(aspect: Aspect, filters: FindFilter[]): boolean {
  if (filters.length === 0) return true;

  let result = true;
  let hasOrMatch = false;
  let hasOrFilter = false;

  for (const filter of filters) {
    const matches = matchesFilter(aspect, filter);

    if (filter.operator === "not") {
      if (matches) return false;
    } else if (filter.operator === "or") {
      hasOrFilter = true;
      if (matches) hasOrMatch = true;
    } else {
      // AND
      if (!matches) result = false;
    }
  }

  if (hasOrFilter && !hasOrMatch) return false;
  return result;
}

function matchesFilter(aspect: Aspect, filter: FindFilter): boolean {
  const value = filter.value.toLowerCase();

  switch (filter.field) {
    case "name":
      return aspect.name.toLowerCase().includes(value);
    case "category":
      return aspect.category?.toLowerCase() === value;
    case "tag":
      return aspect.tags?.some((t) => t.toLowerCase() === value) ?? false;
    case "publisher":
      return aspect.publisher?.toLowerCase() === value;
    case "trust":
      // Trust is only available from registry metadata
      return false;
    case "deep":
      // Deep search is handled separately
      return true;
    default:
      return false;
  }
}

async function loadLocalAspects(): Promise<Aspect[]> {
  const config = await readConfig();
  const aspects: Aspect[] = [];

  for (const name of Object.keys(config.installed || {})) {
    try {
      const aspectPath = join(getAspectPath(name), "aspect.json");
      const content = await readFile(aspectPath, "utf-8");
      aspects.push(JSON.parse(content));
    } catch {
      // Skip aspects that can't be loaded
    }
  }

  return aspects;
}

async function loadRegistryAspects(): Promise<Aspect[]> {
  const index = await fetchRegistryIndex();
  const aspects: Aspect[] = [];

  for (const [name, entry] of Object.entries(index.aspects)) {
    try {
      const versionInfo = entry.versions[entry.latest];
      if (versionInfo?.url) {
        const yamlContent = await fetchAspectContent(versionInfo.url);
        const aspect = JSON.parse(yamlContent);
        aspects.push(aspect);
      }
    } catch {
      // Skip aspects that can't be fetched
    }
  }

  return aspects;
}

export default defineCommand({
  meta: {
    name: "bundle",
    description: "Bundle multiple aspects into a single JSON file",
  },
  args: {
    aspects: {
      type: "positional",
      description: "Aspect names to bundle",
      required: false,
    },
    output: {
      type: "string",
      alias: "o",
      description: "Output file (default: bundle.json)",
      default: "bundle.json",
    },
    find: {
      type: "string",
      alias: "f",
      description: "Use find query to select aspects",
    },
    set: {
      type: "string",
      alias: "s",
      description: "Bundle all aspects from a set",
    },
    registry: {
      type: "boolean",
      alias: "r",
      description: "Fetch from registry instead of local",
      default: false,
    },
    dryRun: {
      type: "boolean",
      description: "Preview what would be bundled",
      default: false,
    },
  },
  async run({ args }) {
    const aspectNames = args.aspects
      ? Array.isArray(args.aspects)
        ? args.aspects
        : [args.aspects]
      : [];

    p.intro(`${pc.cyan("📦")} Bundle aspects`);

    const aspectsToBundle: Aspect[] = [];
    const useRegistry = args.registry as boolean;

    // 1. Add explicit aspects
    if (aspectNames.length > 0) {
      const spinner = p.spinner();
      spinner.start(
        `Loading ${aspectNames.length} aspect(s) from ${useRegistry ? "registry" : "local"}...`
      );

      for (const name of aspectNames) {
        try {
          if (useRegistry) {
            const index = await fetchRegistryIndex();
            // Handle qualified names (publisher/name)
            const aspectName = name.includes("/") ? name.split("/")[1] : name;
            const entry = index.aspects[aspectName];
            if (entry) {
              const versionInfo = entry.versions[entry.latest];
              if (versionInfo?.url) {
                const content = await fetchAspectContent(versionInfo.url);
                const aspect = JSON.parse(content);
                aspectsToBundle.push(aspect);
              }
            }
          } else {
            const aspectPath = join(getAspectPath(name), "aspect.json");
            const content = await readFile(aspectPath, "utf-8");
            aspectsToBundle.push(JSON.parse(content));
          }
        } catch (error) {
          spinner.stop(`Failed to load aspect: ${name}`);
          console.log(`  ${icons.error} Could not load aspect: ${name}`);
        }
      }

      spinner.stop(`Loaded ${aspectsToBundle.length} explicit aspect(s)`);
    }

    // 2. Add aspects from find query
    if (args.find) {
      const spinner = p.spinner();
      spinner.start(`Searching with query: ${args.find}`);

      const filters = parseQuery(args.find as string);
      const allAspects = useRegistry
        ? await loadRegistryAspects()
        : await loadLocalAspects();

      const matches = allAspects.filter((a) => matchesFilters(a, filters));

      for (const aspect of matches) {
        if (!aspectsToBundle.some((a) => a.name === aspect.name)) {
          aspectsToBundle.push(aspect);
        }
      }

      spinner.stop(`Found ${matches.length} aspect(s) matching query`);
    }

    // 3. Add aspects from set
    if (args.set) {
      const spinner = p.spinner();
      spinner.start(`Loading set: ${args.set}`);

      const set = await loadSet(args.set as string);
      if (!set) {
        spinner.stop(`Set not found: ${args.set}`);
        p.outro(`${icons.error} Set "${args.set}" not found`);
        return;
      }

      for (const aspectName of set.aspects) {
        try {
          if (useRegistry) {
            const index = await fetchRegistryIndex();
            const name = aspectName.includes("/")
              ? aspectName.split("/")[1]!
              : aspectName;
            const entry = index.aspects[name];
            if (entry) {
              const versionInfo = entry.versions[entry.latest];
              if (versionInfo?.url) {
                const content = await fetchAspectContent(versionInfo.url);
                const aspect = JSON.parse(content);
                if (!aspectsToBundle.some((a) => a.name === aspect.name)) {
                  aspectsToBundle.push(aspect);
                }
              }
            }
          } else {
            const aspectPath = join(getAspectPath(aspectName), "aspect.json");
            const content = await readFile(aspectPath, "utf-8");
            const aspect = JSON.parse(content);
            if (!aspectsToBundle.some((a) => a.name === aspect.name)) {
              aspectsToBundle.push(aspect);
            }
          }
        } catch {
          console.log(`  ${icons.warn} Could not load aspect from set: ${aspectName}`);
        }
      }

      spinner.stop(`Loaded ${set.aspects.length} aspect(s) from set`);
    }

    // Check if we have any aspects
    if (aspectsToBundle.length === 0) {
      p.outro(`${icons.error} No aspects to bundle`);
      return;
    }

    // Dry run - just show what would be bundled
    if (args.dryRun) {
      console.log();
      console.log(`${c.dim("Would bundle")} ${pc.cyan(aspectsToBundle.length.toString())} ${c.dim("aspects:")}`);
      for (const aspect of aspectsToBundle) {
        console.log(`  ${pc.green("•")} ${aspect.name} - ${aspect.tagline || ""}`);
      }
      console.log();
      p.outro("Dry run complete");
      return;
    }

    // Create bundle
    const bundle: BundleOutput = {
      bundleVersion: 1,
      createdAt: new Date().toISOString(),
      aspects: aspectsToBundle,
    };

    // Write to file
    const outputPath = args.output as string;
    await writeFile(outputPath, JSON.stringify(bundle, null, 2) + "\n");

    console.log();
    console.log(`${c.dim("Bundled aspects:")}`);
    for (const aspect of aspectsToBundle) {
      console.log(`  ${pc.green("•")} ${aspect.name}`);
    }
    console.log();

    p.outro(`${icons.success} Created ${pc.cyan(outputPath)} with ${aspectsToBundle.length} aspects`);
  },
});

// Helper to load a set
async function loadSet(name: string): Promise<{ aspects: string[] } | null> {
  try {
    const setPath = join(getSetsDir(), name, "set.json");
    const content = await readFile(setPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
