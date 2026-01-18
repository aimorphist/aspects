import { defineCommand } from 'citty';
import { log } from '../utils/logger';

export default defineCommand({
  meta: {
    name: 'update',
    description: 'Update installed aspect(s)',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Aspect name (optional, updates all if omitted)',
      required: false,
    },
  },
  run({ args }) {
    log.info(`update command: ${args.name || '(all)'}`);
    log.warn('Not yet implemented');
  },
});
