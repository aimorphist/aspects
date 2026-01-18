import { defineCommand } from 'citty';
import { listInstalledAspects } from '../lib/config';
import { log } from '../utils/logger';

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List installed aspects',
  },
  args: {},
  async run() {
    const installed = await listInstalledAspects();

    if (installed.length === 0) {
      log.info('No aspects installed.');
      log.info('Run `aspects install <name>` to install an aspect.');
      return;
    }

    console.log('Installed aspects:\n');

    for (const aspect of installed) {
      const sourceLabel = aspect.source === 'local' ? ' (local)' 
        : aspect.source === 'github' ? ' (github)' 
        : '';
      console.log(`  ${aspect.name}@${aspect.version}${sourceLabel}`);
    }

    console.log();
  },
});
