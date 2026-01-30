import { defineCommand } from 'citty';
import { log } from '../utils/logger';
import { listInstalledAspects } from '../lib/config';
import { getRegistryAspect } from '../lib/registry';
import { installAspect } from '../lib/installer';
import { c, icons } from '../utils/colors';

export default defineCommand({
  meta: {
    name: 'update',
    description: 'Update installed aspect(s) to latest version',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Aspect name (updates all registry aspects if omitted)',
      required: false,
    },
    check: {
      type: 'boolean',
      alias: 'c',
      description: 'Only check for updates, don\'t install',
      default: false,
    },
  },
  async run({ args }) {
    const installed = await listInstalledAspects();
    
    if (installed.length === 0) {
      console.log();
      console.log(c.muted('  No aspects installed'));
      console.log();
      return;
    }

    // Filter to specific aspect or all registry aspects
    const toCheck = args.name
      ? installed.filter(a => a.name === args.name)
      : installed.filter(a => a.source === 'registry');

    if (args.name && toCheck.length === 0) {
      log.error(`Aspect "${args.name}" is not installed`);
      process.exit(1);
    }

    if (toCheck.length === 0) {
      console.log();
      console.log(c.muted('  No registry-installed aspects to update'));
      console.log();
      return;
    }

    console.log();
    let updatesAvailable = 0;
    let updated = 0;

    for (const aspect of toCheck) {
      // Skip local installs
      if (aspect.source === 'local') {
        console.log(`  ${c.aspect(aspect.name)} ${c.muted('- local install, skipping')}`);
        continue;
      }

      // Skip GitHub installs
      if (aspect.source === 'github') {
        console.log(`  ${c.aspect(aspect.name)} ${c.muted('- github install, use')} ${c.highlight('aspects install github:...')} ${c.muted('to update')}`);
        continue;
      }

      let registryInfo;
      try {
        registryInfo = await getRegistryAspect(aspect.name);
      } catch {
        console.log(`  ${c.aspect(aspect.name)} ${c.error('- failed to check registry')}`);
        continue;
      }

      if (!registryInfo) {
        console.log(`  ${c.aspect(aspect.name)} ${c.warn('- not found in registry')}`);
        continue;
      }

      const currentVersion = aspect.version;
      const latestVersion = registryInfo.latest;

      if (currentVersion === latestVersion) {
        console.log(`  ${c.aspect(aspect.name)} ${icons.success} ${c.muted(`up to date (${currentVersion})`)}`);
        continue;
      }

      updatesAvailable++;

      if (args.check) {
        console.log(`  ${c.aspect(aspect.name)} ${c.version(currentVersion)} ${icons.arrow} ${c.highlight(latestVersion)} ${c.tag('[update available]')}`);
      } else {
        process.stdout.write(`  ${c.aspect(aspect.name)} ${c.version(currentVersion)} ${icons.arrow} ${c.highlight(latestVersion)} `);
        
        const result = await installAspect({ 
          type: 'registry', 
          name: aspect.name, 
          version: latestVersion 
        });

        if (result.success) {
          console.log(icons.success);
          updated++;
        } else {
          console.log(icons.error);
          console.log(c.error(`    ${result.error}`));
        }
      }
    }

    console.log();

    if (args.check) {
      if (updatesAvailable > 0) {
        console.log(c.info(`${updatesAvailable} update(s) available. Run ${c.highlight('aspects update')} to install.`));
      } else {
        console.log(`${icons.success} ${c.success('All aspects up to date')}`);
      }
    } else {
      if (updated > 0) {
        console.log(`${icons.success} ${c.success(`Updated ${updated} aspect(s)`)}`);
      } else if (updatesAvailable === 0) {
        console.log(`${icons.success} ${c.success('All aspects up to date')}`);
      }
    }
    console.log();
  },
});
