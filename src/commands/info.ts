import { defineCommand } from 'citty';
import { log } from '../utils/logger';
import { loadInstalledAspect } from '../lib/aspect-loader';
import { getInstalledAspect } from '../lib/config';
import { c, icons } from '../utils/colors';

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
      log.error(`Failed to load aspect "${args.name}" — aspect.yaml may be corrupted`);
      process.exit(1);
    }

    console.log();
    console.log(`${c.bold(aspect.displayName)} ${c.muted('(')}${c.aspect(aspect.name)}${c.version(`@${aspect.version}`)}${c.muted(')')}`);
    console.log();
    console.log(`  ${c.italic(aspect.tagline)}`);
    console.log();

    const meta: [string, string][] = [];
    if (aspect.publisher) meta.push(['Publisher', aspect.publisher]);
    if (aspect.author) meta.push(['Author', aspect.author]);
    if (aspect.license) meta.push(['License', aspect.license]);
    meta.push(['Source', installed.source]);

    if (meta.length > 0) {
      for (const [label, value] of meta) {
        console.log(`  ${c.label(label.padEnd(10))} ${c.value(value)}`);
      }
    }

    if (aspect.voiceHints) {
      console.log();
      console.log(`  ${c.bold('Voice')}`);
      if (aspect.voiceHints.speed) {
        console.log(`    ${c.label('Speed')}     ${aspect.voiceHints.speed}`);
      }
      if (aspect.voiceHints.emotions?.length) {
        console.log(`    ${c.label('Emotions')}  ${aspect.voiceHints.emotions.join(', ')}`);
      }
      if (aspect.voiceHints.styleHints) {
        console.log(`    ${c.label('Style')}     ${c.muted(aspect.voiceHints.styleHints)}`);
      }
    }

    if (aspect.modes && Object.keys(aspect.modes).length > 0) {
      console.log();
      console.log(`  ${c.bold('Modes')}`);
      for (const [modeName, mode] of Object.entries(aspect.modes)) {
        console.log(`    ${c.highlight(modeName)} ${icons.arrow} ${c.muted(mode.description)}`);
      }
    }

    console.log();
  },
});
