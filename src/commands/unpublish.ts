import { defineCommand } from 'citty';
import * as p from '@clack/prompts';
import { unpublishAspect, ApiClientError } from '../lib/api-client';
import { isLoggedIn } from '../lib/config';
import { c, icons } from '../utils/colors';

export default defineCommand({
  meta: {
    name: 'unpublish',
    description: 'Unpublish a version from the registry',
  },
  args: {
    target: {
      type: 'positional',
      description: 'Aspect to unpublish (name@version)',
      required: true,
    },
  },
  async run({ args }) {
    const target = args.target as string;
    const atIndex = target.lastIndexOf('@');
    if (atIndex <= 0) {
      p.log.error('Please specify name@version (e.g. my-aspect@1.0.0)');
      process.exit(1);
    }

    const name = target.slice(0, atIndex);
    const version = target.slice(atIndex + 1);

    p.intro(`${icons.package} Unpublish ${c.bold(`${name}@${version}`)}`);

    // Check auth
    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
      p.log.error('Not logged in. Run "aspects login" first.');
      process.exit(1);
    }

    // Confirm
    const confirmed = await p.confirm({
      message: `Are you sure you want to unpublish ${name}@${version}? This cannot be undone.`,
      initialValue: false,
    });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Cancelled');
      process.exit(0);
    }

    const spinner = p.spinner();
    spinner.start(`Unpublishing ${name}@${version}...`);

    try {
      const result = await unpublishAspect(name, version);
      spinner.stop('Done');
      console.log();
      console.log(`${icons.success} ${result.message}`);
      console.log();
    } catch (err) {
      spinner.stop('Failed');

      if (err instanceof ApiClientError) {
        p.log.error(err.message);

        if (err.errorCode === 'forbidden') {
          p.log.info('Unpublish is only allowed within 72 hours of publishing.');
        } else if (err.errorCode === 'not_found') {
          p.log.info('That version does not exist in the registry.');
        } else if (err.errorCode === 'unauthorized') {
          p.log.info('Run "aspects login" to authenticate.');
        }
      } else {
        p.log.error(`Unpublish failed: ${(err as Error).message}`);
      }

      process.exit(1);
    }
  },
});
