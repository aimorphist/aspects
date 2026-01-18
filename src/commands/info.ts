import { defineCommand } from 'citty';
import { log } from '../utils/logger';
import { loadInstalledAspect } from '../lib/aspect-loader';
import { getInstalledAspect } from '../lib/config';

export default defineCommand({
  meta: {
    name: 'info',
    description: 'Show details about an installed aspect',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Aspect name',
      required: true,
    },
  },
  async run({ args }) {
    const installed = await getInstalledAspect(args.name);
    if (!installed) {
      log.error(`Aspect "${args.name}" is not installed`);
      process.exit(1);
    }

    const aspect = await loadInstalledAspect(args.name);
    if (!aspect) {
      log.error(`Failed to load aspect "${args.name}" - aspect.yaml may be corrupted`);
      process.exit(1);
    }

    console.log();
    console.log(`${aspect.displayName} (${aspect.name}@${aspect.version})`);
    console.log();
    console.log(`  ${aspect.tagline}`);
    console.log();

    if (aspect.publisher) {
      console.log(`  Publisher:  ${aspect.publisher}`);
    }
    if (aspect.author) {
      console.log(`  Author:     ${aspect.author}`);
    }
    if (aspect.license) {
      console.log(`  License:    ${aspect.license}`);
    }

    if (aspect.voiceHints) {
      console.log();
      console.log('  Voice hints:');
      if (aspect.voiceHints.speed) {
        console.log(`    Speed: ${aspect.voiceHints.speed}`);
      }
      if (aspect.voiceHints.emotions?.length) {
        console.log(`    Emotions: ${aspect.voiceHints.emotions.join(', ')}`);
      }
      if (aspect.voiceHints.styleHints) {
        console.log(`    Style: ${aspect.voiceHints.styleHints}`);
      }
    }

    if (aspect.modes && Object.keys(aspect.modes).length > 0) {
      console.log();
      console.log('  Modes:');
      for (const [modeName, mode] of Object.entries(aspect.modes)) {
        console.log(`    ${modeName} - ${mode.description}`);
      }
    }

    console.log();
  },
});
