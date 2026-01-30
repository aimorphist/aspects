import { defineCommand } from 'citty';
import { listInstalledAspects, listAllInstalledAspects } from '../lib/config';
import { loadInstalledAspect } from '../lib/aspect-loader';
import { c, icons, formatAspectLine, type AspectDisplayInfo } from '../utils/colors';
import { findProjectRoot, type InstallScope } from '../utils/paths';
import { blake3HashAspect } from '../utils/hash';
import type { InstalledAspect } from '../lib/types';

interface GroupedAspect {
  name: string;
  version: string;
  blake3: string;
  scopes: ('project' | 'global')[];
  trust: InstalledAspect['trust'];
  publisher?: string;
  specifier?: string;  // May be undefined for legacy installs
  tagline?: string;
  isModified?: boolean;
}

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
    
    let installed: Array<{ name: string; scope: InstallScope } & InstalledAspect>;
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
      console.log(c.muted(`  Run ${c.highlight('aspects add <name>')} to get started.`));
      console.log();
      return;
    }

    // Group by blake3 hash to deduplicate same content across scopes
    const grouped = new Map<string, GroupedAspect>();
    
    for (const item of installed) {
      const existing = grouped.get(item.blake3);
      if (existing) {
        // Same content in different scope - merge scopes
        if (!existing.scopes.includes(item.scope)) {
          existing.scopes.push(item.scope);
        }
      } else {
        // Load aspect for tagline and modification check
        const aspect = await loadInstalledAspect(item.name, item.scope, projectRoot);
        let isModified = false;
        if (aspect) {
          const currentHash = blake3HashAspect(aspect);
          isModified = currentHash !== item.blake3;
        }
        
        // Handle legacy installs that may lack new fields
        const trust = item.trust ?? (item.source === 'github' ? 'github' : item.source === 'local' ? 'local' : 'community');
        
        grouped.set(item.blake3, {
          name: item.name,
          version: item.version,
          blake3: item.blake3,
          scopes: [item.scope],
          trust,
          publisher: item.publisher,
          specifier: item.specifier,
          tagline: aspect?.tagline,
          isModified,
        });
      }
    }

    console.log();
    console.log(c.bold(`${icons.package} Installed aspects`));
    console.log();

    for (const item of grouped.values()) {
      // Sort scopes for consistent display: project before global
      item.scopes.sort((a, b) => a === 'project' ? -1 : 1);
      console.log(formatAspectLine(item));
    }

    console.log();
  },
});
