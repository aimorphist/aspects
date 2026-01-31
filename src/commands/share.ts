import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { defineCommand } from 'citty';
import * as p from '@clack/prompts';
import { blake3HashAspect, canonicalizeAspect } from '../utils/hash';
import { listInstalledAspects } from '../lib/config';
import { findAndLoadAspect } from '../lib/aspect-loader';
import { parseAspectFile } from '../lib/parser';
import { publishAnonymous, ApiClientError } from '../lib/api-client';
import { c, icons } from '../utils/colors';
import type { Aspect } from '../lib/types';

const MAX_ASPECT_SIZE = 51200; // 50KB

export default defineCommand({
  meta: {
    name: 'share',
    description: `Share an aspect anonymously via content hash (no account required).

How it works:
  1. Computes Blake3 hash of your aspect content
  2. Uploads to registry (content-addressed storage)
  3. Anyone can install via: aspects add blake3:<hash>

No account needed! Perfect for:
  - Quick one-off sharing
  - Testing before claiming a name
  - Anonymous contributions

Examples:
  aspects share my-aspect           Share an installed aspect
  aspects share ./path/to/aspect    Share from local path
  aspects share my-aspect --dry-run Preview hash without uploading

Want to claim a name instead? Use 'aspects publish' (requires login).`,
  },
  args: {
    target: {
      type: 'positional',
      description: 'Aspect name (if installed) or path to aspect.json',
      required: false,
    },
    'dry-run': {
      type: 'boolean',
      description: 'Compute hash without uploading',
    },
  },
  async run({ args }) {
    const dryRun = args['dry-run'] as boolean | undefined;

    p.intro(`${icons.share} ${dryRun ? 'Preview' : 'Share'} an aspect`);

    const target = args.target as string | undefined;

    if (!target) {
      // No target specified - show usage and list installed aspects
      p.log.error('Please specify an aspect to share.');
      console.log();
      p.log.info('Usage:');
      console.log(`  ${c.cmd('aspects share <name>')}     Share an installed aspect`);
      console.log(`  ${c.cmd('aspects share ./path')}     Share from a local path`);
      console.log();

      const installed = await listInstalledAspects();
      if (installed.length > 0) {
        p.log.info('Installed aspects you can share:');
        for (const item of installed.slice(0, 10)) {
          console.log(`  ${icons.bullet} ${c.aspect(item.name)}`);
        }
        if (installed.length > 10) {
          console.log(`  ${c.muted(`...and ${installed.length - 10} more`)}`);
        }
      }
      process.exit(1);
    }

    let aspect: Aspect;

    if (target.startsWith('.') || target.startsWith('/')) {
      // Path to aspect - parseAspectFile handles both JSON and YAML
      let filePath = target;
      try {
        const stats = await stat(target);
        if (stats.isDirectory()) {
          // Try aspect.json first, then aspect.yaml
          const jsonPath = join(target, 'aspect.json');
          const yamlPath = join(target, 'aspect.yaml');
          try {
            await stat(jsonPath);
            filePath = jsonPath;
          } catch {
            filePath = yamlPath;
          }
        }
      } catch {
        p.log.error(`Path not found: ${target}`);
        process.exit(1);
      }

      const result = await parseAspectFile(filePath);
      if (!result.success) {
        p.log.error(`Invalid aspect: ${result.errors.join(', ')}`);
        process.exit(1);
      }
      aspect = result.aspect;
    } else {
      // Installed aspect name - search both project and global scopes
      const found = await findAndLoadAspect(target);
      
      if (!found) {
        p.log.error(`Aspect "${target}" is not installed or cannot be read`);
        p.log.info('To share from a path, use: aspects share ./path/to/aspect.json');
        process.exit(1);
      }
      
      p.log.info(`Found: ${c.aspect(target)} ${c.dim(`[${found.scope}]`)}`);
      aspect = found.aspect;
    }

    // Serialize for hashing and size check (canonicalized JSON matches server)
    const content = canonicalizeAspect(aspect);
    const sizeBytes = Buffer.byteLength(content);

    if (sizeBytes > MAX_ASPECT_SIZE) {
      p.log.error(`Aspect too large: ${sizeBytes} bytes (${MAX_ASPECT_SIZE} byte limit)`);
      process.exit(1);
    }

    // Compute hash (uses same canonicalization as server)
    const hash = blake3HashAspect(aspect);

    // Show preview
    console.log();
    console.log(`  ${c.bold(aspect.displayName)} ${c.muted(`(${aspect.name}@${aspect.version})`)}`);
    console.log(`  ${c.italic(aspect.tagline)}`);
    console.log();
    console.log(`  ${c.label('Size')} ${(sizeBytes / 1024).toFixed(1)} KB`);
    console.log(`  ${c.label('Hash')} ${hash}`);
    console.log();

    if (dryRun) {
      p.log.info('Dry run - not uploading');
      console.log();
      console.log(`  ${c.label('Install')} aspects add hash:${hash}`);
      console.log();
      p.outro('(No upload performed)');
      return;
    }

    // Upload
    const spinner = p.spinner();
    spinner.start('Uploading...');

    try {
      const response = await publishAnonymous(aspect);
      spinner.stop('Uploaded');

      // Warn if client/server hashes diverge (server is authoritative)
      if (response.blake3 !== hash) {
        p.log.warn('Hash mismatch: client and server computed different hashes.');
        console.log(`  ${c.muted('Client:')} ${hash}`);
        console.log(`  ${c.muted('Server:')} ${response.blake3}`);
        console.log(`  ${c.muted('Using server hash (authoritative).')}`);
        console.log();
      }

      console.log();
      console.log(`${icons.success} ${c.bold('Shared successfully!')}`);
      console.log();
      console.log(`  ${c.label('Hash')}    ${response.blake3}`);
      console.log(`  ${c.label('Install')} ${c.highlight(`aspects add blake3:${response.blake3}`)}`);
      if (response.existing) {
        console.log(`  ${c.muted('(Already existed on registry)')}`);
      }
      console.log();

      p.outro('Share this hash with anyone to let them install your aspect!');
    } catch (err) {
      spinner.stop('Upload failed');

      if (err instanceof ApiClientError) {
        p.log.error(err.message);

        if (err.errorCode === 'already_exists') {
          // Hash already exists on server - that's fine for sharing
          console.log();
          console.log(`${icons.info} This aspect is already available on the registry.`);
          console.log();
          console.log(`  ${c.label('Hash')}    ${hash}`);
          console.log(`  ${c.label('Install')} ${c.highlight(`aspects add hash:${hash}`)}`);
          console.log();
          return;
        }
      } else {
        p.log.error(`Upload failed: ${(err as Error).message}`);
      }

      process.exit(1);
    }
  },
});
