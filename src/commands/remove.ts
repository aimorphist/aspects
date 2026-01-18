import { defineCommand } from 'citty';
import { log } from '../utils/logger';

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
  run({ args }) {
    log.info(`remove command: ${args.name}`);
    log.warn('Not yet implemented');
  },
});
