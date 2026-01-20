import { defineCommand } from "citty";
import { c, icons } from "../utils/colors";
import { fetchRegistryIndex } from "../lib/registry";
import { readConfig } from "../lib/config";
import { getAspectPath } from "../utils/paths";
import { parseAspectFile } from "../lib/parser";
import type { Aspect, RegistryAspect, InstalledAspect } from "../lib/types";

interface SearchResult {
  aspect: Aspect;
  source: "registry" | "local";
  installed?: boolean;
  trust?: string;
}

interface SearchFilters {
  name?: string[];
  tag?: string[];
  category?: string[];
  publisher?: string[];
  all?: string[];
  deep?: boolean;
  local?: boolean;
  registry?: boolean;
  or?: boolean;
  not?: { field: string; value: string }[];
}

function matchesFilter(
  aspect: Aspect,
  filters: SearchFilters,
  deep: boolean = false,
): boolean {
  const checks: boolean[] = [];
  const notChecks: boolean[] = [];

  // Handle NOT filters
  for (const notFilter of filters.not || []) {
    const matches = fieldMatches(aspect, notFilter.field, notFilter.value, deep);
    notChecks.push(!matches);
  }

  // If any NOT filter fails, exclude this aspect
  if (notChecks.length > 0 && notChecks.some((c) => !c)) {
    return false;
  }

  // Name filter (default)
  if (filters.name && filters.name.length > 0) {
    const nameMatches = filters.name.some(
      (q) =>
        aspect.name.toLowerCase().includes(q.toLowerCase()) ||
        aspect.displayName.toLowerCase().includes(q.toLowerCase()),
    );
    checks.push(nameMatches);
  }

  // Tag filter
  if (filters.tag && filters.tag.length > 0) {
    const tagMatches = filters.tag.some((t) =>
      aspect.tags?.some((tag) => tag.toLowerCase().includes(t.toLowerCase())),
    );
    checks.push(tagMatches);
  }

  // Category filter
  if (filters.category && filters.category.length > 0) {
    const catMatches = filters.category.some(
      (cat) => aspect.category?.toLowerCase() === cat.toLowerCase(),
    );
    checks.push(catMatches);
  }

  // Publisher filter
  if (filters.publisher && filters.publisher.length > 0) {
    const pubMatches = filters.publisher.some(
      (pub) => aspect.publisher?.toLowerCase().includes(pub.toLowerCase()),
    );
    checks.push(pubMatches);
  }

  // All fields filter
  if (filters.all && filters.all.length > 0) {
    const allMatches = filters.all.some((q) => fieldMatches(aspect, "all", q, deep));
    checks.push(allMatches);
  }

  if (checks.length === 0) return true;

  // OR mode: any check passes
  if (filters.or) {
    return checks.some((c) => c);
  }

  // AND mode (default): all checks pass
  return checks.every((c) => c);
}

function fieldMatches(
  aspect: Aspect,
  field: string,
  query: string,
  deep: boolean = false,
): boolean {
  const q = query.toLowerCase();

  switch (field) {
    case "name":
      return (
        aspect.name.toLowerCase().includes(q) ||
        aspect.displayName.toLowerCase().includes(q)
      );
    case "tag":
      return aspect.tags?.some((t) => t.toLowerCase().includes(q)) ?? false;
    case "category":
      return aspect.category?.toLowerCase() === q;
    case "publisher":
      return aspect.publisher?.toLowerCase().includes(q) ?? false;
    case "all": {
      // Common fields
      if (aspect.name.toLowerCase().includes(q)) return true;
      if (aspect.displayName.toLowerCase().includes(q)) return true;
      if (aspect.tagline?.toLowerCase().includes(q)) return true;
      if (aspect.category?.toLowerCase().includes(q)) return true;
      if (aspect.tags?.some((t) => t.toLowerCase().includes(q))) return true;
      if (aspect.publisher?.toLowerCase().includes(q)) return true;
      if (aspect.author?.toLowerCase().includes(q)) return true;

      // Deep search
      if (deep) {
        if (aspect.prompt?.toLowerCase().includes(q)) return true;
        if (aspect.voiceHints?.styleHints?.toLowerCase().includes(q)) return true;
        if (aspect.modes) {
          for (const mode of Object.values(aspect.modes)) {
            if (mode.description?.toLowerCase().includes(q)) return true;
          }
        }
      }
      return false;
    }
    default:
      return false;
  }
}

export default defineCommand({
  meta: {
    name: "find",
    description: "Search aspects with filters and operators",
  },
  args: {
    query: {
      type: "positional",
      description: "Search query (searches name by default)",
      required: false,
    },
    name: {
      type: "string",
      alias: "n",
      description: "Search by name",
    },
    tag: {
      type: "string",
      alias: "t",
      description: "Search by tag",
    },
    category: {
      type: "string",
      alias: "c",
      description: "Search by category",
    },
    publisher: {
      type: "string",
      alias: "p",
      description: "Search by publisher",
    },
    all: {
      type: "string",
      alias: "a",
      description: "Search all common fields",
    },
    deep: {
      type: "boolean",
      description: "Include prompt, modes, directives in search",
    },
    or: {
      type: "boolean",
      alias: "o",
      description: "Use OR instead of AND for multiple filters",
    },
    not: {
      type: "string",
      description: "Exclude aspects matching this (format: field:value)",
    },
    local: {
      type: "boolean",
      description: "Only search installed aspects",
    },
    registry: {
      type: "boolean",
      description: "Only search registry",
    },
  },
  async run({ args }) {
    const filters: SearchFilters = {
      name: [],
      tag: [],
      category: [],
      publisher: [],
      all: [],
      not: [],
      deep: args.deep as boolean,
      local: args.local as boolean,
      registry: args.registry as boolean,
      or: args.or as boolean,
    };

    // Default query goes to name
    if (args.query) {
      filters.name!.push(args.query as string);
    }

    // Explicit filters
    if (args.name) filters.name!.push(args.name as string);
    if (args.tag) filters.tag!.push(args.tag as string);
    if (args.category) filters.category!.push(args.category as string);
    if (args.publisher) filters.publisher!.push(args.publisher as string);
    if (args.all) filters.all!.push(args.all as string);

    // Parse --not flags (format: field:value)
    if (args.not) {
      const notStr = args.not as string;
      const [field, value] = notStr.split(":");
      if (field && value) {
        filters.not!.push({ field, value });
      }
    }

    // Check if any search criteria provided
    const hasFilters =
      filters.name!.length > 0 ||
      filters.tag!.length > 0 ||
      filters.category!.length > 0 ||
      filters.publisher!.length > 0 ||
      filters.all!.length > 0;

    if (!hasFilters) {
      console.log();
      console.log(`${icons.info} Usage: aspects find <query>`);
      console.log();
      console.log("Examples:");
      console.log("  aspects find wizard                    # Search by name");
      console.log("  aspects find -n wizard -t fantasy      # Name AND tag");
      console.log("  aspects find -n wizard --or -t mentor  # Name OR tag");
      console.log("  aspects find -n wizard --not tag:evil  # Exclude tag");
      console.log("  aspects find -a wizard                 # All fields");
      console.log("  aspects find -a wizard --deep          # Include prompt");
      console.log();
      return;
    }

    const results: SearchResult[] = [];
    const installedNames = new Set<string>();

    // Get installed aspects
    const config = await readConfig();
    const installed = config.installed;
    for (const name of Object.keys(installed)) {
      installedNames.add(name);
    }

    // Search registry (unless --local)
    if (!filters.local) {
      try {
        const registry = await fetchRegistryIndex();
        for (const [name, entry] of Object.entries(registry.aspects || {})) {
          // Build a minimal aspect from registry metadata
          const aspect: Aspect = {
            schemaVersion: 1,
            name,
            displayName: entry.metadata?.displayName || name,
            tagline: entry.metadata?.tagline || "",
            category: entry.metadata?.category,
            tags: entry.metadata?.tags,
            publisher: entry.metadata?.publisher,
            version: entry.latest,
            prompt: "",
          };

          if (matchesFilter(aspect, filters, filters.deep)) {
            results.push({
              aspect,
              source: "registry",
              installed: installedNames.has(name),
              trust: entry.metadata?.trust,
            });
          }
        }
      } catch {
        if (!filters.local) {
          console.log(c.muted("(Could not reach registry, showing local results only)"));
        }
      }
    }

    // Search local aspects (unless --registry)
    if (!filters.registry) {
      for (const [name, info] of Object.entries(installed)) {
        const aspectInfo = info as InstalledAspect;
        // Skip if already in results from registry
        if (results.some((r) => r.aspect.name === name && r.source === "registry")) {
          continue;
        }

        // Load full aspect for deep search
        const aspectPath = aspectInfo.path || getAspectPath(name);
        const parseResult = await parseAspectFile(`${aspectPath}/aspect.yaml`);
        if (!parseResult.success) continue;

        const aspect = parseResult.aspect;
        if (matchesFilter(aspect, filters, filters.deep)) {
          results.push({
            aspect,
            source: "local",
          });
        }
      }
    }

    // Output results
    console.log();
    if (results.length === 0) {
      console.log(`${icons.info} No aspects found matching your search.`);
      console.log();
      return;
    }

    console.log(`${icons.search} Found ${results.length} aspect${results.length === 1 ? "" : "s"}`);
    console.log();

    // Group by source
    const registryResults = results.filter((r) => r.source === "registry");
    const localResults = results.filter((r) => r.source === "local");

    if (registryResults.length > 0) {
      console.log(c.label("Registry:"));
      for (const r of registryResults) {
        const installedBadge = r.installed ? c.success(" ✓") : "";
        const trustBadge = r.trust === "verified" ? " 🛡️" : "";
        console.log(
          `  ${c.aspect(r.aspect.name)}@${r.aspect.version}${installedBadge}${trustBadge}`,
        );
        console.log(`    ${c.italic(r.aspect.tagline)}`);
        const meta: string[] = [];
        if (r.aspect.category) meta.push(`Category: ${r.aspect.category}`);
        if (r.aspect.tags?.length) meta.push(`Tags: ${r.aspect.tags.join(", ")}`);
        if (meta.length > 0) {
          console.log(`    ${c.muted(meta.join(" | "))}`);
        }
      }
    }

    if (localResults.length > 0) {
      if (registryResults.length > 0) console.log();
      console.log(c.label("Local:"));
      for (const r of localResults) {
        console.log(`  ${c.aspect(r.aspect.name)}@${r.aspect.version}`);
        console.log(`    ${c.italic(r.aspect.tagline)}`);
        const meta: string[] = [];
        if (r.aspect.category) meta.push(`Category: ${r.aspect.category}`);
        if (r.aspect.tags?.length) meta.push(`Tags: ${r.aspect.tags.join(", ")}`);
        if (meta.length > 0) {
          console.log(`    ${c.muted(meta.join(" | "))}`);
        }
      }
    }

    console.log();
  },
});
