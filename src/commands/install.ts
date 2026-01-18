import { defineCommand } from 'citty';
import { log } from '../utils/logger';
import { parseInstallSpec } from '../lib/resolver';
import { installAspect } from '../lib/installer';

export default defineCommand({
  meta: {
    name: 'install',
    description: 'Install an aspect from registry or local path',
  },
  args: {
    spec: {
      type: 'positional',
      description: 'Aspect name, @scope/name, github:user/repo, or path',
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

    if (alreadyInstalled) {
      log.info(`${aspect.displayName} (${aspect.name}@${aspect.version}) already installed`);
    } else {
      log.success(`Installed ${aspect.displayName} (${aspect.name}@${aspect.version})`);
    }

    console.log();
    console.log(`  ${aspect.tagline}`);
    if (source === 'local') {
      console.log(`  Source: local`);
    }
    console.log();
  },
});
