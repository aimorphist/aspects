import { rm } from 'node:fs/promises';
import { defineCommand } from 'citty';
import { log } from '../utils/logger';
import { getInstalledAspect, removeInstalledAspect } from '../lib/config';
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
  },
  async run({ args }) {
    // Determine scope
    let scope: InstallScope;
    let projectRoot: string | undefined;

    if (args.global) {
      scope = 'global';
    } else {
      projectRoot = await findProjectRoot() || undefined;
      scope = projectRoot ? 'project' : 'global';
    }

    const installed = await getInstalledAspect(args.name, scope, projectRoot);
    if (!installed) {
      log.error(`Aspect "${args.name}" is not installed`);
      process.exit(1);
    }

    // Remove from config
    await removeInstalledAspect(args.name, scope, projectRoot);

    // Delete files if registry or github install (local installs just unregister)
    if (installed.source === 'registry' || installed.source === 'github') {
      const aspectDir = getAspectPath(args.name, scope, projectRoot);
      try {
        await rm(aspectDir, { recursive: true });
      } catch {
        // Directory might not exist, that's fine
      }
    }

    console.log();
    console.log(`${icons.success} Removed ${c.aspect(args.name)}${c.version(`@${installed.version}`)}`);
    console.log();
  },
});
