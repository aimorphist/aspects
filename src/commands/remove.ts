import { rm } from 'node:fs/promises';
import { defineCommand } from 'citty';
import { log } from '../utils/logger';
import { getInstalledAspect, removeInstalledAspect } from '../lib/config';
import { getAspectPath } from '../utils/paths';

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
  },
  async run({ args }) {
    const installed = await getInstalledAspect(args.name);
    if (!installed) {
      log.error(`Aspect "${args.name}" is not installed`);
      process.exit(1);
    }

    // Remove from config
    await removeInstalledAspect(args.name);

    // Delete files if registry or github install (local installs just unregister)
    if (installed.source === 'registry' || installed.source === 'github') {
      const aspectDir = getAspectPath(args.name);
      try {
        await rm(aspectDir, { recursive: true });
      } catch {
        // Directory might not exist, that's fine
      }
    }

    log.success(`Removed ${args.name}@${installed.version}`);
  },
});
