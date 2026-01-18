import { defineCommand } from 'citty';
import { log } from '../utils/logger';

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List installed aspects',
  },
  args: {},
  run() {
    log.info('list command');
    log.warn('Not yet implemented');
  },
});
