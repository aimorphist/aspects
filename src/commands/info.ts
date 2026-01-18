import { defineCommand } from 'citty';
import { log } from '../utils/logger';

export default defineCommand({
  meta: {
    name: 'info',
    description: 'Show details about an aspect',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Aspect name',
      required: true,
    },
  },
  run({ args }) {
    log.info(`info command: ${args.name}`);
    log.warn('Not yet implemented');
  },
});
