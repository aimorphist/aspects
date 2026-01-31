import { defineCommand } from 'citty';
import { log } from '../utils/logger';
import { findAndLoadAspect } from '../lib/aspect-loader';
import { getAspectDetail } from '../lib/registry';
import { c, icons } from '../utils/colors';

export default defineCommand({
  meta: {
    name: 'info',
    description: 'Show details about an aspect (installed or from registry)',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Aspect name',
      required: true,
    },
  },
  async run({ args }) {
    // Search both project and global scopes
    const found = await findAndLoadAspect(args.name);

    // If installed locally, show local info
    if (found) {
      const { aspect, scope, meta: installMeta } = found;

      console.log();
      console.log(`${c.bold(aspect.displayName)} ${c.muted('(')}${c.aspect(aspect.name)}${c.version(`@${aspect.version}`)}${c.muted(')')} ${c.dim(`[${scope}]`)}`);
      console.log();
      console.log(`  ${c.italic(aspect.tagline)}`);
      console.log();

      const displayMeta: [string, string][] = [];
      if (aspect.publisher) displayMeta.push(['Publisher', aspect.publisher]);
      if (aspect.author) displayMeta.push(['Author', aspect.author]);
      if (aspect.license) displayMeta.push(['License', aspect.license]);
      displayMeta.push(['Source', installMeta.source]);

      if (displayMeta.length > 0) {
        for (const [label, value] of displayMeta) {
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
      return;
    }

    // Not installed locally - try registry API
    try {
      const detail = await getAspectDetail(args.name);

      if (!detail) {
        log.error(`Aspect "${args.name}" not found (not installed or in registry)`);
        console.log(c.muted(`  Try "aspects search ${args.name}" to find similar aspects`));
        process.exit(1);
      }

      const latestVersion = detail.versions[detail.latest];
      const latestAspect = latestVersion?.aspect;

      console.log();
      console.log(`${c.bold(latestAspect?.displayName ?? detail.name)} ${c.muted('(')}${c.aspect(detail.name)}${c.version(`@${detail.latest}`)}${c.muted(')')}`);
      console.log();
      if (latestAspect?.tagline) {
        console.log(`  ${c.italic(latestAspect.tagline)}`);
        console.log();
      }

      const meta: [string, string][] = [];
      meta.push(['Publisher', detail.publisher]);
      if (latestAspect?.category) meta.push(['Category', latestAspect.category]);
      meta.push(['Trust', detail.trust]);
      meta.push(['Latest', detail.latest]);
      meta.push(['Published', formatDate(detail.modified)]);

      for (const [label, value] of meta) {
        console.log(`  ${c.label(label.padEnd(10))} ${c.value(value)}`);
      }

      // Stats
      console.log();
      console.log(`  ${c.bold('Stats')}`);
      console.log(`    ${c.label('Downloads')} ${formatNumber(detail.stats.downloads.total)} total / ${formatNumber(detail.stats.downloads.weekly)} weekly`);

      // Version list
      const versions = Object.keys(detail.versions);
      if (versions.length > 0) {
        console.log();
        console.log(`  ${c.bold('Versions')}`);
        for (const ver of versions) {
          const vInfo = detail.versions[ver];
          const deprecated = vInfo?.deprecated ? c.warn(` (deprecated: ${vInfo.deprecated})`) : '';
          const current = ver === detail.latest ? ` ${c.success('← latest')}` : '';
          console.log(`    ${c.version(ver)}  ${c.muted(formatDate(vInfo?.published ?? ''))}${current}${deprecated}`);
        }
      }

      console.log();
      console.log(c.muted(`  Install: aspects install ${detail.name}`));
      console.log();
    } catch (err) {
      log.error(`Aspect "${args.name}" is not installed`);
      console.log(c.muted(`  Try "aspects search ${args.name}" to find aspects in the registry`));
      process.exit(1);
    }
  },
});

function formatNumber(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return String(n);
}

function formatDate(isoDate: string): string {
  if (!isoDate) return 'unknown';
  try {
    return new Date(isoDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}
