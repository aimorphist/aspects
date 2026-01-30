import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { parseInstallSpec } from "../lib/resolver";
import { installAspect } from "../lib/installer";
import { c, icons } from "../utils/colors";
import { findProjectRoot, type InstallScope } from "../utils/paths";
import { initProjectAspects } from "./init";

export default defineCommand({
  meta: {
    name: "add",
    description: `Install aspect(s) to your local library.

Sources:
  aspects add alaric              From registry (aspects.sh)
  aspects add alaric@1.2.0        Specific version
  aspects add blake3:<hash>       By content hash (from 'aspects share')
  aspects add github:user/repo    From GitHub repository
  aspects add ./my-aspect         From local path

Scope:
  By default, installs to ./.aspects/ if in a project, else ~/.aspects/
  Use -g/--global to always install to ~/.aspects/
  Use -p/--project to install locally (will prompt to init if needed)

Examples:
  aspects add alaric meditation-guide    Install multiple aspects
  aspects add -g alaric                  Install globally
  aspects add -p alaric                  Install to project (init if needed)
  aspects add --force alaric             Overwrite existing`,
  },
  args: {
    specs: {
      type: "positional",
      description: "Aspect spec(s): name, name@version, blake3:<hash>, github:user/repo, or ./path",
      required: true,
    },
    force: {
      type: "boolean",
      description: "Overwrite existing installation",
    },
    global: {
      type: "boolean",
      alias: "g",
      description: "Install to global scope (~/.aspects) instead of project",
    },
    project: {
      type: "boolean",
      alias: "p",
      description: "Install to project scope (init if needed)",
    },
  },
  async run({ args }) {
    const specs = Array.isArray(args.specs) ? args.specs : [args.specs];

    // Determine scope
    let scope: InstallScope;
    let projectRoot: string | undefined;

    if (args.global) {
      scope = 'global';
    } else if (args.project) {
      // Explicit project scope - check if initialized
      projectRoot = await findProjectRoot() || undefined;
      if (!projectRoot) {
        // No project found - offer to init
        console.log();
        const init = await p.confirm({
          message: `No ${c.file('.aspects/')} found. Initialize project here?`,
        });

        if (p.isCancel(init) || !init) {
          console.log(c.muted('  Falling back to global scope'));
          scope = 'global';
        } else {
          projectRoot = await initProjectAspects();
          console.log(`${icons.success} Initialized ${c.file('.aspects/')}`);
          scope = 'project';
        }
      } else {
        scope = 'project';
      }
    } else {
      projectRoot = await findProjectRoot() || undefined;
      scope = projectRoot ? 'project' : 'global';
    }

    // Show scope info
    const scopeLabel = scope === 'global' ? '~/.aspects' : './.aspects';
    console.log();
    console.log(c.muted(`Installing to ${scopeLabel}`));

    const results: Array<{
      spec: string;
      success: boolean;
      aspect?: { name: string; displayName: string; version: string; tagline: string };
      source?: string;
      error?: string;
      alreadyInstalled?: boolean;
    }> = [];

    for (const specStr of specs) {
      let spec;
      try {
        spec = parseInstallSpec(specStr);
      } catch (err) {
        results.push({ spec: specStr, success: false, error: (err as Error).message });
        continue;
      }

      const result = await installAspect(spec, { 
        force: !!args.force, 
        scope, 
        projectRoot,
        specifier: specStr,  // Preserve original input for display/reinstall
      });

      if (!result.success) {
        results.push({ spec: specStr, success: false, error: result.error });
        continue;
      }

      const { aspect, source, alreadyInstalled } = result;

      results.push({
        spec: specStr,
        success: true,
        aspect: {
          name: aspect.name,
          displayName: aspect.displayName,
          version: aspect.version,
          tagline: aspect.tagline,
        },
        source,
        alreadyInstalled,
      });
    }

    // Output results
    console.log();
    const installed = results.filter((r) => r.success && !r.alreadyInstalled);
    const alreadyInstalled = results.filter((r) => r.success && r.alreadyInstalled);
    const failed = results.filter((r) => !r.success);

    for (const r of installed) {
      if (r.aspect) {
        console.log(
          `${icons.success} Installed ${c.bold(r.aspect.displayName)} ${c.muted(`(${r.aspect.name}@${r.aspect.version})`)}`,
        );
        console.log(`  ${c.italic(r.aspect.tagline)}`);
        if (r.source !== "registry") {
          console.log(`  ${c.label("Source")} ${r.source}`);
        }
      }
    }

    for (const r of alreadyInstalled) {
      if (r.aspect) {
        console.log(
          `${icons.info} ${c.aspect(r.aspect.displayName)} ${c.muted(`(${r.aspect.name}@${r.aspect.version})`)} ${c.muted("already installed")}`,
        );
      }
    }

    for (const r of failed) {
      console.log(`${icons.error} ${c.error(r.spec)}: ${r.error}`);
    }

    // Summary
    if (results.length > 1) {
      console.log();
      console.log(
        c.muted(`${installed.length} installed, ${alreadyInstalled.length} already installed, ${failed.length} failed`),
      );
    }
    console.log();
  },
});
