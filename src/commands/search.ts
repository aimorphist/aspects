import { defineCommand } from 'citty';
import { log } from '../utils/logger';
import { fetchRegistryIndex } from '../lib/registry';
import { c, icons } from '../utils/colors';

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
      console.log();
      if (query) {
        console.log(c.muted(`  No aspects found matching "${args.query}"`));
      } else {
        console.log(c.muted('  Registry is empty'));
      }
      console.log();
      return;
    }

    console.log();
    console.log(c.bold(`${icons.search} ${query ? `Aspects matching "${args.query}"` : 'Available aspects'}`));
    console.log();

    for (const [name, info] of matches) {
      const verified = info.metadata.trust === 'verified' 
        ? ` ${icons.success}` 
        : '';
      
      console.log(`  ${c.aspect(name)}${c.version(`@${info.latest}`)}${verified}`);
      console.log(`    ${c.muted(info.metadata.tagline)}`);
      console.log();
    }
  },
});
