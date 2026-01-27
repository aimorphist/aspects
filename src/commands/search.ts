import { defineCommand } from 'citty';
import { log } from '../utils/logger';
import { searchRegistry, fetchRegistryIndex } from '../lib/registry';
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
    category: {
      type: 'string',
      description: 'Filter by category (assistant, roleplay, creative, etc.)',
    },
    trust: {
      type: 'string',
      description: 'Filter by trust level (verified, community)',
    },
    limit: {
      type: 'string',
      description: 'Max results (default 20, max 100)',
    },
    offset: {
      type: 'string',
      description: 'Pagination offset',
    },
  },
  async run({ args }) {
    const query = args.query as string | undefined;
    const category = args.category as string | undefined;
    const trust = args.trust as string | undefined;
    const limit = args.limit ? parseInt(args.limit as string, 10) : undefined;
    const offset = args.offset ? parseInt(args.offset as string, 10) : undefined;

    // Try API-based search first
    try {
      const result = await searchRegistry({ q: query, category, trust, limit, offset });

      if (result.results.length === 0) {
        console.log();
        if (query) {
          console.log(c.muted(`  No aspects found matching "${query}"`));
        } else {
          console.log(c.muted('  No aspects found'));
        }
        console.log();
        return;
      }

      console.log();
      console.log(c.bold(`${icons.search} ${query ? `Aspects matching "${query}"` : 'Available aspects'}`));
      if (result.total > result.results.length) {
        console.log(c.muted(`  Showing ${result.results.length} of ${result.total} results`));
      }
      console.log();

      for (const item of result.results) {
        const verified = item.trust === 'verified' ? ` ${icons.success}` : '';
        const downloads = formatDownloads(item.downloads);

        console.log(`  ${c.aspect(item.name)}${c.version(`@${item.version}`)}${verified}  ${downloads}`);
        console.log(`    ${c.muted(item.tagline)}`);
        console.log();
      }
      return;
    } catch {
      // Fallback to client-side search of full index
    }

    // Fallback: fetch full index and filter client-side
    let index;
    try {
      index = await fetchRegistryIndex();
    } catch (err) {
      log.error((err as Error).message);
      process.exit(1);
    }

    const queryLower = query?.toLowerCase();
    const aspects = Object.entries(index.aspects);

    let matches = queryLower
      ? aspects.filter(([name, info]) =>
          name.toLowerCase().includes(queryLower) ||
          info.metadata.displayName.toLowerCase().includes(queryLower) ||
          info.metadata.tagline.toLowerCase().includes(queryLower)
        )
      : aspects;

    // Apply category filter
    if (category) {
      matches = matches.filter(([, info]) => info.metadata.category === category);
    }

    // Apply trust filter
    if (trust) {
      matches = matches.filter(([, info]) => info.metadata.trust === trust);
    }

    if (matches.length === 0) {
      console.log();
      if (query) {
        console.log(c.muted(`  No aspects found matching "${query}"`));
      } else {
        console.log(c.muted('  Registry is empty'));
      }
      console.log();
      return;
    }

    console.log();
    console.log(c.bold(`${icons.search} ${query ? `Aspects matching "${query}"` : 'Available aspects'}`));
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

function formatDownloads(count: number): string {
  if (count >= 1000) {
    return c.muted(`${(count / 1000).toFixed(1)}k dl`);
  }
  return c.muted(`${count} dl`);
}
