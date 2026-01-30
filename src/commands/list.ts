import { defineCommand } from 'citty';
import { listInstalledAspects, listAllInstalledAspects } from '../lib/config';
import { loadInstalledAspect } from '../lib/aspect-loader';
import { c, icons } from '../utils/colors';
import { findProjectRoot, type InstallScope } from '../utils/paths';

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List installed aspects',
  },
  args: {
    global: {
      type: 'boolean',
      alias: 'g',
      description: 'List only global aspects (~/.aspects)',
    },
    project: {
      type: 'boolean',
      alias: 'p',
      description: 'List only project aspects (./.aspects)',
    },
  },
  async run({ args }) {
    const projectRoot = await findProjectRoot() || undefined;
    
    let installed;
    if (args.global) {
      installed = await listInstalledAspects('global');
    } else if (args.project) {
      installed = await listInstalledAspects('project', projectRoot);
    } else {
      installed = await listAllInstalledAspects(projectRoot);
    }

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

    for (const item of installed) {
      const aspect = await loadInstalledAspect(item.name, item.scope, projectRoot);
      const scopeLabel = item.scope === 'project' ? c.dim(' [project]') : c.dim(' [global]');
      const sourceLabel = item.source === 'local' 
        ? c.dim(' (local)') 
        : item.source === 'github' 
        ? c.dim(' (github)') 
        : '';
      
      const name = c.aspect(item.name);
      const version = c.version(`@${item.version}`);
      const tagline = aspect?.tagline ? c.muted(` - ${aspect.tagline}`) : '';
      
      console.log(`  ${name}${version}${scopeLabel}${sourceLabel}${tagline}`);
    }

    console.log();
  },
});
