import { defineCommand } from 'citty';
import { listInstalledAspects } from '../lib/config';
import { loadInstalledAspect } from '../lib/aspect-loader';
import { c, icons } from '../utils/colors';

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List installed aspects',
  },
  args: {},
  async run() {
    const installed = await listInstalledAspects();

    if (installed.length === 0) {
      console.log();
      console.log(c.muted('  No aspects installed.'));
      console.log(c.muted(`  Run ${c.highlight('aspects install <name>')} to get started.`));
      console.log();
      return;
    }

    console.log();
    console.log(c.bold(`${icons.package} Installed aspects`));
    console.log();

    for (const installed of await listInstalledAspects()) {
      const aspect = await loadInstalledAspect(installed.name);
      const sourceLabel = installed.source === 'local' 
        ? c.dim(' (local)') 
        : installed.source === 'github' 
        ? c.dim(' (github)') 
        : '';
      
      const name = c.aspect(installed.name);
      const version = c.version(`@${installed.version}`);
      const tagline = aspect?.tagline ? c.muted(` — ${aspect.tagline}`) : '';
      
      console.log(`  ${name}${version}${sourceLabel}${tagline}`);
    }

    console.log();
  },
});
