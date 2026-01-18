import { defineCommand } from 'citty';
import { log } from '../utils/logger';
import { fetchRegistryIndex } from '../lib/registry';

export default defineCommand({
  meta: {
    name: 'search',
    description: 'Search the aspect registry',
  },
  args: {
    query: {
      type: 'positional',
      description: 'Search query (optional, lists all if omitted)',
      required: false,
    },
  },
  async run({ args }) {
    let index;
    try {
      index = await fetchRegistryIndex();
    } catch (err) {
      log.error((err as Error).message);
      process.exit(1);
    }

    const query = args.query?.toLowerCase();
    const aspects = Object.entries(index.aspects);

    const matches = query
      ? aspects.filter(([name, info]) => 
          name.toLowerCase().includes(query) ||
          info.metadata.displayName.toLowerCase().includes(query) ||
          info.metadata.tagline.toLowerCase().includes(query)
        )
      : aspects;

    if (matches.length === 0) {
      if (query) {
        log.info(`No aspects found matching "${args.query}"`);
      } else {
        log.info('Registry is empty');
      }
      return;
    }

    console.log(query ? `\nAspects matching "${args.query}":\n` : '\nAvailable aspects:\n');

    for (const [name, info] of matches) {
      const trust = info.metadata.trust === 'verified' ? ' ✓' : '';
      console.log(`  ${name}@${info.latest}${trust}`);
      console.log(`    ${info.metadata.tagline}`);
      console.log();
    }
  },
});
