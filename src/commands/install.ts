import { defineCommand } from 'citty';
import { log } from '../utils/logger';
import { parseInstallSpec } from '../lib/resolver';
import { installAspect } from '../lib/installer';
import { c, icons } from '../utils/colors';

export default defineCommand({
  meta: {
    name: 'install',
    description: 'Install an aspect from registry, GitHub, or local path',
  },
  args: {
    spec: {
      type: 'positional',
      description: 'Aspect name, github:user/repo, or ./path',
      required: true,
    },
  },
  async run({ args }) {
    let spec;
    try {
      spec = parseInstallSpec(args.spec);
    } catch (err) {
      log.error((err as Error).message);
      process.exit(1);
    }

    const result = await installAspect(spec);

    if (!result.success) {
      log.error(result.error);
      process.exit(1);
    }

    const { aspect, source, alreadyInstalled } = result;

    console.log();
    if (alreadyInstalled) {
      console.log(`${icons.info} ${c.aspect(aspect.displayName)} ${c.muted(`(${aspect.name}@${aspect.version})`)} ${c.muted('already installed')}`);
    } else {
      console.log(`${icons.success} Installed ${c.bold(aspect.displayName)} ${c.muted(`(${aspect.name}@${aspect.version})`)}`);
    }
    
    console.log();
    console.log(`  ${c.italic(aspect.tagline)}`);
    
    if (source !== 'registry') {
      console.log(`  ${c.label('Source')} ${source}`);
    }
    console.log();
  },
});
