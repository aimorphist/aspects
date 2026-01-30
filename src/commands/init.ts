import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { defineCommand } from 'citty';
import * as p from '@clack/prompts';
import { c, icons } from '../utils/colors';
import { PROJECT_ASPECTS_DIR_NAME } from '../utils/paths';

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize a project for local aspect installation',
  },
  args: {
    force: {
      type: 'boolean',
      alias: 'f',
      description: 'Overwrite existing .aspects directory',
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const aspectsDir = join(cwd, PROJECT_ASPECTS_DIR_NAME);

    // Check if already initialized
    if (existsSync(aspectsDir) && !args.force) {
      p.log.warn(`${c.file('.aspects/')} already exists in this directory`);
      
      const overwrite = await p.confirm({
        message: 'Reinitialize?',
      });

      if (p.isCancel(overwrite) || !overwrite) {
        p.cancel('Cancelled');
        process.exit(0);
      }
    }

    // Create directory structure
    await mkdir(aspectsDir, { recursive: true });

    console.log();
    console.log(`${icons.success} Initialized ${c.file('.aspects/')} in ${c.muted(cwd)}`);
    console.log();
    console.log(`  Now you can run ${c.cmd('aspects add <name>')} to install locally.`);
    console.log();
  },
});

/**
 * Initialize project aspects directory programmatically.
 * Used by add command when --project is passed without existing project.
 * Returns the project root (cwd).
 */
export async function initProjectAspects(): Promise<string> {
  const cwd = process.cwd();
  const aspectsDir = join(cwd, PROJECT_ASPECTS_DIR_NAME);

  await mkdir(aspectsDir, { recursive: true });

  return cwd;
}
