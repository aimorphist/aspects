import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineCommand } from 'citty';
import { log } from '../utils/logger';
import { blake3Hash } from '../utils/hash';
import { getInstalledAspect } from '../lib/config';
import { getAspectPath } from '../utils/paths';
import { c, icons } from '../utils/colors';

export default defineCommand({
  meta: {
    name: 'share',
    description: 'Share an installed aspect via its content hash',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Aspect name to share',
      required: true,
    },
  },
  async run({ args }) {
    const installed = await getInstalledAspect(args.name);
    if (!installed) {
      log.error(`Aspect "${args.name}" is not installed`);
      process.exit(1);
    }

    // Use stored hash or compute from file
    let hash = installed.blake3;
    if (!hash) {
      const aspectDir = installed.path ?? getAspectPath(args.name);
      const content = await readFile(join(aspectDir, 'aspect.json'), 'utf-8');
      hash = await blake3Hash(content);
    }

    console.log();
    console.log(`${icons.success} ${c.bold(args.name)}${c.version(`@${installed.version}`)}`);
    console.log();
    console.log(`  ${c.label('Hash')}    ${hash}`);
    console.log(`  ${c.label('Install')} aspects add hash:${hash}`);
    console.log();
  },
});
