import { defineCommand } from "citty";
import { parseInstallSpec } from "../lib/resolver";
import { installAspect } from "../lib/installer";
import { c, icons } from "../utils/colors";

export default defineCommand({
  meta: {
    name: "add",
    description: "Install aspect(s) to your local library",
  },
  args: {
    specs: {
      type: "positional",
      description: "Aspect name(s), github:user/repo, or ./path",
      required: true,
    },
    force: {
      type: "boolean",
      description: "Overwrite existing installation",
    },
  },
  async run({ args }) {
    const specs = Array.isArray(args.specs) ? args.specs : [args.specs];

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

      const result = await installAspect(spec);

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
