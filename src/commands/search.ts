import { defineCommand } from 'citty';
import { log } from '../utils/logger';

export default defineCommand({
  meta: {
    name: 'search',
    description: 'Search the aspect registry',
  },
  args: {
    query: {
      type: 'positional',
      description: 'Search query',
      required: false,
    },
  },
  run({ args }) {
    log.info(`search command: ${args.query || '(all)'}`);
    log.warn('Not yet implemented');
  },
});
