import { defineCommand } from 'citty';
import { log } from '../utils/logger';
import { listInstalledAspects } from '../lib/config';
import { getRegistryAspect } from '../lib/registry';
import { installAspect } from '../lib/installer';

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
      log.info('No aspects installed');
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
      log.info('No registry-installed aspects to update');
      return;
    }

    console.log();
    let updatesAvailable = 0;
    let updated = 0;

    for (const aspect of toCheck) {
      // Skip local and github installs
      if (aspect.source === 'local') {
        console.log(`  ${aspect.name}: local install, skipping`);
        continue;
      }

      if (aspect.source === 'github') {
        console.log(`  ${aspect.name}: github install, run 'aspects install github:...' to update`);
        continue;
      }

      let registryInfo;
      try {
        registryInfo = await getRegistryAspect(aspect.name);
      } catch {
        console.log(`  ${aspect.name}: failed to check registry`);
        continue;
      }

      if (!registryInfo) {
        console.log(`  ${aspect.name}: not found in registry`);
        continue;
      }

      const currentVersion = aspect.version;
      const latestVersion = registryInfo.latest;

      if (currentVersion === latestVersion) {
        console.log(`  ${aspect.name}: up to date (${currentVersion})`);
        continue;
      }

      updatesAvailable++;

      if (args.check) {
        console.log(`  ${aspect.name}: ${currentVersion} → ${latestVersion} [update available]`);
      } else {
        process.stdout.write(`  ${aspect.name}: ${currentVersion} → ${latestVersion}...`);
        
        const result = await installAspect({ 
          type: 'registry', 
          name: aspect.name, 
          version: latestVersion 
        });

        if (result.success) {
          console.log(' ✓');
          updated++;
        } else {
          console.log(' ✗');
          log.error(`    ${result.error}`);
        }
      }
    }

    console.log();

    if (args.check) {
      if (updatesAvailable > 0) {
        log.info(`${updatesAvailable} update(s) available. Run without --check to install.`);
      } else {
        log.success('All aspects up to date');
      }
    } else {
      if (updated > 0) {
        log.success(`Updated ${updated} aspect(s)`);
      } else if (updatesAvailable === 0) {
        log.success('All aspects up to date');
      }
    }
  },
});
