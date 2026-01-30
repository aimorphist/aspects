import { rm } from 'node:fs/promises';
import { defineCommand } from 'citty';
import * as p from '@clack/prompts';
import { log } from '../utils/logger';
import { findInstalledAspect, removeInstalledAspect } from '../lib/config';
import { getAspectPath, findProjectRoot, type InstallScope } from '../utils/paths';
import { c, icons } from '../utils/colors';

export default defineCommand({
  meta: {
    name: 'remove',
    description: 'Remove an installed aspect',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Aspect name to remove',
      required: true,
    },
    global: {
      type: 'boolean',
      alias: 'g',
      description: 'Remove from global scope (~/.aspects) instead of project',
    },
    project: {
      type: 'boolean',
      alias: 'p',
      description: 'Remove from project scope only',
    },
    force: {
      type: 'boolean',
      alias: 'f',
      description: 'Skip confirmation prompt',
    },
  },
  async run({ args }) {
    const projectRoot = await findProjectRoot() || undefined;
    
    // Find aspect in all scopes
    const found = await findInstalledAspect(args.name, projectRoot);
    
    if (found.length === 0) {
      log.error(`Aspect "${args.name}" is not installed`);
      process.exit(1);
    }

    // Filter by explicit scope flags
    let toRemove = found;
    if (args.global && !args.project) {
      toRemove = found.filter(f => f.scope === 'global');
      if (toRemove.length === 0) {
        log.error(`Aspect "${args.name}" is not installed globally`);
        process.exit(1);
      }
    } else if (args.project && !args.global) {
      toRemove = found.filter(f => f.scope === 'project');
      if (toRemove.length === 0) {
        log.error(`Aspect "${args.name}" is not installed in project scope`);
        process.exit(1);
      }
    }

    // If multiple scopes and no explicit flag, let user choose
    if (toRemove.length > 1 && !args.global && !args.project) {
      const choice = await p.select({
        message: `"${args.name}" is installed in multiple scopes. Which to remove?`,
        options: [
          ...toRemove.map(f => ({
            value: f.scope,
            label: `${f.scope} (${f.version})`,
          })),
          { value: 'both', label: 'Both' },
        ],
      });

      if (p.isCancel(choice)) {
        p.cancel('Cancelled');
        process.exit(0);
      }

      if (choice === 'both') {
        // keep all
      } else {
        toRemove = toRemove.filter(f => f.scope === choice);
      }
    }

    // Confirm removal (especially important when removing from a different scope than cwd implies)
    if (!args.force && toRemove.length > 0) {
      const first = toRemove[0]!;
      const scopeDesc = toRemove.length === 1 
        ? `from ${c.dim(first.scope)} scope`
        : `from ${toRemove.map(f => c.dim(f.scope)).join(' and ')} scopes`;
      
      const confirmed = await p.confirm({
        message: `Remove ${c.aspect(args.name)}${c.version(`@${first.version}`)} ${scopeDesc}?`,
      });

      if (p.isCancel(confirmed) || !confirmed) {
        p.cancel('Cancelled');
        process.exit(0);
      }
    }

    // Remove each
    for (const install of toRemove) {
      await removeInstalledAspect(args.name, install.scope, projectRoot);

      // Delete files if registry or github install (local installs just unregister)
      if (install.source === 'registry' || install.source === 'github') {
        const aspectDir = getAspectPath(args.name, install.scope, projectRoot);
        try {
          await rm(aspectDir, { recursive: true });
        } catch {
          // Directory might not exist, that's fine
        }
      }

      console.log(`${icons.success} Removed ${c.aspect(args.name)}${c.version(`@${install.version}`)} ${c.dim(`[${install.scope}]`)}`);
    }
    console.log();
  },
});
