import { defineCommand } from 'citty';
import { log } from '../utils/logger';

export default defineCommand({
  meta: {
    name: 'install',
    description: 'Install an aspect from registry or source',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Aspect name, @scope/name, github:user/repo, or path',
      required: true,
    },
    version: {
      type: 'string',
      alias: 'v',
      description: 'Specific version to install',
    },
  },
  run({ args }) {
    log.info(`install command: ${args.name}${args.version ? `@${args.version}` : ''}`);
    log.warn('Not yet implemented');
  },
});
